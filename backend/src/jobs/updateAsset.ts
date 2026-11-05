/**
 * Writes one asset's data in a single transaction: fetch outside it, validate, then write. A failure
 * rolls back that asset only, so it keeps its last good data. New assets go through the same write,
 * which is why an asset can never appear without data.
 */
import type pg from "pg";
import { inTransaction, type Queryable } from "../db/pool.ts";
import { insertAsset, isSlugTaken, setAssetClass } from "../db/queries/assets.ts";
import {
  deleteExpiredFieldValues,
  type FieldValueWrite,
  listCatalog,
  markMissingFieldValues,
  upsertFieldValues,
} from "../db/queries/fieldValues.ts";
import {
  addNewMeasures,
  type CurrentWrite,
  deleteExpiredCurrent,
  type HistoryWrite,
  hasFullHistory,
  markMissingCurrent,
  type NewMeasure,
  readAssetValues,
  upsertCurrent,
  upsertHistory,
} from "../db/queries/financials.ts";
import { ensureOrganization, syncAssetOrganizations } from "../db/queries/organizations.ts";
import { deactivateOtherTokens, ensureNetwork, listAllTokenIds, saveToken } from "../db/queries/tokens.ts";
import { ContractBrokenError } from "../providers/errors.ts";
import type {
  FieldContent,
  FieldInput,
  FinancialProvider,
  ProviderRef,
  ReferenceData,
  ReferenceProvider,
  TokenRef,
} from "../providers/types.ts";
import {
  type AssetData,
  type Catalog,
  findLargeSwings,
  type LargeSwing,
  listSwingMetrics,
  validateAssetData,
} from "./validate.ts";

/** Restated days are picked up within this window. Older ones need UPDATE_FULL_HISTORY. */
const HISTORY_WINDOW_DAYS = 35;
const SLUG_MAX_LENGTH = 64;
const SOLANA = "solana";

export interface WriteCatalog {
  entries: Catalog;
  ids: ReadonlyMap<string, number>;
}

