/** Turns rows into `/assets/{slug}/history`: daily points for one measure, and which series to read. */
import type { HistoryResponse } from "../api/schemas/history.ts";
import type { Queryable } from "../db/pool.ts";
import { findActiveAssetBySlug } from "../db/queries/assets.ts";
import { findServedMeasure } from "../db/queries/financials.ts";
import { findSeriesPresence, listHistoryPoints, type SeriesPresence } from "../db/queries/history.ts";

/** Read from the Solana token, because the asset-level figure adds up each token's percentage. */
export const HOLDER_SHARE_MEASURES: readonly string[] = [
  "top_holder_concentration",
  "top_5_holder_concentration",
  "top_10_holder_concentration",
];

const RANGE_DAYS: Readonly<Record<string, number | null>> = {
  "7d": 7,
  "30d": 30,
  "3m": 90,
  "1y": 365,
  all: null,
};

/** The whole-asset series when there is one, and otherwise the Solana token's. */
export function chooseSeriesScope(measure: string, presence: SeriesPresence): "asset" | "solana" {
  if (HOLDER_SHARE_MEASURES.includes(measure)) return "solana";
  return !presence.hasAssetSeries && presence.hasSolanaSeries ? "solana" : "asset";
}

/** Null when the asset or the measure is unknown, or the measure isn't served. */
export async function getAssetHistory(
  db: Queryable,
  slug: string,
  measureSlug: string,
  range: string,
): Promise<HistoryResponse | null> {
  const [asset, measure] = await Promise.all([findActiveAssetBySlug(db, slug), findServedMeasure(db, measureSlug)]);
  if (!asset || !measure) return null;

  const scope = chooseSeriesScope(measure.slug, await findSeriesPresence(db, asset.id, measure.slug));
  const points = await listHistoryPoints(db, asset.id, measure.slug, scope, RANGE_DAYS[range] ?? null);
  return {
    data: {
      measure: measure.slug,
      label: measure.label,
      unit: measure.unit,
      scope,
      points: points.map((point) => [point.day, point.value]),
    },
  };
}
