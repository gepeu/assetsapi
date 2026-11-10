/** The `asset` table and its aliases: the only list of the universe. */
import type { Queryable } from '../pool.ts';
import { servedSolanaToken } from './history.ts';

const PROVIDER_NAMESPACE = 'rwa_xyz_id';

interface ActiveAsset {
  id: number;
  slug: string;
  ref: string;
}

export async function listActiveAssets(db: Queryable): Promise<ActiveAsset[]> {
  const { rows } = await db.query<ActiveAsset>(
    `SELECT a.id, a.slug, x.value AS ref
     FROM asset a
     JOIN asset_alias x ON x.asset_id = a.id AND x.namespace = $1
     WHERE a.deactivated_at IS NULL
     ORDER BY a.slug`,
    [PROVIDER_NAMESPACE]
  );
  return rows;
}

export interface KnownAsset extends ActiveAsset {
  active: boolean;
  /** Every Solana mint on record, including deactivated tokens, so a mint that returns is recognised. */
  solanaMints: string[];
}

export async function listKnownAssets(db: Queryable): Promise<KnownAsset[]> {
  const { rows } = await db.query<KnownAsset>(
    `SELECT a.id, a.slug, x.value AS ref, a.deactivated_at IS NULL AS active,
            coalesce(array_agg(t.address) FILTER (WHERE t.id IS NOT NULL), '{}') AS "solanaMints"
     FROM asset a
     JOIN asset_alias x ON x.asset_id = a.id AND x.namespace = $1
     LEFT JOIN (
       token t JOIN network n ON n.id = t.network_id AND n.key = 'solana'
     ) ON t.asset_id = a.id
     GROUP BY a.id, x.value
     ORDER BY a.slug`,
    [PROVIDER_NAMESPACE]
  );
  return rows;
}

export async function isSlugTaken(db: Queryable, slug: string): Promise<boolean> {
  const { rows } = await db.query<{ taken: boolean }>('SELECT EXISTS (SELECT 1 FROM asset WHERE slug = $1) AS taken', [
    slug,
  ]);
  return rows[0]?.taken ?? false;
}

interface NewAsset {
  slug: string;
  ticker: string;
  name: string;
  assetClass: string;
  assetType: string;
  ref: string;
}

export async function insertAsset(db: Queryable, asset: NewAsset): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO asset (slug, ticker, name, asset_class, asset_type) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [asset.slug, asset.ticker, asset.name, asset.assetClass, asset.assetType]
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("Couldn't create an asset");
  await db.query('INSERT INTO asset_alias (asset_id, namespace, value) VALUES ($1, $2, $3)', [
    id,
    PROVIDER_NAMESPACE,
    asset.ref,
  ]);
  return id;
}

interface AssetIdentity {
  ticker: string;
  name: string;
  assetClass: string;
}

/** Keeps the list in step with the provider. The slug and type stay as they are, by design. */
export async function refreshAssetIdentity(db: Queryable, assetId: number, identity: AssetIdentity): Promise<void> {
  await db.query(
    `UPDATE asset SET ticker = $2, name = $3, asset_class = $4
     WHERE id = $1 AND (ticker, name, asset_class) IS DISTINCT FROM ($2, $3, $4)`,
    [assetId, identity.ticker, identity.name, identity.assetClass]
  );
}

export async function deactivateAssets(db: Queryable, ids: readonly number[]): Promise<void> {
  await db.query('UPDATE asset SET deactivated_at = now() WHERE id = ANY($1::int[]) AND deactivated_at IS NULL', [ids]);
}

export async function reactivateAssets(db: Queryable, ids: readonly number[]): Promise<void> {
  await db.query('UPDATE asset SET deactivated_at = NULL WHERE id = ANY($1::int[]) AND deactivated_at IS NOT NULL', [
    ids,
  ]);
}

interface ActiveAssetRow {
  id: number;
  slug: string;
  ticker: string;
  name: string;
  asset_class: string;
  asset_type: string;
}

/** A deactivated asset reads as unknown to API clients. */
export async function findActiveAssetBySlug(db: Queryable, slug: string): Promise<ActiveAssetRow | null> {
  const { rows } = await db.query<ActiveAssetRow>(
    `SELECT id, slug, ticker, name, asset_class, asset_type
     FROM asset WHERE slug = $1 AND deactivated_at IS NULL`,
    [slug]
  );
  return rows[0] ?? null;
}

interface AssetListFilters {
  assetClass: string | null;
  assetType: string | null;
  network: string | null;
  q: string | null;
}

export type AssetSort = { by: 'ticker' } | { by: 'metric'; metric: string; scope: 'asset' | 'solana' };

