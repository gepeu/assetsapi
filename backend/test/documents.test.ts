import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { ASSETS } from "../src/db/catalog/assets.ts";
import { htmlToText, isEmptyShell } from "../src/documents/extractText.ts";
import { fetchDocument, HostRateLimiter, isPublicAddress } from "../src/documents/fetchDocument.ts";
import { parseKaminoBundle } from "../src/documents/kaminoBundle.ts";
import { CANDIDATE_DOCUMENTS, classifyLink, isHostOfficialForAny } from "../src/documents/officialSources.ts";
import { storageKeyFor } from "../src/documents/documentStore.ts";
import { LocalBucketStorage } from "../src/localBucketStorage.ts";

describe("LocalBucketStorage", () => {
  let dir: string;
  let storage: LocalBucketStorage;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "rwa-storage-"));
    storage = new LocalBucketStorage({ rootDir: dir, signingSecret: "test" });
  });
  after(() => rm(dir, { recursive: true, force: true }));

  it("reads back what it stored, with a matching hash and content type", async () => {
    const body = new TextEncoder().encode("<h1>Prospectus</h1>");
    const hash = createHash("sha256").update(body).digest("hex");
    const key = storageKeyFor(hash, "text/html; charset=utf-8");
    assert.equal(key, `${hash}.html`);

    await storage.put(key, body, "text/html");
    const object = await storage.get(key);
    assert.equal(createHash("sha256").update(object!.body).digest("hex"), hash);
    assert.equal(object!.contentType, "text/html");
    assert.equal(object!.size, body.byteLength);
  });

  it("returns null for a missing key and deleting one succeeds", async () => {
    assert.equal(await storage.get("missing.pdf"), null);
    assert.equal(await storage.stat("missing.pdf"), null);
    await storage.delete("missing.pdf");
  });

  it("lists objects by prefix and hides its own metadata", async () => {
    await storage.put("raw/a.json", new Uint8Array([1]), "application/json");
    await storage.put("raw/b.json", new Uint8Array([2]), "application/json");
    const all = [];
    for await (const object of storage.list("raw/")) all.push(object.key);
    assert.deepEqual(all, ["raw/a.json", "raw/b.json"]);
    for await (const object of storage.list()) assert.ok(!object.key.startsWith("."));
  });

  it("rejects keys that could leave its folder", async () => {
    for (const key of ["../escape", "a/../../b", "/etc/passwd", "a\\b", ".meta/x", "", "a//b"]) {
      await assert.rejects(storage.put(key, new Uint8Array(), "text/plain"), /Invalid storage key/, key);
      await assert.rejects(storage.get(key), /Invalid storage key/, key);
    }
  });

  it("issues signed links, and rejects changed or expired ones", async () => {
    const url = await storage.createDownloadUrl("raw/a.json", { filename: "a.json" });
    const params = new URL(url, "http://localhost").searchParams;
    assert.deepEqual(storage.verifyDownload(params), { key: "raw/a.json", filename: "a.json" });

    const tampered = new URLSearchParams(params);
    tampered.set("key", "raw/b.json");
    assert.equal(storage.verifyDownload(tampered), null);

    const expired = await storage.createDownloadUrl("raw/a.json", { expiresInSeconds: -1 });
    assert.equal(storage.verifyDownload(new URL(expired, "http://localhost").searchParams), null);
  });
});

