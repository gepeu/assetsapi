import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import pg from "pg";
import { migrate } from "../src/db/migrate.ts";
import { createPool } from "../src/db/pool.ts";
import { seed } from "../src/db/seed.ts";
import { requireEnv } from "../src/env.ts";
import { FIELDS } from "../src/db/catalog/fields.ts";
import { loadAssetDetail, type FieldsBlock, type RecordsBlock } from "../src/views/assetDetail.ts";
import { loadAssetList } from "../src/views/assetList.ts";
import { VIEWS } from "../src/views/index.ts";

const adminUrl = requireEnv("DATABASE_URL");
const testDatabase = `rwa_views_test_${process.pid}`;
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

async function assetId(slug: string): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(`SELECT id FROM asset WHERE slug = $1`, [slug]);
  return rows[0].id;
}

async function addClaim(input: {
  fieldKey: string;
  column: "asset_id" | "token_id" | "contract_id";
  subjectId: number;
  sourceKey: string;
  value?: unknown;
  status?: string;
  recordKey?: string;
  asOf?: string;
}): Promise<void> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO ingestion_run (source_id) SELECT id FROM source WHERE key = $1 RETURNING id`,
    [input.sourceKey],
  );
  const value = input.value === undefined ? null : JSON.stringify(input.value);
  await pool.query(
    `INSERT INTO claim (field_id, ${input.column}, record_key, source_id, ingestion_run_id, status,
                        raw_value, normalized_value, as_of, extraction_method)
     SELECT f.id, $2::integer, $3::text, s.id, $4::bigint, $5::text, $6::jsonb, $6::jsonb, $7::date, 'api'
     FROM field f, source s WHERE f.key = $1 AND s.key = $8`,
    [
      input.fieldKey,
      input.subjectId,
      input.recordKey ?? "",
      rows[0].id,
      input.status ?? "disclosed",
      value,
      input.asOf ?? null,
      input.sourceKey,
    ],
  );
}

const findField = (view: Awaited<ReturnType<typeof loadAssetDetail>>, key: string) => {
  for (const category of view!.categories) {
    for (const block of category.blocks) {
      const field = block.kind === "fields" ? (block as FieldsBlock).fields.find((f) => f.key === key) : undefined;
      if (field) return field;
    }
  }
  assert.fail(`no field ${key}`);
};

const findRecords = (view: Awaited<ReturnType<typeof loadAssetDetail>>, key: string): RecordsBlock => {
  for (const category of view!.categories) {
    for (const block of category.blocks) {
      if (block.kind === "records" && block.key === key) return block;
    }
  }
  assert.fail(`no records block ${key}`);
};

describe("asset views", () => {
  it("are registered by name", async () => {
    assert.ok(Array.isArray(await VIEWS.asset_list.load(pool, new URLSearchParams())));
    assert.equal(await VIEWS.asset_detail.load(pool, new URLSearchParams("asset=no-such-asset")), null);
    assert.equal(await VIEWS.asset_detail.load(pool, new URLSearchParams()), null);
  });

  it("list every asset", async () => {
    const list = await loadAssetList(pool);
    const buidl = list.find((asset) => asset.slug === "buidl");
    assert.equal(list.length, 30);
    assert.equal(buidl?.assetClass, "Treasuries");
    assert.ok(buidl?.issuer);
  });

  it("shows every category, and a never-checked status for an asset with no data", async () => {
    const view = await loadAssetDetail(pool, "ousg");
    const names = new Set(FIELDS.map((field) => field.category));
    assert.deepEqual(new Set(view!.categories.map((c) => c.name)), names);
    assert.equal(view!.catalogFieldCount, FIELDS.length);
    assert.equal(view!.coverage.disclosed, 0);
    assert.equal(view!.coverage.neverChecked, view!.coverage.applicable);
    assert.equal(findField(view, "identity.website").status, "never_checked");
    // Governance has no fields for a tokenized fund: the category stays, with nothing in it.
    const governance = view!.categories.find((c) => c.name === "Governance")!;
    assert.equal(governance.coverage.applicable, 0);
    assert.deepEqual(governance.blocks, []);
  });

  it("picks the Fact by conflict order and keeps the disagreeing claim visible", async () => {
    const id = await assetId("buidl");
    await addClaim({ fieldKey: "legal.domicile", column: "asset_id", subjectId: id, sourceKey: "rwa_xyz", value: "Place B" });
    await addClaim({
      fieldKey: "legal.domicile",
      column: "asset_id",
      subjectId: id,
      sourceKey: "official_documents",
      value: "Place A",
    });

    const field = findField(await loadAssetDetail(pool, "buidl"), "legal.domicile");
    assert.equal(field.value, "Place A");
    assert.equal(field.source, "Official documents");
    assert.equal(field.hasConflict, true);
    assert.deepEqual(
      field.claims.map((claim) => [claim.source, claim.value, claim.isFact]),
      [
        ["Official documents", "Place A", true],
        ["RWA.xyz", "Place B", false],
      ],
    );
  });

  it("resolves organizations to names and shows subjective claims as attributed only", async () => {
    const id = await assetId("usyc");
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO organization (slug, brand_name) VALUES ('view-test-org', 'View Test Org') RETURNING id`,
    );
    await addClaim({
      fieldKey: "provider.custodian",
      column: "asset_id",
      subjectId: id,
      sourceKey: "rwa_xyz",
      value: { organization_id: rows[0].id },
    });
    await addClaim({
      fieldKey: "holder.holdings_security",
      column: "asset_id",
      subjectId: id,
      sourceKey: "rwa_xyz",
      value: "Trustless custody",
    });

    const view = await loadAssetDetail(pool, "usyc");
    assert.equal(findField(view, "provider.custodian").value, "View Test Org");
    const attributed = findField(view, "holder.holdings_security");
    assert.equal(attributed.status, "attributed_only");
    assert.equal(attributed.value, null);
    assert.equal(attributed.claims[0].isAttributedOnly, true);
    assert.equal(attributed.claims[0].isFact, false);
  });

  it("gives tokens one row per chain, and repeating records one row per record", async () => {
    const id = await assetId("nvdax");
    const { rows: networks } = await pool.query<{ id: number }>(
      `INSERT INTO network (key, name) VALUES ('view-a', 'Network A'), ('view-b', 'Network B') RETURNING id`,
    );
    const { rows: tokens } = await pool.query<{ id: number }>(
      `INSERT INTO token (asset_id, network_id, address) VALUES ($1, $2, '0xaaa'), ($1, $3, '0xbbb') RETURNING id`,
      [id, networks[0].id, networks[1].id],
    );
    await addClaim({ fieldKey: "token.decimals", column: "token_id", subjectId: tokens[0].id, sourceKey: "chain", value: 18 });
    for (const [recordKey, firm] of [["a1", "Firm One"], ["a2", "Firm Two"]]) {
      const { rows } = await pool.query<{ id: number }>(
        `INSERT INTO organization (slug, brand_name) VALUES ($1, $2) RETURNING id`,
        [`view-${recordKey}`, firm],
      );
      await addClaim({
        fieldKey: "security.audit_firm",
        column: "asset_id",
        subjectId: id,
        sourceKey: "official_documents",
        value: { organization_id: rows[0].id },
        recordKey,
      });
    }

    const view = await loadAssetDetail(pool, "nvdax");
    const tokenBlock = findRecords(view, "token");
    assert.deepEqual(tokenBlock.rows.map((row) => row.label), ["Network A", "Network B"]);
    // The network is the row's label, so it isn't also a column.
    assert.ok(!tokenBlock.columns.some((column) => column.key === "token.network"));
    const decimals = tokenBlock.columns.findIndex((column) => column.key === "token.decimals");
    assert.equal(tokenBlock.rows[0].cells[decimals].value, 18);
    assert.equal(tokenBlock.rows[1].cells[decimals].status, "never_checked");
    assert.deepEqual(tokenBlock.sources, ["On-chain data"]);

    const audits = findRecords(view, "audit");
    const firm = audits.columns.findIndex((column) => column.key === "security.audit_firm");
    assert.deepEqual(audits.rows.map((row) => row.cells[firm].value), ["Firm One", "Firm Two"]);
    assert.equal(findRecords(view, "incident").rows.length, 0);
  });

  it("agrees with the asset_coverage database view", async () => {
    const id = await assetId("buidl");
    const view = await loadAssetDetail(pool, "buidl");
    const { rows } = await pool.query<{ category: string; disclosed: number; applicable: number; conflicts: number }>(
      `SELECT category, disclosed::int, applicable::int, conflicts::int FROM asset_coverage WHERE asset_id = $1`,
      [id],
    );
    assert.ok(rows.length > 0);
    for (const row of rows) {
      const category = view!.categories.find((c) => c.name === row.category)!;
      assert.equal(category.coverage.disclosed, row.disclosed, row.category);
      assert.equal(category.coverage.applicable, row.applicable, row.category);
      assert.equal(category.coverage.conflicts, row.conflicts, row.category);
    }
  });

  it("lists the asset's documents, official ones first, and only that asset's", async () => {
    const id = await assetId("jup");
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO document (url, title, category) VALUES
         ('https://example.com/third-party', 'A third-party page', 'website'),
         ('https://example.com/terms', 'Terms', 'terms'),
         ('https://example.com/other-asset', 'Another asset''s page', 'website')
       RETURNING id`,
    );
    await pool.query(
      `INSERT INTO asset_document (asset_id, document_id, is_official, provenance)
       VALUES ($1, $2, false, 'test'), ($1, $3, true, 'test'), ($4, $5, true, 'test')`,
      [id, rows[0].id, rows[1].id, await assetId("kmno"), rows[2].id],
    );

    const { documents } = (await loadAssetDetail(pool, "jup"))!;
    assert.deepEqual(
      documents.map((document) => [document.title, document.isOfficial, document.hasSavedCopy]),
      [
        ["Terms", true, false],
        ["A third-party page", false, false],
      ],
    );
  });
});
