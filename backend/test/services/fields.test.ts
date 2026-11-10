/** Tests for field service. */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { getAsset } from '../../src/services/assets.ts';
import { makeAsset, seedAssets, TODAY } from '../helpers/fakeProvider.ts';
import { createTestDb, type TestDb } from '../helpers/testDb.ts';

describe('field service', () => {
  let db: TestDb;
  let assetId = 0;

  before(async () => {
    db = await createTestDb();
    await seedAssets(db, [makeAsset({ ref: '1' })]);
    const { rows } = await db.pool.query<{ id: number }>("SELECT id FROM asset WHERE slug = 'asset-1'");
    assetId = rows[0]?.id ?? 0;
  });
  after(() => db.close());

  async function load(query = {}) {
    const response = await getAsset(db.pool, 'asset-1', { include: 'fields', ...query });
    assert.ok(response?.data.fields);
    return response.data.fields;
  }

  const allFields = (data: Awaited<ReturnType<typeof load>>) => data.categories.flatMap((category) => category.fields);

  test('groups values by category with labels and types', async () => {
    const data = await load();
    const identity = data.categories.find((category) => category.name === 'Identity');
    assert.deepEqual(
      identity?.fields.find((field) => field.key === 'identity.name'),
      { key: 'identity.name', label: 'Name', valueType: 'text', value: 'Asset 1', asOf: TODAY }
    );
  });

  test('organization values come back as names, never IDs', async () => {
    const fields = allFields(await load());
    assert.equal(fields.find((field) => field.key === 'issuer.name')?.value, 'Shared Issuer');
    assert.equal(fields.find((field) => field.key === 'provider.manager')?.value, undefined);
  });

  test("the issuer's own fields are read from the organization", async () => {
    const fields = allFields(await load());
    assert.equal(fields.find((field) => field.key === 'issuer.website')?.value, 'https://issuer.example');
  });

  test('lists stay lists, and an applicable field with no data is null', async () => {
    const fields = allFields(await load());
    assert.deepEqual(fields.find((field) => field.key === 'classification.sector')?.value, ['Cash']);
    const website = fields.find((field) => field.key === 'identity.website');
    assert.equal(website?.value, null);
    assert.equal(website?.asOf, null);
  });

  test('categories narrow the section, and coverage stays whole-asset', async () => {
    const all = await load();
    const some = await load({ categories: 'identity,legal' });
    assert.deepEqual(
      some.categories.map((category) => category.name),
      ['Identity', 'Legal and regulatory']
    );
    assert.deepEqual(some.coverage, all.coverage);
  });

  test("a category that doesn't apply to this asset is valid and comes back empty", async () => {
    assert.deepEqual((await load({ categories: 'governance' })).categories, []);
  });

  test('an unknown category is a 400', async () => {
    await assert.rejects(load({ categories: 'made_up' }), (error: { code?: string }) => error.code === 'bad_request');
  });

  test("empty=false drops listed fields with no value, and coverage doesn't change", async () => {
    const all = await load();
    const filled = await load({ empty: false });
    assert.deepEqual(filled.coverage, all.coverage);
    assert.ok(allFields(all).some((field) => field.value === null));
    assert.ok(allFields(filled).length > 0);
    assert.ok(allFields(filled).every((field) => field.value !== null));
    const coverageOf = (data: typeof all) => data.categories.map((category) => [category.name, category.coverage]);
    assert.deepEqual(coverageOf(filled), coverageOf(all));
    for (const category of filled.categories) {
      for (const record of category.records) {
        assert.ok(record.fields.length > 0);
        assert.ok(record.fields.every((field) => field.value !== null));
      }
    }
  });

  test('token-level fields and their category are excluded', async () => {
    const data = await load();
    assert.ok(!data.categories.some((category) => category.name === 'Token, per chain'));
    assert.ok(!allFields(data).some((field) => field.key.startsWith('token.')));
  });

  test('internal fields stay out of the response and coverage', async () => {
    const fields = allFields(await load());
    assert.ok(!fields.some((field) => field.key === 'identity.rwa_xyz_slug'));
    assert.ok(!fields.some((field) => field.key === 'identity.logo'));
  });

  test("fields that don't apply to the asset's type are left out", async () => {
    const data = await load();
    // Governance applies only to protocols, and this asset is a stablecoin.
    assert.ok(!data.categories.some((category) => category.name === 'Governance'));
    assert.ok(!allFields(data).some((field) => field.key === 'identity.isin'));
  });

  test('network fields come as one record per network', async () => {
    const data = await load();
    const technology = data.categories.find((category) => category.name === 'Technology and dependencies');
    const records = technology?.records.filter((record) => record.group === 'network') ?? [];
    assert.deepEqual(
      records.map((record) => record.key),
      ['ethereum', 'solana']
    );
    const ethereum = records.find((record) => record.key === 'ethereum');
    assert.equal(ethereum?.fields.find((field) => field.key === 'technology.chain_id')?.value, '1');
    const solana = records.find((record) => record.key === 'solana');
    assert.equal(solana?.fields.find((field) => field.key === 'technology.network_layer')?.value, 'L1');
    assert.equal(solana?.fields.find((field) => field.key === 'technology.chain_id')?.value, null);
  });

  test('repeating records appear once they have values', async () => {
    const before = await load();
    const security = () => before.categories.find((category) => category.name === 'Security and incidents');
    assert.deepEqual(security()?.records, []);

    await db.pool.query(
      `INSERT INTO field_value (field_id, asset_id, record_key, value, source_id, locked_reason)
       SELECT f.id, $1, 'audit-1', '"2026-01-01"', s.id, 'Manual entry'
       FROM field f, source s WHERE f.key = 'security.audit_date' AND s.key = 'manual'`,
      [assetId]
    );
    const data = await load();
    const records = data.categories.find((category) => category.name === 'Security and incidents')?.records ?? [];
    assert.equal(records.length, 1);
    assert.equal(records[0]?.group, 'audit');
    assert.equal(records[0]?.key, 'audit-1');
    assert.equal(records[0]?.fields.find((field) => field.key === 'security.audit_date')?.value, '2026-01-01');
  });

  test('coverage counts what the response can show, overall and per category', async () => {
    const data = await load();
    const sum = (pick: (coverage: { withData: number; applicable: number }) => number) =>
      data.categories.reduce((total, category) => total + pick(category.coverage), 0);
    assert.equal(
      data.coverage.withData,
      sum((coverage) => coverage.withData)
    );
    assert.equal(
      data.coverage.applicable,
      sum((coverage) => coverage.applicable)
    );
    assert.ok(data.coverage.withData > 0);
    assert.ok(data.coverage.applicable > data.coverage.withData);
    const identity = data.categories.find((category) => category.name === 'Identity');
    assert.equal(identity?.coverage.withData, 3);
  });

  test('an unknown or deactivated asset is null', async () => {
    assert.equal(await getAsset(db.pool, 'nope', { include: 'fields' }), null);
  });
});
