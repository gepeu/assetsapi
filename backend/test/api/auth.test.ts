/** Tests for API key auth; the frontend login; per-key rate limit; request logs. */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/api/app.ts";
import { hashApiKey, newApiKey } from "../../src/api/auth.ts";
import { createTestDb, createTestKey, silentLogger, type TestDb } from "../helpers/testDb.ts";

const WELL_FORMED_BAD_KEY = newApiKey();

describe("API key auth", () => {
  let db: TestDb;
  let app: FastifyInstance;
  let time = 1_900_000_000_000;

  before(async () => {
    db = await createTestDb();
    app = await buildApp({ db: db.pool, logger: silentLogger, now: () => time, failedAuthMax: 3, rateLimitMax: 1000 });
  });
  after(async () => {
    await app.close();
    await db.close();
  });
  beforeEach(() => {
    // Moves past any failure window a previous test used.
    time += 120_000;
  });

  const get = (headers: Record<string, string> = {}, url = "/tokenized_assets") =>
    app.inject({ method: "GET", url, headers });
  const bearer = (key: string) => ({ authorization: `Bearer ${key}` });

  test("the scheme's name is case-insensitive, and the key isn't", async () => {
    const key = await createTestKey(db.pool);
    assert.equal((await get({ authorization: `bearer ${key}` })).statusCode, 200);
    assert.equal((await get({ authorization: `BEARER ${key}` })).statusCode, 200);
    const flipped = key.replace(/[a-z]/, (letter) => letter.toUpperCase());
    assert.equal((await get({ authorization: `Bearer ${flipped}` })).statusCode, 401);
  });

  test("a valid key gets in", async () => {
    assert.equal((await get(bearer(await createTestKey(db.pool)))).statusCode, 200);
  });

  for (const [name, headers] of [
    ["no key", {}],
    ["an unknown key", bearer(WELL_FORMED_BAD_KEY)],
    ["a malformed key", bearer("nope")],
    ["the wrong scheme", { authorization: "Basic abc" }],
  ] as const) {
    test(`${name} gets a 401 in the standard shape`, async () => {
      const response = await get(headers);
      assert.equal(response.statusCode, 401);
      assert.equal(response.json().error.code, "unauthorized");
      // Without a login set, nothing invites a browser to ask for one.
      assert.equal(response.headers["www-authenticate"], undefined);
    });
  }

  test("every data route requires a key", async () => {
    for (const url of [
      "/tokenized_assets",
      "/tokenized_assets/x",
      "/tokenized_assets/catalog",
      "/tokenized_assets/x?include=fields",
      "/tokenized_assets/x?history=price_dollar",
    ]) {
      time += 120_000;
      assert.equal((await get({}, url)).statusCode, 401, url);
    }
  });

  test("/readyz needs no key", async () => {
    assert.equal((await get({}, "/readyz")).statusCode, 200);
  });

  test("auth runs before validation, so a bad parameter doesn't reveal anything without a key", async () => {
    assert.equal((await get({}, "/tokenized_assets?unknown=1")).statusCode, 401);
  });

  test("an expired key gets a 401", async () => {
    const key = await createTestKey(db.pool, { expiresAt: new Date(Date.now() - 1000) });
    assert.equal((await get(bearer(key))).statusCode, 401);
  });

  test("a revoked key stops within a minute", async () => {
    const key = await createTestKey(db.pool);
    assert.equal((await get(bearer(key))).statusCode, 200);
    await db.pool.query("UPDATE api_key SET revoked_at = now() WHERE key_hash = $1", [hashApiKey(key)]);

    time += 30_000;
    assert.equal((await get(bearer(key))).statusCode, 200);
    time += 31_000;
    assert.equal((await get(bearer(key))).statusCode, 401);
  });

  test("a cached key that passes its expiry stops at once", async () => {
    // The test's clock is years ahead of the database's, so only the cached check can reject this.
    const key = await createTestKey(db.pool, { expiresAt: new Date(time + 10_000) });
    assert.equal((await get(bearer(key))).statusCode, 200);
    time += 11_000;
    assert.equal((await get(bearer(key))).statusCode, 401);
  });

  test("two active keys can be used while a client switches", async () => {
    const [oldKey, newKey] = [await createTestKey(db.pool), await createTestKey(db.pool)];
    assert.equal((await get(bearer(oldKey))).statusCode, 200);
    assert.equal((await get(bearer(newKey))).statusCode, 200);
  });

  test("use is recorded, and the key itself is never stored", async () => {
    const key = await createTestKey(db.pool);
    await get(bearer(key));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const { rows } = await db.pool.query<{ last_used_at: Date | null; key_hash: string; key_prefix: string }>(
      "SELECT last_used_at, key_hash, key_prefix FROM api_key WHERE key_hash = $1",
      [hashApiKey(key)],
    );
    assert.ok(rows[0]?.last_used_at);
    assert.notEqual(rows[0]?.key_hash, key);
    assert.ok(key.startsWith(rows[0]?.key_prefix ?? "x"));
    assert.ok((rows[0]?.key_prefix.length ?? 99) < key.length);
  });

  test("too many failures from one IP get a 429", async () => {
    const headers = { ...bearer(WELL_FORMED_BAD_KEY), "x-real-ip": "203.0.113.1" };
    for (let attempt = 0; attempt < 3; attempt++) assert.equal((await get(headers)).statusCode, 401);
    const blocked = await get(headers);
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.json().error.code, "rate_limited");
  });

  test("the IP comes from Railway's proxy header, so other clients aren't affected", async () => {
    const headers = { ...bearer(WELL_FORMED_BAD_KEY), "x-real-ip": "203.0.113.2" };
    for (let attempt = 0; attempt < 4; attempt++) await get(headers);
    const other = await get({ ...bearer(WELL_FORMED_BAD_KEY), "x-real-ip": "203.0.113.3" });
    assert.equal(other.statusCode, 401);
  });

  test("a valid key is never blocked by IP", async () => {
    const ip = { "x-real-ip": "203.0.113.4" };
    for (let attempt = 0; attempt < 5; attempt++) await get({ ...bearer(WELL_FORMED_BAD_KEY), ...ip });
    const key = await createTestKey(db.pool);
    assert.equal((await get({ ...bearer(key), ...ip })).statusCode, 200);
  });

  test("the failure window resets", async () => {
    const headers = { ...bearer(WELL_FORMED_BAD_KEY), "x-real-ip": "203.0.113.5" };
    for (let attempt = 0; attempt < 4; attempt++) await get(headers);
    assert.equal((await get(headers)).statusCode, 429);
    time += 61_000;
    assert.equal((await get(headers)).statusCode, 401);
  });
});

