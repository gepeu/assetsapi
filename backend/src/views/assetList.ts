import type pg from "pg";

export interface AssetListItem {
  slug: string;
  ticker: string;
  name: string;
  issuer: string | null;
  assetClass: string;
}

export async function loadAssetList(pool: pg.Pool): Promise<AssetListItem[]> {
  const { rows } = await pool.query<{
    slug: string;
    ticker: string;
    name: string;
    asset_class: string;
    issuer: string | null;
  }>(
    `SELECT a.slug, a.ticker, a.name, a.asset_class, coalesce(o.brand_name, a.listed_issuer) AS issuer
     FROM asset a
     LEFT JOIN LATERAL (
       SELECT org.brand_name
       FROM asset_organization ao
       JOIN organization org ON org.id = ao.organization_id
       WHERE ao.asset_id = a.id AND ao.role = 'issuer'
       ORDER BY org.id
       LIMIT 1
     ) o ON true
     ORDER BY a.ticker`,
  );
  return rows.map((row) => ({
    slug: row.slug,
    ticker: row.ticker,
    name: row.name,
    issuer: row.issuer,
    assetClass: row.asset_class,
  }));
}
