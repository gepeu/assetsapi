import type pg from "pg";
import { inTransaction } from "../db/pool.ts";
import type { ApiRecord, RwaXyzClient, TimeseriesSeries } from "./client.ts";
import { isFinancialField } from "./mapping.ts";

const SOLANA = "solana";
const BATCH_SIZE = 5000;

export interface FinancialMetric {
  metric: string;
  value: number | null;
  value7d: number | null;
  value30d: number | null;
  value90d: number | null;
  raw: unknown;
}

export interface FinancialLoadSummary {
  runId: string;
  assets: number;
  tokens: number;
  snapshotRows: number;
  historyPoints: number;
  /** Series for an entity we can't place. Anything above zero means history went unsaved. */
  historySeriesSkipped: number;
  notLoaded: { ticker: string; reason: string }[];
  tokensSkipped: { ticker: string; name: unknown; reason: string }[];
  failed: { ticker: string; error: string }[];
}

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const isObject = (value: unknown): value is ApiRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasNoValue = (raw: unknown): boolean => {
  if (raw === null || raw === undefined || raw === "") return true;
  if (Array.isArray(raw)) return raw.length === 0;
  if (isObject(raw)) return Object.values(raw).every((value) => value === null || value === undefined);
  return false;
};

/** Every financial field that has a value. A false or a zero is a value; a null is not. */
export function financialMetrics(record: ApiRecord): FinancialMetric[] {
  const metrics: FinancialMetric[] = [];
  for (const [metric, raw] of Object.entries(record)) {
    if (!isFinancialField(metric) || hasNoValue(raw)) continue;
    const tracked = isObject(raw) && "val" in raw ? raw : null;
    metrics.push({
      metric,
      value: numberOrNull(tracked ? tracked.val : raw),
      value7d: numberOrNull(tracked?.val_7d),
      value30d: numberOrNull(tracked?.val_30d),
      value90d: numberOrNull(tracked?.val_90d),
      raw,
    });
  }
  return metrics;
}

const dateOf = (value: unknown): string | null => {
  const date = typeof value === "string" ? value.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
};

interface OurToken {
  id: number;
  network: string;
  address: string;
  caseSensitive: boolean;
}

async function insertSnapshot(
  db: pg.PoolClient,
  runId: string,
  assetId: number,
  tokenId: number | null,
  asOf: string,
  metrics: readonly FinancialMetric[],
): Promise<void> {
  if (metrics.length === 0) return;
  await db.query(
    `INSERT INTO financial_snapshot (ingestion_run_id, asset_id, token_id, metric, value, value_7d, value_30d, value_90d, raw, as_of)
     SELECT $1, $2, $3, m.metric, m.value, m.value_7d, m.value_30d, m.value_90d, m.raw, $4
     FROM unnest($5::text[], $6::float8[], $7::float8[], $8::float8[], $9::float8[], $10::jsonb[])
       AS m(metric, value, value_7d, value_30d, value_90d, raw)`,
    [
      runId,
      assetId,
      tokenId,
      asOf,
      metrics.map((m) => m.metric),
      metrics.map((m) => m.value),
      metrics.map((m) => m.value7d),
      metrics.map((m) => m.value30d),
      metrics.map((m) => m.value90d),
      metrics.map((m) => JSON.stringify(m.raw)),
    ],
  );
}

/** Saves one series. A point with no usable number is skipped. Returns the points saved. */
async function saveSeries(
  pool: pg.Pool,
  runId: string,
  assetId: number,
  tokenId: number | null,
  series: TimeseriesSeries,
): Promise<number> {
  const slug = series.measure?.slug;
  if (!slug) return 0;
  // The API can repeat a day, and one upsert can't touch the same row twice. The last one stands.
  const byDay = new Map<string, number>();
  for (const [day, value] of series.points ?? []) {
    const date = dateOf(day);
    const number = numberOrNull(value);
    if (date && number !== null) byDay.set(date, number);
  }
  const points = [...byDay];
  if (points.length === 0) return 0;

  await pool.query(
    `INSERT INTO financial_measure (slug, name, unit) VALUES ($1, $2, $3)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, unit = EXCLUDED.unit`,
    [slug, series.measure?.name ?? null, series.measure?.unit ?? null],
  );
  for (let start = 0; start < points.length; start += BATCH_SIZE) {
    const batch = points.slice(start, start + BATCH_SIZE);
    await pool.query(
      `INSERT INTO financial_timeseries (asset_id, token_id, measure, day, value, ingestion_run_id)
       SELECT $1, $2, $3, p.day, p.value, $4 FROM unnest($5::date[], $6::float8[]) AS p(day, value)
       ON CONFLICT (asset_id, token_id, measure, day)
       DO UPDATE SET value = EXCLUDED.value, ingestion_run_id = EXCLUDED.ingestion_run_id`,
      [assetId, tokenId, slug, runId, batch.map(([day]) => day), batch.map(([, value]) => value)],
    );
  }
  return points.length;
}

