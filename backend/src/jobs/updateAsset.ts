/**
 * Writes one asset's data in a single transaction: fetch outside it, validate, then write. A failure
 * rolls back that asset only, so it keeps its last good data. New assets go through the same write,
 * which is why an asset can never appear without data.
 */
import type pg from 'pg';
import { settings } from '../config.ts';
import { inTransaction, type Queryable } from '../db/pool.ts';
import { insertAsset, isSlugTaken, refreshAssetIdentity } from '../db/queries/assets.ts';
import {
  deleteExpiredFieldValues,
  type FieldValueWrite,
  listCatalog,
  markMissingFieldValues,
  upsertFieldValues,
} from '../db/queries/fieldValues.ts';
import {
  addNewMeasures,
  type CurrentWrite,
  deleteExpiredCurrent,
  markMissingCurrent,
  type NewMeasure,
  readAssetValues,
  upsertCurrent,
} from '../db/queries/financials.ts';
import { type HistoryWrite, upsertHistory } from '../db/queries/history.ts';
import { ensureOrganization, syncAssetOrganizations } from '../db/queries/organizations.ts';
import { findSourceId } from '../db/queries/runs.ts';
import { deactivateOtherTokens, ensureNetwork, listAllTokenIds, saveToken } from '../db/queries/tokens.ts';
import { ContractBrokenError } from '../providers/errors.ts';
import {
  type FieldContent,
  type FieldInput,
  type FinancialProvider,
  type ProviderRef,
  type ReferenceData,
  type ReferenceProvider,
  SOLANA_NETWORK,
  type TokenRef,
  utcToday,
} from '../providers/types.ts';
import {
  type AssetData,
  type Catalog,
  findLargeSwings,
  type LargeSwing,
  SWING_METRICS,
  validateAssetData,
} from './validate.ts';

export const DATA_SOURCE = 'rwa_xyz';

export interface DataProviders {
  pool: pg.Pool;
  reference: ReferenceProvider;
  financial: FinancialProvider;
  today?: () => string;
}

export interface AssetContext {
  pool: pg.Pool;
  runId: number;
  /** The data provider's source record. */
  sourceId: number;
  catalog: Catalog;
  fieldIds: ReadonlyMap<string, number>;
  reference: ReferenceProvider;
  financial: FinancialProvider;
  today: () => string;
}

export interface AssetWriteResult {
  fieldValuesWritten: number;
  currentWritten: number;
  historyDaysWritten: number;
  valuesMarkedMissing: number;
  valuesDeleted: number;
  newMeasures: string[];
  swings: LargeSwing[];
  notes: string[];
}

type NewAssetResult =
  | { status: 'created'; slug: string; result: AssetWriteResult }
  | { status: 'held_back'; assetClass: string; slug: string };

export async function createAssetContext(deps: DataProviders, runId: number): Promise<AssetContext> {
  const fields = await listCatalog(deps.pool);
  return {
    pool: deps.pool,
    runId,
    sourceId: await findSourceId(deps.pool, DATA_SOURCE),
    catalog: new Map(fields.map((field) => [field.key, field])),
    fieldIds: new Map(fields.map((field) => [field.key, field.id])),
    reference: deps.reference,
    financial: deps.financial,
    today: deps.today ?? utcToday,
  };
}

const toTokenKey = (token: TokenRef): string => `${token.network}:${token.address}`;

async function fetchAssetData(context: AssetContext, ref: ProviderRef): Promise<AssetData> {
  const reference = await context.reference.getReference(ref);
  const current = await context.financial.getCurrent(ref);
  const history = await context.financial.getHistory(ref);
  return { reference, current, history };
}

interface Subject {
  assetId?: number;
  tokenId?: number;
  organizationId?: number;
  networkId?: number;
}

/** Organization values point at a record, so spelling differences never read as changes. */
function toStoredValue(value: FieldContent, organizationIds: ReadonlyMap<string, number>): unknown {
  if (typeof value !== 'object' || Array.isArray(value)) return value;
  const id = organizationIds.get(value.organization);
  if (id === undefined) throw new ContractBrokenError(`Organization ${value.organization} wasn't saved`);
  return { organization_id: id };
}

function toFieldRows(
  inputs: readonly FieldInput[],
  subject: Subject,
  context: AssetContext,
  organizationIds: ReadonlyMap<string, number>
): FieldValueWrite[] {
  return inputs.map((input) => {
    const fieldId = context.fieldIds.get(input.field);
    if (fieldId === undefined) throw new ContractBrokenError(`${input.field} isn't in the catalog`);
    return {
      fieldId,
      assetId: subject.assetId ?? null,
      tokenId: subject.tokenId ?? null,
      organizationId: subject.organizationId ?? null,
      networkId: subject.networkId ?? null,
      value: toStoredValue(input.value, organizationIds),
      raw: input.raw,
      asOf: input.asOf,
    };
  });
}

