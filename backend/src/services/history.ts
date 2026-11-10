/** Turns rows into the `history` part of an asset: daily points per metric, and which series to read. */
import { DEFAULT_HISTORY_RANGE, type HistorySection } from '../api/schemas/history.ts';
import type { Queryable } from '../db/pool.ts';
import type { MetricInfo } from '../db/queries/financials.ts';
import { findSeriesPresence, listHistoryPoints, type SeriesPresence } from '../db/queries/history.ts';

/** Read from the Solana token, because the asset-level value adds up each token's percentage. */
export const HOLDER_SHARE_METRICS: readonly string[] = [
  'top_holder_concentration',
  'top_5_holder_concentration',
  'top_10_holder_concentration',
];

/** A share above 100% can't be true, though the source has some. These are stored but not served. */
export const toServableShare = (value: number | null): number | null => (value !== null && value > 100 ? null : value);

const RANGE_DAYS: Readonly<Record<string, number | null>> = {
  '7d': 7,
  '30d': 30,
  '3m': 90,
  '1y': 365,
  all: null,
};

/** The whole-asset series when there is one, and otherwise the Solana token's. */
export function chooseSeriesScope(metric: string, presence: SeriesPresence): 'asset' | 'solana' {
  if (HOLDER_SHARE_METRICS.includes(metric)) return 'solana';
  return !presence.hasAssetSeries && presence.hasSolanaSeries ? 'solana' : 'asset';
}

export function loadHistory(
  db: Queryable,
  assetId: number,
  metrics: readonly MetricInfo[],
  range: string = DEFAULT_HISTORY_RANGE
): Promise<HistorySection> {
  return Promise.all(
    metrics.map(async (metric) => {
      const scope = chooseSeriesScope(metric.slug, await findSeriesPresence(db, assetId, metric.slug));
      const points = await listHistoryPoints(db, assetId, metric.slug, scope, RANGE_DAYS[range] ?? null);
      return {
        metric: metric.slug,
        label: metric.label,
        unit: metric.unit,
        scope,
        points: points.map((point) => [point.day, point.value]),
      };
    })
  );
}
