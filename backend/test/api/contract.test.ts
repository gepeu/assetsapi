/** Tests for the OpenAPI contract the app builds, and the Swagger page that serves it at /docs. */
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

  const get = async (url: string) => {
    const response = await app.inject({ method: 'GET', url });
    return response.statusCode === 302
      ? app.inject({ method: 'GET', url: new URL(String(response.headers.location), `http://x${url}/`).pathname })
      : response;
  };

  test('the guide opens the contract, with the current paths', () => {
    const { info } = app.swagger() as { info: { description: string } };
    assert.match(info.description, /\/assets\/catalog/);
    assert.ok(!/\bfigures\b/.test(info.description));
  });

  test('the docs page and its scripts load with no key', async () => {
    const page = await get('/docs');
    assert.equal(page.statusCode, 200);
    assert.match(String(page.headers['content-type']), /text\/html/);
    assert.match(page.body, /swagger-ui/);
    assert.equal((await get('/docs/static/swagger-ui-bundle.js')).statusCode, 200);
  });

  test('the docs page serves the same contract as the app', async () => {
    const response = await get('/docs/json');
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), JSON.parse(JSON.stringify(app.swagger())));
  });

  test('the docs routes stay out of the contract', () => {
    const paths = Object.keys((app.swagger() as { paths: object }).paths);
    assert.ok(!paths.some((path) => path.startsWith('/docs')));
  });
});
