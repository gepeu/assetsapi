/** Tests for GET /assets and /assets/{slug}: paths, validation and service behaviour. */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/api/app.ts';
import { runUniverseJob } from '../../src/jobs/updateUniverse.ts';
import { coversRoutes } from '../helpers/coversRoutes.ts';
import { createFakeProvider, makeAsset, universeDeps } from '../helpers/fakeProvider.ts';
import { createTestDb, silentLogger, type TestDb } from '../helpers/testDb.ts';

coversRoutes(['GET /assets', 'GET /assets/{slug}']);

describe('GET /assets and /assets/{slug}', () => {
  let db: TestDb;
  let app: FastifyInstance;

  before(async () => {
    db = await createTestDb();
    await runUniverseJob(universeDeps(db, createFakeProvider([makeAsset({ ref: '1' }), makeAsset({ ref: '2' })])));
    // The data version is read on every request, so a change shows at once, as it would after the check interval.
    app = await buildApp({ db: db.pool, logger: silentLogger, cacheVersionCheckMs: 0 });
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  const get = (url: string, extra: Record<string, string> = {}) => app.inject({ method: 'GET', url, headers: extra });

  test('lists assets in the documented shape', async () => {
    const response = await get('/assets');
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.data.length, 2);
    assert.deepEqual(Object.keys(body.data[0]).sort(), [
      'asOf',
      'assetClass',
      'assetType',
      'issuer',
      'metrics',
      'name',
      'slug',
      'ticker',
    ]);
    assert.deepEqual(Object.keys(body.meta).sort(), ['limit', 'offset', 'total']);
    assert.equal(body.data[0].metrics.apy_30_day, null);
  });

  test("solanaMetrics reads each asset's Solana token, and appears only when sent", async () => {
    const body = (await get('/assets?metrics=total_asset_value_dollar&solanaMetrics=total_asset_value_dollar')).json();
    const first = body.data[0];
    assert.deepEqual(Object.keys(first.solanaMetrics), ['total_asset_value_dollar']);
    assert.equal(first.solanaMetrics.total_asset_value_dollar, 2 * 600);
    assert.notEqual(first.metrics.total_asset_value_dollar, first.solanaMetrics.total_asset_value_dollar);
    assert.equal('solanaMetrics' in (await get('/assets')).json().data[0], false);
  });

  test('query numbers arrive as numbers', async () => {
    const body = (await get('/assets?limit=1&offset=1')).json();
    assert.equal(body.meta.limit, 1);
    assert.equal(body.meta.offset, 1);
    assert.equal(body.data.length, 1);
  });

  for (const url of [
    '/assets?unknown=1',
    '/assets?limit=0',
    '/assets?limit=201',
    '/assets?limit=abc',
    '/assets?limit=1&limit=2',
    '/assets?offset=-1',
    '/assets?offset=99999999999999999999',
    '/assets?q=%00',
    '/assets?assetClass=%00',
    '/assets?sort=name',
    '/assets?sort=Bad-Name',
    '/assets?metrics=made_up',
    '/assets?solanaMetrics=made_up',
    '/assets?solanaMetrics=raw_supply',
    '/assets?metrics=price_dollar,',
    '/assets?metrics=price_dollar,%20apy_30_day',
    '/assets?metrics=raw_supply',
    '/assets?metrics=sp_rating',
    '/assets?assetType=made_up',
    '/assets?network=Not%20Valid',
    '/assets?q=',
    `/assets?q=${'x'.repeat(65)}`,
    `/assets?assetClass=${'x'.repeat(65)}`,
    '/assets/Not_Valid',
    `/assets/${'a'.repeat(65)}`,
    '/assets/asset-1?unknown=1',
  ]) {
    test(`rejects ${url.slice(0, 40)} with a 400`, async () => {
      const response = await get(url);
      assert.equal(response.statusCode, 400);
      const body = response.json();
      assert.equal(body.error.code, 'bad_request');
      assert.equal(typeof body.error.requestId, 'string');
    });
  }

  test('accepts every documented sort', async () => {
    for (const sort of [
      'ticker',
      '-ticker',
      'price_dollar',
      '-apy_30_day',
      'net_asset_value_dollar',
      'total_asset_value_dollar',
      'holding_addresses_count',
      'market_value_dollar',
      '-top_holder_concentration',
    ]) {
      assert.equal((await get(`/assets?sort=${sort}`)).statusCode, 200, sort);
    }
  });

  test('returns one asset', async () => {
    const response = await get('/assets/asset-1');
    assert.equal(response.statusCode, 200);
    const { data } = response.json();
    assert.equal(data.slug, 'asset-1');
    assert.equal(data.issuer, 'Shared Issuer');
    assert.ok(Array.isArray(data.organizations));
    assert.deepEqual(Object.keys(data.metrics), [
      'price_dollar',
      'net_asset_value_dollar',
      'total_asset_value_dollar',
      'apy_30_day',
      'holding_addresses_count',
    ]);
  });

  test('an unknown asset is a 404 in the standard shape', async () => {
    const response = await get('/assets/nope');
    assert.equal(response.statusCode, 404);
    const body = response.json();
    assert.equal(body.error.code, 'not_found');
    assert.equal(body.error.requestId, response.headers['x-request-id']);
  });

  test('a deactivated asset is a 404', async () => {
    await db.pool.query("UPDATE asset SET deactivated_at = now() WHERE slug = 'asset-2'");
    assert.equal((await get('/assets/asset-2')).statusCode, 404);
    await db.pool.query("UPDATE asset SET deactivated_at = NULL WHERE slug = 'asset-2'");
  });

  test('an unknown path is a 404 in the standard shape', async () => {
    const response = await get('/nope');
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error.code, 'not_found');
  });

  test('the old paths are gone', async () => {
    for (const url of [
      '/tokenized_assets',
      '/tokenized_assets/catalog',
      '/tokenized_assets/asset-1',
      '/assets/asset-1/fields',
      '/assets/asset-1/tokens',
    ]) {
      assert.equal((await get(url)).statusCode, 404, url);
    }
  });

  test('only GET is allowed', async () => {
    const response = await app.inject({ method: 'POST', url: '/assets' });
    assert.equal(response.statusCode, 404);
  });

  test('a response has an ETag, and sending it back gets a 304 with no body', async () => {
    const first = await get('/assets/asset-1');
    const etag = first.headers.etag;
    assert.equal(typeof etag, 'string');
    assert.equal(first.headers['cache-control'], 'no-cache');

    const second = await get('/assets/asset-1', { 'if-none-match': String(etag) });
    assert.equal(second.statusCode, 304);
    assert.equal(second.body, '');
  });

  test('the ETag changes when the data does', async () => {
    const first = await get('/assets/asset-1');
    await db.pool.query(`UPDATE asset SET name = 'Renamed' WHERE slug = 'asset-1'`);
    const second = await get('/assets/asset-1', { 'if-none-match': String(first.headers.etag) });
    assert.equal(second.statusCode, 200);
    assert.notEqual(second.headers.etag, first.headers.etag);
    await db.pool.query(`UPDATE asset SET name = 'Asset 1' WHERE slug = 'asset-1'`);
  });

  test('long responses are compressed, and the ETag survives', async () => {
    const url = '/assets/asset-1?include=fields';
    const plain = await get(url);
    assert.ok(plain.body.length > 1024);
    const zipped = await get(url, { 'accept-encoding': 'gzip' });
    assert.equal(zipped.headers['content-encoding'], 'gzip');
    assert.equal(zipped.headers.etag, plain.headers.etag);
    const notModified = await get(url, { 'accept-encoding': 'gzip', 'if-none-match': String(plain.headers.etag) });
    assert.equal(notModified.statusCode, 304);
  });

  test('security headers are set', async () => {
    const response = await get('/assets');
    assert.ok(response.headers['strict-transport-security']);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.match(String(response.headers['content-security-policy']), /script-src 'self';/);
  });

  test('the database being down is a 503 with no internals', async () => {
    const broken = await buildApp({
      db: {
        query: async () => {
          throw Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:5432'), { code: 'ECONNREFUSED' });
        },
      } as never,
      logger: silentLogger,
    });
    const response = await broken.inject({
      method: 'GET',
      url: '/assets',
    });
    await broken.close();
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error.code, 'unavailable');
    assert.ok(!response.body.includes('10.0.0.1'));
  });

  test('a full connection pool is a 503', async () => {
    const full = await buildApp({
      db: {
        query: () => Promise.reject(new Error('timeout exceeded when trying to connect')),
      } as never,
      logger: silentLogger,
    });
    const response = await full.inject({
      method: 'GET',
      url: '/assets',
    });
    await full.close();
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error.code, 'unavailable');
  });

  test('a database connection that went quiet is a 503', async () => {
    const quiet = await buildApp({
      db: {
        query: () => Promise.reject(new Error('Query read timeout')),
      } as never,
      logger: silentLogger,
    });
    const response = await quiet.inject({
      method: 'GET',
      url: '/assets',
    });
    await quiet.close();
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error.code, 'unavailable');
  });

  test('an unexpected error is a generic 500', async () => {
    let calls = 0;
    const flaky = await buildApp({
      db: {
        query: () => {
          calls++;
          return Promise.reject(new Error('column "secret_column" does not exist'));
        },
      } as never,
      logger: silentLogger,
    });
    const response = await flaky.inject({
      method: 'GET',
      url: '/assets',
    });
    await flaky.close();
    assert.ok(calls > 0);
    assert.equal(response.statusCode, 500);
    assert.equal(response.json().error.code, 'internal');
    assert.ok(!response.body.includes('secret_column'));
  });
});