describe("frontend login", () => {
  // The colon checks that only the first one separates the username.
  const login = { username: "team", password: "a long: shared password" };
  const CHALLENGE = 'Basic realm="RWA data", charset="UTF-8"';
  let db: TestDb;
  let app: FastifyInstance;
  let time = 1_900_000_000_000;

  before(async () => {
    db = await createTestDb();
    app = await buildApp({ db: db.pool, logger: silentLogger, login, now: () => time, failedAuthMax: 3 });
  });
  after(async () => {
    await app.close();
    await db.close();
  });
  beforeEach(() => {
    time += 120_000;
  });

  const basic = (username: string, password: string) => ({
    authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
  });
  const get = (headers: Record<string, string> = {}, url = "/tokenized_assets") =>
    app.inject({ method: "GET", url, headers });

  test("the login gets into the data routes", async () => {
    assert.equal((await get(basic(login.username, login.password))).statusCode, 200);
    assert.equal((await get(basic(login.username, login.password), "/tokenized_assets/catalog")).statusCode, 200);
  });

  test("keys still work alongside it", async () => {
    const key = await createTestKey(db.pool);
    assert.equal((await get({ authorization: `Bearer ${key}` })).statusCode, 200);
  });

  for (const [name, headers] of [
    ["no credentials", {}],
    ["a wrong password", basic(login.username, "a long: wrong password")],
    ["a wrong username", basic("someone", login.password)],
    ["the password alone", basic("", login.password)],
    ["no colon", { authorization: `Basic ${Buffer.from(login.username).toString("base64")}` }],
    ["a bad key", { authorization: `Bearer ${WELL_FORMED_BAD_KEY}` }],
  ] as const) {
    test(`${name} gets a 401 that asks the browser for the login`, async () => {
      const response = await get(headers);
      assert.equal(response.statusCode, 401);
      assert.equal(response.json().error.code, "unauthorized");
      assert.equal(response.headers["www-authenticate"], CHALLENGE);
    });
  }

  test("wrong passwords count toward the limit per IP, like bad keys", async () => {
    const headers = { ...basic(login.username, "a long: wrong password"), "x-real-ip": "203.0.113.20" };
    for (let attempt = 0; attempt < 3; attempt++) assert.equal((await get(headers)).statusCode, 401);
    const blocked = await get(headers);
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.headers["www-authenticate"], undefined);
    // The right login is never blocked by IP.
    const right = await get({ ...basic(login.username, login.password), "x-real-ip": "203.0.113.20" });
    assert.equal(right.statusCode, 200);
  });

  test("a request with no credentials isn't counted, so first visits can't block an address", async () => {
    const ip = { "x-real-ip": "203.0.113.21" };
    for (let attempt = 0; attempt < 10; attempt++) assert.equal((await get(ip)).statusCode, 401);
  });

  test("the login is rate limited per IP, not as one shared key", async () => {
    const limited = await buildApp({ db: db.pool, logger: silentLogger, login, rateLimitMax: 2 });
    const from = (ip: string) =>
      limited.inject({
        method: "GET",
        url: "/tokenized_assets",
        headers: { ...basic(login.username, login.password), "x-real-ip": ip },
      });
    try {
      for (let attempt = 0; attempt < 2; attempt++) assert.equal((await from("203.0.113.22")).statusCode, 200);
      assert.equal((await from("203.0.113.22")).statusCode, 429);
      assert.equal((await from("203.0.113.23")).statusCode, 200);
    } finally {
      await limited.close();
    }
  });
});

