/** Tests for GET /assets/{slug}/financials. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/api/app.ts";
import { runUniverseJob } from "../../src/jobs/updateUniverse.ts";
import { createFakeProvider, makeAsset, universeDeps } from "../helpers/fakeProvider.ts";
import { createTestDb, createTestKey, silentLogger, type TestDb } from "../helpers/testDb.ts";

describe("GET /assets/{slug}/financials", () => {
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

  test("returns figures, terms, networks and available history", async () => {
    const response = await get("/assets/asset-1/financials");
    assert.equal(response.statusCode, 200);
    const { data } = response.json();
    assert.deepEqual(Object.keys(data).sort(), ["asOf", "figures", "history", "networks", "terms"]);
    const price = data.figures.find((figure: { measure: string }) => figure.measure === "price_dollar");
    assert.equal(price.value, 2);
    assert.equal(price.scope, "asset");
    assert.equal(price.unit, "dollar");
    assert.equal(data.networks[0].share, 60);
  });

  test("terms keep their types through serialisation", async () => {
    const { data } = (await get("/assets/asset-1/financials")).json();
    const term = (key: string) => data.terms.find((row: { key: string }) => row.key === key);
    assert.equal(term("primary_market__subscription_frequency").value, "Daily");
    assert.equal(term("total_management_fee_bps").value, 25);
  });

  test("an unknown parameter is a 400 and an unknown asset a 404", async () => {
    assert.equal((await get("/assets/asset-1/financials?range=7d")).statusCode, 400);
    assert.equal((await get("/assets/nope/financials")).statusCode, 404);
  });
});
