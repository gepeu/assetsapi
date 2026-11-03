import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { LoginLimiter } from "../src/loginLimiter.ts";
import { sendFrontendFile } from "../src/staticFiles.ts";

describe("LoginLimiter", () => {
  const fifteenMinutes = 15 * 60 * 1000;

  function limiterAt(start = 1_000_000) {
    const clock = { now: start };
    return { clock, limiter: new LoginLimiter(() => clock.now) };
  }

  function fail(limiter: LoginLimiter, client: string, times: number) {
    for (let i = 0; i < times; i++) limiter.recordFailure(client);
  }

  it("blocks a client after 10 failures and says when to retry", () => {
    const { limiter } = limiterAt();
    fail(limiter, "a", 9);
    assert.equal(limiter.retryAfterSeconds("a"), 0);
    fail(limiter, "a", 1);
    assert.equal(limiter.retryAfterSeconds("a"), 15 * 60);
  });

  it("doesn't block other clients because of one client's failures", () => {
    const { limiter } = limiterAt();
    fail(limiter, "a", 10);
    assert.equal(limiter.retryAfterSeconds("b"), 0);
  });

  it("allows a client again once the window has passed", () => {
    const { clock, limiter } = limiterAt();
    fail(limiter, "a", 10);
    clock.now += fifteenMinutes;
    assert.equal(limiter.retryAfterSeconds("a"), 0);
    fail(limiter, "a", 1);
    assert.equal(limiter.retryAfterSeconds("a"), 0);
  });

  it("clears a client's count when it signs in", () => {
    const { limiter } = limiterAt();
    fail(limiter, "a", 9);
    limiter.recordSuccess("a");
    fail(limiter, "a", 9);
    assert.equal(limiter.retryAfterSeconds("a"), 0);
  });

  it("blocks everyone after 100 failures, even from different clients", () => {
    const { limiter } = limiterAt();
    for (let i = 0; i < 100; i++) limiter.recordFailure(`client-${i}`);
    assert.ok(limiter.retryAfterSeconds("someone-new") > 0);
  });

  it("doesn't let a successful sign-in reset the overall limit", () => {
    const { limiter } = limiterAt();
    for (let i = 0; i < 100; i++) limiter.recordFailure(`client-${i}`);
    limiter.recordSuccess("client-0");
    assert.ok(limiter.retryAfterSeconds("someone-new") > 0);
  });

  it("forgets expired clients, so forged addresses can't grow memory forever", () => {
    const { clock, limiter } = limiterAt();
    fail(limiter, "old", 5);
    clock.now += fifteenMinutes;
    limiter.recordFailure("new");
    const clients = (limiter as unknown as { clients: Map<string, unknown> }).clients;
    assert.deepEqual([...clients.keys()], ["new"]);
  });
});

describe("sendFrontendFile", () => {
  let dir: string;
  let server: Server;
  let baseUrl: string;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "rwa-frontend-"));
    const root = join(dir, "dist");
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "index.html"), "<html>app</html>");
    await writeFile(join(root, "assets", "main-abc123.js"), "console.log(1)");
    await writeFile(join(dir, "secret.txt"), "outside the root");

    server = createServer(async (req, res) => {
      const { pathname } = new URL(req.url ?? "/", "http://localhost");
      if (!(await sendFrontendFile(res, root, pathname))) {
        res.writeHead(404);
        res.end("not found");
      }
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise((done) => server.close(done));
    await rm(dir, { recursive: true, force: true });
  });

  it("serves a built file with its type and a long cache lifetime", async () => {
    const response = await fetch(`${baseUrl}/assets/main-abc123.js`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /javascript/);
    assert.match(response.headers.get("cache-control") ?? "", /immutable/);
    assert.equal(await response.text(), "console.log(1)");
  });

  it("serves index.html for page routes without long caching", async () => {
    for (const path of ["/", "/assets", "/assets/aaplx", "/somewhere/else"]) {
      const response = await fetch(baseUrl + path);
      assert.equal(response.status, 200, path);
      assert.equal(await response.text(), "<html>app</html>", path);
      assert.equal(response.headers.get("cache-control"), "no-cache", path);
    }
  });

  it("returns 404 for a missing file rather than sending HTML as a script", async () => {
    const response = await fetch(`${baseUrl}/assets/gone-999.js`);
    assert.equal(response.status, 404);
  });

  it("never serves files outside the root", async () => {
    for (const path of ["/..%2fsecret.txt", "/assets/..%2f..%2fsecret.txt", "/%2e%2e%2fsecret.txt"]) {
      const response = await fetch(baseUrl + path);
      assert.equal(response.status, 404, path);
      assert.doesNotMatch(await response.text(), /outside the root/, path);
    }
  });

  it("handles malformed and null-byte paths without failing", async () => {
    for (const path of ["/%E0%A4%A.js", "/index.html%00.js"]) {
      assert.equal((await fetch(baseUrl + path)).status, 404, path);
    }
  });
});
