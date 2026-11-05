import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type pg from "pg";
import { migrate } from "../src/db/migrate.ts";
import { createPool } from "../src/db/pool.ts";
import { seed } from "../src/db/seed.ts";
import { requireEnv } from "../src/env.ts";
import { RwaXyzClient } from "../src/rwaXyz/client.ts";
import { financialMetrics, loadFinancials } from "../src/rwaXyz/financials.ts";
import { ASSET_MAPPINGS, isFinancialField, ISSUER_MAPPINGS, NETWORK_MAPPINGS, TOKEN_MAPPINGS } from "../src/rwaXyz/mapping.ts";

const tracked = (val: number) => ({ val, val_7d: val - 1, val_30d: val - 2, val_90d: null, chg_7d_amt: 1 });

describe("financial fields", () => {
  it("reads tracked values, plain values, and keeps false and zero", () => {
    const metrics = financialMetrics({
      name: "Not financial",
      price_dollar: tracked(10),
      trailing_7_day_return_percent: 0,
      is_yield_bearing: false,
      fee_structure_description: "50 bps",
    });
    assert.deepEqual(metrics.map((m) => m.metric).sort(), [
      "fee_structure_description",
      "is_yield_bearing",
      "price_dollar",
      "trailing_7_day_return_percent",
    ]);
    const price = metrics.find((m) => m.metric === "price_dollar")!;
    assert.deepEqual([price.value, price.value7d, price.value30d, price.value90d], [10, 9, 8, null]);
    assert.equal(metrics.find((m) => m.metric === "trailing_7_day_return_percent")!.value, 0);
    assert.equal(metrics.find((m) => m.metric === "is_yield_bearing")!.value, null);
    assert.equal(metrics.find((m) => m.metric === "is_yield_bearing")!.raw, false);
  });

  it("treats null, empty and all-null values as nothing", () => {
    const metrics = financialMetrics({
      price_dollar: null,
      ratings: [],
      fee_structure_description: "",
      apy_7_day: { val: null, val_7d: null },
    });
    assert.deepEqual(metrics, []);
  });

  it("doesn't overlap with fields that become claims", () => {
    const mapped = [...ASSET_MAPPINGS, ...ISSUER_MAPPINGS, ...TOKEN_MAPPINGS, ...NETWORK_MAPPINGS];
    for (const mapping of mapped) {
      if (mapping.from.startsWith("primary_markets")) continue;
      for (const name of mapping.from.split(", ")) {
        assert.equal(isFinancialField(name.split(/[.[]/)[0]), false, name);
      }
    }
  });
});

describe("financial load", () => {
  const adminUrl = requireEnv("DATABASE_URL");
  const database = `rwa_fin_test_${process.pid}`;
  let admin: pg.Pool;
  let pool: pg.Pool;
  let assetId: number;
  let solanaToken: number;
  let ethereumToken: number;
  let price = 1.5;
  let failAsset = false;

  const fakeFetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/v4", "");
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (path === "/assets/15123") {
      if (failAsset) return json({}, 500);
      return json({ id: 15123, _updated_at: "2026-11-04T01:00:00", name: "OnRe", price_dollar: tracked(price), distributes_income: false, apy_7_day: null });
    }
    if (path === "/tokens") {
      return json({
        results: [
          { id: 1, name: "Solana ONyc", address: "OnycMint", network_id: 2, network: { slug: "solana" }, circulating_supply_token: tracked(100) },
          { id: 2, name: "Ethereum ONyc", address: "0xABC", network_id: 1, network: { slug: "ethereum" }, circulating_supply_token: tracked(50) },
          { id: 3, name: "Unknown", address: "Nope", network_id: 2, network: { slug: "solana" }, circulating_supply_token: tracked(5) },
        ],
        pagination: { pageCount: 1 },
      });
    }
    if (path === "/assets/aggregates/timeseries") {
      const measure = { slug: "price_dollar", name: "Price", unit: "dollar" };
      return json({
        results: [
          { measure, group: { id: 15123, type: "asset" }, points: [["2026-11-03", 1.4], ["2026-11-04", price], ["2026-11-05", null]] },
          { measure, group: { id: 999, type: "asset" }, points: [["2026-11-03", 77]] },
        ],
        pagination: { pageCount: 1 },
      });
    }
    if (path === "/tokens/aggregates/timeseries") {
      const query = JSON.parse(url.searchParams.get("query")!);
      const filters = query.filter.filters as { field: string; value: string }[];
      assert.deepEqual(filters.map((f) => [f.field, f.value]), [["asset_id", "15123"], ["network_id", "2"]]);
      const measure = { slug: "holding_addresses_count", unit: "count" };
      // Like the real API: asked for no grouping, it groups by protocol.
      if (query.aggregate?.groupBy !== "token") {
        return json({ results: [{ measure, group: { id: 8, type: "protocol" }, points: [["2026-11-04", 1]] }], pagination: { pageCount: 1 } });
      }
      return json({
        results: [
          { measure, group: { id: 1, type: "token" }, points: [["2026-11-04", 12], ["2026-11-04", 13]] },
          { measure, group: { id: 3, type: "token" }, points: [["2026-11-04", 99]] },
        ],
        pagination: { pageCount: 1 },
      });
    }
    return json({ message: "not found" }, 404);
  }) as typeof fetch;

  const client = new RwaXyzClient({ apiKey: "key", fetchImpl: fakeFetch, requestIntervalMs: 0 });
  const newRun = async () =>
    (await pool.query<{ id: string }>(`INSERT INTO ingestion_run (source_id) SELECT id FROM source WHERE key = 'rwa_xyz' RETURNING id`)).rows[0].id;

  before(async () => {
    admin = createPool(adminUrl);
    await admin.query(`CREATE DATABASE ${database}`);
    const url = new URL(adminUrl);
    url.pathname = `/${database}`;
    pool = createPool(url.toString());
    await migrate(pool);
    await seed(pool);
    assetId = (await pool.query<{ id: number }>(`SELECT id FROM asset WHERE slug = 'onyc'`)).rows[0].id;
    await pool.query(`INSERT INTO asset_alias (asset_id, namespace, value, verified) VALUES ($1, 'rwa_xyz_id', '15123', true)`, [assetId]);
    const network = async (key: string, sensitive: boolean) =>
      (await pool.query<{ id: number }>(`INSERT INTO network (key, name, address_case_sensitive) VALUES ($1, $1, $2) RETURNING id`, [key, sensitive])).rows[0].id;
    const addToken = async (networkId: number, address: string) =>
      (await pool.query<{ id: number }>(`INSERT INTO token (asset_id, network_id, address) VALUES ($1, $2, $3) RETURNING id`, [assetId, networkId, address])).rows[0].id;
    solanaToken = await addToken(await network("solana", true), "OnycMint");
    ethereumToken = await addToken(await network("ethereum", false), "0xABC");
  });

  after(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await admin.end();
  });

  const latest = (metric: string, tokenId: number | null) =>
    pool.query<{ value: number; value_7d: number; as_of: string; raw: unknown }>(
      `SELECT value, value_7d, as_of::text AS as_of, raw FROM financial_latest
       WHERE asset_id = $1 AND token_id IS NOT DISTINCT FROM $2 AND metric = $3`,
      [assetId, tokenId, metric],
    );
  const history = (measure: string, tokenId: number | null) =>
    pool.query<{ day: string; value: number }>(
      `SELECT day::text AS day, value FROM financial_timeseries
       WHERE asset_id = $1 AND token_id IS NOT DISTINCT FROM $2 AND measure = $3 ORDER BY day`,
      [assetId, tokenId, measure],
    );

  it("saves the asset and each of its tokens, and reports tokens that aren't ours", async () => {
    const summary = await loadFinancials(pool, client, await newRun(), { onlySlugs: ["onyc"] });
    assert.deepEqual(summary.failed, []);
    assert.equal(summary.assets, 1);
    assert.equal(summary.tokens, 2);
    assert.deepEqual(summary.tokensSkipped.map((t) => t.name), ["Unknown"]);
    // The other asset's series and the token that isn't ours.
    assert.equal(summary.historySeriesSkipped, 2);

    const { rows } = await latest("price_dollar", null);
    assert.equal(rows[0].value, 1.5);
    assert.equal(rows[0].value_7d, 0.5);
    assert.equal(rows[0].as_of, "2026-11-04");
    assert.equal((await latest("distributes_income", null)).rows[0].raw, false);
    assert.equal((await latest("apy_7_day", null)).rows.length, 0);
    assert.equal((await latest("circulating_supply_token", solanaToken)).rows[0].value, 100);
    // An EVM address is stored lowercase, and still matches.
    assert.equal((await latest("circulating_supply_token", ethereumToken)).rows[0].value, 50);
  });

  it("saves history, skipping nulls and other entities' series", async () => {
    assert.deepEqual((await history("price_dollar", null)).rows, [
      { day: "2026-11-03", value: 1.4 },
      { day: "2026-11-04", value: 1.5 },
    ]);
    const { rows: tokenRows } = await pool.query(`SELECT token_id, value FROM financial_timeseries WHERE measure = 'holding_addresses_count'`);
    assert.deepEqual(tokenRows, [{ token_id: solanaToken, value: 13 }]);
    const { rows: units } = await pool.query(`SELECT unit FROM financial_measure WHERE slug = 'price_dollar'`);
    assert.equal(units[0].unit, "dollar");
  });

  it("re-running adds a snapshot, overwrites a restated day and adds no duplicate", async () => {
    price = 2;
    await loadFinancials(pool, client, await newRun(), { onlySlugs: ["onyc"] });
    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM financial_snapshot WHERE asset_id = $1 AND token_id IS NULL AND metric = 'price_dollar'`,
      [assetId],
    );
    assert.equal(rows[0].n, 2);
    assert.equal((await latest("price_dollar", null)).rows[0].value, 2);
    assert.deepEqual((await history("price_dollar", null)).rows, [
      { day: "2026-11-03", value: 1.4 },
      { day: "2026-11-04", value: 2 },
    ]);
  });

  it("adds no claims and no catalog fields", async () => {
    const { rows } = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM claim`);
    assert.equal(rows[0].n, 0);
  });

  it("reports a failure and an unmatched asset without inventing data", async () => {
    failAsset = true;
    const run = await newRun();
    const summary = await loadFinancials(pool, client, run, { onlySlugs: ["onyc", "usdc"] });
    failAsset = false;
    assert.deepEqual(summary.failed.map((f) => f.ticker), ["ONyc"]);
    assert.deepEqual(summary.notLoaded.map((n) => n.ticker), ["USDC"]);
    const { rows } = await pool.query<{ status: string }>(`SELECT status FROM ingestion_run WHERE id = $1`, [run]);
    assert.equal(rows[0].status, "partial");
    // A failed load leaves the last good snapshot as the latest.
    assert.equal((await latest("price_dollar", null)).rows[0].value, 2);
  });
});
