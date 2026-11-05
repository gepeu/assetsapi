/** Tests for serving the built frontend, its login, and turning off the key check locally. */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/api/app.ts";
import { createTestDb, silentLogger, type TestDb } from "../helpers/testDb.ts";

describe("frontend", () => {
  let db: TestDb;
  let app: FastifyInstance;
  let parent: string;

  const get = (url: string) => app.inject({ method: "GET", url });

  before(async () => {
    db = await createTestDb();
    parent = await mkdtemp(join(tmpdir(), "rwa-ui-"));
    const uiDir = join(parent, "dist");
    await mkdir(join(uiDir, "static"), { recursive: true });
    await writeFile(join(uiDir, "index.html"), "<!doctype html><title>page</title>");
    await writeFile(join(uiDir, "static", "app-abc.js"), "console.log(1)");
    await writeFile(join(parent, "secret.txt"), "outside the frontend");
    app = await buildApp({ db: db.pool, logger: silentLogger, uiDir });
  });
  after(async () => {
    await app.close();
    await db.close();
    await rm(parent, { recursive: true });
  });

  test("page URLs get index.html, so a deep link can be reloaded", async () => {
    for (const url of ["/ui/", "/ui/assets", "/ui/assets/some-asset"]) {
      const response = await get(url);
      assert.equal(response.statusCode, 200, url);
      assert.match(response.headers["content-type"] as string, /^text\/html/, url);
      assert.equal(response.body, "<!doctype html><title>page</title>", url);
      assert.equal(response.headers["cache-control"], "no-cache", url);
    }
  });

  test("the root and /ui lead to the asset list", async () => {
    for (const url of ["/", "/ui"]) {
      const response = await get(url);
      assert.equal(response.statusCode, 302, url);
      assert.equal(response.headers.location, "/ui/assets", url);
    }
  });

  test("built files are served with a long cache", async () => {
    const response = await get("/ui/static/app-abc.js");
    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"] as string, /^text\/javascript/);
    assert.equal(response.headers["cache-control"], "public, max-age=31536000, immutable");
    assert.equal(response.body, "console.log(1)");
  });

  test("a missing file is a 404, not the page", async () => {
    const response = await get("/ui/static/missing.js");
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error.code, "not_found");
  });

  test("nothing outside the frontend folder can be read", async () => {
    for (const url of [
      "/ui/../secret.txt",
      "/ui/%2e%2e/secret.txt",
      "/ui/..%2fsecret.txt",
      "/ui/static/..%2f..%2fsecret.txt",
    ]) {
      const response = await get(url);
      assert.ok(!response.body.includes("outside the frontend"), url);
    }
  });

  test("a NUL byte in the path doesn't reach the file system", async () => {
    assert.equal((await get("/ui/static/app%00.js")).statusCode, 404);
  });

  test("the API keeps its paths and still requires a key", async () => {
    const response = await get("/tokenized_assets");
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, "unauthorized");
  });
});

describe("frontend behind the login", () => {
  const login = { username: "team", password: "a long shared password" };
  const signedIn = { authorization: `Basic ${Buffer.from(`${login.username}:${login.password}`).toString("base64")}` };
  let db: TestDb;
  let app: FastifyInstance;
  let uiDir: string;

  const get = (url: string, headers: Record<string, string> = {}) => app.inject({ method: "GET", url, headers });

  before(async () => {
    db = await createTestDb();
    uiDir = await mkdtemp(join(tmpdir(), "rwa-ui-"));
    await writeFile(join(uiDir, "index.html"), "<!doctype html><title>page</title>");
    app = await buildApp({ db: db.pool, logger: silentLogger, uiDir, login });
  });
  after(async () => {
    await app.close();
    await db.close();
    await rm(uiDir, { recursive: true });
  });

  test("every frontend path asks for the login", async () => {
    for (const url of ["/", "/ui", "/ui/assets", "/ui/static/app.js"]) {
      const response = await get(url);
      assert.equal(response.statusCode, 401, url);
      assert.match(response.headers["www-authenticate"] as string, /^Basic realm=/, url);
    }
  });

  test("signed in, the pages and the data load", async () => {
    const page = await get("/ui/assets", signedIn);
    assert.equal(page.statusCode, 200);
    assert.equal(page.body, "<!doctype html><title>page</title>");
    assert.equal((await get("/", signedIn)).statusCode, 302);
    assert.equal((await get("/tokenized_assets", signedIn)).statusCode, 200);
  });

  test("the health check stays open, and the API docs take the same login", async () => {
    assert.equal((await get("/readyz")).statusCode, 200);
    assert.equal((await get("/docs/json")).statusCode, 401);
    assert.equal((await get("/docs/json", signedIn)).statusCode, 200);
  });
});

describe("without a frontend folder", () => {
  let db: TestDb;
  let app: FastifyInstance;

  before(async () => {
    db = await createTestDb();
    app = await buildApp({ db: db.pool, logger: silentLogger });
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  test("the service is the API alone", async () => {
    for (const url of ["/", "/ui", "/ui/assets"]) {
      assert.equal((await app.inject({ method: "GET", url })).statusCode, 404, url);
    }
  });
});

describe("authDisabled", () => {
  let db: TestDb;
  let app: FastifyInstance;

  before(async () => {
    db = await createTestDb();
    app = await buildApp({ db: db.pool, logger: silentLogger, authDisabled: true });
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  test("the data routes need no key", async () => {
    assert.equal((await app.inject({ method: "GET", url: "/tokenized_assets" })).statusCode, 200);
  });

  test("requests are still validated", async () => {
    assert.equal((await app.inject({ method: "GET", url: "/tokenized_assets?unknown=1" })).statusCode, 400);
  });
});
