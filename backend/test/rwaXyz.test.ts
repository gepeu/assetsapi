import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type pg from "pg";
import { migrate } from "../src/db/migrate.ts";
import { createPool } from "../src/db/pool.ts";
import { seed } from "../src/db/seed.ts";
import { requireEnv } from "../src/env.ts";
import { agreesWithAsset } from "../src/rwaXyz/assetMatch.ts";
import { RwaXyzClient, RwaXyzError } from "../src/rwaXyz/client.ts";
import { loadRwaXyz } from "../src/rwaXyz/load.ts";
import { ASSET_MAPPINGS, issuanceType, normalizeValue } from "../src/rwaXyz/mapping.ts";

const SECRET_KEY = "test-secret-key";

describe("value normalization", () => {
  it("treats null, undefined and empty as no value", () => {
    for (const raw of [null, undefined, ""]) assert.deepEqual(normalizeValue("text", raw), { kind: "none" });
    assert.deepEqual(normalizeValue("list", []), { kind: "none" });
    assert.deepEqual(normalizeValue("boolean", "yes"), { kind: "none" });
  });

  it("keeps false and zero, which are real values", () => {
    assert.deepEqual(normalizeValue("boolean", false), { kind: "value", value: false });
    assert.deepEqual(normalizeValue("integer", 0), { kind: "value", value: 0 });
  });

  it("wraps single values as lists, removes duplicates and sorts", () => {
    assert.deepEqual(normalizeValue("list", "BMA"), { kind: "value", value: ["BMA"] });
    assert.deepEqual(normalizeValue("list", ["b", "a", "b"]), { kind: "value", value: ["a", "b"] });
  });

  it("rejects non-web URLs and cuts timestamps to dates", () => {
    assert.deepEqual(normalizeValue("url", "javascript:alert(1)"), { kind: "none" });
    assert.deepEqual(normalizeValue("date", "2025-04-04T00:00:00Z"), { kind: "value", value: "2025-04-04" });
    assert.deepEqual(normalizeValue("date", "soon"), { kind: "none" });
  });

  it("maps issuance types without guessing", () => {
    assert.equal(issuanceType("NATIVE"), "native");
    assert.equal(issuanceType("BRIDGE"), "bridged");
    assert.equal(issuanceType("WRAPPER"), "wrapper");
    assert.equal(issuanceType("SOMETHING_NEW"), "unknown");
    assert.equal(issuanceType(null), "unknown");
  });
});

describe("mapping scope", () => {
  it("names no financial API field", () => {
    const banned = /price|nav|net_asset|apy|yield|fee|supply|market_|volume|holding_addresses|concentration|tvl|minimum|return|income|accounting/i;
    for (const mapping of ASSET_MAPPINGS) assert.doesNotMatch(mapping.from, banned, mapping.from);
  });
});

describe("asset matching", () => {
  const near = { slug: "near", ticker: "NEAR", name: "Near Protocol" };

  it("needs more than a ticker", () => {
    assert.equal(agreesWithAsset({ ticker: "NEAR", slug: "near", name: "NEAR" }, near), true);
    assert.equal(agreesWithAsset({ ticker: "NEAR", slug: "ishares-short-duration-bond-active-etf", name: "iShares Short Duration Bond Active ETF" }, near), false);
    assert.equal(agreesWithAsset({ ticker: "NEARX", slug: "near", name: "NEAR" }, near), false);
  });
});

