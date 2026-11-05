/** Tests for GET /assets/{slug}/fields. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/api/app.ts";
import { runUniverseJob } from "../../src/jobs/updateUniverse.ts";
import { createFakeProvider, makeAsset, universeDeps } from "../helpers/fakeProvider.ts";
import { createTestDb, createTestKey, silentLogger, type TestDb } from "../helpers/testDb.ts";

describe("GET /assets/{slug}/fields", () => {
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

  test("every value type survives serialisation", async () => {
    const response = await get("/assets/asset-1/fields");
    assert.equal(response.statusCode, 200);
    const { data } = response.json();
    const fields = data.categories.flatMap((category: { fields: object[] }) => category.fields) as {
      key: string;
      value: unknown;
    }[];
    assert.equal(fields.find((field) => field.key === "identity.name")?.value, "Asset 1");
    assert.deepEqual(fields.find((field) => field.key === "classification.sector")?.value, ["Cash"]);
    assert.equal(fields.find((field) => field.key === "identity.website")?.value, null);
    assert.deepEqual(Object.keys(data).sort(), ["categories", "coverage"]);
  });

  test("an unknown parameter is a 400 and an unknown asset a 404", async () => {
    assert.equal((await get("/assets/asset-1/fields?unknown=1")).statusCode, 400);
    assert.equal((await get("/assets/nope/fields")).statusCode, 404);
  });
});
