/** Tests for history service. */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { getAsset } from '../../src/services/assets.ts';
import { makeAsset, seedAssets } from '../helpers/fakeProvider.ts';
import { createTestDb, type TestDb } from '../helpers/testDb.ts';

describe('history service', () => {
  let db: TestDb;

  before(async () => {
    db = await createTestDb();
    await seedAssets(db, [makeAsset({ ref: '1' })]);
  });
  after(() => db.close());

  async function load(metric: string, range?: '7d' | '30d' | '3m' | '1y' | 'all') {
    const response = await getAsset(db.pool, 'asset-1', { history: metric, ...(range && { range }) });
    return response?.data.history?.[0];
  }

  test('returns daily points oldest first, with labels', async () => {
    assert.deepEqual(await load('price_dollar', 'all'), {
      metric: 'price_dollar',
      label: 'Price',
      unit: 'dollar',
      scope: 'asset',
      points: [
        ['2026-11-01', 2],
        ['2026-11-02', 3],
        ['2026-11-03', 4],
        ['2026-11-04', 5],
      ],
    });
  });

  test("a range counts back from the series' own last point", async () => {
    await db.pool.query(
      `INSERT INTO financial_timeseries (asset_id, measure, day, value, ingestion_run_id)
       SELECT a.id, 'apy_7_day', d::date, 1, (SELECT max(id) FROM ingestion_run)
       FROM asset a, generate_series('2024-01-01'::date, '2024-12-31'::date, '1 day') d
       WHERE a.slug = 'asset-1'`
    );
    const count = async (range: '7d' | '30d' | '3m' | '1y' | 'all') => (await load('apy_7_day', range))?.points.length;
    assert.equal(await count('7d'), 7);
    assert.equal(await count('30d'), 30);
    assert.equal(await count('3m'), 90);
    assert.equal(await count('1y'), 365);
    assert.equal(await count('all'), 366);
    const last = (await load('apy_7_day', '7d'))?.points.at(-1);
    assert.deepEqual(last, ['2024-12-31', 1]);
  });

  test('the range defaults to three months', async () => {
    assert.equal((await load('apy_7_day'))?.points.length, 90);
  });

  test('several metrics come back in the order asked for, without repeats', async () => {
    const response = await getAsset(db.pool, 'asset-1', {
      history: 'top_holder_concentration,price_dollar,top_holder_concentration',
      range: 'all',
    });
    assert.deepEqual(
      response?.data.history?.map((series) => series.metric),
      ['top_holder_concentration', 'price_dollar']
    );
  });

  test('holder shares read the Solana series and skip impossible days', async () => {
    const series = await load('top_holder_concentration', 'all');
    assert.equal(series?.scope, 'solana');
    assert.deepEqual(series?.points, [
      ['2026-11-02', 50],
      ['2026-11-04', 40],
    ]);
  });

  test('a metric with only a Solana series reads that one', async () => {
    const series = await load('holding_addresses_count', 'all');
    assert.equal(series?.scope, 'solana');
    assert.deepEqual(series?.points, [['2026-11-04', 77]]);
  });

  test('a valid metric with no data has empty points', async () => {
    const series = await load('apy_30_day', 'all');
    assert.deepEqual(series?.points, []);
    assert.equal(series?.scope, 'asset');
  });

  test('an unknown or unserved metric is a 400, and an unknown asset is null', async () => {
    const isBadRequest = (error: { code?: string }) => error.code === 'bad_request';
    await assert.rejects(getAsset(db.pool, 'asset-1', { history: 'made_up' }), isBadRequest);
    await assert.rejects(getAsset(db.pool, 'asset-1', { history: 'raw_supply' }), isBadRequest);
    assert.equal(await getAsset(db.pool, 'nope', { history: 'price_dollar' }), null);
  });
});
