/** Tests for GET /assets/{slug}/tokens. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { type ApiHarness, createApiHarness, makeAsset } from "../helpers/fakeProvider.ts";

describe("GET /assets/{slug}/tokens", () => {
  let harness: ApiHarness;

  before(async () => {
    harness = await createApiHarness([makeAsset({ ref: "1" })]);
  });
  after(() => harness.close());

  const get = (url: string) => harness.get(url);

  test("returns one row per chain in the documented shape", async () => {
    const response = await get("/assets/asset-1/tokens");
    assert.equal(response.statusCode, 200);
    const { data } = response.json();
    assert.equal(data.length, 2);
    assert.deepEqual(Object.keys(data[0]).sort(), ["address", "asOf", "fields", "figures", "issuanceType", "network"]);
    assert.deepEqual(Object.keys(data[0].figures).sort(), [
      "holding_addresses_count",
      "market_value_dollar",
      "total_asset_value_dollar",
      "total_supply_token",
    ]);
    assert.equal(typeof data[0].fields[0].key, "string");
  });

  test("filters by network, and validates the filter", async () => {
    const { data } = (await get("/assets/asset-1/tokens?network=solana")).json();
    assert.equal(data.length, 1);
    assert.equal(data[0].network.key, "solana");
    assert.equal((await get("/assets/asset-1/tokens?network=Bad_Name")).statusCode, 400);
    assert.equal((await get("/assets/asset-1/tokens?other=1")).statusCode, 400);
  });

  test("an unknown asset is a 404", async () => {
    assert.equal((await get("/assets/nope/tokens")).statusCode, 404);
  });
});
