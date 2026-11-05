import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ASSETS } from "../src/db/catalog/assets.ts";
import { createPool } from "../src/db/pool.ts";
import { requireEnv } from "../src/env.ts";
import { RwaXyzClient } from "../src/rwaXyz/client.ts";
import { loadFinancials } from "../src/rwaXyz/financials.ts";

const REPORT_PATH = join(import.meta.dirname, "../../.local/reports/rwa_xyz_financials.md");

const pool = createPool();

try {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO ingestion_run (source_id, parameters)
     SELECT id, '{"loader": "rwa_xyz_financials"}' FROM source WHERE key = 'rwa_xyz' RETURNING id`,
  );
  const runId = rows[0].id;
  const client = new RwaXyzClient({ apiKey: requireEnv("RWA_XYZ_API_KEY") });
  const summary = await loadFinancials(pool, client, runId, { onlySlugs: ASSETS.map((asset) => asset.slug) });

  const { rows: metrics } = await pool.query<{ metric: string; assets: number; tokens: number }>(
    `SELECT metric,
            count(*) FILTER (WHERE token_id IS NULL)::int AS assets,
            count(*) FILTER (WHERE token_id IS NOT NULL)::int AS tokens
     FROM financial_snapshot WHERE ingestion_run_id = $1
     GROUP BY metric ORDER BY assets DESC, tokens DESC, metric`,
    [runId],
  );
  const { rows: history } = await pool.query<{ measure: string; unit: string | null; assets: number; tokens: number; points: number; first: string; last: string }>(
    `SELECT t.measure, m.unit,
            count(DISTINCT t.asset_id) FILTER (WHERE t.token_id IS NULL)::int AS assets,
            count(DISTINCT t.token_id)::int AS tokens,
            count(*)::int AS points, min(t.day)::text AS first, max(t.day)::text AS last
     FROM financial_timeseries t JOIN financial_measure m ON m.slug = t.measure
     GROUP BY t.measure, m.unit ORDER BY t.measure`,
  );

  const lines = [
    "# Financial data load report",
    "",
    `Run ${runId}, ${new Date().toISOString()}.`,
    "",
    `Assets ${summary.assets}, tokens ${summary.tokens}, snapshot rows ${summary.snapshotRows}, history points saved ${summary.historyPoints}, history series skipped ${summary.historySeriesSkipped}.`,
    "",
    `## Not loaded (${summary.notLoaded.length})`,
    "",
    ...summary.notLoaded.map((m) => `- **${m.ticker}:** ${m.reason}`),
    "",
    `## Failures (${summary.failed.length})`,
    "",
    ...summary.failed.map((m) => `- **${m.ticker}:** ${m.error}`),
    "",
    `## Skipped tokens (${summary.tokensSkipped.length})`,
    "",
    ...summary.tokensSkipped.map((m) => `- **${m.ticker}:** ${String(m.name)}: ${m.reason}`),
    "",
    `## Snapshot metrics (${metrics.length})`,
    "",
    "| Metric | Assets | Tokens |",
    "| --- | --- | --- |",
    ...metrics.map((m) => `| \`${m.metric}\` | ${m.assets} | ${m.tokens} |`),
    "",
    `## History measures (${history.length})`,
    "",
    "| Measure | Unit | Assets | Tokens | Points | First | Last |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...history.map((h) => `| \`${h.measure}\` | ${h.unit ?? ""} | ${h.assets} | ${h.tokens} | ${h.points} | ${h.first} | ${h.last} |`),
    "",
  ];
  await mkdir(join(REPORT_PATH, ".."), { recursive: true });
  await writeFile(REPORT_PATH, lines.join("\n"));

  console.log({
    runId,
    assets: summary.assets,
    tokens: summary.tokens,
    snapshotRows: summary.snapshotRows,
    historyPoints: summary.historyPoints,
    historySeriesSkipped: summary.historySeriesSkipped,
    notLoaded: summary.notLoaded,
    failed: summary.failed,
    tokensSkipped: summary.tokensSkipped.length,
  });
  console.log(`Report: ${REPORT_PATH}`);
  if (summary.failed.length > 0) process.exitCode = 1;
} finally {
  await pool.end();
}