export interface AssetContext {
  pool: pg.Pool;
  runId: number;
  /** The data provider's source record. */
  sourceId: number;
  catalog: WriteCatalog;
  reference: ReferenceProvider;
  financial: FinancialProvider;
  today: () => string;
  fullHistory: boolean;
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

export type NewAssetResult =
  | { status: "created"; slug: string; result: AssetWriteResult }
  | { status: "held_back"; assetClass: string; slug: string };

const toTokenKey = (token: TokenRef): string => `${token.network}:${token.address}`;

function subtractDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function fetchFinancials(
  context: AssetContext,
  ref: ProviderRef,
  reference: ReferenceData,
  since: string | null,
): Promise<AssetData> {
  const current = await context.financial.getCurrent(ref);
  const history = await context.financial.getHistory(ref, since);
  return { reference, current, history };
}

interface Subject {
  assetId?: number;
  tokenId?: number;
  organizationId?: number;
  networkId?: number;
}

function toFieldRows(
  inputs: readonly FieldInput[],
  subject: Subject,
  context: AssetContext,
  organizationIds: ReadonlyMap<string, number>,
): FieldValueWrite[] {
  return inputs.map((input) => {
    const fieldId = context.catalog.ids.get(input.field);
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

/** Organization values point at a record, so spelling differences never read as changes. */
function toStoredValue(value: FieldContent, organizationIds: ReadonlyMap<string, number>): unknown {
  if (typeof value !== "object" || Array.isArray(value)) return value;
  const id = organizationIds.get(value.organization);
  if (id === undefined) throw new ContractBrokenError(`Organization ${value.organization} wasn't saved`);
  return { organization_id: id };
}

function collectNewMeasures(data: AssetData): NewMeasure[] {
  const measures = new Map<string, NewMeasure>();
  for (const row of data.current.values) {
    if (!measures.has(row.metric)) {
      measures.set(row.metric, {
        slug: row.metric,
        label: row.metric,
        unit: null,
        kind: row.value === null ? "term" : "figure",
      });
    }
  }
  for (const series of data.history.series) {
    measures.set(series.measure, {
      slug: series.measure,
      label: series.label ?? series.measure,
      unit: series.unit,
      kind: "figure",
    });
  }
  return [...measures.values()];
}

/** Everything inside the transaction. Returns what changed, for the run summary. */
async function writeAssetData(
  db: Queryable,
  context: AssetContext,
  assetId: number,
  data: AssetData,
): Promise<AssetWriteResult & { savedTokens: ReadonlySet<string> }> {
  const { reference, current, history } = data;
  const { runId, sourceId } = context;
  const notes = [...reference.notes, ...history.notes];

  await setAssetClass(db, assetId, reference.assetClass);

  const networkIds = new Map<string, number>();
  const sharedRows: FieldValueWrite[] = [];
  const organizationIds = new Map<string, number>();
  for (const organization of reference.organizations) {
    organizationIds.set(organization.slug, await ensureOrganization(db, organization));
  }
  for (const organization of reference.organizations) {
    const organizationId = organizationIds.get(organization.slug);
    if (organizationId !== undefined) {
      sharedRows.push(...toFieldRows(organization.fields, { organizationId }, context, organizationIds));
    }
  }
  for (const network of reference.networks) {
    const networkId = await ensureNetwork(db, network);
    networkIds.set(network.key, networkId);
    sharedRows.push(...toFieldRows(network.fields, { networkId }, context, organizationIds));
  }

  const roles = reference.roles.flatMap(({ organization, role }) => {
    const organizationId = organizationIds.get(organization);
    return organizationId === undefined ? [] : [{ organizationId, role }];
  });
  await syncAssetOrganizations(db, assetId, roles);

  const tokenIds = new Map<string, number>();
  const ownRows: FieldValueWrite[] = toFieldRows(reference.fields, { assetId }, context, organizationIds);
  for (const token of reference.tokens) {
    if (tokenIds.has(toTokenKey(token))) {
      notes.push(`Skipped a repeat of token ${toTokenKey(token)}`);
      continue;
    }
    const networkId = networkIds.get(token.network);
    if (networkId === undefined) throw new ContractBrokenError(`Network ${token.network} wasn't saved`);
    const tokenId = await saveToken(db, {
      assetId,
      networkId,
      address: token.address,
      issuanceType: token.issuanceType,
    });
    if (tokenId === null) {
      notes.push(`Skipped token ${toTokenKey(token)}: it belongs to another of our assets`);
      continue;
    }
    tokenIds.set(toTokenKey(token), tokenId);
    ownRows.push(...toFieldRows(token.fields, { tokenId }, context, organizationIds));
  }
  await deactivateOtherTokens(db, assetId, [...tokenIds.values()]);

  let fieldValuesWritten = await upsertFieldValues(db, sharedRows, sourceId, runId);
  fieldValuesWritten += await upsertFieldValues(db, ownRows, sourceId, runId);

  // Organization and network rows are only overwritten: they're shared across assets, so one
  // asset's load says nothing about whether a value is gone.
  const subjects = [`asset:${assetId}`, ...(await listAllTokenIds(db, assetId)).map((id) => `token:${id}`)];
  const seen = ownRows.map((row) => ({
    fieldId: row.fieldId,
    subjectRef: row.assetId !== null ? `asset:${row.assetId}` : `token:${row.tokenId}`,
  }));
  let valuesMarkedMissing = await markMissingFieldValues(db, subjects, seen);
  let valuesDeleted = await deleteExpiredFieldValues(db, subjects);

  const newMeasures = await addNewMeasures(db, collectNewMeasures(data));

  const placeToken = (token: TokenRef | null): number | null | undefined =>
    token === null ? null : tokenIds.get(toTokenKey(token));

  // Keyed, because one upsert can't touch the same row twice if the provider repeats a value.
  const currentByKey = new Map<string, CurrentWrite>();
  for (const row of current.values) {
    const tokenId = placeToken(row.token);
    if (tokenId === undefined) continue;
    currentByKey.set(`${tokenId}:${row.metric}`, {
      tokenId,
      metric: row.metric,
      value: row.value,
      value7d: row.value7d,
      value30d: row.value30d,
      value90d: row.value90d,
      raw: row.raw,
      asOf: row.asOf,
    });
  }
  const currentRows = [...currentByKey.values()];
  const previous = await readAssetValues(db, assetId, listSwingMetrics());
  const swings = findLargeSwings(previous, current);
  const currentWritten = await upsertCurrent(db, assetId, runId, currentRows);
  valuesMarkedMissing += await markMissingCurrent(db, assetId, currentRows);
  valuesDeleted += await deleteExpiredCurrent(db, assetId);

  const historyRows: HistoryWrite[] = [];
  for (const series of history.series) {
    const tokenId = placeToken(series.token);
    if (tokenId === undefined) {
      notes.push(`Skipped ${series.measure} history for a token that isn't ours`);
      continue;
    }
    historyRows.push({ tokenId, measure: series.measure, points: series.points });
  }
  const historyDaysWritten = await upsertHistory(db, assetId, runId, historyRows);

  return {
    fieldValuesWritten,
    currentWritten,
    historyDaysWritten,
    valuesMarkedMissing,
    valuesDeleted,
    newMeasures,
    swings,
    notes,
    savedTokens: new Set(tokenIds.keys()),
  };
}

export const utcToday = (): string => new Date().toISOString().slice(0, 10);

export async function loadWriteCatalog(pool: pg.Pool): Promise<WriteCatalog> {
  const fields = await listCatalog(pool);
  return {
    entries: new Map(fields.map((field) => [field.key, field])),
    ids: new Map(fields.map((field) => [field.key, field.id])),
  };
}

export async function updateAsset(
  context: AssetContext,
  asset: { id: number; ref: ProviderRef },
): Promise<AssetWriteResult> {
  const today = context.today();
  const reference = await context.reference.getReference(asset.ref);
  // Checked against what the provider lists now, so a token first seen in this load gets its full series.
  const mints = reference.tokens.filter((token) => token.network === SOLANA).map((token) => token.address);
  const needsFull = context.fullHistory || !(await hasFullHistory(context.pool, asset.id, mints));
  const since = needsFull ? null : subtractDays(today, HISTORY_WINDOW_DAYS);

  const data = await fetchFinancials(context, asset.ref, reference, since);
  validateAssetData(data, context.catalog.entries, today);

  const { savedTokens: _savedTokens, ...result } = await inTransaction(context.pool, (db) =>
    writeAssetData(db, context, asset.id, data),
  );
  return result;
}

async function findFreeSlug(db: Queryable, base: string): Promise<string> {
  if (!(await isSlugTaken(db, base))) return base;
  for (let suffix = 2; ; suffix++) {
    const ending = `-${suffix}`;
    const candidate = `${base.slice(0, SLUG_MAX_LENGTH - ending.length)}${ending}`;
    if (!(await isSlugTaken(db, candidate))) return candidate;
  }
}

/**
 * Creates an asset, alias and tokens and loads its data in one transaction. If the load fails,
 * nothing is created and the next run retries. An unmapped class holds the asset back unwritten.
 */
export async function createNewAsset(
  context: AssetContext,
  ref: ProviderRef,
  mints: readonly string[],
): Promise<NewAssetResult> {
  const today = context.today();
  const data = await fetchFinancials(context, ref, await context.reference.getReference(ref), null);
  validateAssetData(data, context.catalog.entries, today);

  const { reference } = data;
  if (reference.assetType === null) {
    return { status: "held_back", assetClass: reference.assetClass, slug: reference.slug };
  }
  const assetType = reference.assetType;

  return inTransaction(context.pool, async (db) => {
    const slug = await findFreeSlug(db, reference.slug);
    const assetId = await insertAsset(db, {
      slug,
      ticker: reference.ticker,
      name: reference.name,
      assetClass: reference.assetClass,
      assetType,
      ref,
    });
    const { savedTokens, ...result } = await writeAssetData(db, context, assetId, data);
    for (const mint of mints) {
      if (!savedTokens.has(toTokenKey({ network: SOLANA, address: mint }))) {
        throw new ContractBrokenError(`${slug}: the new asset's mint ${mint} wasn't in its token list`);
      }
    }
    return { status: "created", slug, result };
  });
}
