import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import pg from "pg";
import { migrate } from "../src/db/migrate.ts";
import { createPool } from "../src/db/pool.ts";
import { seed } from "../src/db/seed.ts";
import { requireEnv } from "../src/env.ts";

// Runs against a throwaway database, so it proves the schema applies to an empty one.
const adminUrl = requireEnv("DATABASE_URL");
const testDatabase = `rwa_test_${process.pid}`;
let admin: pg.Pool;
let pool: pg.Pool;

before(async () => {
  admin = createPool(adminUrl);
  await admin.query(`CREATE DATABASE ${testDatabase}`);
  const url = new URL(adminUrl);
  url.pathname = `/${testDatabase}`;
  pool = createPool(url.toString());
  await migrate(pool);
  await seed(pool);
});

after(async () => {
  await pool?.end();
  await admin.query(`DROP DATABASE IF EXISTS ${testDatabase} WITH (FORCE)`);
  await admin.end();
});

async function one<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await pool.query<T>(sql, params);
  assert.equal(rows.length, 1, `expected one row from: ${sql}`);
  return rows[0];
}

const idOf = async (table: string, column: string, value: string): Promise<number> =>
  (await one<{ id: number }>(`SELECT id FROM ${table} WHERE ${column} = $1`, [value])).id;

async function newRun(sourceKey: string): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO ingestion_run (source_id) SELECT id FROM source WHERE key = $1 RETURNING id`,
    [sourceKey],
  );
  return row.id;
}

async function organization(slug: string, brandName: string): Promise<number> {
  const row = await one<{ id: number }>(
    `INSERT INTO organization (slug, brand_name) VALUES ($1, $2) RETURNING id`,
    [slug, brandName],
  );
  return row.id;
}

interface ClaimInput {
  fieldKey: string;
  subject: { column: "asset_id" | "token_id" | "organization_id" | "network_id" | "contract_id"; id: number };
  sourceKey: string;
  status?: string;
  value?: unknown;
  recordKey?: string;
  asOf?: string | null;
  method?: string;
  observedAt?: string;
}

async function addClaim(input: ClaimInput): Promise<number> {
  const run = await newRun(input.sourceKey);
  const value = input.value === undefined ? null : JSON.stringify(input.value);
  const row = await one<{ id: number }>(
    `INSERT INTO claim (field_id, ${input.subject.column}, record_key, source_id, ingestion_run_id,
                        status, raw_value, normalized_value, as_of, extraction_method, observed_at)
     SELECT f.id, $2::integer, $3::text, s.id, $4::bigint, $5::text, $6::jsonb, $6::jsonb, $7::date, $8::text,
            coalesce($9::timestamptz, now())
     FROM field f, source s WHERE f.key = $1 AND s.key = $10
     RETURNING id`,
    [
      input.fieldKey,
      input.subject.id,
      input.recordKey ?? "",
      run,
      input.status ?? "disclosed",
      value,
      input.asOf === undefined ? "2026-11-03" : input.asOf,
      input.method ?? "api",
      input.observedAt ?? null,
      input.sourceKey,
    ],
  );
  return row.id;
}

const factFor = (fieldKey: string, subjectRef: string, recordKey = "") =>
  pool.query(
    `SELECT x.* FROM fact x JOIN field f ON f.id = x.field_id
     WHERE f.key = $1 AND x.subject_ref = $2 AND x.record_key = $3`,
    [fieldKey, subjectRef, recordKey],
  );

describe("catalog", () => {
  it("has 144 fields in the agreed categories", async () => {
    const { rows } = await pool.query<{ category: string; n: number }>(
      `SELECT category, count(*)::int AS n FROM field GROUP BY category`,
    );
    assert.deepEqual(Object.fromEntries(rows.map((row) => [row.category, row.n])), {
      Identity: 17,
      Classification: 11,
      Issuer: 10,
      "Legal and regulatory": 13,
      "Holder rights and backing": 13,
      "Service providers": 16,
      "Primary market": 20,
      "Token, per chain": 13,
      "Control and upgradeability": 9,
      "Security and incidents": 9,
      Governance: 4,
      "Technology and dependencies": 9,
    });
    const total = await one<{ n: number }>(`SELECT count(*)::int AS n FROM field`);
    assert.equal(total.n, 144);
  });

  it("has the 49 assets, with aliases that resolve", async () => {
    const total = await one<{ n: number }>(`SELECT count(*)::int AS n FROM asset`);
    assert.equal(total.n, 49);
    const alias = await one<{ ticker: string }>(
      `SELECT a.ticker FROM asset_alias x JOIN asset a ON a.id = x.asset_id WHERE x.value = 'maple-usdc'`,
    );
    assert.equal(alias.ticker, "syrupUSDC");
  });

  it("re-seeding changes nothing", async () => {
    const first = await one<{ ids: number[] }>(`SELECT array_agg(id ORDER BY id) AS ids FROM field`);
    await seed(pool);
    const second = await one<{ ids: number[] }>(`SELECT array_agg(id ORDER BY id) AS ids FROM field`);
    assert.deepEqual(second.ids, first.ids);
  });

  it("never has a financial field", async () => {
    const { rows } = await pool.query(
      `SELECT key FROM field WHERE key ~* '(price|nav|apy|yield|tvl|supply|volume|fee|return|income|holders?_count|minimum)'`,
    );
    assert.deepEqual(rows, []);
  });
});

describe("conflicting claims on ONyc's auditor", () => {
  let asset: number;
  let officialClaim: number;
  let rwaClaim: number;

  before(async () => {
    asset = await idOf("asset", "slug", "onyc");
    const apex = await organization("apex-insurance-fund-services", "Apex Insurance Fund Services");
    const harris = await organization("harris-and-trotter", "Harris & Trotter");
    rwaClaim = await addClaim({
      fieldKey: "provider.financial_auditor",
      subject: { column: "asset_id", id: asset },
      sourceKey: "rwa_xyz",
      value: { organization_id: harris },
    });
    officialClaim = await addClaim({
      fieldKey: "provider.financial_auditor",
      subject: { column: "asset_id", id: asset },
      sourceKey: "official_documents",
      value: { organization_id: apex },
      method: "document_parse",
    });
  });

  it("gives one Fact, from the higher-ranked source, with the conflict visible", async () => {
    const { rows } = await factFor("provider.financial_auditor", `asset:${asset}`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].claim_id, String(officialClaim));
    assert.equal(rows[0].has_conflict, true);
    assert.deepEqual(rows[0].conflicting_claim_ids.map(String).sort(), [officialClaim, rwaClaim].map(String).sort());
  });

  it("rejects changing a claim's value", async () => {
    await assert.rejects(
      pool.query(`UPDATE claim SET normalized_value = '{"organization_id": 1}' WHERE id = $1`, [rwaClaim]),
      /append-only/,
    );
  });

  it("rejects changing a value while withdrawing", async () => {
    await assert.rejects(
      pool.query(
        `UPDATE claim SET withdrawn_at = now(), withdrawn_reason = 'x', note = 'sneaky' WHERE id = $1`,
        [rwaClaim],
      ),
      /append-only/,
    );
  });

  it("rejects deleting and truncating claims", async () => {
    await assert.rejects(pool.query(`DELETE FROM claim WHERE id = $1`, [rwaClaim]), /append-only/);
    await assert.rejects(pool.query(`TRUNCATE claim CASCADE`), /append-only/);
  });

  it("a manual override wins and is labelled, and clearing it restores the order", async () => {
    await pool.query(
      `INSERT INTO fact_override (claim_id, reason, created_by) VALUES ($1, 'Test override', 'test')`,
      [rwaClaim],
    );
    let { rows } = await factFor("provider.financial_auditor", `asset:${asset}`);
    assert.equal(rows[0].claim_id, String(rwaClaim));
    assert.equal(rows[0].is_override, true);
    assert.equal(rows[0].has_conflict, true);

    await pool.query(`UPDATE fact_override SET cleared_at = now() WHERE claim_id = $1`, [rwaClaim]);
    ({ rows } = await factFor("provider.financial_auditor", `asset:${asset}`));
    assert.equal(rows[0].claim_id, String(officialClaim));
    assert.equal(rows[0].is_override, false);
  });

  it("withdrawing the winner switches the Fact and keeps the record", async () => {
    await pool.query(
      `UPDATE claim SET withdrawn_at = now(), withdrawn_reason = 'Former provider' WHERE id = $1`,
      [officialClaim],
    );
    const { rows } = await factFor("provider.financial_auditor", `asset:${asset}`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].claim_id, String(rwaClaim));
    assert.equal(rows[0].has_conflict, false);

    const kept = await one<{ withdrawn_reason: string }>(`SELECT withdrawn_reason FROM claim WHERE id = $1`, [officialClaim]);
    assert.equal(kept.withdrawn_reason, "Former provider");
  });

  it("rejects withdrawing the same claim twice", async () => {
    await assert.rejects(
      pool.query(`UPDATE claim SET withdrawn_reason = 'Changed my mind' WHERE id = $1`, [officialClaim]),
      /append-only/,
    );
  });
});

describe("AI claims", () => {
  let asset: number;
  let aiClaim: number;
  let document: number;
  let citation: number;

  before(async () => {
    asset = await idOf("asset", "slug", "usyc");
    aiClaim = await addClaim({
      fieldKey: "legal.domicile",
      subject: { column: "asset_id", id: asset },
      sourceKey: "ai_researcher",
      value: "Bermuda",
      method: "ai_extraction",
    });
    document = (
      await one<{ id: number }>(`INSERT INTO document (url, category) VALUES ('https://example.com/usyc', 'docs') RETURNING id`)
    ).id;
  });

  it("don't become a Fact with no citation", async () => {
    assert.equal((await factFor("legal.domicile", `asset:${asset}`)).rows.length, 0);
  });

  it("don't become a Fact with an unverified quote", async () => {
    citation = (
      await one<{ id: number }>(
        `INSERT INTO claim_citation (claim_id, document_id, quote) VALUES ($1, $2, 'domiciled in Bermuda') RETURNING id`,
        [aiClaim, document],
      )
    ).id;
    assert.equal((await factFor("legal.domicile", `asset:${asset}`)).rows.length, 0);
  });

  it("can't be marked verified without a stored file", async () => {
    await assert.rejects(pool.query(`UPDATE claim_citation SET verified_at = now() WHERE id = $1`, [citation]));
  });

  it("become a Fact once the quote is confirmed", async () => {
    const file = await one<{ id: number }>(
      `INSERT INTO stored_file (document_id, storage_key, sha256, size_bytes)
       VALUES ($1, 'abc.html', repeat('a', 64), 10) RETURNING id`,
      [document],
    );
    await pool.query(`UPDATE claim_citation SET verified_at = now(), stored_file_id = $1 WHERE id = $2`, [file.id, citation]);
    const { rows } = await factFor("legal.domicile", `asset:${asset}`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].claim_id, String(aiClaim));
  });

  it("rank below RWA.xyz unless the cited document is official, then rank as it", async () => {
    const rwa = await addClaim({
      fieldKey: "legal.domicile",
      subject: { column: "asset_id", id: asset },
      sourceKey: "rwa_xyz",
      value: "Cayman Islands",
    });
    let { rows } = await factFor("legal.domicile", `asset:${asset}`);
    assert.equal(rows[0].claim_id, String(rwa));
    assert.equal(rows[0].has_conflict, true);

    await pool.query(
      `INSERT INTO asset_document (asset_id, document_id, is_official, provenance) VALUES ($1, $2, true, 'test')`,
      [asset, document],
    );
    ({ rows } = await factFor("legal.domicile", `asset:${asset}`));
    assert.equal(rows[0].claim_id, String(aiClaim));
  });
});

describe("tokens", () => {
  let ethereum: number;
  let base: number;
  let solana: number;
  let asset: number;

  before(async () => {
    asset = await idOf("asset", "slug", "aaplx");
    const addNetwork = async (key: string, caseSensitive: boolean) =>
      (
        await one<{ id: number }>(
          `INSERT INTO network (key, name, address_case_sensitive) VALUES ($1, $1, $2) RETURNING id`,
          [key, caseSensitive],
        )
      ).id;
    ethereum = await addNetwork("ethereum", false);
    base = await addNetwork("base", false);
    solana = await addNetwork("solana", true);
  });

  const addToken = (network: number, address: string, issuance: string) =>
    one<{ id: number; address: string }>(
      `INSERT INTO token (asset_id, network_id, address, issuance_type) VALUES ($1, $2, $3, $4) RETURNING id, address`,
      [asset, network, address, issuance],
    );

  it("an asset has several tokens, including wrappers, and an address can repeat across chains", async () => {
    const address = "0xAbC0000000000000000000000000000000000001";
    await addToken(ethereum, address, "native");
    await addToken(base, address, "bridged");
    await addToken(ethereum, "0xAbC0000000000000000000000000000000000002", "wrapper");
    await addToken(solana, "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", "native");

    const { rows } = await pool.query(
      `SELECT issuance_type, count(*)::int AS n FROM token WHERE asset_id = $1 GROUP BY 1 ORDER BY 1`,
      [asset],
    );
    assert.deepEqual(rows, [
      { issuance_type: "bridged", n: 1 },
      { issuance_type: "native", n: 2 },
      { issuance_type: "wrapper", n: 1 },
    ]);
  });

  it("rejects the same address twice on one chain, whatever its case on EVM", async () => {
    await assert.rejects(addToken(ethereum, "0xABC0000000000000000000000000000000000001", "native"), /unique/);
  });

  it("keeps case on Solana", async () => {
    const lower = await addToken(solana, "xsbehlatcf6hdfpfz5xemdqw8nfavcsp5bdudrljzjp", "native");
    assert.equal(lower.address, "xsbehlatcf6hdfpfz5xemdqw8nfavcsp5bdudrljzjp");
  });
});

describe("rules", () => {
  const asset = () => idOf("asset", "slug", "ousg");

  it("rejects a disclosed claim with a JSON null, since a null from an API is no claim", async () => {
    await assert.rejects(
      addClaim({ fieldKey: "identity.isin", subject: { column: "asset_id", id: await asset() }, sourceKey: "rwa_xyz", value: null }),
    );
  });

  it("rejects a fast-changing field with no as-of date", async () => {
    await assert.rejects(
      addClaim({
        fieldKey: "primary.subscriptions_open",
        subject: { column: "asset_id", id: await asset() },
        sourceKey: "rwa_xyz",
        value: true,
        asOf: null,
      }),
      /as-of/,
    );
  });

  it("rejects a claim on the wrong subject level", async () => {
    const network = await one<{ id: number }>(`INSERT INTO network (key, name) VALUES ('wrong-level', 'x') RETURNING id`);
    await assert.rejects(
      addClaim({ fieldKey: "identity.isin", subject: { column: "network_id", id: network.id }, sourceKey: "rwa_xyz", value: "x" }),
      /subject level/,
    );
  });

  it("rejects a claim whose source differs from its ingestion run", async () => {
    const run = await newRun("chain");
    await assert.rejects(
      pool.query(
        `INSERT INTO claim (field_id, asset_id, source_id, ingestion_run_id, status, normalized_value, extraction_method)
         SELECT f.id, $1::integer, s.id, $2::bigint, 'disclosed', '"x"'::jsonb, 'api' FROM field f, source s
         WHERE f.key = 'identity.isin' AND s.key = 'rwa_xyz'`,
        [await asset(), run],
      ),
      /ingestion run/,
    );
  });

  it("keeps repeating records separate, with one Fact each", async () => {
    const id = await asset();
    const a = await organization("audit-firm-a", "Audit Firm A");
    const b = await organization("audit-firm-b", "Audit Firm B");
    const subject = { column: "asset_id", id } as const;
    await addClaim({ fieldKey: "security.audit_firm", subject, sourceKey: "official_documents", recordKey: "a-2025", value: { organization_id: a } });
    await addClaim({ fieldKey: "security.audit_firm", subject, sourceKey: "official_documents", recordKey: "b-2026", value: { organization_id: b } });
    assert.equal((await factFor("security.audit_firm", `asset:${id}`, "a-2025")).rows.length, 1);
    assert.equal((await factFor("security.audit_firm", `asset:${id}`, "b-2026")).rows.length, 1);
    await assert.rejects(
      addClaim({ fieldKey: "security.audit_firm", subject, sourceKey: "official_documents", value: { organization_id: a } }),
      /record_key/,
    );
  });

  it("a newer claim from the same source replaces the older one, with no false conflict", async () => {
    const id = await asset();
    const subject = { column: "asset_id", id } as const;
    await addClaim({ fieldKey: "identity.description", subject, sourceKey: "rwa_xyz", value: "old", observedAt: "2026-01-01" });
    const newer = await addClaim({ fieldKey: "identity.description", subject, sourceKey: "rwa_xyz", value: "new", observedAt: "2026-02-01" });
    const { rows } = await factFor("identity.description", `asset:${id}`);
    assert.equal(rows[0].claim_id, String(newer));
    assert.equal(rows[0].has_conflict, false);
  });

  it("the chain beats RWA.xyz on token details, and official documents beat it elsewhere", async () => {
    const network = await one<{ id: number }>(`INSERT INTO network (key, name) VALUES ('order-test', 'x') RETURNING id`);
    const token = await one<{ id: number }>(
      `INSERT INTO token (asset_id, network_id, address) VALUES ($1, $2, '0x01') RETURNING id`,
      [await asset(), network.id],
    );
    const subject = { column: "token_id", id: token.id } as const;
    await addClaim({ fieldKey: "token.decimals", subject, sourceKey: "official_documents", value: 9 });
    await addClaim({ fieldKey: "token.decimals", subject, sourceKey: "rwa_xyz", value: 18 });
    const chain = await addClaim({ fieldKey: "token.decimals", subject, sourceKey: "chain", value: 6, method: "chain_read" });
    const { rows } = await factFor("token.decimals", `token:${token.id}`);
    assert.equal(rows[0].claim_id, String(chain));
    assert.equal(rows[0].has_conflict, true);
  });

  it("a stated value beats an official 'not disclosed', and that is not a conflict", async () => {
    const id = await idOf("asset", "slug", "buidl");
    const subject = { column: "asset_id", id } as const;
    await addClaim({ fieldKey: "identity.cusip", subject, sourceKey: "official_documents", status: "not_disclosed" });
    const rwa = await addClaim({ fieldKey: "identity.cusip", subject, sourceKey: "rwa_xyz", value: "123456789" });
    const { rows } = await factFor("identity.cusip", `asset:${id}`);
    assert.equal(rows[0].claim_id, String(rwa));
    assert.equal(rows[0].has_conflict, false);
  });

  it("marketing words stay attributed Claims and never become Facts", async () => {
    const id = await idOf("asset", "slug", "usdc");
    const subject = { column: "asset_id", id } as const;
    for (const value of ["A fully audited protocol", "Decentralized lending", "Highly SECURE"]) {
      await addClaim({ fieldKey: "identity.description", subject, sourceKey: "rwa_xyz", value });
    }
    assert.equal((await factFor("identity.description", `asset:${id}`)).rows.length, 0);
    const status = await one<{ status: string }>(
      `SELECT status FROM asset_field_status WHERE asset_id = $1 AND field_key = 'identity.description'`,
      [id],
    );
    assert.equal(status.status, "attributed_only");
  });

  it("doesn't flag 'senior secured' or a Safe multisig as marketing", async () => {
    const id = await idOf("asset", "slug", "acred");
    const subject = { column: "asset_id", id } as const;
    await addClaim({ fieldKey: "holder.holdings_security", subject, sourceKey: "rwa_xyz", value: "Senior secured notes held in a Safe" });
    assert.equal((await factFor("holder.holdings_security", `asset:${id}`)).rows.length, 1);
  });

  it("every claim traces to a source and an ingestion run", async () => {
    const row = await one<{ untraced: number; total: number }>(`
      SELECT count(*) FILTER (WHERE s.id IS NULL OR r.id IS NULL OR r.source_id <> c.source_id)::int AS untraced,
             count(*)::int AS total
      FROM claim c
      LEFT JOIN source s ON s.id = c.source_id
      LEFT JOIN ingestion_run r ON r.id = c.ingestion_run_id
    `);
    assert.ok(row.total > 0);
    assert.equal(row.untraced, 0);
  });
});

describe("coverage", () => {
  it("computes per asset from the catalog, statuses and applicability", async () => {
    const id = await idOf("asset", "slug", "near");
    const subject = { column: "asset_id", id } as const;
    const applicable = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM field WHERE 'native_crypto' = ANY (applicable_asset_types)`,
    );
    const empty = await one<{ disclosed: number; applicable: number }>(
      `SELECT sum(disclosed)::int AS disclosed, sum(applicable)::int AS applicable FROM asset_coverage WHERE asset_id = $1`,
      [id],
    );
    assert.deepEqual(empty, { disclosed: 0, applicable: applicable.n });

    await addClaim({ fieldKey: "identity.website", subject, sourceKey: "rwa_xyz", value: "https://z.cash" });
    await addClaim({ fieldKey: "identity.logo", subject, sourceKey: "rwa_xyz", status: "not_disclosed" });
    await addClaim({ fieldKey: "identity.brand_color", subject, sourceKey: "rwa_xyz", status: "not_applicable" });

    const row = await one<{ disclosed: number; applicable: number; not_disclosed: number; not_applicable: number }>(
      `SELECT disclosed::int, applicable::int, not_disclosed::int, not_applicable::int
       FROM asset_coverage WHERE asset_id = $1 AND category = 'Identity'`,
      [id],
    );
    const identityFields = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM field WHERE category = 'Identity' AND 'native_crypto' = ANY (applicable_asset_types)`,
    );
    assert.deepEqual(row, { disclosed: 1, applicable: identityFields.n - 1, not_disclosed: 1, not_applicable: 1 });
  });

  it("counts a field as disclosed if any of the asset's tokens discloses it", async () => {
    const id = await idOf("asset", "slug", "near");
    const network = await one<{ id: number }>(`INSERT INTO network (key, name) VALUES ('coverage-test', 'x') RETURNING id`);
    const token = await one<{ id: number }>(
      `INSERT INTO token (asset_id, network_id, address) VALUES ($1, $2, '0x02') RETURNING id`,
      [id, network.id],
    );
    await addClaim({ fieldKey: "token.decimals", subject: { column: "token_id", id: token.id }, sourceKey: "chain", value: 24, method: "chain_read" });
    const row = await one<{ status: string }>(
      `SELECT status FROM asset_field_status WHERE asset_id = $1 AND field_key = 'token.decimals'`,
      [id],
    );
    assert.equal(row.status, "disclosed");
  });
});
