/** Tests for updateAsset and createNewAsset. */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { findSourceId, startRun } from "../../src/db/queries/runs.ts";
import { type AssetContext, createAssetContext, createNewAsset, updateAsset } from "../../src/jobs/updateAsset.ts";
import { ContractBrokenError } from "../../src/providers/errors.ts";
import type { ReferenceData } from "../../src/providers/types.ts";
import { createFakeProvider, type FakeProvider, makeAsset, TODAY, toProviders } from "../helpers/fakeProvider.ts";
import { createTestDb, fingerprintWrites, type TestDb } from "../helpers/testDb.ts";

describe("updateAsset and createNewAsset", () => {
  let db: TestDb;
  let fake: FakeProvider;
  let context: AssetContext;
  let refCounter = 100;

  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  beforeEach(async () => {
    fake = createFakeProvider([]);
    const sourceId = await findSourceId(db.pool, "rwa_xyz");
    const providers = { pool: db.pool, ...toProviders(fake), today: () => TODAY };
    context = await createAssetContext(providers, await startRun(db.pool, sourceId, "update"));
  });

  /** Creates a fresh asset so each test starts from its own data. */
  async function createAsset(mutate?: (reference: ReferenceData) => void) {
    const ref = String(refCounter++);
    const asset = makeAsset({ ref });
    mutate?.(asset.reference);
    fake.assets.set(ref, asset);
    const result = await createNewAsset(context, ref, [asset.mint]);
    assert.equal(result.status, "created");
    const { rows } = await db.pool.query<{ id: number }>("SELECT id FROM asset WHERE slug = $1", [
      result.status === "created" ? result.slug : "",
    ]);
    const id = rows[0]?.id;
    assert.ok(id);
    return { id, ref, asset, target: { id, ref } };
  }

  async function fieldRow(assetId: number, key: string) {
    const { rows } = await db.pool.query<{
      value: unknown;
      missing_since: Date | null;
      updated_at: Date;
      as_of: string;
    }>(
      `SELECT v.value, v.missing_since, v.updated_at, v.as_of::text AS as_of
       FROM field_value v JOIN field f ON f.id = v.field_id
       WHERE v.asset_id = $1 AND f.key = $2`,
      [assetId, key],
    );
    return rows[0];
  }

  test("a new asset gets its alias, tokens, organizations, values and history", async () => {
    const { id, ref, asset } = await createAsset();
    const count = async (sql: string, ...params: unknown[]) =>
      (await db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${sql}`, params)).rows[0]?.n;

    assert.equal(
      await count("asset_alias WHERE asset_id = $1 AND namespace = 'rwa_xyz_id' AND value = $2", id, ref),
      1,
    );
    assert.equal(await count("token WHERE asset_id = $1", id), 2);
    assert.equal(await count("token WHERE asset_id = $1 AND address = $2", id, asset.mint), 1);
    assert.equal(await count("asset_organization WHERE asset_id = $1", id), 2);
    assert.ok(((await count("field_value WHERE asset_id = $1", id)) ?? 0) > 0);
    assert.ok(((await count("financial_current WHERE asset_id = $1", id)) ?? 0) > 0);
    assert.ok(((await count("financial_timeseries WHERE asset_id = $1", id)) ?? 0) > 0);
  });

  test("organization values store the record's ID", async () => {
    const { id } = await createAsset();
    const row = await fieldRow(id, "issuer.name");
    assert.ok(row);
    assert.equal(typeof (row.value as { organization_id?: unknown }).organization_id, "number");
  });

  test("a value change is written and bumps updated_at", async () => {
    const { id, target, asset } = await createAsset();
    const before = await fieldRow(id, "identity.description");
    const [description] = asset.reference.fields.filter((field) => field.field === "identity.description");
    assert.ok(description);
    description.value = "Changed";
    description.raw = "Changed";
    await updateAsset(context, target);
    const after = await fieldRow(id, "identity.description");
    assert.equal(after?.value, "Changed");
    assert.ok((after?.updated_at.getTime() ?? 0) > (before?.updated_at.getTime() ?? 0));
  });

  test("a newer date alone moves as_of but not updated_at", async () => {
    const { id, target, asset } = await createAsset();
    const before = await fieldRow(id, "identity.name");
    for (const field of asset.reference.fields) field.asOf = TODAY;
    await db.pool.query(`UPDATE field_value SET as_of = '2026-01-01' WHERE asset_id = $1`, [id]);
    await updateAsset(context, target);
    const after = await fieldRow(id, "identity.name");
    assert.equal(after?.as_of, TODAY);
    assert.equal(after?.updated_at.getTime(), before?.updated_at.getTime());
  });

  test("a second run with the same data writes nothing", async () => {
    const { target } = await createAsset();
    await updateAsset(context, target);
    const before = await fingerprintWrites(db.pool);
    const result = await updateAsset(context, target);
    assert.deepEqual(await fingerprintWrites(db.pool), before);
    assert.equal(result.fieldValuesWritten, 0);
    assert.equal(result.currentWritten, 0);
    assert.equal(result.historyDaysWritten, 0);
  });

  test("a value missing from one load is kept and marked, and comes back cleanly", async () => {
    const { id, target, asset } = await createAsset();
    const saved = asset.reference.fields;
    asset.reference.fields = saved.filter((field) => field.field !== "identity.description");
    await updateAsset(context, target);
    const missing = await fieldRow(id, "identity.description");
    assert.equal(missing?.value, `About asset ${target.ref}`);
    assert.ok(missing?.missing_since);

    asset.reference.fields = saved;
    await updateAsset(context, target);
    assert.equal((await fieldRow(id, "identity.description"))?.missing_since, null);
  });

  test("the missing clock isn't restarted by later loads", async () => {
    const { id, target, asset } = await createAsset();
    asset.reference.fields = asset.reference.fields.filter((field) => field.field !== "identity.description");
    await updateAsset(context, target);
    const first = await fieldRow(id, "identity.description");
    await updateAsset(context, target);
    const second = await fieldRow(id, "identity.description");
    assert.equal(second?.missing_since?.getTime(), first?.missing_since?.getTime());
  });

  test("a value missing for 7 days is deleted", async () => {
    const { id, target, asset } = await createAsset();
    asset.reference.fields = asset.reference.fields.filter((field) => field.field !== "identity.description");
    await updateAsset(context, target);
    await db.pool.query(
      `UPDATE field_value SET missing_since = now() - interval '6 days' WHERE asset_id = $1 AND missing_since IS NOT NULL`,
      [id],
    );
    await updateAsset(context, target);
    assert.ok(await fieldRow(id, "identity.description"));

    await db.pool.query(
      `UPDATE field_value SET missing_since = now() - interval '8 days' WHERE asset_id = $1 AND missing_since IS NOT NULL`,
      [id],
    );
    await updateAsset(context, target);
    assert.equal(await fieldRow(id, "identity.description"), undefined);
  });

  test("a current value missing for 7 days is deleted too", async () => {
    const { id, target, asset } = await createAsset();
    asset.current.values = asset.current.values.filter((row) => row.metric !== "price_dollar");
    await updateAsset(context, target);
    const read = async () =>
      (
        await db.pool.query<{ missing_since: Date | null }>(
          `SELECT missing_since FROM financial_current WHERE asset_id = $1 AND metric = 'price_dollar' AND token_id IS NULL`,
          [id],
        )
      ).rows[0];
    assert.ok((await read())?.missing_since);

    await db.pool.query(
      `UPDATE financial_current SET missing_since = now() - interval '8 days' WHERE asset_id = $1 AND missing_since IS NOT NULL`,
      [id],
    );
    await updateAsset(context, target);
    assert.equal(await read(), undefined);
  });

  test("a locked value isn't overwritten, marked missing or deleted", async () => {
    const { id, target, asset } = await createAsset();
    await db.pool.query(
      `UPDATE field_value v SET value = '"Corrected"', locked_reason = 'Manual fix'
       FROM field f WHERE f.id = v.field_id AND v.asset_id = $1 AND f.key = 'identity.description'`,
      [id],
    );
    await updateAsset(context, target);
    assert.equal((await fieldRow(id, "identity.description"))?.value, "Corrected");

    asset.reference.fields = asset.reference.fields.filter((field) => field.field !== "identity.description");
    await updateAsset(context, target);
    const row = await fieldRow(id, "identity.description");
    assert.equal(row?.value, "Corrected");
    assert.equal(row?.missing_since, null);

    await db.pool.query(
      `UPDATE field_value SET missing_since = now() - interval '30 days' WHERE asset_id = $1 AND locked_reason IS NOT NULL`,
      [id],
    );
    await updateAsset(context, target);
    assert.ok(await fieldRow(id, "identity.description"));
  });

  test("shared organization values are overwritten but never removed", async () => {
    const { target, asset } = await createAsset();
    const readWebsite = async () =>
      (
        await db.pool.query<{ value: unknown; missing_since: Date | null }>(
          `SELECT v.value, v.missing_since FROM field_value v
           JOIN field f ON f.id = v.field_id AND f.key = 'issuer.website'
           JOIN organization o ON o.id = v.organization_id AND o.slug = 'shared-issuer'`,
        )
      ).rows[0];
    for (const organization of asset.reference.organizations) organization.fields = [];
    await updateAsset(context, target);
    const row = await readWebsite();
    assert.equal(row?.value, "https://issuer.example");
    assert.equal(row?.missing_since, null);
  });

  test("a role the provider removes doesn't stay", async () => {
    const { id, target, asset } = await createAsset();
    asset.reference.roles = asset.reference.roles.filter((role) => role.role !== "manager");
    await updateAsset(context, target);
    const { rows } = await db.pool.query<{ role: string }>("SELECT role FROM asset_organization WHERE asset_id = $1", [
      id,
    ]);
    assert.deepEqual(
      rows.map((row) => row.role),
      ["issuer"],
    );
  });

  test("a token the provider stops listing is deactivated, keeps its history, and returns if listed again", async () => {
    const { id, target, asset } = await createAsset();
    const saved = asset.reference.tokens;
    asset.reference.tokens = saved.filter((token) => token.network === "solana");
    asset.current.values = asset.current.values.filter((row) => row.token?.network !== "ethereum");
    await updateAsset(context, target);
    const read = async () =>
      (
        await db.pool.query<{ deactivated_at: Date | null }>(
          `SELECT t.deactivated_at FROM token t JOIN network n ON n.id = t.network_id
           WHERE t.asset_id = $1 AND n.key = 'ethereum'`,
          [id],
        )
      ).rows[0];
    assert.ok((await read())?.deactivated_at);

    asset.reference.tokens = saved;
    await updateAsset(context, target);
    assert.equal((await read())?.deactivated_at, null);
  });

  test("a token owned by another of our assets is skipped and noted, not moved", async () => {
    const first = await createAsset();
    const firstSolana = first.asset.reference.tokens.find((token) => token.network === "solana");
    assert.ok(firstSolana);
    const second = await createAsset();
    second.asset.reference.tokens.push({ ...firstSolana, fields: [] });
    const result = await updateAsset(context, second.target);
    assert.ok(result.notes.some((note) => note.includes("another of our assets")));
    const { rows } = await db.pool.query<{ asset_id: number }>("SELECT asset_id FROM token WHERE address = $1", [
      firstSolana.address,
    ]);
    assert.equal(rows[0]?.asset_id, first.id);
  });

  test("a renamed asset and organization update in place, and the slug and type don't", async () => {
    const { id, target, asset } = await createAsset();
    const { rows: before } = await db.pool.query<{ slug: string; asset_type: string }>(
      "SELECT slug, asset_type FROM asset WHERE id = $1",
      [id],
    );
    asset.reference.name = "Renamed asset";
    asset.reference.ticker = "RENAMED";
    asset.reference.assetClass = "New Class";
    asset.reference.assetType = "tokenized_fund";
    const manager = asset.reference.organizations.find((item) => item.slug.startsWith("manager-"));
    assert.ok(manager);
    manager.name = "Renamed Manager";
    manager.legalName = "Renamed Manager Ltd";
    await updateAsset(context, target);

    const { rows } = await db.pool.query(
      "SELECT slug, ticker, name, asset_class, asset_type FROM asset WHERE id = $1",
      [id],
    );
    assert.deepEqual(rows[0], {
      slug: before[0]?.slug,
      ticker: "RENAMED",
      name: "Renamed asset",
      asset_class: "New Class",
      asset_type: before[0]?.asset_type,
    });
    const organization = await db.pool.query("SELECT brand_name, legal_name FROM organization WHERE slug = $1", [
      manager.slug,
    ]);
    assert.deepEqual(organization.rows[0], { brand_name: "Renamed Manager", legal_name: "Renamed Manager Ltd" });
  });

  test("a record without a legal name doesn't erase the one we have", async () => {
    const { target, asset } = await createAsset();
    const issuer = asset.reference.organizations.find((item) => item.slug === "shared-issuer");
    assert.ok(issuer);
    issuer.legalName = null;
    await updateAsset(context, target);
    const { rows } = await db.pool.query("SELECT legal_name FROM organization WHERE slug = 'shared-issuer'");
    assert.equal(rows[0]?.legal_name, "Shared Issuer Ltd");
    issuer.legalName = "Shared Issuer Ltd";
  });

  test("a new measure name is kept but unserved, and reported", async () => {
    const { id, target, asset } = await createAsset();
    asset.current.values.push({
      metric: "brand_new_measure",
      token: null,
      value: 5,
      value7d: null,
      value30d: null,
      value90d: null,
      raw: 5,
      asOf: TODAY,
    });
    const result = await updateAsset(context, target);
    assert.deepEqual(result.newMeasures, ["brand_new_measure"]);
    const { rows } = await db.pool.query<{ served: boolean; kind: string }>(
      "SELECT served, kind FROM financial_measure WHERE slug = 'brand_new_measure'",
    );
    assert.equal(rows[0]?.served, false);
    assert.equal(rows[0]?.kind, "figure");
    const stored = await db.pool.query(
      "SELECT 1 FROM financial_current WHERE asset_id = $1 AND metric = 'brand_new_measure'",
      [id],
    );
    assert.equal(stored.rowCount, 1);

    const again = await updateAsset(context, target);
    assert.deepEqual(again.newMeasures, []);
  });

  test("a large swing is written and noted", async () => {
    const { id, target, asset } = await createAsset();
    const row = asset.current.values.find((value) => value.metric === "price_dollar" && value.token === null);
    assert.ok(row);
    const from = row.value;
    row.value = (from ?? 0) * 10;
    const result = await updateAsset(context, target);
    assert.deepEqual(result.swings, [{ metric: "price_dollar", from, to: row.value }]);
    const stored = await db.pool.query<{ value: number }>(
      `SELECT value FROM financial_current WHERE asset_id = $1 AND metric = 'price_dollar' AND token_id IS NULL`,
      [id],
    );
    assert.equal(stored.rows[0]?.value, row.value);
  });

  test("a restated day overwrites only that day, however old", async () => {
    const { id, target, asset } = await createAsset();
    const [series] = asset.history.series;
    assert.ok(series);
    const [day] = series.points[0] ?? [];
    series.points = series.points.map(([pointDay, value], index) =>
      index === 0 ? [pointDay, value + 100] : [pointDay, value],
    );
    const result = await updateAsset(context, target);
    assert.equal(result.historyDaysWritten, 1);
    const { rows } = await db.pool.query<{ value: number }>(
      `SELECT value FROM financial_timeseries WHERE asset_id = $1 AND measure = $2 AND token_id IS NULL AND day = $3`,
      [id, series.measure, day],
    );
    assert.equal(rows[0]?.value, series.points[0]?.[1]);
  });

  test("an empty token list fails the asset and leaves its tokens active", async () => {
    const { id, target, asset } = await createAsset();
    asset.reference.tokens = [];
    await assert.rejects(updateAsset(context, target), ContractBrokenError);
    const { rows } = await db.pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM token WHERE asset_id = $1 AND deactivated_at IS NULL",
      [id],
    );
    assert.equal(rows[0]?.n, 2);
  });

  test("a write error rolls back everything for that asset", async () => {
    const { id, target, asset } = await createAsset();
    const before = await fingerprintWrites(db.pool);
    const description = asset.reference.fields.find((field) => field.field === "identity.description");
    assert.ok(description);
    description.value = "Should roll back";
    description.raw = "Should roll back";
    // Passes validation, then fails on the foreign key inside the transaction.
    const [firstValue] = asset.current.values;
    assert.ok(firstValue);
    firstValue.metric = "x".repeat(10);
    await db.pool.query(`ALTER TABLE financial_current ADD CONSTRAINT test_no_x CHECK (metric <> 'xxxxxxxxxx')`);
    try {
      await assert.rejects(updateAsset(context, target));
    } finally {
      await db.pool.query("ALTER TABLE financial_current DROP CONSTRAINT test_no_x");
      await db.pool.query("DELETE FROM financial_measure WHERE slug = 'xxxxxxxxxx'");
    }
    assert.deepEqual(await fingerprintWrites(db.pool), before);
    assert.equal((await fieldRow(id, "identity.description"))?.value, `About asset ${target.ref}`);
  });

  test("a new asset's slug gets a number if it's taken", async () => {
    await createAsset((reference) => {
      reference.slug = "taken-slug";
    });
    const second = await createAsset((reference) => {
      reference.slug = "taken-slug";
    });
    const { rows } = await db.pool.query<{ slug: string }>("SELECT slug FROM asset WHERE id = $1", [second.id]);
    assert.equal(rows[0]?.slug, "taken-slug-2");
  });

  test("an unmapped class holds a new asset back, writing nothing", async () => {
    const asset = makeAsset({ ref: "900", assetClass: "Space Rocks", assetType: null });
    fake.assets.set("900", asset);
    const before = await fingerprintWrites(db.pool);
    const result = await createNewAsset(context, "900", [asset.mint]);
    assert.deepEqual(result, { status: "held_back", assetClass: "Space Rocks", slug: "asset-900" });
    assert.deepEqual(await fingerprintWrites(db.pool), before);
  });

  test("a new asset whose mint isn't in its own token list creates nothing", async () => {
    const asset = makeAsset({ ref: "901" });
    asset.reference.tokens = asset.reference.tokens.filter((token) => token.network !== "solana");
    asset.current.values = asset.current.values.filter((row) => row.token?.network !== "solana");
    asset.history.series = asset.history.series.filter((series) => series.token === null);
    fake.assets.set("901", asset);
    await assert.rejects(createNewAsset(context, "901", [asset.mint]), ContractBrokenError);
    const { rowCount } = await db.pool.query("SELECT 1 FROM asset WHERE slug = 'asset-901'");
    assert.equal(rowCount, 0);
  });
});
