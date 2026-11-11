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
    assert.equal((await from('203.0.113.2')).statusCode, 200);
  });

  test('a cached response still counts toward the limit', async () => {
    const url = '/assets/catalog';
    for (let attempt = 0; attempt < 3; attempt++) assert.equal((await from('203.0.113.3', url)).statusCode, 200);
    assert.equal((await from('203.0.113.3', url)).statusCode, 429);
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
