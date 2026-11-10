/** Turns rows into an asset's `tokens`: one row per token. */
import type { TokensSection } from '../api/schemas/tokens.ts';
import type { Queryable } from '../db/pool.ts';
import { listAssetFieldStatuses, listTokenValues, type StoredValue } from '../db/queries/fieldValues.ts';
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
  const [tokens, statuses] = await Promise.all([
    listActiveTokens(db, assetId, network),
    listAssetFieldStatuses(db, assetId),
  ]);
  const tokenIds = tokens.map((token) => token.id);
  const [values, metricRows, asOfs] = await Promise.all([
    listTokenValues(db, tokenIds),
    listServedTokenValues(db, tokenIds, TOKEN_METRICS),
    listTokenAsOf(db, tokenIds),
  ]);
  const organizations = await loadOrganizationLookup(db, values);

  const tokenFields = statuses.filter(
    (row) => row.level === 'token' && row.status !== 'not_applicable' && !FIELDS_SHOWN_AS_PROPERTIES.has(row.key)
  );

  const valueByCell = new Map<string, StoredValue>(values.map((row) => [`${row.field_id}|${row.subject_ref}`, row]));
  const metricByCell = new Map<string, TokenValueRow>(metricRows.map((row) => [`${row.token_id}|${row.metric}`, row]));

  return tokens.map((token) => ({
    network: { key: token.network_key, name: token.network_name },
    address: token.address,
    issuanceType: token.issuance_type,
    fields: tokenFields.map((field) =>
      toFieldValue(field, valueByCell.get(`${field.id}|token:${token.id}`), organizations)
    ),
    metrics: Object.fromEntries(
      TOKEN_METRICS.map((metric) => [metric, metricByCell.get(`${token.id}|${metric}`)?.value ?? null])
    ),
    asOf: asOfs.get(token.id) ?? null,
  }));
}
