/** Turns rows into `/assets/{slug}/tokens`: one row per chain. */
import type { TokensResponse } from "../api/schemas/tokens.ts";
import type { Queryable } from "../db/pool.ts";
import { findActiveAssetBySlug } from "../db/queries/assets.ts";
import { listAssetFieldStatuses, listTokenValues, type StoredValue } from "../db/queries/fieldValues.ts";
import { listServedTokenValues, listTokenAsOf, type TokenValueRow } from "../db/queries/financials.ts";
import { listActiveTokens } from "../db/queries/tokens.ts";
import { loadOrganizationLookup, toFieldValue } from "./fields.ts";

const TOKEN_FIGURES = [
  "total_asset_value_dollar",
  "market_value_dollar",
  "total_supply_token",
  "holding_addresses_count",
] as const;

/** Already top-level properties of each row, so they aren't repeated as fields. */
const FIELDS_SHOWN_AS_PROPERTIES: ReadonlySet<string> = new Set([
  "token.network",
  "token.contract_address",
  "token.issuance_type",
]);

/** Null when the asset is unknown or deactivated. */
export async function listAssetTokens(
  db: Queryable,
  slug: string,
  network: string | null,
): Promise<TokensResponse | null> {
  const asset = await findActiveAssetBySlug(db, slug);
  if (!asset) return null;

  const [tokens, statuses] = await Promise.all([
    listActiveTokens(db, asset.id, network),
    listAssetFieldStatuses(db, asset.id),
  ]);
  const tokenIds = tokens.map((token) => token.id);
  const [values, figures, asOfs] = await Promise.all([
    listTokenValues(db, tokenIds),
    listServedTokenValues(db, tokenIds, TOKEN_FIGURES),
    listTokenAsOf(db, tokenIds),
  ]);
  const organizations = await loadOrganizationLookup(db, values);

  const tokenFields = statuses.filter(
    (row) => row.level === "token" && row.status !== "not_applicable" && !FIELDS_SHOWN_AS_PROPERTIES.has(row.key),
  );

  const valueByCell = new Map<string, StoredValue>(values.map((row) => [`${row.field_id}|${row.subject_ref}`, row]));
  const figureByCell = new Map<string, TokenValueRow>(figures.map((row) => [`${row.token_id}|${row.metric}`, row]));
  const figureOf = (tokenId: number, metric: string): number | null =>
    figureByCell.get(`${tokenId}|${metric}`)?.value ?? null;

  return {
    data: tokens.map((token) => ({
      network: { key: token.network_key, name: token.network_name },
      address: token.address,
      issuanceType: token.issuance_type,
      fields: tokenFields.map((field) =>
        toFieldValue(field, valueByCell.get(`${field.id}|token:${token.id}`), organizations),
      ),
      figures: {
        total_asset_value_dollar: figureOf(token.id, "total_asset_value_dollar"),
        market_value_dollar: figureOf(token.id, "market_value_dollar"),
        total_supply_token: figureOf(token.id, "total_supply_token"),
        holding_addresses_count: figureOf(token.id, "holding_addresses_count"),
      },
      asOf: asOfs.get(token.id) ?? null,
    })),
  };
}
