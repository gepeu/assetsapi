import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type pg from "pg";
import { migrate } from "../src/db/migrate.ts";
import { createPool } from "../src/db/pool.ts";
import { seed } from "../src/db/seed.ts";
import { requireEnv } from "../src/env.ts";
import { loadAssetFinancialHistory, loadAssetFinancials } from "../src/views/assetFinancials.ts";
import { VIEWS } from "../src/views/index.ts";

const adminUrl = requireEnv("DATABASE_URL");
const database = `rwa_fin_views_test_${process.pid}`;
let admin: pg.Pool;
let pool: pg.Pool;
let assetId: number;
let solanaToken: number;
let ethereumToken: number;
let baseToken: number;

const newRun = async () =>
  (await pool.query<{ id: string }>(`INSERT INTO ingestion_run (source_id) SELECT id FROM source WHERE key = 'rwa_xyz' RETURNING id`))
    .rows[0].id;

async function addMetric(
  run: string,
  metric: string,
  values: { value?: number | null; value30d?: number | null; raw?: unknown; tokenId?: number; asOf?: string },
): Promise<void> {
  await pool.query(
    `INSERT INTO financial_snapshot (ingestion_run_id, asset_id, token_id, metric, value, value_30d, raw, as_of)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      run,
      assetId,
      values.tokenId ?? null,
      metric,
      values.value ?? null,
      values.value30d ?? null,
      JSON.stringify(values.raw ?? values.value ?? null),
      values.asOf ?? "2026-11-04",
    ],
  );
}

async function addHistory(run: string, measure: string, tokenId: number | null, points: [string, number][]): Promise<void> {
  await pool.query(`INSERT INTO financial_measure (slug) VALUES ($1) ON CONFLICT (slug) DO NOTHING`, [measure]);
  for (const [day, value] of points) {
    await pool.query(
      `INSERT INTO financial_timeseries (asset_id, token_id, measure, day, value, ingestion_run_id) VALUES ($1, $2, $3, $4, $5, $6)`,
      [assetId, tokenId, measure, day, value, run],
    );
  }
}

before(async () => {
  admin = createPool(adminUrl);
  await admin.query(`CREATE DATABASE ${database}`);
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  pool = createPool(url.toString());
  await migrate(pool);
  await seed(pool);
  assetId = (await pool.query<{ id: number }>(`SELECT id FROM asset WHERE slug = 'onyc'`)).rows[0].id;

  const addToken = async (network: string, address: string) => {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO network (key, name, address_case_sensitive) VALUES ($1, initcap($1), true)
       ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [network],
    );
    return (
      await pool.query<{ id: number }>(`INSERT INTO token (asset_id, network_id, address) VALUES ($1, $2, $3) RETURNING id`, [
        assetId,
        rows[0].id,
        address,
      ])
    ).rows[0].id;
  };
  solanaToken = await addToken("solana", "OnycMint");
  ethereumToken = await addToken("ethereum", "0xabc");
  baseToken = await addToken("base", "0xdef");

  const stale = await newRun();
  await addMetric(stale, "price_dollar", { value: 1 });
  await addMetric(stale, "holding_addresses_count", { value: 1 });

  const run = await newRun();
  await addMetric(run, "price_dollar", { value: 1.5, value30d: 1.2 });
  await addMetric(run, "total_asset_value_dollar", { value: 400 });
  await addMetric(run, "apy_30_day", { value: 10.5, value30d: 11 });
  await addMetric(run, "trailing_1_year_return_percent", { value: 0 });
  await addMetric(run, "market_value_dollar", { value: 5, value30d: 0 });
  await addMetric(run, "primary_market__redemption_fee_bps", { value: 30 });
  await addMetric(run, "total_performance_fee_bps", { value: 2000 });
  await addMetric(run, "primary_market__minimum_subscription_amt", { value: 0 });
  await addMetric(run, "primary_market__redemption_frequency", { raw: "Instant" });
  await addMetric(run, "fee_structure_description", { raw: "Two and twenty." });
  await addMetric(run, "sp_rating", { raw: "" });
  await addMetric(run, "accounting_frequency_type_id", { value: 1 });
  await addMetric(run, "total_asset_value_dollar", { value: 300, tokenId: solanaToken });
  await addMetric(run, "total_asset_value_dollar", { value: 75, tokenId: ethereumToken });
  await addMetric(run, "total_asset_value_dollar", { value: 25, tokenId: baseToken });
  await addMetric(run, "holding_addresses_count", { value: 9, tokenId: solanaToken });
  // The asset-level shares add up each token's percentage, as the source does.
  await addMetric(run, "top_holder_concentration", { value: 160 });
  await addMetric(run, "top_holder_concentration", { value: 60, value30d: 50, tokenId: solanaToken });
  await addMetric(run, "top_holder_concentration", { value: 100, tokenId: ethereumToken });
  await addMetric(run, "top_5_holder_concentration", { value: 130, tokenId: solanaToken });
  await addMetric(run, "top_10_holder_concentration", { value: 90, value30d: 140, tokenId: solanaToken });

  await addHistory(run, "price_dollar", null, [
    ["2026-01-01", 1],
    ["2026-10-30", 1.4],
    ["2026-10-31", 1.45],
    ["2026-11-04", 1.5],
  ]);
  await addHistory(run, "holding_addresses_count", solanaToken, [["2026-11-04", 9]]);
  await addHistory(run, "monthly_transfer_count", solanaToken, [["2026-11-01", 3]]);
  await addHistory(run, "top_holder_concentration", solanaToken, [
    ["2026-11-03", 100],
    ["2026-11-04", 130],
  ]);
  await addHistory(run, "top_5_holder_concentration", solanaToken, [["2026-11-04", 120]]);
});

after(async () => {
  await pool?.end();
  await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  await admin.end();
});

describe("asset financials view", () => {
  it("gives figures from the latest load only, leaving out what's missing", async () => {
    const view = await loadAssetFinancials(pool, "onyc");
    assert.equal(view?.asOf, "2026-11-04");
    assert.deepEqual(view?.overview.map((figure) => figure.key), ["price_dollar", "total_asset_value_dollar", "apy_30_day"]);
  });

  it("compares percent figures in points and everything else as a percent change", async () => {
    const view = await loadAssetFinancials(pool, "onyc");
    const byKey = new Map(view?.overview.map((figure) => [figure.key, figure]));
    assert.ok(Math.abs(byKey.get("price_dollar")!.change30d! - 25) < 1e-9);
    assert.equal(byKey.get("apy_30_day")!.change30d, -0.5);
    assert.equal(byKey.get("total_asset_value_dollar")!.change30d, null);
  });

  it("keeps a zero, and has no change against a zero", async () => {
    const view = await loadAssetFinancials(pool, "onyc");
    const figures = view!.sections.flatMap((section) => section.figures);
    assert.equal(figures.find((figure) => figure.key === "trailing_1_year_return_percent")!.value, 0);
    assert.equal(figures.find((figure) => figure.key === "market_value_dollar")!.change30d, null);
    assert.deepEqual(view?.sections.map((section) => section.title), ["Returns and yield", "Supply and holders"]);
  });

  it("converts fees to percent and skips empty text and internal IDs", async () => {
    const view = await loadAssetFinancials(pool, "onyc");
    assert.deepEqual(
      view?.terms.map((term) => [term.key, term.format, term.value]),
      [
        ["primary_market__redemption_frequency", "text", "Instant"],
        ["primary_market__redemption_fee_bps", "percent", 0.3],
        ["primary_market__minimum_subscription_amt", "count", 0],
        ["total_performance_fee_bps", "percent", 20],
        ["fee_structure_description", "long_text", "Two and twenty."],
      ],
    );
  });

  it("ranks value by network with each one's share", async () => {
    const view = await loadAssetFinancials(pool, "onyc");
    assert.deepEqual(view?.networks, [
      { key: "solana", name: "Solana", value: 300, share: 75 },
      { key: "ethereum", name: "Ethereum", value: 75, share: 18.75 },
      { key: "base", name: "Base", value: 25, share: 6.25 },
    ]);
  });

  it("offers only charts with data, and says which cover just the Solana token", async () => {
    const view = await loadAssetFinancials(pool, "onyc");
    assert.deepEqual(
      view?.charts.map((chart) => [chart.measure, chart.scope]),
      [
        ["price_dollar", "asset"],
        ["holding_addresses_count", "solana"],
        ["top_holder_concentration", "solana"],
      ],
    );
  });

  it("reads holder shares from the Solana token, and doesn't serve an impossible one", async () => {
    const view = await loadAssetFinancials(pool, "onyc");
    const shares = view!.sections
      .flatMap((section) => section.figures)
      .filter((figure) => figure.key.endsWith("_concentration"))
      .map((figure) => [figure.key, figure.value, figure.change30d]);
    assert.deepEqual(shares, [
      ["top_holder_concentration", 60, 10],
      // Its value 30 days ago was impossible, so there's nothing to compare with.
      ["top_10_holder_concentration", 90, null],
    ]);
  });

  it("is empty, not missing, for an asset with no financial data", async () => {
    const view = await loadAssetFinancials(pool, "usdc");
    assert.deepEqual(view, { asOf: null, overview: [], sections: [], terms: [], networks: [], charts: [] });
  });

  it("doesn't name where the data came from", async () => {
    const view = await loadAssetFinancials(pool, "onyc");
    assert.doesNotMatch(JSON.stringify(view), /rwa[._ ]?xyz/i);
  });
});

describe("asset financial history view", () => {
  const days = async (range: string) =>
    (await loadAssetFinancialHistory(pool, "onyc", "price_dollar", range))?.points.map(([day]) => day);

  it("gives days as plain dates, oldest first, with their values", async () => {
    const view = await loadAssetFinancialHistory(pool, "onyc", "price_dollar", "7d");
    assert.deepEqual(view, {
      measure: "price_dollar",
      points: [
        ["2026-10-30", 1.4],
        ["2026-10-31", 1.45],
        ["2026-11-04", 1.5],
      ],
    });
  });

  it("counts a range back from the series' own last day", async () => {
    assert.deepEqual(await days("7d"), ["2026-10-30", "2026-10-31", "2026-11-04"]);
    assert.equal((await days("all"))?.length, 4);
    assert.equal((await days("1y"))?.length, 4);
    assert.deepEqual((await loadAssetFinancialHistory(pool, "onyc", "monthly_transfer_count", "7d"))?.points, [["2026-11-01", 3]]);
  });

  it("leaves out impossible holder shares", async () => {
    const view = await loadAssetFinancialHistory(pool, "onyc", "top_holder_concentration", "all");
    assert.deepEqual(view?.points, [["2026-11-03", 100]]);
    assert.equal(await loadAssetFinancialHistory(pool, "onyc", "top_5_holder_concentration", "all"), null);
  });

  it("is null for an unknown asset, measure or range", async () => {
    assert.equal(await loadAssetFinancialHistory(pool, "no-such-asset", "price_dollar", "all"), null);
    assert.equal(await loadAssetFinancialHistory(pool, "onyc", "no_such_measure", "all"), null);
    assert.equal(await loadAssetFinancialHistory(pool, "onyc", "price_dollar", "5y"), null);
    assert.equal(await loadAssetFinancialHistory(pool, "onyc", "price_dollar", "constructor"), null);
  });
});

describe("registered views", () => {
  it("serves both, with a missing asset as null and range defaulting to all", async () => {
    assert.equal(await VIEWS.asset_financials.load(pool, new URLSearchParams("asset=no-such-asset")), null);
    assert.equal(await VIEWS.asset_financial_history.load(pool, new URLSearchParams("asset=onyc")), null);
    const history = await VIEWS.asset_financial_history.load(pool, new URLSearchParams("asset=onyc&measure=price_dollar"));
    assert.equal((history as { points: unknown[] }).points.length, 4);
  });
});
