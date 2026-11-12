/** Turns rows into the `tokens` of one asset or a page of them: one row per token. */
import type { TokensSection } from '../api/schemas/tokens.ts';
import type { Queryable } from '../db/pool.ts';
import {
  listTokenFieldStatuses,
  listTokenValues,
  type StoredValue,
  type TokenFieldStatusRow,
} from '../db/queries/fieldValues.ts';
import { listServedTokenValues, listTokenAsOf, type TokenValueRow } from '../db/queries/financials.ts';
import { listActiveTokens } from '../db/queries/tokens.ts';
import { loadOrganizationLookup, toFieldValue } from './fields.ts';

const TOKEN_METRICS = [
  'total_asset_value_dollar',
  'market_value_dollar',
  'total_supply_token',
  'holding_addresses_count',
] as const;

/** Already top-level properties of each row, so they aren't repeated as fields. */
const FIELDS_SHOWN_AS_PROPERTIES: ReadonlySet<string> = new Set([
  'token.network',
  'token.contract_address',
  'token.issuance_type',
]);

export async function loadTokens(db: Queryable, assetId: number, network: string | null): Promise<TokensSection> {
  return (await loadTokensByAsset(db, [assetId], network)).get(assetId) ?? [];
}

/** Every asset's tokens in a fixed number of queries, however many assets there are. */
export async function loadTokensByAsset(
  db: Queryable,
  assetIds: readonly number[],
  network: string | null
): Promise<Map<number, TokensSection>> {
  if (assetIds.length === 0) return new Map();
  const [tokens, statuses] = await Promise.all([
    listActiveTokens(db, assetIds, network),
    listTokenFieldStatuses(db, assetIds),
  ]);
  const tokenIds = tokens.map((token) => token.id);
  const [values, metricRows, asOfs] = await Promise.all([
    listTokenValues(db, tokenIds),
    listServedTokenValues(db, tokenIds, TOKEN_METRICS),
    listTokenAsOf(db, tokenIds),
  ]);
  const organizations = await loadOrganizationLookup(db, values);

  const fieldsByAsset = new Map<number, TokenFieldStatusRow[]>();
  for (const row of statuses) {
    if (FIELDS_SHOWN_AS_PROPERTIES.has(row.key)) continue;
    fieldsByAsset.set(row.asset_id, [...(fieldsByAsset.get(row.asset_id) ?? []), row]);
  }

  const valueByCell = new Map<string, StoredValue>(values.map((row) => [`${row.field_id}|${row.subject_ref}`, row]));
  const metricByCell = new Map<string, TokenValueRow>(metricRows.map((row) => [`${row.token_id}|${row.metric}`, row]));

  const byAsset = new Map<number, TokensSection>(assetIds.map((id) => [id, []]));
  for (const token of tokens) {
    byAsset.get(token.asset_id)?.push({
      network: { key: token.network_key, name: token.network_name },
      address: token.address,
      issuanceType: token.issuance_type,
      fields: (fieldsByAsset.get(token.asset_id) ?? []).map((field) =>
        toFieldValue(field, valueByCell.get(`${field.id}|token:${token.id}`), organizations)
      ),
      metrics: Object.fromEntries(
        TOKEN_METRICS.map((metric) => [metric, metricByCell.get(`${token.id}|${metric}`)?.value ?? null])
      ),
      asOf: asOfs.get(token.id) ?? null,
    });
  }
  return byAsset;
}
