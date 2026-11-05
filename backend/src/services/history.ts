/** Turns rows into `/assets/{slug}/history`: daily points for one measure. */
import type { HistoryResponse } from "../api/schemas/history.ts";
import type { Queryable } from "../db/pool.ts";
import { findActiveAssetBySlug } from "../db/queries/assets.ts";
import { findSeriesScope, findServedMeasure, listHistoryPoints } from "../db/queries/financials.ts";
import { HOLDER_SHARE_MEASURES } from "./financials.ts";

const RANGE_DAYS: Readonly<Record<string, number | null>> = {
  "7d": 7,
  "30d": 30,
  "3m": 90,
  "1y": 365,
  all: null,
};

/** Null when the asset or the measure is unknown, or the measure isn't served. */
export async function getAssetHistory(
  db: Queryable,
  slug: string,
  measureSlug: string,
  range: string,
): Promise<HistoryResponse | null> {
  const [asset, measure] = await Promise.all([findActiveAssetBySlug(db, slug), findServedMeasure(db, measureSlug)]);
  if (!asset || !measure) return null;

  let scope: "asset" | "solana" = "solana";
  if (!HOLDER_SHARE_MEASURES.includes(measure.slug)) {
    const { hasAssetSeries } = await findSeriesScope(db, asset.id, measure.slug);
    const points = hasAssetSeries ? [] : await listHistoryPoints(db, asset.id, measure.slug, "solana", 1);
    scope = hasAssetSeries || points.length === 0 ? "asset" : "solana";
  }

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