interface AssetListOptions extends AssetListFilters {
  sort: AssetSort;
  descending: boolean;
  limit: number;
  offset: number;
}

export interface AssetListRow {
  id: number;
  slug: string;
  ticker: string;
  name: string;
  asset_class: string;
  asset_type: string;
  issuer: string | null;
  as_of: string | null;
}

// Text sorts with a fixed collation, because the database's own locale differs by host and would
// reorder most of the list.
const toSortExpression = (sort: AssetSort): string =>
  sort.by === 'ticker' ? `lower(a.ticker) COLLATE "C"` : 's.value';

/** The sort metric's value for each asset, in $7. A holder share above 100% can't be true, so it sorts as missing. */
function toSortJoin(sort: AssetSort): string {
  if (sort.by === 'ticker') return '';
  const scope =
    sort.scope === 'asset' ? 's.token_id IS NULL' : `s.token_id = ${servedSolanaToken('a.id')} AND s.value <= 100`;
  return `LEFT JOIN financial_current s ON s.asset_id = a.id AND s.metric = $7 AND ${scope}`;
}

const ISSUER_JOIN = `
  LEFT JOIN LATERAL (
    SELECT o.brand_name
    FROM asset_organization ao
    JOIN organization o ON o.id = ao.organization_id
    WHERE ao.asset_id = a.id AND ao.role = 'issuer'
    ORDER BY o.id
    LIMIT 1
  ) i ON true`;

const FILTERS = `
  a.deactivated_at IS NULL
  AND ($1::text IS NULL OR a.asset_class = $1)
  AND ($2::text IS NULL OR a.asset_type = $2)
  AND ($3::text IS NULL OR EXISTS (
    SELECT 1 FROM token t JOIN network n ON n.id = t.network_id
    WHERE t.asset_id = a.id AND t.deactivated_at IS NULL AND n.key = $3
  ))
  AND ($4::text IS NULL OR a.ticker ILIKE $4 OR a.name ILIKE $4 OR i.brand_name ILIKE $4)`;

function toSearchPattern(q: string | null): string | null {
  return q === null ? null : `%${q.replace(/[\\%_]/g, '\\$&')}%`;
}

export async function listAssetRows(db: Queryable, options: AssetListOptions): Promise<AssetListRow[]> {
  const direction = options.descending ? 'DESC' : 'ASC';
  const { sort } = options;
  const { rows } = await db.query<AssetListRow>(
    `SELECT a.id, a.slug, a.ticker, a.name, a.asset_class, a.asset_type, i.brand_name AS issuer, d.as_of
     FROM asset a
     ${ISSUER_JOIN}
     ${toSortJoin(sort)}
     LEFT JOIN (
       SELECT c.asset_id, max(c.as_of)::text AS as_of
       FROM financial_current c
       JOIN financial_measure m ON m.slug = c.metric AND m.served
       WHERE c.token_id IS NULL
       GROUP BY c.asset_id
     ) d ON d.asset_id = a.id
     WHERE ${FILTERS}
     ORDER BY ${toSortExpression(sort)} ${direction} NULLS LAST, a.slug COLLATE "C"
     LIMIT $5 OFFSET $6`,
    [
      options.assetClass,
      options.assetType,
      options.network,
      toSearchPattern(options.q),
      options.limit,
      options.offset,
      ...(sort.by === 'metric' ? [sort.metric] : []),
    ]
  );
  return rows;
}

export async function countAssets(db: Queryable, filters: AssetListFilters): Promise<number> {
  const { rows } = await db.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM asset a ${ISSUER_JOIN} WHERE ${FILTERS}`,
    [filters.assetClass, filters.assetType, filters.network, toSearchPattern(filters.q)]
  );
  return rows[0]?.total ?? 0;
}

interface FilterOptions {
  assetClasses: string[];
  assetTypes: string[];
  networks: string[];
}

export async function listFilterOptions(db: Queryable): Promise<FilterOptions> {
  const { rows } = await db.query<FilterOptions>(
    `SELECT
       coalesce((SELECT array_agg(DISTINCT asset_class ORDER BY asset_class) FROM asset WHERE deactivated_at IS NULL), '{}') AS "assetClasses",
       coalesce((SELECT array_agg(DISTINCT asset_type ORDER BY asset_type) FROM asset WHERE deactivated_at IS NULL), '{}') AS "assetTypes",
       coalesce((
         SELECT array_agg(DISTINCT n.key ORDER BY n.key)
         FROM token t
         JOIN network n ON n.id = t.network_id
         JOIN asset a ON a.id = t.asset_id AND a.deactivated_at IS NULL
         WHERE t.deactivated_at IS NULL
       ), '{}') AS networks`
  );
  return rows[0] ?? { assetClasses: [], assetTypes: [], networks: [] };
}