describe("loading a response", () => {
  const adminUrl = requireEnv("DATABASE_URL");
  const database = `rwa_test_load_${process.pid}`;
  let admin: pg.Pool;
  let pool: pg.Pool;

  const onyc = {
    id: 15123,
    slug: "onre-tokenized-reinsurance",
    ticker: "ONyc",
    name: "OnRe Tokenized Reinsurance",
    _updated_at: "2026-11-03T03:18:49",
    isin: null,
    website: "https://app.onre.finance",
    description: "A reinsurance token.",
    holder_rights_description: "Charges a 2% fee on redemptions.",
    has_deposit_insurance: false,
    governing_body: "BMA - Bermuda Monetary Authority",
    auditor: { id: 165, name: "Harris & Trotter", slug: "harris-trotter", legal_name: "Harris & Trotter LLP", market_value_dollar: 123 },
    issuer: { id: "560", name: "OnRe", slug: "onre", legal_name: "On Re SAC Ltd.", lei: null, legal_structure_type: "Segregated Accounts Company" },
    primary_markets: [
      { kyc_is_required: true, allowed_investor_types: ["Non-U.S. Institutional Investor"], base_asset_ticker: "USDG", redemption_fee_bps: 50, is_subscription_allowed: true },
      { kyc_is_required: true, allowed_investor_types: ["Non-U.S. Professional Investor"], base_asset_ticker: "USDC", redemption_fee_bps: 75, is_subscription_allowed: false },
    ],
    // Financial data that must never come through.
    price_dollar: { val: 1.07 },
    apy_7_day: { val: 0.12 },
    total_supply_token: { val: 1000 },
    total_management_fee_bps: 100,
    primary_market__minimum_subscription_amt: 100000,
  };
  const tokens = [
    {
      id: 1, name: "Solana ONyc", hidden: false, address: "5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5", network_id: 2,
      network: { id: 2, name: "Solana" }, decimals: 9, standards: ["SPL"], issuance_type: "NATIVE",
      platform: { id: 394, name: "OnRe", slug: "onre" }, tokenization_type: "Onchain Distributed", price_dollar: { val: 1.07 },
    },
    {
      id: 2, name: "Wrapped ONyc", hidden: false, address: "0xABCDEF0000000000000000000000000000000001", network_id: 1,
      network: { id: 1, name: "Ethereum" }, decimals: 18, standards: ["ERC-20"], issuance_type: "WRAPPER",
      platform: { id: 394, name: "OnRe", slug: "onre" },
    },
    { id: 3, name: "Hidden", hidden: true, address: "0x03", network_id: 1 },
    { id: 4, name: "No address", hidden: false, address: null, network_id: 1 },
  ];
  const networks: Record<string, unknown> = {
    "/networks/2": { id: 2, name: "Solana", slug: "solana", evm_chain_id: null, layer_description: "L1", parent_network_id: null },
    "/networks/1": { id: 1, name: "Ethereum", slug: "ethereum", evm_chain_id: 1, layer_description: "L1", parent_network_id: null },
  };

  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal((init?.headers as Record<string, string>).Authorization, `Bearer ${SECRET_KEY}`);
    const url = new URL(String(input));
    const path = url.pathname.replace("/v4", "");
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

    if (path === "/assets/15123") return json(onyc);
    if (path === "/tokens" && url.searchParams.get("asset_id") === "15123") {
      return json({ results: tokens, pagination: { pageCount: 1 } });
    }
    if (path in networks) return json(networks[path]);
    if (path === "/assets" || path === "/tokens") return json({ results: [] });
    return json({ message: "not found" }, 404);
  }) as typeof fetch;

  const client = new RwaXyzClient({ apiKey: SECRET_KEY, fetchImpl: fakeFetch, requestIntervalMs: 0 });
  let assetId: number;

  const newRun = async () =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO ingestion_run (source_id) SELECT id FROM source WHERE key = 'rwa_xyz' RETURNING id`,
      )
    ).rows[0].id;

  before(async () => {
    admin = createPool(adminUrl);
    await admin.query(`CREATE DATABASE ${database}`);
    const url = new URL(adminUrl);
    url.pathname = `/${database}`;
    pool = createPool(url.toString());
    await migrate(pool);
    await seed(pool);
    assetId = (await pool.query<{ id: number }>(`SELECT id FROM asset WHERE slug = 'onyc'`)).rows[0].id;
  });

  after(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await admin.end();
  });

  const claimFor = (key: string) =>
    pool.query(
      `SELECT c.*, c.as_of::text AS as_of_text, s.key AS source_key FROM claim c JOIN field f ON f.id = c.field_id JOIN source s ON s.id = c.source_id
       WHERE f.key = $1 AND c.asset_id = $2`,
      [key, assetId],
    );

  it("loads, and an asset with no listing is reported rather than invented", async () => {
    const summary = await loadRwaXyz(pool, client, await newRun(), { onlySlugs: ["onyc", "aave"] });
    assert.deepEqual(summary.failed, []);
    assert.deepEqual(summary.matched.map((m) => m.ticker), ["ONyc"]);
    assert.deepEqual(summary.notFound.map((m) => m.ticker), ["AAVE"]);
    assert.equal(summary.matched[0].tokens, 2);
    assert.equal(summary.tokensSkipped.length, 2);
  });

  it("adds no claim for a null, leaving the field never checked", async () => {
    assert.equal((await claimFor("identity.isin")).rows.length, 0);
    const { rows } = await pool.query(
      `SELECT status FROM asset_field_status WHERE asset_id = $1 AND field_key = 'identity.isin'`,
      [assetId],
    );
    assert.equal(rows[0].status, "never_checked");
  });

  it("keeps false as a claim", async () => {
    assert.equal((await claimFor("legal.deposit_insurance")).rows[0].normalized_value, false);
  });

  it("never lets financial data reach a claim, even inside nested objects", async () => {
    const { rows } = await pool.query(`SELECT raw_value::text || normalized_value::text AS text FROM claim`);
    assert.ok(rows.length > 0);
    for (const row of rows) {
      assert.doesNotMatch(row.text, /price_dollar|market_value|apy|supply|fee_bps|1\.07|minimum/i);
    }
  });

  it("links the auditor as an organization with a brand and legal name, and makes a Fact", async () => {
    const { rows } = await pool.query(
      `SELECT o.brand_name, o.legal_name, x.status, s.key AS source
       FROM fact x JOIN field f ON f.id = x.field_id JOIN source s ON s.id = x.source_id
       JOIN organization o ON o.id = (x.normalized_value ->> 'organization_id')::int
       WHERE f.key = 'provider.financial_auditor' AND x.asset_id = $1`,
      [assetId],
    );
    assert.deepEqual(rows, [{ brand_name: "Harris & Trotter", legal_name: "Harris & Trotter LLP", status: "disclosed", source: "rwa_xyz" }]);
  });

  it("merges primary markets: lists combine, and disagreeing values add nothing", async () => {
    assert.deepEqual((await claimFor("primary.base_assets")).rows[0].normalized_value, ["USDC", "USDG"]);
    assert.equal((await claimFor("primary.kyc_required")).rows[0].normalized_value, true);
    assert.equal((await claimFor("primary.subscriptions_open")).rows.length, 0);
  });

  it("creates tokens with their issuance type, and normalizes addresses by network", async () => {
    const { rows } = await pool.query(
      `SELECT n.key, t.address, t.issuance_type, n.address_case_sensitive
       FROM token t JOIN network n ON n.id = t.network_id WHERE t.asset_id = $1 ORDER BY n.key`,
      [assetId],
    );
    assert.deepEqual(rows, [
      { key: "ethereum", address: "0xabcdef0000000000000000000000000000000001", issuance_type: "wrapper", address_case_sensitive: false },
      { key: "solana", address: "5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5", issuance_type: "native", address_case_sensitive: true },
    ]);
  });

  it("records aliases, and an as-of date from the record", async () => {
    const { rows } = await pool.query(
      `SELECT namespace, value FROM asset_alias WHERE asset_id = $1 AND namespace LIKE 'rwa_xyz%' ORDER BY 1`,
      [assetId],
    );
    assert.deepEqual(rows, [
      { namespace: "rwa_xyz_id", value: "15123" },
      { namespace: "rwa_xyz_slug", value: "onre-tokenized-reinsurance" },
    ]);
    const claim = (await claimFor("identity.website")).rows[0];
    assert.equal(claim.as_of_text, "2026-11-03");
    assert.equal(claim.source_key, "rwa_xyz");
    assert.equal(claim.extraction_method, "api");
    assert.ok(claim.ingestion_run_id);
  });

  it("a second run with the same data adds no claims", async () => {
    const before = (await pool.query(`SELECT count(*)::int AS n FROM claim`)).rows[0].n;
    const summary = await loadRwaXyz(pool, client, await newRun(), { onlySlugs: ["onyc"] });
    assert.equal(summary.claimsAdded, 0);
    assert.ok(summary.claimsUnchanged > 0);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM claim`)).rows[0].n, before);
  });

  it("marks the run with its summary", async () => {
    const { rows } = await pool.query(`SELECT status, finished_at FROM ingestion_run ORDER BY id LIMIT 1`);
    assert.equal(rows[0].status, "succeeded");
    assert.ok(rows[0].finished_at);
  });

  it("doesn't leak the key in errors", async () => {
    const failing = new RwaXyzClient({
      apiKey: SECRET_KEY,
      requestIntervalMs: 0,
      fetchImpl: (async () => new Response("no", { status: 500 })) as typeof fetch,
    });
    await assert.rejects(failing.getAsset(1), (error: Error) => {
      assert.ok(error instanceof RwaXyzError);
      assert.doesNotMatch(`${error.message} ${error.stack}`, new RegExp(SECRET_KEY));
      return true;
    });
  });
});
