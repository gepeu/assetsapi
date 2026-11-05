/** Tests for financials service. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { runUniverseJob } from "../../src/jobs/updateUniverse.ts";
import { getAssetFinancials } from "../../src/services/financials.ts";
import { createFakeProvider, makeAsset, TODAY, universeDeps } from "../helpers/fakeProvider.ts";
import { createTestDb, type TestDb } from "../helpers/testDb.ts";

describe("financials service", () => {
  let db: TestDb;

  before(async () => {
    db = await createTestDb();
    await runUniverseJob(universeDeps(db, createFakeProvider([makeAsset({ ref: "1" })])));
  });
  after(() => db.close());

  async function load() {
    const response = await getAssetFinancials(db.pool, "asset-1");
    assert.ok(response);
    return response.data;
  }

  test("figures carry labels, units, groups and lookbacks", async () => {
    const { figures, asOf } = await load();
    assert.equal(asOf, TODAY);
    assert.deepEqual(
      figures.find((figure) => figure.measure === "price_dollar"),
      {
        measure: "price_dollar",
        label: "Price",
        group: "Value",
        unit: "dollar",
        scope: "asset",
        value: 2,
        value7d: 1,
        value30d: 0,
        value90d: -1,
        asOf: TODAY,
      },
    );
  });

  test("unserved measures never appear", async () => {
    const data = await load();
    assert.ok(!data.figures.some((figure) => figure.measure === "raw_supply"));
    assert.ok(!data.terms.some((term) => term.key === "primary_markets"));
    assert.ok(!data.history.some((series) => series.measure === "raw_supply"));
  });

  test("holder shares come from the Solana token, not the asset's added-up figure", async () => {
    const { figures } = await load();
    const share = figures.filter((figure) => figure.measure === "top_holder_concentration");
    assert.equal(share.length, 1);
    assert.equal(share[0]?.scope, "solana");
    assert.equal(share[0]?.value, 40);
  });

  test("a share above 100% is stored but not served", async () => {
    const { figures } = await load();
    assert.ok(!figures.some((figure) => figure.measure === "top_5_holder_concentration"));
    const { rows } = await db.pool.query<{ value: number }>(
      `SELECT value FROM financial_current WHERE metric = 'top_5_holder_concentration' AND token_id IS NOT NULL`,
    );
    assert.equal(rows[0]?.value, 140);
  });

  test("a lookback share above 100% reads as null", async () => {
    await db.pool.query(
      `UPDATE financial_current SET value_30d = 150 WHERE metric = 'top_holder_concentration' AND token_id IS NOT NULL`,
    );
    const { figures } = await load();
    const share = figures.find((figure) => figure.measure === "top_holder_concentration");
    assert.equal(share?.value30d, null);
    assert.equal(share?.value7d, 39);
    await db.pool.query(
      `UPDATE financial_current SET value_30d = 38 WHERE metric = 'top_holder_concentration' AND token_id IS NOT NULL`,
    );
  });

  test("terms come back in their own type", async () => {
    const { terms } = await load();
    assert.deepEqual(
      terms.find((term) => term.key === "primary_market__subscription_frequency"),
      {
        key: "primary_market__subscription_frequency",
        label: "Subscriptions",
        valueType: "text",
        value: "Daily",
        asOf: TODAY,
      },
    );
    const fee = terms.find((term) => term.key === "total_management_fee_bps");
    assert.equal(fee?.value, 25);
    assert.equal(fee?.valueType, "decimal");
    assert.equal(fee?.label, "Management fee (bps)");
  });

  test("value by network has shares that add up to 100", async () => {
    const { networks } = await load();
    assert.deepEqual(networks, [
      { key: "solana", name: "Solana", value: 1200, share: 60 },
      { key: "ethereum", name: "Ethereum", value: 800, share: 40 },
    ]);
  });

  test("history lists what's available, with the right scope", async () => {
    const { history } = await load();
    assert.deepEqual(history, [
      { measure: "price_dollar", label: "Price", group: "Value", unit: "dollar", scope: "asset" },
      {
        measure: "holding_addresses_count",
        label: "Holders",
        group: "Supply and holders",
        unit: "address",
        scope: "solana",
      },
      {
        measure: "top_holder_concentration",
        label: "Top holder share",
        group: "Supply and holders",
        unit: "percent",
        scope: "solana",
      },
    ]);
  });

  test("a series on a deactivated token isn't offered, because /history can't serve it", async () => {
    await db.pool.query(
      `UPDATE token SET deactivated_at = now() WHERE network_id = (SELECT id FROM network WHERE key = 'solana')`,
    );
    const { history } = await load();
    assert.deepEqual(
      history.map((series) => series.measure),
      ["price_dollar"],
    );
    await db.pool.query("UPDATE token SET deactivated_at = NULL");
  });

  test("an unknown or deactivated asset is null", async () => {
    assert.equal(await getAssetFinancials(db.pool, "nope"), null);
  });
});