describe("fetchDocument", () => {
  let server: Server;
  let base: string;
  let hits: Record<string, number>;

  before(async () => {
    hits = {};
    server = createServer((req, res) => {
      hits[req.url!] = (hits[req.url!] ?? 0) + 1;
      if (req.url === "/ok") {
        res.setHeader("Content-Type", "application/pdf");
        res.end("pdf");
      } else if (req.url === "/redirect") {
        res.writeHead(302, { Location: "/ok" }).end();
      } else if (req.url === "/loop") {
        res.writeHead(302, { Location: "/loop" }).end();
      } else if (req.url === "/to-login") {
        res.writeHead(302, { Location: "/login?next=x" }).end();
      } else if (req.url === "/off-site") {
        res.writeHead(302, { Location: "https://elsewhere.example/doc" }).end();
      } else if (req.url === "/big") {
        res.end(Buffer.alloc(2000));
      } else if (req.url === "/blocked") {
        res.writeHead(403).end("no");
      } else {
        res.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => new Promise((resolve) => server.close(resolve)));

  const local = { allowPrivateHosts: true };

  it("returns the body and records redirects", async () => {
    const result = await fetchDocument(`${base}/redirect`, local);
    assert.equal(result.ok, true);
    assert.equal(Buffer.from(result.body!).toString(), "pdf");
    assert.equal(result.finalUrl, `${base}/ok`);
    assert.deepEqual(result.redirectChain, [{ url: `${base}/redirect`, status: 302 }]);
  });

  it("refuses private addresses by default", async () => {
    const result = await fetchDocument(`${base}/ok`);
    assert.equal(result.ok, false);
    assert.match(result.error!, /public address/);
    for (const url of ["http://169.254.169.254/latest/", "http://[::1]/", "http://localhost/"]) {
      assert.match((await fetchDocument(url)).error!, /public address/);
    }
  });

  it("tells public addresses from private ones", () => {
    for (const address of ["64.29.17.3", "104.18.21.145", "172.67.73.1", "2606:4700::6812:1591", "::ffff:8.8.8.8"]) {
      assert.equal(isPublicAddress(address), true, address);
    }
    for (const address of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "100.64.0.1", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254"]) {
      assert.equal(isPublicAddress(address), false, address);
    }
  });

  it("refuses non-http schemes and URLs with credentials", async () => {
    assert.match((await fetchDocument("file:///etc/passwd")).error!, /http\(s\)/);
    assert.match((await fetchDocument("ftp://example.com/x")).error!, /http\(s\)/);
    assert.match((await fetchDocument("https://user:pw@example.com/")).error!, /credentials/);
  });

  it("records a bot wall as a failure and tries only once", async () => {
    const before = hits["/blocked"] ?? 0;
    const result = await fetchDocument(`${base}/blocked`, local);
    assert.equal(result.ok, false);
    assert.equal(result.httpStatus, 403);
    assert.equal(result.body, null);
    assert.equal(hits["/blocked"], before + 1);
  });

  it("stops at the size cap, redirect loops, sign-in pages and off-domain redirects", async () => {
    assert.match((await fetchDocument(`${base}/big`, { ...local, maxBytes: 1000 })).error!, /limit/);
    assert.match((await fetchDocument(`${base}/loop`, local)).error!, /redirects/);
    assert.match((await fetchDocument(`${base}/to-login`, local)).error!, /Login required/);
    const offSite = await fetchDocument(`${base}/off-site`, {
      ...local,
      isHostAllowed: (host) => host === "127.0.0.1",
    });
    assert.match(offSite.error!, /allowed domains/);
  });

  it("returns a result rather than throwing when the host can't be reached", async () => {
    const result = await fetchDocument("http://127.0.0.1:1/", local);
    assert.equal(result.ok, false);
    assert.ok(result.error);
  });
});

describe("HostRateLimiter", () => {
  it("spaces out requests to one host but not across hosts", async () => {
    const limiter = new HostRateLimiter(100);
    await limiter.wait("https://a.example/1");
    const start = Date.now();
    await limiter.wait("https://b.example/1");
    assert.ok(Date.now() - start < 50);
    await limiter.wait("https://a.example/2");
    assert.ok(Date.now() - start >= 60);
  });
});

describe("official link rules", () => {
  it("applies each asset's allowlist", () => {
    assert.equal(classifyLink("aaplx", "https://docs.xstocks.fi/docs/x").kind, "official");
    assert.equal(classifyLink("aaplx", "https://www.xstocks.fi/products").kind, "official");
    assert.equal(classifyLink("usyc", "https://www.circle.com/usyc").kind, "official");
  });

  it("only allows Backed's own folder on the shared CDN", () => {
    assert.equal(classifyLink("aaplx", "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/x.pdf").kind, "official");
    assert.equal(classifyLink("aaplx", "https://cdn.prod.website-files.com/other/x.pdf").kind, "excluded");
    assert.equal(classifyLink("buidl", "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/x.pdf").kind, "excluded");
  });

  it("drops USDY's wrong docs.sky.money entry but keeps it for sUSDS", () => {
    assert.equal(classifyLink("usdy", "https://docs.sky.money/x").kind, "excluded");
    assert.equal(classifyLink("susds", "https://docs.sky.money/x").kind, "official");
  });

  it("excludes Securitize's /learn and press or blog pieces", () => {
    assert.equal(classifyLink("buidl", "https://securitize.io/learn/blog/x").kind, "excluded");
    assert.equal(classifyLink("buidl", "https://securitize.io/blackrock/buidl").kind, "official");
    assert.equal(classifyLink("usyc", "https://www.circle.com/blog/x").kind, "excluded");
    assert.equal(classifyLink("usyc", "https://www.circle.com/pressroom/x").kind, "excluded");
  });

  it("never makes regulators official, and rejects lookalike domains", () => {
    assert.equal(classifyLink("onyc", "https://www.bma.bm/x").kind, "reference");
    assert.equal(classifyLink("aaplx", "https://eur-lex.europa.eu/x").kind, "reference");
    assert.equal(classifyLink("aaplx", "https://www.esma.europa.eu/x").kind, "reference");
    assert.equal(classifyLink("xaum", "https://matrixdock.com.evil.example/x").kind, "excluded");
    assert.equal(classifyLink("xaum", "javascript:alert(1)").kind, "excluded");
    assert.equal(classifyLink("xaum", "not a url").kind, "excluded");
  });

  it("keeps jtBIL with no allowlist, so nothing can become official", () => {
    assert.equal(classifyLink("jtbil", "https://www.jito.network/").kind, "excluded");
  });

  it("checks redirects against the assets linked to a document", () => {
    assert.equal(isHostOfficialForAny(["usyc"], "www.circle.com"), true);
    assert.equal(isHostOfficialForAny(["usyc"], "evil.example"), false);
    assert.equal(isHostOfficialForAny(["aaplx", "buidl"], "securitize.io"), true);
  });
});

describe("Kamino bundle parsing", () => {
  it("reads records as text", () => {
    const bundle = `
      var kind$a = "tokenized", id$a = "aaplx", fetchedAt$a = 1;
      website: { value: "https://assets.backed.fi/x" }, transparencyUrl: { value: "https://t.example" },
      [{ title: "Doc", url: "https://docs.xstocks.fi/a", category: "Guide", source: "tt" }]
      var kind$b = "crypto-native", id$b = "aave", fetchedAt$b = 1;
    `;
    const records = parseKaminoBundle(bundle);
    assert.equal(records.length, 2);
    assert.equal(records[0].id, "aaplx");
    assert.equal(records[0].website, "https://assets.backed.fi/x");
    assert.equal(records[0].transparencyUrl, "https://t.example");
    assert.deepEqual(records[0].documents, [
      { title: "Doc", url: "https://docs.xstocks.fi/a", category: "Guide", source: "tt" },
    ]);
    assert.deepEqual(records[1].documents, []);
  });
});

describe("HTML text and empty shells", () => {
  it("removes scripts, styles and tags, and decodes entities", () => {
    const text = htmlToText(
      `<head><title>t</title></head><script>alert(1)</script><style>a{}</style><p>Fish &amp; chips&#33;</p><!-- x --><div>Two</div>`,
    );
    assert.equal(text, "Fish & chips!\n\nTwo");
  });

  it("flags client-rendered shells and challenge pages, not real pages", () => {
    assert.equal(isEmptyShell(`<html><body><div id="root"></div><script src="/a.js"></script></body></html>`), true);
    assert.equal(isEmptyShell(`<body>Just a moment... ${"x ".repeat(300)}</body>`), true);
    assert.equal(isEmptyShell(`<body><p>${"Real document text. ".repeat(50)}</p></body>`), false);
  });
});

describe("candidate documents", () => {
  it("name a catalog asset and sit on that asset's allowlist", () => {
    const slugs = new Set(ASSETS.map((asset) => asset.slug));
    for (const candidate of CANDIDATE_DOCUMENTS) {
      assert.ok(slugs.has(candidate.assetSlug), candidate.assetSlug);
      assert.equal(classifyLink(candidate.assetSlug, candidate.url).kind, "official", candidate.url);
    }
  });
});