interface SharedRecords {
  organizationIds: ReadonlyMap<string, number>;
  networkIds: ReadonlyMap<string, number>;
  rows: FieldValueWrite[];
}

/** Organizations and networks, which several assets can share, and the asset's roles. */
async function saveSharedRecords(
  db: Queryable,
  context: AssetContext,
  assetId: number,
  reference: ReferenceData
): Promise<SharedRecords> {
  const organizationIds = new Map<string, number>();
  for (const organization of reference.organizations) {
    organizationIds.set(organization.slug, await ensureOrganization(db, organization));
  }
  const rows = reference.organizations.flatMap((organization) => {
    const organizationId = organizationIds.get(organization.slug);
    return toFieldRows(organization.fields, { organizationId }, context, organizationIds);
  });

  const networkIds = new Map<string, number>();
  for (const network of reference.networks) {
    const networkId = await ensureNetwork(db, network);
    networkIds.set(network.key, networkId);
    rows.push(...toFieldRows(network.fields, { networkId }, context, organizationIds));
  }

  const roles = reference.roles.flatMap(({ organization, role }) => {
    const organizationId = organizationIds.get(organization);
    return organizationId === undefined ? [] : [{ organizationId, role }];
  });
  await syncAssetOrganizations(db, assetId, roles);

  return { organizationIds, networkIds, rows };
}

interface SavedTokens {
  /** By network and address. */
  tokenIds: ReadonlyMap<string, number>;
  rows: FieldValueWrite[];
  notes: string[];
}

/** Saves what the provider lists, and deactivates the asset's other tokens. */
async function saveTokens(
  db: Queryable,
  context: AssetContext,
  assetId: number,
  reference: ReferenceData,
  shared: SharedRecords
): Promise<SavedTokens> {
  const tokenIds = new Map<string, number>();
  const rows: FieldValueWrite[] = [];
  const notes: string[] = [];
  for (const token of reference.tokens) {
    const key = toTokenKey(token);
    if (tokenIds.has(key)) {
      notes.push(`Skipped a repeat of token ${key}`);
      continue;
    }
    const networkId = shared.networkIds.get(token.network);
    if (networkId === undefined) throw new ContractBrokenError(`Network ${token.network} wasn't saved`);
    const tokenId = await saveToken(db, { ...token, assetId, networkId });
    if (tokenId === null) {
      notes.push(`Skipped token ${key}: it belongs to another of our assets`);
      continue;
    }
    tokenIds.set(key, tokenId);
    rows.push(...toFieldRows(token.fields, { tokenId }, context, shared.organizationIds));
  }
  await deactivateOtherTokens(db, assetId, [...tokenIds.values()]);
  return { tokenIds, rows, notes };
}

/**
 * Writes field values and retires those this load didn't report. Organization and network rows are
 * only overwritten: they're shared across assets, so one asset's load says nothing about whether a
 * value is gone.
 */
async function writeFieldValues(
  db: Queryable,
  context: AssetContext,
  assetId: number,
  sharedRows: readonly FieldValueWrite[],
  ownRows: readonly FieldValueWrite[]
) {
  const { sourceId, runId } = context;
  const written =
    (await upsertFieldValues(db, sharedRows, sourceId, runId)) +
    (await upsertFieldValues(db, ownRows, sourceId, runId));

  const subjects = [`asset:${assetId}`, ...(await listAllTokenIds(db, assetId)).map((id) => `token:${id}`)];
  const seen = ownRows.map((row) => ({
    fieldId: row.fieldId,
    subjectRef: row.assetId !== null ? `asset:${row.assetId}` : `token:${row.tokenId}`,
  }));
  const markedMissing = await markMissingFieldValues(db, subjects, seen);
  const deleted = await deleteExpiredFieldValues(db, subjects);
  return { written, markedMissing, deleted };
}

function collectMeasures(data: AssetData): NewMeasure[] {
  const measures = new Map<string, NewMeasure>();
  for (const row of data.current.values) {
    if (!measures.has(row.metric)) {
      measures.set(row.metric, {
        slug: row.metric,
        label: row.metric,
        unit: null,
        kind: row.value === null ? 'term' : 'figure',
      });
    }
  }
  for (const series of data.history.series) {
    measures.set(series.measure, {
      slug: series.measure,
      label: series.label ?? series.measure,
      unit: series.unit,
      kind: 'figure',
    });
  }
  return [...measures.values()];
}