describe("per-key rate limit", () => {
  let db: TestDb;
  let app: FastifyInstance;

  before(async () => {
    db = await createTestDb();
    app = await buildApp({ db: db.pool, logger: silentLogger, rateLimitMax: 3 });
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  test("a key over its limit gets a 429 in the standard shape, and others don't", async () => {
    const busy = { authorization: `Bearer ${await createTestKey(db.pool)}` };
    const quiet = { authorization: `Bearer ${await createTestKey(db.pool)}` };
    for (let attempt = 0; attempt < 3; attempt++) {
      assert.equal((await app.inject({ method: "GET", url: "/tokenized_assets", headers: busy })).statusCode, 200);
    }
    const limited = await app.inject({ method: "GET", url: "/tokenized_assets", headers: busy });
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.json().error.code, "rate_limited");
    assert.equal((await app.inject({ method: "GET", url: "/tokenized_assets", headers: quiet })).statusCode, 200);
  });

  test("/readyz is never rate limited", async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      assert.equal((await app.inject({ method: "GET", url: "/readyz" })).statusCode, 200);
    }
  });
});

describe("request logs", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  test("one JSON line per request, with the key's name and never the key", async () => {
    const { pino } = await import("pino");
    const lines: string[] = [];
    const logger = pino({ redact: ["req.headers.authorization"] }, { write: (line: string) => void lines.push(line) });
    const app = await buildApp({ db: db.pool, logger });
    const key = await createTestKey(db.pool, { clientName: "frontend staging" });
    await app.inject({ method: "GET", url: "/tokenized_assets", headers: { authorization: `Bearer ${key}` } });
    await app.close();

    const requestLines = lines.map((line) => JSON.parse(line)).filter((line) => line.msg === "request");
    assert.equal(requestLines.length, 1);
    const [line] = requestLines;
    assert.equal(line.route, "/tokenized_assets");
    assert.equal(line.status, 200);
    assert.equal(line.client, "frontend staging");
    assert.equal(typeof line.requestId, "string");
    assert.equal(typeof line.durationMs, "number");
    assert.ok(!lines.join("").includes(key));
  });
});
