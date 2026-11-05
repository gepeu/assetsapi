/** Financial measures, current values and daily history. */
import type { Queryable } from "../pool.ts";

const MISSING_GRACE = "7 days";
const HISTORY_BATCH_SIZE = 5000;

export interface NewMeasure {
  slug: string;
  label: string;
  unit: string | null;
  kind: "figure" | "term";
}

/** Adds unknown names, unserved. Returns those added, for the run summary. */
export async function addNewMeasures(db: Queryable, measures: readonly NewMeasure[]): Promise<string[]> {
  if (measures.length === 0) return [];
  const { rows } = await db.query<{ slug: string }>(
    `INSERT INTO financial_measure (slug, label, unit, kind, served)
     SELECT u.slug, u.label, u.unit, u.kind, false
     FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) AS u(slug, label, unit, kind)
     WHERE NOT EXISTS (SELECT 1 FROM financial_measure m WHERE m.slug = u.slug)
     RETURNING slug`,
    [
      measures.map((measure) => measure.slug),
      measures.map((measure) => measure.label),
      measures.map((measure) => measure.unit),
      measures.map((measure) => measure.kind),
    ],
  );
  return rows.map((row) => row.slug);
}

export interface CurrentWrite {
  tokenId: number | null;
  metric: string;
  value: number | null;
  value7d: number | null;
  value30d: number | null;
  value90d: number | null;
  raw: unknown;
  asOf: string;
}

