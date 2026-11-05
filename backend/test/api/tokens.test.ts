/** Tests for GET /assets/{slug}/tokens. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/api/app.ts";
import { runUniverseJob } from "../../src/jobs/updateUniverse.ts";
import { createFakeProvider, makeAsset, universeDeps } from "../helpers/fakeProvider.ts";
import { createTestDb, createTestKey, silentLogger, type TestDb } from "../helpers/testDb.ts";

describe("GET /assets/{slug}/tokens", () => {
  let db: TestDb;
  let app: FastifyInstance;
  let headers: { authorization: string };

  before(async () => {
    db = await createTestDb();
    await runUniverseJob(universeDeps(db, createFakeProvider([makeAsset({ ref: "1" })])));
    app = await buildApp({ db: db.pool, logger: silentLogger });
    headers = { authorization: `Bearer ${await createTestKey(db.pool)}` };
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  const get = (url: string) => app.inject({ method: "GET", url, headers });

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
