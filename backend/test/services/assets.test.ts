/** Tests for asset services. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { runUniverseJob } from "../../src/jobs/updateUniverse.ts";
import { getAsset, listAssets } from "../../src/services/assets.ts";
import { createFakeProvider, makeAsset, universeDeps } from "../helpers/fakeProvider.ts";
import { createTestDb, type TestDb } from "../helpers/testDb.ts";

describe("asset services", () => {
  let db: TestDb;

  before(async () => {
    db = await createTestDb();
    const stock = makeAsset({
      ref: "3",
      slug: "stock",
      ticker: "AAA",
      assetClass: "Stocks",
      assetType: "tokenized_equity",
    });
    const fund = makeAsset({
      ref: "1",
      slug: "fund",
      ticker: "CCC",
      assetClass: "US Treasury Debt",
      assetType: "tokenized_fund",
    });
    const coin = makeAsset({ ref: "2", slug: "coin", ticker: "BBB" });
    // Coin has no price, so sorting by price has to put it last either way.
    coin.current.values = coin.current.values.filter((row) => row.metric !== "price_dollar");
    coin.reference.tokens = coin.reference.tokens.filter((token) => token.network === "solana");
    coin.current.values = coin.current.values.filter((row) => row.token?.network !== "ethereum");
    const twin = makeAsset({ ref: "4", slug: "twin", ticker: "AAA" });
    const gone = makeAsset({ ref: "5", slug: "gone", ticker: "ZZZ", assetClass: "Gone Class" });
    await runUniverseJob(universeDeps(db, createFakeProvider([stock, fund, coin, twin, gone])));
    await db.pool.query("UPDATE asset SET deactivated_at = now() WHERE slug = 'gone'");
  });
  after(() => db.close());

  const slugs = (response: Awaited<ReturnType<typeof listAssets>>) => response.data.map((row) => row.slug);

  test("lists active assets only, by ticker and then slug", async () => {
    const response = await listAssets(db.pool, {});
    assert.deepEqual(slugs(response), ["stock", "twin", "coin", "fund"]);
    assert.equal(response.meta.total, 4);
    assert.equal(response.meta.limit, 50);
    assert.equal(response.meta.offset, 0);
  });

  test("each row has its identity, issuer, date and figures", async () => {
    const response = await listAssets(db.pool, { q: "CCC" });
    assert.deepEqual(response.data[0], {
      slug: "fund",
      ticker: "CCC",
      name: "Asset 1",
      assetClass: "US Treasury Debt",
      assetType: "tokenized_fund",
      issuer: "Shared Issuer",
      asOf: "2026-11-05",
      figures: {
        price_dollar: 2,
        net_asset_value_dollar: 2,
        total_asset_value_dollar: 2000,
        apy_30_day: null,
        holding_addresses_count: 20,
      },
    });
  });

  test("filter options describe all active assets, whatever the filter", async () => {
    const { meta } = await listAssets(db.pool, { assetType: "tokenized_fund" });
    assert.deepEqual(meta.filters.assetClasses, ["Stablecoins", "Stocks", "US Treasury Debt"]);
    assert.deepEqual(meta.filters.assetTypes, ["stablecoin", "tokenized_equity", "tokenized_fund"]);
    assert.deepEqual(meta.filters.networks, ["ethereum", "solana"]);
  });

  test("filters by class, type and network", async () => {
    assert.deepEqual(slugs(await listAssets(db.pool, { assetClass: "Stocks" })), ["stock"]);
    assert.deepEqual(slugs(await listAssets(db.pool, { assetType: "tokenized_fund" })), ["fund"]);
    assert.deepEqual(slugs(await listAssets(db.pool, { network: "ethereum" })), ["stock", "twin", "fund"]);
    assert.deepEqual(slugs(await listAssets(db.pool, { network: "nowhere" })), []);
  });

  test("searches ticker, name and issuer, and treats wildcards as text", async () => {
    assert.deepEqual(slugs(await listAssets(db.pool, { q: "bbb" })), ["coin"]);
    assert.deepEqual(slugs(await listAssets(db.pool, { q: "Asset 3" })), ["stock"]);
    assert.equal((await listAssets(db.pool, { q: "shared iss" })).meta.total, 4);
    assert.equal((await listAssets(db.pool, { q: "%" })).meta.total, 0);
    assert.equal((await listAssets(db.pool, { q: "_" })).meta.total, 0);
  });

  test("missing figures sort last in both directions", async () => {
    assert.deepEqual(slugs(await listAssets(db.pool, { sort: "price_dollar" })), ["fund", "stock", "twin", "coin"]);
    assert.deepEqual(slugs(await listAssets(db.pool, { sort: "-price_dollar" })), ["twin", "stock", "fund", "coin"]);
  });

  test("ties break by slug, so paging stays stable", async () => {
    assert.deepEqual(slugs(await listAssets(db.pool, { sort: "apy_30_day" })), ["coin", "fund", "stock", "twin"]);
    assert.deepEqual(slugs(await listAssets(db.pool, { sort: "-apy_30_day" })), ["coin", "fund", "stock", "twin"]);
  });

  test("pages through results, and the total ignores paging", async () => {
    const page = await listAssets(db.pool, { limit: 2, offset: 2 });
    assert.deepEqual(slugs(page), ["coin", "fund"]);
    assert.equal(page.meta.total, 4);
    const beyond = await listAssets(db.pool, { offset: 100 });
    assert.deepEqual(beyond.data, []);
    assert.equal(beyond.meta.total, 4);
  });

  test("detail returns identity, issuer, organizations, networks and figures", async () => {
    const response = await getAsset(db.pool, "fund");
    assert.ok(response);
    const { data } = response;
    assert.equal(data.description, "About asset 1");
    assert.equal(data.issuer, "Shared Issuer");
    assert.deepEqual(data.organizations, [
      { slug: "shared-issuer", name: "Shared Issuer", role: "issuer", legalName: "Shared Issuer Ltd" },
      { slug: "manager-1", name: "Manager 1", role: "manager", legalName: null },
    ]);
    assert.deepEqual(data.networks, [
      { key: "ethereum", name: "Ethereum" },
      { key: "solana", name: "Solana" },
    ]);
    assert.equal(data.figures.price_dollar, 2);
    assert.equal(data.asOf, "2026-11-05");
  });

  test("an unknown or deactivated asset is null", async () => {
    assert.equal(await getAsset(db.pool, "nope"), null);
    assert.equal(await getAsset(db.pool, "gone"), null);
  });

  test("an unserved measure never appears in figures", async () => {
    await db.pool.query("UPDATE financial_measure SET served = false WHERE slug = 'price_dollar'");
    try {
      const listed = await listAssets(db.pool, { q: "CCC" });
      assert.equal(listed.data[0]?.figures.price_dollar, null);
      assert.equal((await getAsset(db.pool, "fund"))?.data.figures.price_dollar, null);
    } finally {
      await db.pool.query("UPDATE financial_measure SET served = true WHERE slug = 'price_dollar'");
    }
  });
});
