/** Tests for the in-memory response cache: the store's budget, and the cache through the real app. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/api/app.ts";
import { ResponseStore } from "../../src/api/cache.ts";
import { makeAsset, seedAssets } from "../helpers/fakeProvider.ts";
import { createTestDb, createTestKey, silentLogger, type TestDb } from "../helpers/testDb.ts";

describe("ResponseStore", () => {
  // Each entry below is a one-letter key and a nine-letter body: 10 bytes.
  const body = (letter: string) => letter.repeat(9);

  test("keeps bodies by key and version", () => {
    const store = new ResponseStore(100);
    store.set("a", body("a"), "1");
    assert.equal(store.get("a", "1"), body("a"));
    assert.equal(store.get("b", "1"), null);
  });

  test("a body kept under another version is dropped", () => {
    const store = new ResponseStore(100);
    store.set("a", body("a"), "1");
    assert.equal(store.get("a", "2"), null);
    assert.equal(store.size, 0);
    assert.equal(store.bytes, 0);
  });

  test("when full, the least recently used goes first", () => {
    const store = new ResponseStore(30);
    store.set("a", body("a"), "1");
    store.set("b", body("b"), "1");
    store.set("c", body("c"), "1");
    store.get("a", "1");
    store.set("d", body("d"), "1");
    assert.equal(store.get("b", "1"), null);
    assert.equal(store.get("a", "1"), body("a"));
    assert.equal(store.bytes, 30);
  });

  test("a body bigger than the whole budget isn't kept", () => {
    const store = new ResponseStore(5);
    store.set("a", body("a"), "1");
    assert.equal(store.size, 0);
  });

  test("replacing a key counts its bytes once", () => {
    const store = new ResponseStore(100);
    store.set("a", body("a"), "1");
    store.set("a", body("b"), "1");
    assert.equal(store.bytes, 10);
    assert.equal(store.get("a", "1"), body("b"));
  });
});

describe("response cache in the API", () => {
  const CHECK_MS = 10_000;
  let db: TestDb;
  let app: FastifyInstance;
  let off: FastifyInstance;
  let time = 1_000_000;
  let headers: Record<string, string>;

  before(async () => {
    db = await createTestDb();
    await seedAssets(db, [makeAsset({ ref: "1" })]);
    app = await buildApp({ db: db.pool, logger: silentLogger, now: () => time, cacheVersionCheckMs: CHECK_MS });
    off = await buildApp({ db: db.pool, logger: silentLogger, cacheMaxBytes: 0 });
    headers = { authorization: `Bearer ${await createTestKey(db.pool)}` };
  });
  after(async () => {
    await app.close();
    await off.close();
    await db.close();
  });

  const get = (url: string, extra: Record<string, string> = {}, target = app) =>
    target.inject({ method: "GET", url, headers: { ...headers, ...extra } });

  test("the first call is a miss, the next a hit with the same body and ETag", async () => {
    const url = "/tokenized_assets?limit=5";
    const first = await get(url);
    const second = await get(url);
    assert.equal(first.headers["x-cache"], "miss");
    assert.equal(second.headers["x-cache"], "hit");
    assert.equal(second.statusCode, 200);
    assert.equal(second.body, first.body);
    assert.equal(second.headers.etag, first.headers.etag);
    assert.equal(second.headers["content-type"], first.headers["content-type"]);
    assert.equal(second.headers["cache-control"], "private, no-cache");
  });

  test("each route and each query is kept apart", async () => {
    await get("/tokenized_assets/catalog");
    assert.equal((await get("/tokenized_assets/catalog")).headers["x-cache"], "hit");
    await get("/tokenized_assets/asset-1");
    assert.equal((await get("/tokenized_assets/asset-1")).headers["x-cache"], "hit");
    assert.equal((await get("/tokenized_assets/asset-1?include=tokens")).headers["x-cache"], "miss");
  });

  test("a hit still needs a key", async () => {
    await get("/tokenized_assets/asset-1");
    const response = await app.inject({ method: "GET", url: "/tokenized_assets/asset-1" });
    assert.equal(response.statusCode, 401);
    assert.equal(response.headers["x-cache"], undefined);
  });

  test("a hit answers If-None-Match with a 304, and compresses like a fresh response", async () => {
    const url = "/tokenized_assets/asset-1?include=fields";
    const first = await get(url);
    const again = await get(url, { "if-none-match": String(first.headers.etag) });
    assert.equal(again.headers["x-cache"], "hit");
    assert.equal(again.statusCode, 304);
    const zipped = await get(url, { "accept-encoding": "gzip" });
    assert.equal(zipped.headers["x-cache"], "hit");
    assert.equal(zipped.headers["content-encoding"], "gzip");
  });

  test("errors are never kept", async () => {
    for (const _ of [1, 2]) {
      const missing = await get("/tokenized_assets/nope");
      assert.equal(missing.statusCode, 404);
      assert.equal(missing.headers["x-cache"], "miss");
    }
    const bad = await get("/tokenized_assets?unknown=1");
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.headers["x-cache"], undefined);
  });

  test("routes that don't opt in are never cached", async () => {
    assert.equal((await app.inject({ method: "GET", url: "/readyz" })).headers["x-cache"], undefined);
  });

  test("a data change shows once the check interval has passed", async () => {
    const url = "/tokenized_assets/asset-1";
    await get(url);
    await db.pool.query(`UPDATE asset SET name = 'Renamed' WHERE slug = 'asset-1'`);
    try {
      const within = await get(url);
      assert.equal(within.headers["x-cache"], "hit");
      assert.notEqual(within.json().data.name, "Renamed");

      time += CHECK_MS;
      const afterCheck = await get(url);
      assert.equal(afterCheck.headers["x-cache"], "miss");
      assert.equal(afterCheck.json().data.name, "Renamed");
    } finally {
      await db.pool.query(`UPDATE asset SET name = 'Asset 1' WHERE slug = 'asset-1'`);
      time += CHECK_MS;
    }
  });

  test("a budget of 0 turns the cache off", async () => {
    const url = "/tokenized_assets/asset-1";
    await get(url, {}, off);
    const response = await get(url, {}, off);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["x-cache"], undefined);
  });
});
