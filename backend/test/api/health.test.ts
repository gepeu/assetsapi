/** Tests for GET /readyz. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { pino } from "pino";
import { buildApp } from "../../src/api/app.ts";
import { createTestDb, silentLogger, type TestDb } from "../helpers/testDb.ts";

describe("GET /readyz", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  test("ready when the database is reachable and the schema is current", async () => {
    const app = await buildApp({ db: db.pool, logger: silentLogger });
    const response = await app.inject({ method: "GET", url: "/readyz" });
    await app.close();
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: "ready" });
  });

  test("HEAD works too, because some uptime monitors default to it", async () => {
    const app = await buildApp({ db: db.pool, logger: silentLogger });
    const response = await app.inject({ method: "HEAD", url: "/readyz" });
    await app.close();
    assert.equal(response.statusCode, 200);
    assert.equal(response.body, "");
  });

  test("a 503 when the schema is behind", async () => {
    await db.pool.query("DELETE FROM schema_migration WHERE filename = '002_catalog_seed.sql'");
    const app = await buildApp({ db: db.pool, logger: silentLogger });
    const response = await app.inject({ method: "GET", url: "/readyz" });
    await app.close();
    await db.pool.query("INSERT INTO schema_migration (filename) VALUES ('002_catalog_seed.sql')");
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error.code, "unavailable");
  });

  test("a 503 with no internals when the database is down, and the cause in the logs", async () => {
    const lines: string[] = [];
    const logger = pino({}, { write: (line: string) => void lines.push(line) });
    const app = await buildApp({
      db: {
        query: async () => {
          throw new Error("connect ECONNREFUSED 10.0.0.1:5432");
        },
      } as never,
      logger,
    });
    const response = await app.inject({ method: "GET", url: "/readyz" });
    await app.close();
    assert.equal(response.statusCode, 503);
    assert.ok(!response.body.includes("10.0.0.1"));
    assert.ok(lines.join("").includes("ECONNREFUSED"));
  });
});
