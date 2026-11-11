/** Tests for financials service. */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { getAsset } from '../../src/services/assets.ts';
import { makeAsset, seedAssets, TODAY } from '../helpers/fakeProvider.ts';
import { createTestDb, type TestDb } from '../helpers/testDb.ts';

describe('financials service', () => {
  let db: TestDb;

  before(async () => {
    db = await createTestDb();
    await seedAssets(db, [makeAsset({ ref: '1' })]);
  });
  after(() => db.close());

  async function load(query = {}) {
    const response = await getAsset(db.pool, 'asset-1', {
      include: 'financials,series,valueByNetwork,terms',
      ...query,
    });
    assert.ok(response);
    const { financials, series, valueByNetwork, terms, asOf } = response.data;
    assert.ok(financials && series && valueByNetwork && terms);
    return { financials, series, valueByNetwork, terms, asOf };
  }

  test('financials carry labels, units, groups and lookbacks', async () => {
    const { financials, asOf } = await load();
    assert.equal(asOf, TODAY);
    assert.deepEqual(
      financials.find((row) => row.metric === 'price_dollar'),
      {
        metric: 'price_dollar',
        label: 'Price',
        group: 'value',
        unit: 'dollar',
        scope: 'asset',
        value: 2,
        value7d: 1,
        value30d: 0,
        value90d: -1,
        asOf: TODAY,
      }
    );
  });

  test('unserved measures never appear', async () => {
    const data = await load();
    assert.ok(!data.financials.some((row) => row.metric === 'raw_supply'));
    assert.ok(!data.terms.some((term) => term.key === 'primary_markets'));
    assert.ok(!data.series.some((row) => row.metric === 'raw_supply'));
  });

  test("holder shares come from the Solana token, not the asset's added-up value", async () => {
    const { financials } = await load();
    const share = financials.filter((row) => row.metric === 'top_holder_concentration');
    assert.equal(share.length, 1);
    assert.equal(share[0]?.scope, 'solana');
    assert.equal(share[0]?.value, 40);
  });

  test('a share above 100% is stored but not served', async () => {
    const { financials } = await load();
    assert.ok(!financials.some((row) => row.metric === 'top_5_holder_concentration'));
    const { rows } = await db.pool.query<{ value: number }>(
      `SELECT value FROM financial_current WHERE metric = 'top_5_holder_concentration' AND token_id IS NOT NULL`
    );
    assert.equal(rows[0]?.value, 140);
  });

  test('a lookback share above 100% reads as null', async () => {
    await db.pool.query(
      `UPDATE financial_current SET value_30d = 150 WHERE metric = 'top_holder_concentration' AND token_id IS NOT NULL`
    );
    const { financials } = await load();
    const share = financials.find((row) => row.metric === 'top_holder_concentration');
    assert.equal(share?.value30d, null);
    assert.equal(share?.value7d, 39);
    await db.pool.query(
      `UPDATE financial_current SET value_30d = 38 WHERE metric = 'top_holder_concentration' AND token_id IS NOT NULL`
    );
  });

  test('terms come back in their own type', async () => {
    const { terms } = await load();
    const fee = terms.find((term) => term.key === 'total_management_fee_bps');
    assert.equal(fee?.value, 25);
    assert.equal(fee?.valueType, 'decimal');
    assert.equal(fee?.label, 'Management fee (bps)');
  });

  test("terms that repeat a catalog field aren't served, though they stay stored", async () => {
    const { terms } = await load();
    for (const key of [
      'primary_market__subscription_frequency',
      'primary_market__redemption_frequency',
      'primary_market__subscription_description',
      'primary_market__redemption_description',
      'primary_market__investor_types',
      'primary_market__is_kyc_required',
      'primary_market__base_asset_ticker',
    ]) {
      assert.ok(!terms.some((term) => term.key === key), key);
    }
    const { rows } = await db.pool.query(
      "SELECT value FROM financial_current WHERE metric = 'primary_market__subscription_frequency'"
    );
    assert.ok(rows.length > 0);
  });

  test('groups and financialMetrics narrow financials, and both must match', async () => {
    const metricsOf = (rows: { metric: string }[]) => rows.map((row) => row.metric);
    const groupsOf = (rows: { group: string }[]) => [...new Set(rows.map((row) => row.group))];
    assert.deepEqual(groupsOf((await load({ groups: 'value' })).financials), ['value']);
    assert.deepEqual(groupsOf((await load({ groups: 'supply' })).financials), ['supply']);
    assert.deepEqual(metricsOf((await load({ financialMetrics: 'price_dollar' })).financials), ['price_dollar']);
    assert.deepEqual(metricsOf((await load({ financialMetrics: 'top_holder_concentration' })).financials), [
      'top_holder_concentration',
    ]);
    assert.deepEqual(metricsOf((await load({ groups: 'value', financialMetrics: 'price_dollar' })).financials), [
      'price_dollar',
    ]);
    assert.deepEqual((await load({ groups: 'activity', financialMetrics: 'price_dollar' })).financials, []);
  });

  test("narrowing financials leaves the core's metrics and the series alone", async () => {
    const all = await load();
    const response = await getAsset(db.pool, 'asset-1', {
      include: 'financials,series',
      financialMetrics: 'price_dollar',
    });
    assert.deepEqual(response?.data.series, all.series);
    assert.ok(response && Object.keys(response.data.metrics).length === 5);
  });

  test('value by network has shares that add up to 100', async () => {
    const { valueByNetwork } = await load();
    assert.deepEqual(valueByNetwork, [
      { key: 'solana', name: 'Solana', value: 1200, share: 60 },
      { key: 'ethereum', name: 'Ethereum', value: 800, share: 40 },
    ]);
  });

  test("series lists what's available, with the right scope", async () => {
    const { series } = await load();
    assert.deepEqual(series, [
      { metric: 'price_dollar', label: 'Price', group: 'value', unit: 'dollar', scope: 'asset' },
      {
        metric: 'holding_addresses_count',
        label: 'Holders',
        group: 'supply',
        unit: 'address',
        scope: 'solana',
      },
      {
        metric: 'top_holder_concentration',
        label: 'Top holder share',
        group: 'supply',
        unit: 'percent',
        scope: 'solana',
      },
    ]);
  });

  test("a series on a deactivated token isn't offered, because history can't serve it", async () => {
    await db.pool.query(
      `UPDATE token SET deactivated_at = now() WHERE network_id = (SELECT id FROM network WHERE key = 'solana')`
    );
    const { series } = await load();
    assert.deepEqual(
      series.map((row) => row.metric),
      ['price_dollar']
    );
    await db.pool.query('UPDATE token SET deactivated_at = NULL');
  });

  test('an unknown or deactivated asset is null', async () => {
    assert.equal(await getAsset(db.pool, 'nope', { include: 'financials' }), null);
  });
});
