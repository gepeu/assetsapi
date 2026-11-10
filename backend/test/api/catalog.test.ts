/** Tests for GET /tokenized_assets/catalog. */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { coversRoutes } from '../helpers/coversRoutes.ts';
import { type ApiHarness, createApiHarness, makeAsset } from '../helpers/fakeProvider.ts';

interface Catalog {
  metrics: { metric: string; group: string; hasCurrentValue: boolean; hasHistory: boolean }[];
  groups: { key: string; label: string }[];
  categories: { key: string; label: string }[];
  fields: { key: string; level: string }[];
  filters: { assetClasses: string[]; assetTypes: string[]; networks: string[] };
}

coversRoutes(['GET /tokenized_assets/catalog']);

describe('GET /tokenized_assets/catalog', () => {
  let harness: ApiHarness;
  let catalog: Catalog;

  before(async () => {
    harness = await createApiHarness([makeAsset({ ref: '1' })]);
    const response = await harness.get('/tokenized_assets/catalog');
    assert.equal(response.statusCode, 200);
    catalog = response.json().data;
  });
  after(() => harness.close());

  test('it wins over an asset slug, and takes no parameters', async () => {
    assert.ok(Array.isArray(catalog.metrics));
    assert.equal((await harness.get('/tokenized_assets/catalog?unknown=1')).statusCode, 400);
  });

  test('metrics say whether they have values and history', () => {
    const price = catalog.metrics.find((row) => row.metric === 'price_dollar');
    assert.equal(price?.group, 'Value');
    assert.equal(price?.hasCurrentValue, true);
    assert.equal(price?.hasHistory, true);
    const apy = catalog.metrics.find((row) => row.metric === 'apy_30_day');
    assert.equal(apy?.hasCurrentValue, false);
    assert.equal(apy?.hasHistory, false);
  });

  test("unserved measures and terms aren't metrics", () => {
    const names = catalog.metrics.map((row) => row.metric);
    assert.ok(!names.includes('raw_supply'));
    assert.ok(!names.includes('sp_rating'));
    assert.ok(!names.includes('total_management_fee_bps'));
  });

  test('groups have the short names that `groups` takes', () => {
    assert.deepEqual(catalog.groups, [
      { key: 'value', label: 'Value' },
      { key: 'yield', label: 'Yield and returns' },
      { key: 'supply', label: 'Supply and holders' },
      { key: 'activity', label: 'Activity' },
    ]);
  });

  test('every short name is different, so none can hide another', () => {
    for (const options of [catalog.groups, catalog.categories]) {
      const keys = options.map((option) => option.key);
      assert.equal(new Set(keys).size, keys.length);
      assert.ok(keys.every((key) => /^[a-z0-9]+$/.test(key)));
    }
  });

  test('every category and group it lists is accepted', async () => {
    const asset = '/tokenized_assets/asset-1';
    for (const { key } of catalog.categories) {
      assert.equal((await harness.get(`${asset}?include=fields&categories=${key}`)).statusCode, 200, key);
    }
    for (const { key } of catalog.groups) {
      assert.equal((await harness.get(`${asset}?include=financials&groups=${key}`)).statusCode, 200, key);
    }
  });

  test('every metric it lists is accepted everywhere', async () => {
    for (const { metric } of catalog.metrics) {
      assert.equal((await harness.get(`/tokenized_assets?metrics=${metric}&sort=-${metric}`)).statusCode, 200, metric);
      const asset = `/tokenized_assets/asset-1?metrics=${metric}&history=${metric}`;
      assert.equal((await harness.get(asset)).statusCode, 200, metric);
    }
  });

  test("token fields are listed but can't be asked for by category", () => {
    assert.ok(catalog.fields.some((field) => field.level === 'token'));
    assert.ok(!catalog.categories.some((category) => category.key === 'token'));
  });

  test('internal fields stay out', () => {
    assert.ok(!catalog.fields.some((field) => field.key === 'identity.rwa_xyz_slug'));
  });

  test("filters list what's in use", () => {
    assert.deepEqual(catalog.filters.networks, ['ethereum', 'solana']);
    assert.deepEqual(catalog.filters.assetTypes, ['stablecoin']);
  });
});
