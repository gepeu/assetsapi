/** Tests for GET /assets/{slug}/history. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/api/app.ts";
import { runUniverseJob } from "../../src/jobs/updateUniverse.ts";
import { createFakeProvider, makeAsset, universeDeps } from "../helpers/fakeProvider.ts";
import { createTestDb, createTestKey, silentLogger, type TestDb } from "../helpers/testDb.ts";

describe("GET /assets/{slug}/history", () => {
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

  test("points serialise as [day, number] pairs", async () => {
    const response = await get("/assets/asset-1/history?measure=price_dollar");
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().data, {
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

  test("the measure is required, and the range must be a known one", async () => {
    assert.equal((await get("/assets/asset-1/history")).statusCode, 400);
    assert.equal((await get("/assets/asset-1/history?measure=Bad-Name")).statusCode, 400);
    assert.equal((await get("/assets/asset-1/history?measure=price_dollar&range=2w")).statusCode, 400);
    for (const range of ["7d", "30d", "3m", "1y", "all"]) {
      assert.equal((await get(`/assets/asset-1/history?measure=price_dollar&range=${range}`)).statusCode, 200, range);
    }
  });

  test("an unknown or unserved measure is a 404", async () => {
    assert.equal((await get("/assets/asset-1/history?measure=made_up")).statusCode, 404);
    assert.equal((await get("/assets/asset-1/history?measure=raw_supply")).statusCode, 404);
  });

  test("a valid measure with no data has empty points", async () => {
    const response = await get("/assets/asset-1/history?measure=apy_30_day");
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().data.points, []);
  });
});