/** Returns the rows written. An unchanged value writes nothing, and `updated_at` tracks the value alone. */
export async function upsertCurrent(
  db: Queryable,
  assetId: number,
  runId: number,
  rows: readonly CurrentWrite[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const { rowCount } = await db.query(
    `INSERT INTO financial_current (asset_id, token_id, metric, value, value_7d, value_30d, value_90d, raw, as_of, ingestion_run_id)
     SELECT $1, u.token_id, u.metric, u.value, u.value_7d, u.value_30d, u.value_90d, u.raw, u.as_of, $2
     FROM unnest($3::int[], $4::text[], $5::float8[], $6::float8[], $7::float8[], $8::float8[], $9::jsonb[], $10::date[])
       AS u(token_id, metric, value, value_7d, value_30d, value_90d, raw, as_of)
     ON CONFLICT (asset_id, token_id, metric) DO UPDATE SET
       value = EXCLUDED.value,
       value_7d = EXCLUDED.value_7d,
       value_30d = EXCLUDED.value_30d,
       value_90d = EXCLUDED.value_90d,
       raw = EXCLUDED.raw,
       as_of = EXCLUDED.as_of,
       ingestion_run_id = EXCLUDED.ingestion_run_id,
       missing_since = NULL,
       updated_at = CASE
         WHEN (financial_current.value, financial_current.value_7d, financial_current.value_30d, financial_current.value_90d, financial_current.raw)
           IS DISTINCT FROM (EXCLUDED.value, EXCLUDED.value_7d, EXCLUDED.value_30d, EXCLUDED.value_90d, EXCLUDED.raw)
         THEN now() ELSE financial_current.updated_at END
     WHERE (financial_current.value, financial_current.value_7d, financial_current.value_30d, financial_current.value_90d, financial_current.raw, financial_current.as_of)
       IS DISTINCT FROM (EXCLUDED.value, EXCLUDED.value_7d, EXCLUDED.value_30d, EXCLUDED.value_90d, EXCLUDED.raw, EXCLUDED.as_of)
       OR financial_current.missing_since IS NOT NULL`,
    [
      assetId,
      runId,
      rows.map((row) => row.tokenId),
      rows.map((row) => row.metric),
      rows.map((row) => row.value),
      rows.map((row) => row.value7d),
      rows.map((row) => row.value30d),
      rows.map((row) => row.value90d),
      rows.map((row) => JSON.stringify(row.raw)),
      rows.map((row) => row.asOf),
    ],
  );
  return rowCount ?? 0;
}

export async function markMissingCurrent(
  db: Queryable,
  assetId: number,
  seen: readonly { tokenId: number | null; metric: string }[],
): Promise<number> {
  const { rowCount } = await db.query(
    `UPDATE financial_current c SET missing_since = now()
     WHERE c.asset_id = $1
       AND c.missing_since IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM unnest($2::int[], $3::text[]) AS s(token_id, metric)
         WHERE s.token_id IS NOT DISTINCT FROM c.token_id AND s.metric = c.metric
       )`,
    [assetId, seen.map((row) => row.tokenId), seen.map((row) => row.metric)],
  );
  return rowCount ?? 0;
}

export async function deleteExpiredCurrent(db: Queryable, assetId: number): Promise<number> {
  const { rowCount } = await db.query(
    "DELETE FROM financial_current WHERE asset_id = $1 AND missing_since < now() - $2::interval",
    [assetId, MISSING_GRACE],
  );
  return rowCount ?? 0;
}

/** Asset-level values before this load, to spot large swings. */
export async function readAssetValues(
  db: Queryable,
  assetId: number,
  metrics: readonly string[],
): Promise<Map<string, number>> {
  const { rows } = await db.query<{ metric: string; value: number }>(
    `SELECT metric, value FROM financial_current
     WHERE asset_id = $1 AND token_id IS NULL AND metric = ANY($2::text[]) AND value IS NOT NULL`,
    [assetId, metrics],
  );
  return new Map(rows.map((row) => [row.metric, row.value]));
}

export interface HistoryWrite {
  tokenId: number | null;
  measure: string;
  points: readonly (readonly [string, number])[];
}

/** Writes only new or changed days, which stops each run rewriting the whole table. Returns days written. */
export async function upsertHistory(
  db: Queryable,
  assetId: number,
  runId: number,
  series: readonly HistoryWrite[],
): Promise<number> {
  let written = 0;
  for (const { tokenId, measure, points } of series) {
    for (let start = 0; start < points.length; start += HISTORY_BATCH_SIZE) {
      const batch = points.slice(start, start + HISTORY_BATCH_SIZE);
      const { rowCount } = await db.query(
        `INSERT INTO financial_timeseries (asset_id, token_id, measure, day, value, ingestion_run_id)
         SELECT $1, $2, $3, p.day, p.value, $4 FROM unnest($5::date[], $6::float8[]) AS p(day, value)
         ON CONFLICT (asset_id, token_id, measure, day) DO UPDATE
           SET value = EXCLUDED.value, ingestion_run_id = EXCLUDED.ingestion_run_id
           WHERE financial_timeseries.value IS DISTINCT FROM EXCLUDED.value`,
        [assetId, tokenId, measure, runId, batch.map(([day]) => day), batch.map(([, value]) => value)],
      );
      written += rowCount ?? 0;
    }
  }
  return written;
}

/** Whether the asset and each of these Solana mints already have history, so a recent window is enough. */
export async function hasFullHistory(db: Queryable, assetId: number, mints: readonly string[]): Promise<boolean> {
  const { rows } = await db.query<{ complete: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM financial_timeseries WHERE asset_id = $1 AND token_id IS NULL)
        AND NOT EXISTS (
          SELECT 1 FROM unnest($2::text[]) AS m(address)
          WHERE NOT EXISTS (
            SELECT 1 FROM financial_timeseries s
            JOIN token t ON t.id = s.token_id AND t.address = m.address
            JOIN network n ON n.id = t.network_id AND n.key = 'solana'
            WHERE s.asset_id = $1
          )
        ) AS complete`,
    [assetId, mints],
  );
  return rows[0]?.complete ?? false;
}

export interface ServedValueRow {
  metric: string;
  label: string;
  unit: string | null;
  measure_group: string | null;
  kind: "figure" | "term" | null;
  value: number | null;
  value_7d: number | null;
  value_30d: number | null;
  value_90d: number | null;
  raw: unknown;
  as_of: string;
}

const SERVED_VALUE_COLUMNS = `c.metric, m.label, m.unit, m.measure_group, m.kind, c.value, c.value_7d, c.value_30d,
       c.value_90d, c.raw, c.as_of::text AS as_of`;

export async function listServedAssetValues(db: Queryable, assetId: number): Promise<ServedValueRow[]> {
  const { rows } = await db.query<ServedValueRow>(
    `SELECT ${SERVED_VALUE_COLUMNS}
     FROM financial_current c
     JOIN financial_measure m ON m.slug = c.metric AND m.served
     WHERE c.asset_id = $1 AND c.token_id IS NULL
     ORDER BY m.sort_order, c.metric`,
    [assetId],
  );
  return rows;
}

/** Values read from the asset's active Solana token rather than the asset. */
export async function listServedSolanaValues(
  db: Queryable,
  assetId: number,
  metrics: readonly string[],
): Promise<ServedValueRow[]> {
  const { rows } = await db.query<ServedValueRow>(
    `SELECT DISTINCT ON (c.metric) ${SERVED_VALUE_COLUMNS}
     FROM financial_current c
     JOIN financial_measure m ON m.slug = c.metric AND m.served
     JOIN token t ON t.id = c.token_id AND t.deactivated_at IS NULL
     JOIN network n ON n.id = t.network_id AND n.key = 'solana'
     WHERE c.asset_id = $1 AND c.metric = ANY($2::text[])
     ORDER BY c.metric, t.id`,
    [assetId, metrics],
  );
  return rows;
}

export interface TokenValueRow {
  token_id: number;
  metric: string;
  value: number | null;
  as_of: string;
}

export async function listServedTokenValues(
  db: Queryable,
  tokenIds: readonly number[],
  metrics: readonly string[],
): Promise<TokenValueRow[]> {
  const { rows } = await db.query<TokenValueRow>(
    `SELECT c.token_id, c.metric, c.value, c.as_of::text AS as_of
     FROM financial_current c
     JOIN financial_measure m ON m.slug = c.metric AND m.served
     WHERE c.token_id = ANY($1::int[]) AND c.metric = ANY($2::text[])`,
    [tokenIds, metrics],
  );
  return rows;
}

/** The latest date across a set of tokens' values, whichever metric it's on. */
export async function listTokenAsOf(db: Queryable, tokenIds: readonly number[]): Promise<Map<number, string>> {
  const { rows } = await db.query<{ token_id: number; as_of: string }>(
    `SELECT c.token_id, max(c.as_of)::text AS as_of
     FROM financial_current c
     WHERE c.token_id = ANY($1::int[])
     GROUP BY c.token_id`,
    [tokenIds],
  );
  return new Map(rows.map((row) => [row.token_id, row.as_of]));
}

export interface NetworkValueRow {
  key: string;
  name: string;
  value: number;
}

export async function listValueByNetwork(db: Queryable, assetId: number): Promise<NetworkValueRow[]> {
  const { rows } = await db.query<NetworkValueRow>(
    `SELECT n.key, n.name, sum(c.value) AS value
     FROM financial_current c
     JOIN token t ON t.id = c.token_id AND t.deactivated_at IS NULL
     JOIN network n ON n.id = t.network_id
     WHERE c.asset_id = $1 AND c.metric = 'total_asset_value_dollar'
     GROUP BY n.key, n.name
     HAVING sum(c.value) > 0
     ORDER BY value DESC, n.key`,
    [assetId],
  );
  return rows;
}

/** The one token that Solana-scoped reads use, so every endpoint agrees on it. Expects the asset ID as $1. */
const SERVED_SOLANA_TOKEN = `(
  SELECT t.id FROM token t JOIN network n ON n.id = t.network_id AND n.key = 'solana'
  WHERE t.asset_id = $1 AND t.deactivated_at IS NULL ORDER BY t.id LIMIT 1
)`;

// A holder share above 100% can't be true, though the source has some. These are stored but not served.
const SERVABLE_POINT = `NOT (s.measure LIKE 'top%concentration' AND s.value > 100)`;

export interface MeasureInfo {
  slug: string;
  label: string;
  unit: string | null;
  group: string | null;
}

export async function findServedMeasure(db: Queryable, slug: string): Promise<MeasureInfo | null> {
  const { rows } = await db.query<MeasureInfo>(
    `SELECT slug, label, unit, measure_group AS "group" FROM financial_measure WHERE slug = $1 AND served`,
    [slug],
  );
  return rows[0] ?? null;
}

export interface AvailableSeriesRow extends MeasureInfo {
  has_asset_series: boolean;
  has_solana_series: boolean;
}

export async function listAvailableSeries(db: Queryable, assetId: number): Promise<AvailableSeriesRow[]> {
  const { rows } = await db.query<AvailableSeriesRow>(
    `SELECT m.slug, m.label, m.unit, m.measure_group AS "group",
            bool_or(a.token_id IS NULL) AS has_asset_series,
            bool_or(a.token_id IS NOT NULL) AS has_solana_series
     FROM (
       SELECT DISTINCT s.measure, s.token_id
       FROM financial_timeseries s
       WHERE s.asset_id = $1 AND ${SERVABLE_POINT}
         AND (s.token_id IS NULL OR s.token_id = ${SERVED_SOLANA_TOKEN})
     ) a
     JOIN financial_measure m ON m.slug = a.measure AND m.served AND m.kind = 'figure'
     GROUP BY m.slug, m.label, m.unit, m.measure_group, m.sort_order
     ORDER BY m.sort_order, m.slug`,
    [assetId],
  );
  return rows;
}

export interface SeriesScope {
  hasAssetSeries: boolean;
}

export async function findSeriesScope(db: Queryable, assetId: number, measure: string): Promise<SeriesScope> {
  const { rows } = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM financial_timeseries s
       WHERE s.asset_id = $1 AND s.token_id IS NULL AND s.measure = $2 AND ${SERVABLE_POINT}
     ) AS exists`,
    [assetId, measure],
  );
  return { hasAssetSeries: rows[0]?.exists ?? false };
}

/**
 * One series, oldest first. Ranges count back from the series' own last point, so a series that has
 * stopped still shows its final stretch.
 */
export async function listHistoryPoints(
  db: Queryable,
  assetId: number,
  measure: string,
  scope: "asset" | "solana",
  rangeDays: number | null,
): Promise<{ day: string; value: number }[]> {
  const scopeFilter = scope === "asset" ? "s.token_id IS NULL" : `s.token_id = ${SERVED_SOLANA_TOKEN}`;
  const { rows } = await db.query<{ day: string; value: number }>(
    `WITH series AS (
       SELECT s.day, s.value FROM financial_timeseries s
       WHERE s.asset_id = $1 AND s.measure = $2 AND ${scopeFilter} AND ${SERVABLE_POINT}
     )
     SELECT day::text AS day, value FROM series
     WHERE $3::int IS NULL OR day > (SELECT max(day) FROM series) - $3::int
     ORDER BY series.day`,
    [assetId, measure, rangeDays],
  );
  return rows;
}
