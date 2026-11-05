/** Daily history: writing changed days, and reading series for the API. */
import type { Queryable } from "../pool.ts";
import type { MeasureInfo } from "./financials.ts";

const HISTORY_BATCH_SIZE = 5000;

/** The one token that Solana-scoped reads use, so every endpoint agrees on it. Expects the asset ID as $1. */
const SERVED_SOLANA_TOKEN = `(
  SELECT t.id FROM token t JOIN network n ON n.id = t.network_id AND n.key = 'solana'
  WHERE t.asset_id = $1 AND t.deactivated_at IS NULL ORDER BY t.id LIMIT 1
)`;

// A holder share above 100% can't be true, though the source has some. These are stored but not served.
const SERVABLE_POINT = `NOT (s.measure LIKE 'top%concentration' AND s.value > 100)`;

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

/** Which of an asset's series have anything servable for a measure. */
export interface SeriesPresence {
  hasAssetSeries: boolean;
  hasSolanaSeries: boolean;
}

export async function listAvailableSeries(db: Queryable, assetId: number): Promise<(MeasureInfo & SeriesPresence)[]> {
  const { rows } = await db.query<MeasureInfo & SeriesPresence>(
    `SELECT m.slug, m.label, m.unit, m.measure_group AS "group",
            bool_or(a.token_id IS NULL) AS "hasAssetSeries",
            bool_or(a.token_id IS NOT NULL) AS "hasSolanaSeries"
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

export async function findSeriesPresence(db: Queryable, assetId: number, measure: string): Promise<SeriesPresence> {
  const { rows } = await db.query<SeriesPresence>(
    `SELECT
       EXISTS (
         SELECT 1 FROM financial_timeseries s
         WHERE s.asset_id = $1 AND s.measure = $2 AND s.token_id IS NULL AND ${SERVABLE_POINT}
       ) AS "hasAssetSeries",
       EXISTS (
         SELECT 1 FROM financial_timeseries s
         WHERE s.asset_id = $1 AND s.measure = $2 AND s.token_id = ${SERVED_SOLANA_TOKEN} AND ${SERVABLE_POINT}
       ) AS "hasSolanaSeries"`,
    [assetId, measure],
  );
  return rows[0] ?? { hasAssetSeries: false, hasSolanaSeries: false };
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
