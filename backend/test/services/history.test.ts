/** Tests for history service. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { runUniverseJob } from "../../src/jobs/updateUniverse.ts";
import { getAssetHistory } from "../../src/services/history.ts";
import { createFakeProvider, makeAsset, universeDeps } from "../helpers/fakeProvider.ts";
import { createTestDb, type TestDb } from "../helpers/testDb.ts";

describe("history service", () => {
  let db: TestDb;

  before(async () => {
    db = await createTestDb();
    await runUniverseJob(universeDeps(db, createFakeProvider([makeAsset({ ref: "1" })])));
  });
  after(() => db.close());

  test("returns daily points oldest first, with labels", async () => {
    const response = await getAssetHistory(db.pool, "asset-1", "price_dollar", "all");
    assert.deepEqual(response?.data, {
      measure: "price_dollar",
      label: "Price",
      unit: "dollar",
      scope: "asset",
      points: [
        ["2026-11-01", 2],
        ["2026-11-02", 3],
        ["2026-11-03", 4],
        ["2026-11-04", 5],
      ],
    });
  });

  test("a range counts back from the series' own last point", async () => {
    await db.pool.query(
      `INSERT INTO financial_timeseries (asset_id, measure, day, value, ingestion_run_id)
       SELECT a.id, 'apy_7_day', d::date, 1, (SELECT max(id) FROM ingestion_run)
       FROM asset a, generate_series('2024-01-01'::date, '2024-12-31'::date, '1 day') d
       WHERE a.slug = 'asset-1'`,
    );
    const count = async (range: string) =>
      (await getAssetHistory(db.pool, "asset-1", "apy_7_day", range))?.data.points.length;
    assert.equal(await count("7d"), 7);
    assert.equal(await count("30d"), 30);
    assert.equal(await count("3m"), 90);
    assert.equal(await count("1y"), 365);
    assert.equal(await count("all"), 366);
    const last = (await getAssetHistory(db.pool, "asset-1", "apy_7_day", "7d"))?.data.points.at(-1);
    assert.deepEqual(last, ["2024-12-31", 1]);
  });

  test("holder shares read the Solana series and skip impossible days", async () => {
    const response = await getAssetHistory(db.pool, "asset-1", "top_holder_concentration", "all");
    assert.equal(response?.data.scope, "solana");
    assert.deepEqual(response?.data.points, [
      ["2026-11-02", 50],
      ["2026-11-04", 40],
    ]);
  });

  test("a measure with only a Solana series reads that one", async () => {
    const response = await getAssetHistory(db.pool, "asset-1", "holding_addresses_count", "all");
    assert.equal(response?.data.scope, "solana");
    assert.deepEqual(response?.data.points, [["2026-11-04", 77]]);
  });

  test("a valid measure with no data has empty points", async () => {
    const response = await getAssetHistory(db.pool, "asset-1", "apy_30_day", "all");
    assert.deepEqual(response?.data.points, []);
    assert.equal(response?.data.scope, "asset");
  });

  test("an unknown or unserved measure, or an unknown asset, is null", async () => {
    assert.equal(await getAssetHistory(db.pool, "asset-1", "made_up", "all"), null);
    assert.equal(await getAssetHistory(db.pool, "asset-1", "raw_supply", "all"), null);
    assert.equal(await getAssetHistory(db.pool, "nope", "price_dollar", "all"), null);
  });
});
