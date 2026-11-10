/** Tests for the OpenAPI contract the app builds, now that it has no hosted docs page. */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/api/app.ts';
import { createTestDb, silentLogger, type TestDb } from '../helpers/testDb.ts';

describe('OpenAPI contract', () => {
  let db: TestDb;
  let app: FastifyInstance;

  before(async () => {
    db = await createTestDb();
    app = await buildApp({ db: db.pool, logger: silentLogger });
    await app.ready();
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  test('the guide opens the contract, with the current paths', () => {
    const { info } = app.swagger() as { info: { description: string } };
    assert.match(info.description, /\/tokenized_assets\/catalog/);
    assert.ok(!/\bfigures\b/.test(info.description));
  });

  test('no docs page is served', async () => {
    for (const url of ['/docs', '/docs/', '/docs/json']) {
      assert.equal((await app.inject({ method: 'GET', url })).statusCode, 404, url);
    }
  });
});