/** Writes current values and changed history days. A value on a token we skipped is left out. */
async function writeFinancials(
  db: Queryable,
  context: AssetContext,
  assetId: number,
  data: AssetData,
  tokenIds: ReadonlyMap<string, number>
) {
  const { runId } = context;
  const notes: string[] = [];
  const newMeasures = await addNewMeasures(db, collectMeasures(data));
  const placeToken = (token: TokenRef | null): number | null | undefined =>
    token === null ? null : tokenIds.get(toTokenKey(token));

  // Keyed, because one upsert can't touch the same row twice if the provider repeats a value.
  const currentByKey = new Map<string, CurrentWrite>();
  for (const { token, ...row } of data.current.values) {
    const tokenId = placeToken(token);
    if (tokenId !== undefined) currentByKey.set(`${tokenId}:${row.metric}`, { ...row, tokenId });
  }
  const currentRows = [...currentByKey.values()];

  const previous = await readAssetValues(db, assetId, SWING_METRICS);
  const swings = findLargeSwings(previous, data.current);
  const currentWritten = await upsertCurrent(db, assetId, runId, currentRows);
  const markedMissing = await markMissingCurrent(db, assetId, currentRows);
  const deleted = await deleteExpiredCurrent(db, assetId);

  const historyRows: HistoryWrite[] = [];
  for (const series of data.history.series) {
    const tokenId = placeToken(series.token);
    if (tokenId === undefined) {
      notes.push(`Skipped ${series.measure} history for a token that isn't ours`);
      continue;
    }
    historyRows.push({ tokenId, measure: series.measure, points: series.points });
  }
  const historyDaysWritten = await upsertHistory(db, assetId, runId, historyRows);

  return { newMeasures, swings, currentWritten, historyDaysWritten, markedMissing, deleted, notes };
}

/** Everything inside the transaction. Returns what changed, and which tokens were saved. */
async function writeAssetData(
  db: Queryable,
  context: AssetContext,
  assetId: number,
  data: AssetData
): Promise<{ result: AssetWriteResult; tokenIds: ReadonlyMap<string, number> }> {
  const { reference, history } = data;
  await refreshAssetIdentity(db, assetId, reference);

  const shared = await saveSharedRecords(db, context, assetId, reference);
  const tokens = await saveTokens(db, context, assetId, reference, shared);
  const ownRows = [...toFieldRows(reference.fields, { assetId }, context, shared.organizationIds), ...tokens.rows];
  const fields = await writeFieldValues(db, context, assetId, shared.rows, ownRows);
  const financials = await writeFinancials(db, context, assetId, data, tokens.tokenIds);

  return {
    tokenIds: tokens.tokenIds,
    result: {
      fieldValuesWritten: fields.written,
      currentWritten: financials.currentWritten,
      historyDaysWritten: financials.historyDaysWritten,
      valuesMarkedMissing: fields.markedMissing + financials.markedMissing,
      valuesDeleted: fields.deleted + financials.deleted,
      newMeasures: financials.newMeasures,
      swings: financials.swings,
      notes: [...reference.notes, ...history.notes, ...tokens.notes, ...financials.notes],
    },
  };
}

export async function updateAsset(
  context: AssetContext,
  asset: { id: number; ref: ProviderRef }
): Promise<AssetWriteResult> {
  const data = await fetchAssetData(context, asset.ref);
  validateAssetData(data, context.catalog, context.today());
  const { result } = await inTransaction(context.pool, (db) => writeAssetData(db, context, asset.id, data));
  return result;
}

/** API paths that sit where an asset's slug would, so an asset with one of these could never be read. */
const RESERVED_SLUGS: ReadonlySet<string> = new Set(['catalog']);

async function isSlugFree(db: Queryable, slug: string): Promise<boolean> {
  return !RESERVED_SLUGS.has(slug) && !(await isSlugTaken(db, slug));
}

async function findFreeSlug(db: Queryable, base: string): Promise<string> {
  if (await isSlugFree(db, base)) return base;
  for (let suffix = 2; ; suffix++) {
    const ending = `-${suffix}`;
    const candidate = `${base.slice(0, settings.limits.maxSlugLength - ending.length)}${ending}`;
    if (await isSlugFree(db, candidate)) return candidate;
  }
}

/**
 * Creates an asset, alias and tokens and loads its data in one transaction. If the load fails,
 * nothing is created and the next run retries. An unmapped class holds the asset back unwritten.
 */
export async function createNewAsset(
  context: AssetContext,
  ref: ProviderRef,
  mints: readonly string[]
): Promise<NewAssetResult> {
  const data = await fetchAssetData(context, ref);
  validateAssetData(data, context.catalog, context.today());

  const { reference } = data;
  if (reference.assetType === null) {
    return { status: 'held_back', assetClass: reference.assetClass, slug: reference.slug };
  }
  const assetType = reference.assetType;

  return inTransaction(context.pool, async (db) => {
    const slug = await findFreeSlug(db, reference.slug);
    const assetId = await insertAsset(db, { ...reference, slug, assetType, ref });
    const { result, tokenIds } = await writeAssetData(db, context, assetId, data);
    for (const mint of mints) {
      if (!tokenIds.has(toTokenKey({ network: SOLANA_NETWORK, address: mint }))) {
        throw new ContractBrokenError(`${slug}: the new asset's mint ${mint} wasn't in its token list`);
      }
    }
    return { status: 'created', slug, result };
  });
}
