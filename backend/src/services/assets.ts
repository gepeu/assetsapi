/** Turns rows into `/assets` and `/assets/{slug}`. */
import type { AssetDetailResponse, AssetListQuery, AssetListResponse } from "../api/schemas/assets.ts";
import type { Figures } from "../api/schemas/shared.ts";
import type { Queryable } from "../db/pool.ts";
import {
  type AssetListRow,
  countAssets,
  findActiveAssetBySlug,
  listAssetRows,
  listFilterOptions,
  type SortColumn,
} from "../db/queries/assets.ts";
import { findAssetFieldValue } from "../db/queries/fieldValues.ts";
import { listServedAssetValues } from "../db/queries/financials.ts";
import { listAssetOrganizations } from "../db/queries/organizations.ts";
import { listAssetNetworks } from "../db/queries/tokens.ts";

const toFigures = (row: Figures): Figures => ({
  price_dollar: row.price_dollar,
  net_asset_value_dollar: row.net_asset_value_dollar,
  total_asset_value_dollar: row.total_asset_value_dollar,
  apy_30_day: row.apy_30_day,
  holding_addresses_count: row.holding_addresses_count,
});

const toListItem = (row: AssetListRow): AssetListResponse["data"][number] => ({
  slug: row.slug,
  ticker: row.ticker,
  name: row.name,
  assetClass: row.asset_class,
  assetType: row.asset_type,
  issuer: row.issuer,
  asOf: row.as_of,
  figures: toFigures(row),
});

export async function listAssets(db: Queryable, query: Partial<AssetListQuery>): Promise<AssetListResponse> {
  const sort = query.sort ?? "ticker";
  const descending = sort.startsWith("-");
  const filters = {
    assetClass: query.assetClass ?? null,
    assetType: query.assetType ?? null,
    network: query.network ?? null,
    q: query.q ?? null,
  };
  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;

  const [rows, total, options] = await Promise.all([
    listAssetRows(db, {
      ...filters,
      sort: (descending ? sort.slice(1) : sort) as SortColumn,
      descending,
      limit,
      offset,
    }),
    countAssets(db, filters),
    listFilterOptions(db),
  ]);
  return { data: rows.map(toListItem), meta: { total, limit, offset, filters: options } };
}

/** Null when the asset is unknown or deactivated. */
export async function getAsset(db: Queryable, slug: string): Promise<AssetDetailResponse | null> {
  const asset = await findActiveAssetBySlug(db, slug);
  if (!asset) return null;

  const [description, organizations, networks, values] = await Promise.all([
    findAssetFieldValue(db, asset.id, "identity.description"),
    listAssetOrganizations(db, asset.id),
    listAssetNetworks(db, asset.id),
    listServedAssetValues(db, asset.id),
  ]);

  const figureOf = (metric: string): number | null => values.find((row) => row.metric === metric)?.value ?? null;
  const asOf = values.reduce<string | null>(
    (latest, row) => (latest === null || row.as_of > latest ? row.as_of : latest),
    null,
  );

  return {
    data: {
      slug: asset.slug,
      ticker: asset.ticker,
      name: asset.name,
      assetClass: asset.asset_class,
      assetType: asset.asset_type,
      description: typeof description === "string" ? description : null,
      issuer: organizations.find((organization) => organization.role === "issuer")?.name ?? null,
      organizations: organizations.map((organization) => ({
        slug: organization.slug,
        name: organization.name,
        role: organization.role,
        legalName: organization.legal_name,
      })),
      networks: networks.map((network) => ({ key: network.key, name: network.name })),
      asOf,
      figures: {
        price_dollar: figureOf("price_dollar"),
        net_asset_value_dollar: figureOf("net_asset_value_dollar"),
        total_asset_value_dollar: figureOf("total_asset_value_dollar"),
        apy_30_day: figureOf("apy_30_day"),
        holding_addresses_count: figureOf("holding_addresses_count"),
      },
    },
  };
}