export interface FinancialLoadOptions {
  /** Limits the load, by our slug. */
  onlySlugs?: readonly string[];
}

/**
 * Loads financial data for assets that `loadRwaXyz` has already matched: a snapshot of the asset and
 * all its tokens on every chain, the asset's daily history, and daily history for its Solana tokens.
 * Safe to re-run: each run adds a snapshot, and history updates in place.
 */
export async function loadFinancials(
  pool: pg.Pool,
  client: RwaXyzClient,
  runId: string,
  options: FinancialLoadOptions = {},
): Promise<FinancialLoadSummary> {
  const today = new Date().toISOString().slice(0, 10);
  const { rows: assets } = await pool.query<{ id: number; slug: string; ticker: string; rwa_id: string | null }>(
    `SELECT a.id, a.slug, a.ticker, x.value AS rwa_id
     FROM asset a LEFT JOIN asset_alias x ON x.asset_id = a.id AND x.namespace = 'rwa_xyz_id'
     ORDER BY a.ticker`,
  );
  const summary: FinancialLoadSummary = {
    runId,
    assets: 0,
    tokens: 0,
    snapshotRows: 0,
    historyPoints: 0,
    historySeriesSkipped: 0,
    notLoaded: [],
    tokensSkipped: [],
    failed: [],
  };

  for (const asset of assets) {
    if (options.onlySlugs && !options.onlySlugs.includes(asset.slug)) continue;
    if (!asset.rwa_id) {
      summary.notLoaded.push({ ticker: asset.ticker, reason: "Not matched yet: run rwa:load first" });
      continue;
    }
    try {
      const rwaId = Number(asset.rwa_id);
      const record = await client.getAsset(rwaId);
      if (!record) {
        summary.notLoaded.push({ ticker: asset.ticker, reason: `ID ${rwaId} no longer exists` });
        continue;
      }
      const tokenRecords = await client.listTokensForAsset(rwaId);
      const { rows: ourTokens } = await pool.query<OurToken>(
        `SELECT t.id, n.key AS network, t.address, n.address_case_sensitive AS "caseSensitive"
         FROM token t JOIN network n ON n.id = t.network_id WHERE t.asset_id = $1`,
        [asset.id],
      );
      const byAddress = new Map(ourTokens.map((t) => [`${t.network}:${t.address}`, t]));
      const findOurs = (token: ApiRecord): OurToken | undefined => {
        const network = (token.network as ApiRecord | null | undefined)?.slug;
        const address = token.address;
        if (typeof network !== "string" || typeof address !== "string") return undefined;
        return byAddress.get(`${network}:${address}`) ?? byAddress.get(`${network}:${address.toLowerCase()}`);
      };

      const asOf = dateOf(record._updated_at) ?? today;
      const assetMetrics = financialMetrics(record);
      const rows = await inTransaction(pool, async (db) => {
        await insertSnapshot(db, runId, asset.id, null, asOf, assetMetrics);
        let count = assetMetrics.length;
        for (const token of tokenRecords) {
          const ours = findOurs(token);
          if (!ours) {
            summary.tokensSkipped.push({ ticker: asset.ticker, name: token.name, reason: "Not one of our tokens" });
            continue;
          }
          const metrics = financialMetrics(token);
          await insertSnapshot(db, runId, asset.id, ours.id, dateOf(token._updated_at) ?? asOf, metrics);
          count += metrics.length;
          summary.tokens++;
        }
        return count;
      });
      summary.snapshotRows += rows;

      for (const series of await client.timeseries("assets", [{ field: "asset_id", value: rwaId }])) {
        if (series.group?.id === rwaId) {
          summary.historyPoints += await saveSeries(pool, runId, asset.id, null, series);
        } else {
          summary.historySeriesSkipped++;
        }
      }

      // Solana is the chain the universe is defined on. Other chains' history isn't loaded.
      const solana = tokenRecords.filter((token) => (token.network as ApiRecord | null | undefined)?.slug === SOLANA);
      const networkId = solana.find((token) => typeof token.network_id === "number")?.network_id;
      if (networkId !== undefined) {
        const byRwaId = new Map(solana.map((token) => [token.id, findOurs(token)]));
        const filters = [
          { field: "asset_id", value: rwaId },
          { field: "network_id", value: networkId as number },
        ];
        for (const series of await client.timeseries("tokens", filters)) {
          const ours = byRwaId.get(series.group?.id);
          if (ours) summary.historyPoints += await saveSeries(pool, runId, asset.id, ours.id, series);
          else summary.historySeriesSkipped++;
        }
      }
      summary.assets++;
    } catch (error) {
      summary.failed.push({ ticker: asset.ticker, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const status = summary.failed.length > 0 ? "partial" : "succeeded";
  await pool.query(`UPDATE ingestion_run SET finished_at = now(), status = $1, summary = $2 WHERE id = $3`, [
    status,
    JSON.stringify(summary),
    runId,
  ]);
  return summary;
}
