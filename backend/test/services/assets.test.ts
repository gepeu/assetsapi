/** Tests for asset services. */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { ApiError } from '../../src/api/errors.ts';
import { getAsset, listAssets } from '../../src/services/assets.ts';
import { makeAsset, seedAssets } from '../helpers/fakeProvider.ts';
import { createTestDb, type TestDb } from '../helpers/testDb.ts';

describe('asset services', () => {
  let db: TestDb;

  before(async () => {
    db = await createTestDb();
    const stock = makeAsset({
      ref: '3',
      slug: 'stock',
      ticker: 'AAA',
      assetClass: 'Stocks',
      assetType: 'tokenized_equity',
    });
    const fund = makeAsset({
      ref: '1',
      slug: 'fund',
      ticker: 'CCC',
      assetClass: 'US Treasury Debt',
      assetType: 'tokenized_fund',
    });
    const coin = makeAsset({ ref: '2', slug: 'coin', ticker: 'BBB' });
    // Coin has no price, so sorting by price has to put it last either way.
    coin.current.values = coin.current.values.filter((row) => row.metric !== 'price_dollar');
    coin.reference.tokens = coin.reference.tokens.filter((token) => token.network === 'solana');
    coin.current.values = coin.current.values.filter((row) => row.token?.network !== 'ethereum');
    const twin = makeAsset({ ref: '4', slug: 'twin', ticker: 'AAA' });
    const gone = makeAsset({ ref: '5', slug: 'gone', ticker: 'ZZZ', assetClass: 'Gone Class' });
    await seedAssets(db, [stock, fund, coin, twin, gone]);
    await db.pool.query("UPDATE asset SET deactivated_at = now() WHERE slug = 'gone'");
  });
  after(() => db.close());

  const slugs = (response: Awaited<ReturnType<typeof listAssets>>) => response.data.map((row) => row.slug);

  test('lists active assets only, by ticker and then slug', async () => {
    const response = await listAssets(db.pool, {});
    assert.deepEqual(slugs(response), ['stock', 'twin', 'coin', 'fund']);
    assert.equal(response.meta.total, 4);
    assert.equal(response.meta.limit, 50);
    assert.equal(response.meta.offset, 0);
  });

  test('each row has its identity, issuer, date and metrics', async () => {
    const response = await listAssets(db.pool, { q: 'CCC' });
    assert.deepEqual(response.data[0], {
      slug: 'fund',
      ticker: 'CCC',
      name: 'Asset 1',
      assetClass: 'US Treasury Debt',
      assetType: 'tokenized_fund',
      classification: {
        group: { key: 'fixed_income', label: 'Fixed income' },
        subclass: { key: 'treasuries', label: 'Treasuries' },
      },
      issuer: 'Shared Issuer',
      asOf: '2026-11-05',
      metrics: {
        price_dollar: 2,
        net_asset_value_dollar: 2,
        total_asset_value_dollar: 2000,
        apy_30_day: null,
        holding_addresses_count: 20,
      },
    });
  });

  test('filters by class, type and network', async () => {
    assert.deepEqual(slugs(await listAssets(db.pool, { assetClass: 'Stocks' })), ['stock']);
    assert.deepEqual(slugs(await listAssets(db.pool, { assetType: 'tokenized_fund' })), ['fund']);
    assert.deepEqual(slugs(await listAssets(db.pool, { network: 'ethereum' })), ['stock', 'twin', 'fund']);
    assert.deepEqual(slugs(await listAssets(db.pool, { network: 'nowhere' })), []);
  });

  test('filters by classification group and subclass', async () => {
    assert.deepEqual(slugs(await listAssets(db.pool, { group: 'crypto' })), ['twin', 'coin']);
    assert.deepEqual(slugs(await listAssets(db.pool, { group: 'fixed_income' })), ['fund']);
    assert.deepEqual(slugs(await listAssets(db.pool, { subclass: 'stocks' })), ['stock']);
    assert.deepEqual(slugs(await listAssets(db.pool, { group: 'equities', subclass: 'stocks' })), ['stock']);
    assert.deepEqual(slugs(await listAssets(db.pool, { group: 'alternatives' })), []);
    assert.equal((await listAssets(db.pool, { group: 'crypto' })).meta.total, 2);
  });

  test('a subclass outside the sent group is a 400', async () => {
    await assert.rejects(listAssets(db.pool, { group: 'crypto', subclass: 'stocks' }), ApiError);
  });

  test('a classification filter still sorts by metric', async () => {
    const response = await listAssets(db.pool, { group: 'crypto', sort: '-price_dollar', limit: 1, offset: 1 });
    assert.equal(response.meta.total, 2);
    assert.equal(response.data.length, 1);
  });

  test('detail carries the classification too', async () => {
    const response = await getAsset(db.pool, 'stock');
    assert.deepEqual(response?.data.classification, {
      group: { key: 'equities', label: 'Equities' },
      subclass: { key: 'stocks', label: 'Stocks' },
    });
  });

  test('searches ticker, name and issuer, and treats wildcards as text', async () => {
    assert.deepEqual(slugs(await listAssets(db.pool, { q: 'bbb' })), ['coin']);
    assert.deepEqual(slugs(await listAssets(db.pool, { q: 'Asset 3' })), ['stock']);
    assert.equal((await listAssets(db.pool, { q: 'shared iss' })).meta.total, 4);
    assert.equal((await listAssets(db.pool, { q: '%' })).meta.total, 0);
    assert.equal((await listAssets(db.pool, { q: '_' })).meta.total, 0);
  });

  test('missing values sort last in both directions', async () => {
    assert.deepEqual(slugs(await listAssets(db.pool, { sort: 'price_dollar' })), ['fund', 'stock', 'twin', 'coin']);
    assert.deepEqual(slugs(await listAssets(db.pool, { sort: '-price_dollar' })), ['twin', 'stock', 'fund', 'coin']);
  });

  test('ties break by slug, so paging stays stable', async () => {
    assert.deepEqual(slugs(await listAssets(db.pool, { sort: 'apy_30_day' })), ['coin', 'fund', 'stock', 'twin']);
    assert.deepEqual(slugs(await listAssets(db.pool, { sort: '-apy_30_day' })), ['coin', 'fund', 'stock', 'twin']);
  });

  test('pages through results, and the total ignores paging', async () => {
    const page = await listAssets(db.pool, { limit: 2, offset: 2 });
    assert.deepEqual(slugs(page), ['coin', 'fund']);
    assert.equal(page.meta.total, 4);
    const beyond = await listAssets(db.pool, { offset: 100 });
    assert.deepEqual(beyond.data, []);
    assert.equal(beyond.meta.total, 4);
  });

  test('detail returns identity, issuer, organizations, networks and figures', async () => {
    const response = await getAsset(db.pool, 'fund');
    assert.ok(response);
    const { data } = response;
    assert.equal(data.description, 'About asset 1');
    assert.equal(data.issuer, 'Shared Issuer');
    assert.deepEqual(data.organizations, [
      { slug: 'shared-issuer', name: 'Shared Issuer', role: 'issuer', legalName: 'Shared Issuer Ltd' },
      { slug: 'manager-1', name: 'Manager 1', role: 'manager', legalName: null },
    ]);
    assert.deepEqual(data.networks, [
      { key: 'ethereum', name: 'Ethereum' },
      { key: 'solana', name: 'Solana' },
    ]);
    assert.equal(data.metrics.price_dollar, 2);
    assert.equal(data.asOf, '2026-11-05');
  });

  test('the list carries the metrics asked for, and only those', async () => {
    const { data } = await listAssets(db.pool, { q: 'CCC', metrics: 'holding_addresses_count,price_dollar' });
    assert.deepEqual(data[0]?.metrics, { holding_addresses_count: 20, price_dollar: 2 });
  });

  test("the list can sort by any metric, whether or not it's shown", async () => {
    assert.deepEqual(slugs(await listAssets(db.pool, { sort: '-holding_addresses_count', metrics: 'price_dollar' })), [
      'twin',
      'stock',
      'coin',
      'fund',
    ]);
  });

  test('a metric with no value is null', async () => {
    const { data } = await listAssets(db.pool, { q: 'BBB', metrics: 'price_dollar' });
    assert.deepEqual(data[0]?.metrics, { price_dollar: null });
  });

  test('holder shares on the list come from the Solana token, as on the asset', async () => {
    const { data } = await listAssets(db.pool, { q: 'CCC', metrics: 'top_holder_concentration' });
    assert.deepEqual(data[0]?.metrics, { top_holder_concentration: 40 });
    const detail = await getAsset(db.pool, 'fund', { metrics: 'top_holder_concentration' });
    assert.deepEqual(detail?.data.metrics, { top_holder_concentration: 40 });
  });

  test('a holder share above 100% reads as null, and sorts last', async () => {
    const { data } = await listAssets(db.pool, { q: 'CCC', metrics: 'top_5_holder_concentration' });
    assert.deepEqual(data[0]?.metrics, { top_5_holder_concentration: null });
    const detail = await getAsset(db.pool, 'fund', { metrics: 'top_5_holder_concentration' });
    assert.deepEqual(detail?.data.metrics, { top_5_holder_concentration: null });
    await db.pool.query(
      `UPDATE financial_current c SET value = 10
       WHERE c.metric = 'top_5_holder_concentration' AND c.token_id IS NOT NULL
         AND c.asset_id = (SELECT id FROM asset WHERE slug = 'coin')`
    );
    const sorted = slugs(await listAssets(db.pool, { sort: '-top_5_holder_concentration' }));
    assert.equal(sorted[0], 'coin');
    await db.pool.query(
      `UPDATE financial_current c SET value = 140
       WHERE c.metric = 'top_5_holder_concentration' AND c.token_id IS NOT NULL
         AND c.asset_id = (SELECT id FROM asset WHERE slug = 'coin')`
    );
  });

  test('an unknown metric or sort is a 400, on both endpoints', async () => {
    const isBadRequest = (error: { code?: string }) => error.code === 'bad_request';
    await assert.rejects(listAssets(db.pool, { metrics: 'made_up' }), isBadRequest);
    await assert.rejects(listAssets(db.pool, { sort: '-made_up' }), isBadRequest);
    await assert.rejects(getAsset(db.pool, 'fund', { metrics: 'made_up' }), isBadRequest);
  });

  test('an unknown or deactivated asset is null', async () => {
    assert.equal(await getAsset(db.pool, 'nope'), null);
    assert.equal(await getAsset(db.pool, 'gone'), null);
  });

  test('an unserved measure never appears in metrics', async () => {
    await db.pool.query("UPDATE financial_measure SET served = false WHERE slug = 'price_dollar'");
    try {
      const listed = await listAssets(db.pool, { q: 'CCC' });
      assert.equal(listed.data[0]?.metrics.price_dollar, null);
      assert.equal((await getAsset(db.pool, 'fund'))?.data.metrics.price_dollar, null);
    } finally {
      await db.pool.query("UPDATE financial_measure SET served = true WHERE slug = 'price_dollar'");
    }
  });
});

describe('asset list order', () => {
  let db: TestDb;

  before(async () => {
    db = await createTestDb();
    const tickers = ['USDC', 'sUSDe', 'AAPLx', 'tGBP', 'reUSD', 'BRK.Bx'];
    const assets = tickers.map((ticker, index) =>
      makeAsset({ ref: String(index + 1), slug: ticker.toLowerCase().replace('.', '-'), ticker })
    );
    await seedAssets(db, assets);
  });
  after(() => db.close());

  const tickers = async (sort: 'ticker' | '-ticker') =>
    (await listAssets(db.pool, { sort })).data.map((row) => row.ticker);

  test("tickers sort the same whatever the database's locale, ignoring case", async () => {
    assert.deepEqual(await tickers('ticker'), ['AAPLx', 'BRK.Bx', 'reUSD', 'sUSDe', 'tGBP', 'USDC']);
  });

  test('descending is the exact reverse', async () => {
    assert.deepEqual(await tickers('-ticker'), ['USDC', 'tGBP', 'sUSDe', 'reUSD', 'BRK.Bx', 'AAPLx']);
  });
});
