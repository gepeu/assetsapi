import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ASSETS } from "../src/db/catalog/assets.ts";
import { createPool } from "../src/db/pool.ts";
import { requireEnv } from "../src/env.ts";
import { RwaXyzClient } from "../src/rwaXyz/client.ts";
import { loadRwaXyz, rawResponseKeeper } from "../src/rwaXyz/load.ts";
import { createBucketStorage } from "../src/storage.ts";

const REPORT_PATH = join(import.meta.dirname, "../../.local/reports/rwa_xyz.md");

const pool = createPool();
const storage = createBucketStorage();

try {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO ingestion_run (source_id, parameters)
     SELECT id, '{"loader": "rwa_xyz"}' FROM source WHERE key = 'rwa_xyz' RETURNING id`,
  );
  const runId = rows[0].id;

  const keeper = rawResponseKeeper(pool, storage, () => runId);
  const client = new RwaXyzClient({
    apiKey: requireEnv("RWA_XYZ_API_KEY"),
    onResponse: keeper.onResponse,
  });
  const summary = await loadRwaXyz(pool, client, runId, {
    rawResponsesKept: keeper.kept,
    onlySlugs: ASSETS.map((asset) => asset.slug),
  });

  const { rows: never } = await pool.query<{ key: string; category: string }>(`
    SELECT f.key, f.category FROM field f
    WHERE NOT EXISTS (
      SELECT 1 FROM claim c JOIN source s ON s.id = c.source_id
      WHERE c.field_id = f.id AND s.key = 'rwa_xyz'
    )
    ORDER BY f.sort_order
  `);
  const { rows: filled } = await pool.query<{ key: string; assets: number }>(`
    SELECT f.key, count(DISTINCT coalesce(c.asset_id, t.asset_id))::int AS assets
    FROM claim c JOIN field f ON f.id = c.field_id
    LEFT JOIN token t ON t.id = c.token_id
    GROUP BY f.key, f.sort_order ORDER BY f.sort_order
  `);

  const lines = [
    "# RWA.xyz load report",
    "",
    `Run ${runId}, ${new Date().toISOString()}.`,
    "",
    "```json",
    JSON.stringify(
      {
        claimsAdded: summary.claimsAdded,
        claimsUnchanged: summary.claimsUnchanged,
        tokensSeen: summary.tokensSeen,
        rawResponsesKept: summary.rawResponsesKept,
      },
      null,
      2,
    ),
    "```",
    "",
    `## Matched (${summary.matched.length})`,
    "",
    "| Asset | RWA.xyz ID | Matched by | Tokens |",
    "| --- | --- | --- | --- |",
    ...summary.matched.map((m) => `| ${m.ticker} | ${String(m.rwaId)} | ${m.method} | ${m.tokens} |`),
    "",
    `## Not found in RWA.xyz (${summary.notFound.length})`,
    "",
    ...summary.notFound.map((m) => `- **${m.ticker}:** ${m.reason}`),
    "",
    `## ID mismatches (${summary.mismatched.length})`,
    "",
    ...summary.mismatched.map((m) => `- **${m.ticker}:** ${m.reason}`),
    "",
    `## Failures (${summary.failed.length})`,
    "",
    ...summary.failed.map((m) => `- **${m.ticker}:** ${m.error}`),
    "",
    `## Skipped tokens (${summary.tokensSkipped.length})`,
    "",
    ...summary.tokensSkipped.map((m) => `- **${m.ticker}:** ${String(m.name)}: ${m.reason}`),
    "",
    `## Assets filled, per field (${filled.length} fields)`,
    "",
    "| Field | Assets |",
    "| --- | --- |",
    ...filled.map((f) => `| \`${f.key}\` | ${f.assets} |`),
    "",
    `## Fields RWA.xyz never filled (${never.length})`,
    "",
    "Official documents and the AI researcher must cover these.",
    "",
    ...never.map((f) => `- ${f.category}: \`${f.key}\``),
    "",
  ];
  await mkdir(join(REPORT_PATH, ".."), { recursive: true });
  await writeFile(REPORT_PATH, lines.join("\n"));

  console.log({
    runId,
    matched: summary.matched.length,
    notFound: summary.notFound.map((m) => m.ticker),
    mismatched: summary.mismatched,
    failed: summary.failed,
    claimsAdded: summary.claimsAdded,
    claimsUnchanged: summary.claimsUnchanged,
    tokensSeen: summary.tokensSeen,
    tokensSkipped: summary.tokensSkipped.length,
    rawResponsesKept: summary.rawResponsesKept,
    neverFilled: never.length,
  });
  console.log(`Report: ${REPORT_PATH}`);
  if (summary.failed.length > 0) process.exitCode = 1;
} finally {
  await pool.end();
}
