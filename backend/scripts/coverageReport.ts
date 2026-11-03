import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createPool } from "../src/db/pool.ts";

const REPORT_PATH = join(import.meta.dirname, "../../.local/reports/coverage.md");
const pool = createPool();

try {
  const { rows: categories } = await pool.query<{ category: string }>(
    `SELECT category FROM field GROUP BY category ORDER BY min(sort_order)`,
  );
  const { rows } = await pool.query<{ ticker: string; category: string; disclosed: number; applicable: number }>(
    `SELECT a.ticker, c.category, c.disclosed::int, c.applicable::int
     FROM asset_coverage c JOIN asset a ON a.id = c.asset_id`,
  );

  const byAsset = new Map<string, Map<string, string>>();
  const totals = new Map<string, { disclosed: number; applicable: number }>();
  for (const row of rows) {
    if (!byAsset.has(row.ticker)) byAsset.set(row.ticker, new Map());
    byAsset.get(row.ticker)!.set(row.category, `${row.disclosed}/${row.applicable}`);
    const total = totals.get(row.ticker) ?? { disclosed: 0, applicable: 0 };
    total.disclosed += row.disclosed;
    total.applicable += row.applicable;
    totals.set(row.ticker, total);
  }
  const tickers = [...byAsset.keys()].sort(
    (a, b) => totals.get(b)!.disclosed - totals.get(a)!.disclosed || a.localeCompare(b),
  );

  const lines = [
    "# Coverage",
    "",
    `Generated ${new Date().toISOString()}. Each cell is disclosed / applicable. A dash means the category doesn't apply to that asset type.`,
    "",
    `| Asset | Total | ${categories.map((c) => c.category).join(" | ")} |`,
    `| --- | --- | ${categories.map(() => "---").join(" | ")} |`,
    ...tickers.map((ticker) => {
      const total = totals.get(ticker)!;
      const cells = categories.map((c) => byAsset.get(ticker)!.get(c.category) ?? "–");
      return `| ${ticker} | ${total.disclosed}/${total.applicable} | ${cells.join(" | ")} |`;
    }),
    "",
  ];
  await mkdir(join(REPORT_PATH, ".."), { recursive: true });
  await writeFile(REPORT_PATH, lines.join("\n"));
  console.log(lines.join("\n"));
} finally {
  await pool.end();
}
