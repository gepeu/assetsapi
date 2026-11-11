/** Tests for open access: no credentials, the per-IP rate limit and request logs. */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/api/app.ts';
import { createTestDb, silentLogger, type TestDb } from '../helpers/testDb.ts';

describe('open access', () => {
  let db: TestDb;
  let app: FastifyInstance;

  before(async () => {
    db = await createTestDb();
    app = await buildApp({ db: db.pool, logger: silentLogger });
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  test('every data route answers without credentials', async () => {
    for (const url of ['/assets', '/assets/catalog']) {
      assert.equal((await app.inject({ method: 'GET', url })).statusCode, 200, url);
    }
  });

  test('an Authorization header is ignored', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/assets',
      headers: { authorization: 'Bearer anything' },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['www-authenticate'], undefined);
  });

  test('a page on any website may read every answer, errors included', async () => {
    const origin = { origin: 'https://app.example' };
    for (const [url, status] of [
      ['/assets', 200],
      ['/assets?unknown=1', 400],
      ['/assets/no-such-asset', 404],
      ['/no-such-path', 404],
      ['/readyz', 200],
      ['/docs/json', 200],
    ] as const) {
      const response = await app.inject({ method: 'GET', url, headers: origin });
      assert.equal(response.statusCode, status, url);
      assert.equal(response.headers['access-control-allow-origin'], '*', url);
      assert.equal(response.headers['cross-origin-resource-policy'], 'cross-origin', url);
    }
  });

  test("a page's script can read the ETag and the rate-limit headers", async () => {
    const response = await app.inject({ method: 'GET', url: '/assets' });
    const exposed = String(response.headers['access-control-expose-headers']).split(', ');
    for (const name of ['etag', 'retry-after', 'x-request-id', 'x-ratelimit-remaining']) {
      assert.ok(exposed.includes(name), name);
    }
  });

  test("a browser's preflight is answered, and allows only reading", async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/assets/asset-1',
      headers: {
        origin: 'https://app.example',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'if-none-match',
      },
    });
    assert.equal(response.statusCode, 204);
    assert.equal(response.headers['access-control-allow-origin'], '*');
    assert.equal(response.headers['access-control-allow-methods'], 'GET, HEAD');
    assert.equal(response.headers['access-control-allow-headers'], 'if-none-match');
    assert.equal(response.headers['access-control-max-age'], '86400');
    assert.equal(response.headers['access-control-allow-credentials'], undefined);
  });

  test('the old frontend paths are gone', async () => {
    for (const url of ['/', '/ui', '/ui/assets']) {
      assert.equal((await app.inject({ method: 'GET', url })).statusCode, 404, url);
    }
  });
});

describe('per-IP rate limit', () => {
  let db: TestDb;
  let app: FastifyInstance;

  before(async () => {
    db = await createTestDb();
    app = await buildApp({ db: db.pool, logger: silentLogger, rateLimitMax: 3 });
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  const from = (ip: string, url = '/assets') => app.inject({ method: 'GET', url, headers: { 'x-real-ip': ip } });

  test("an IP over its limit gets a 429 in the standard shape, and others don't", async () => {
    for (let attempt = 0; attempt < 3; attempt++) assert.equal((await from('203.0.113.1')).statusCode, 200);
    const limited = await from('203.0.113.1');
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.json().error.code, 'rate_limited');
    assert.equal(limited.headers['access-control-allow-origin'], '*');
    assert.equal((await from('203.0.113.2')).statusCode, 200);
  });

  test('a cached response still counts toward the limit', async () => {
    const url = '/assets/catalog';
    for (let attempt = 0; attempt < 3; attempt++) assert.equal((await from('203.0.113.3', url)).statusCode, 200);
    assert.equal((await from('203.0.113.3', url)).statusCode, 429);
  });

  test('preflight requests count toward the limit', async () => {
    const preflight = () => app.inject({ method: 'OPTIONS', url: '/assets', headers: { 'x-real-ip': '203.0.113.5' } });
    for (let attempt = 0; attempt < 3; attempt++) assert.equal((await preflight()).statusCode, 204);
    assert.equal((await preflight()).statusCode, 429);
  });

  test('/readyz is never rate limited', async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      assert.equal((await from('203.0.113.4', '/readyz')).statusCode, 200);
    }
  });
});

describe('request logs', () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  test('one JSON line per request', async () => {
    const { pino } = await import('pino');
    const lines: string[] = [];
    const logger = pino({}, { write: (line: string) => void lines.push(line) });
    const app = await buildApp({ db: db.pool, logger });
    await app.inject({ method: 'GET', url: '/assets' });
    await app.close();

    const requestLines = lines.map((line) => JSON.parse(line)).filter((line) => line.msg === 'request');
    assert.equal(requestLines.length, 1);
    const [line] = requestLines;
    assert.equal(line.route, '/assets');
    assert.equal(line.status, 200);
    assert.equal(typeof line.requestId, 'string');
    assert.equal(typeof line.durationMs, 'number');
  });
});
