/** Tests for universe job. */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { runUniverseJob } from '../../src/jobs/updateUniverse.ts';
import { AuthOrQuotaError, TransientError } from '../../src/providers/errors.ts';
import { createFakeProvider, type FakeProvider, makeAsset, universeDeps } from '../helpers/fakeProvider.ts';
import { createTestDb, fingerprintWrites, type TestDb } from '../helpers/testDb.ts';

describe('universe job', () => {
  let db: TestDb;
  let fake: FakeProvider;
  const ASSET_COUNT = 10;

  beforeEach(async () => {
    db = await createTestDb();
    fake = createFakeProvider(Array.from({ length: ASSET_COUNT }, (_, index) => makeAsset({ ref: String(index + 1) })));
  });
  afterEach(() => db.close());

  const run = () => runUniverseJob(universeDeps(db, fake));
  const seed = async () => {
    const outcome = await run();
    assert.equal(outcome.kind === 'finished' && outcome.status, 'succeeded');
  };

  async function activeSlugs(): Promise<string[]> {
    const { rows } = await db.pool.query<{ slug: string }>(
      'SELECT slug FROM asset WHERE deactivated_at IS NULL ORDER BY slug'
    );
    return rows.map((row) => row.slug);
  }

  function summaryOf(outcome: Awaited<ReturnType<typeof run>>) {
    assert.equal(outcome.kind, 'finished');
    if (outcome.kind !== 'finished') throw new Error('unreachable');
    return { status: outcome.status, summary: outcome.summary };
  }

  test('an empty database fills itself from the two lists', async () => {
    const { status, summary } = summaryOf(await run());
    assert.equal(status, 'succeeded');
    assert.equal((summary.created as string[]).length, ASSET_COUNT);
    assert.equal((await activeSlugs()).length, ASSET_COUNT);
  });

  test('the run record names the list provider, and new values point at it', async () => {
    await seed();
    const { rows } = await db.pool.query<{ key: string; job: string }>(
      `SELECT s.key, r.job FROM ingestion_run r JOIN source s ON s.id = r.source_id ORDER BY r.id DESC LIMIT 1`
    );
    assert.deepEqual(rows[0], { key: 'kamino', job: 'universe' });
  });

  test('a qualifying token joins automatically', async () => {
    await seed();
    fake.assets.set('50', makeAsset({ ref: '50' }));
    const { summary } = summaryOf(await run());
    assert.deepEqual(summary.created, ['asset-50']);
    assert.ok((await activeSlugs()).includes('asset-50'));
  });

  test('a second run with nothing new writes nothing', async () => {
    await seed();
    const before = await fingerprintWrites(db.pool);
    const { status } = summaryOf(await run());
    assert.equal(status, 'succeeded');
    assert.deepEqual(await fingerprintWrites(db.pool), before);
  });

  test('a failed Kamino list changes nothing', async () => {
    await seed();
    const before = await fingerprintWrites(db.pool);
    fake.listError = new TransientError('Kamino is down');
    const { status, summary } = summaryOf(await run());
    assert.equal(status, 'failed');
    assert.match(String(summary.error), /Kamino is down/);
    assert.deepEqual(await fingerprintWrites(db.pool), before);
  });

  test('a suspiciously short Kamino list changes nothing', async () => {
    await seed();
    const before = await fingerprintWrites(db.pool);
    for (const asset of [...fake.assets.values()].slice(0, 3)) fake.delisted.add(asset.mint);
    const { status, summary } = summaryOf(await run());
    assert.equal(status, 'failed');
    assert.match(String(summary.error), /80%/);
    assert.deepEqual(await fingerprintWrites(db.pool), before);
    assert.equal((await activeSlugs()).length, ASSET_COUNT);
  });

  test('a failed RWA.xyz lookup changes nothing', async () => {
    await seed();
    const before = await fingerprintWrites(db.pool);
    fake.resolveError = new TransientError('RWA.xyz is down');
    const { status } = summaryOf(await run());
    assert.equal(status, 'failed');
    assert.deepEqual(await fingerprintWrites(db.pool), before);
  });

  test("an asset whose mint leaves Kamino's list becomes inactive and keeps its history", async () => {
    await seed();
    const [leaving] = fake.assets.values();
    assert.ok(leaving);
    fake.delisted.add(leaving.mint);
    const { rows: before } = await db.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM financial_timeseries t JOIN asset a ON a.id = t.asset_id WHERE a.slug = 'asset-1'`
    );
    const { summary } = summaryOf(await run());
    assert.deepEqual(summary.deactivated, ['asset-1']);
    assert.ok(!(await activeSlugs()).includes('asset-1'));
    const { rows: after } = await db.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM financial_timeseries t JOIN asset a ON a.id = t.asset_id WHERE a.slug = 'asset-1'`
    );
    assert.ok((before[0]?.n ?? 0) > 0);
    assert.equal(after[0]?.n, before[0]?.n);
  });

  test('an asset whose mint leaves RWA.xyz becomes inactive too', async () => {
    await seed();
    const [leaving] = fake.assets.values();
    assert.ok(leaving);
    fake.unresolved.add(leaving.mint);
    const { summary } = summaryOf(await run());
    assert.deepEqual(summary.deactivated, ['asset-1']);
  });

  test('an asset that qualifies again is reactivated', async () => {
    await seed();
    const [leaving] = fake.assets.values();
    assert.ok(leaving);
    fake.delisted.add(leaving.mint);
    await run();
    fake.delisted.delete(leaving.mint);
    const { summary } = summaryOf(await run());
    assert.deepEqual(summary.reactivated, ['asset-1']);
    assert.ok((await activeSlugs()).includes('asset-1'));
  });

  test("a new asset's failed first load creates nothing, and the next run retries", async () => {
    await seed();
    const asset = makeAsset({ ref: '60' });
    asset.error = new TransientError('Timed out');
    fake.assets.set('60', asset);
    const before = await fingerprintWrites(db.pool);
    const { status, summary } = summaryOf(await run());
    assert.equal(status, 'partial');
    assert.equal((summary.failed as unknown[]).length, 1);
    assert.deepEqual(await fingerprintWrites(db.pool), before);

    delete asset.error;
    const retried = summaryOf(await run());
    assert.equal(retried.status, 'succeeded');
    assert.deepEqual(retried.summary.created, ['asset-60']);
  });

  test('an unmapped class is held back and reported', async () => {
    await seed();
    fake.assets.set('70', makeAsset({ ref: '70', assetClass: 'Space Rocks', assetType: null }));
    const pings: string[] = [];
    const fetchImpl = (async (url: string) => {
      pings.push(url);
      return new Response('OK');
    }) as typeof fetch;
    const outcome = await runUniverseJob(universeDeps(db, fake, { monitorUrl: 'https://monitor.test/u', fetchImpl }));
    const { status, summary } = summaryOf(outcome);
    assert.equal(status, 'succeeded');
    assert.deepEqual(summary.heldBack, [{ slug: 'asset-70', assetClass: 'Space Rocks' }]);
    assert.ok(!(await activeSlugs()).includes('asset-70'));
    assert.equal(pings[0], 'https://monitor.test/u/fail');
  });

  test('a mint moved to a new ID is skipped and reported for a manual fix', async () => {
    await seed();
    const [asset] = fake.assets.values();
    assert.ok(asset);
    fake.movedTo.set(asset.mint, '12345');
    const { status, summary } = summaryOf(await run());
    assert.equal(status, 'succeeded');
    assert.deepEqual(summary.moved, [{ mint: asset.mint, slug: 'asset-1', ref: '12345' }]);
    assert.deepEqual(summary.created, []);
    assert.ok((await activeSlugs()).includes('asset-1'));
  });

  test("a rejected key during a new asset's load stops the run", async () => {
    await seed();
    const asset = makeAsset({ ref: '80' });
    asset.error = new AuthOrQuotaError('Key rejected');
    fake.assets.set('80', asset);
    const { status } = summaryOf(await run());
    assert.equal(status, 'failed');
  });

  test('a stop signal changes nothing and records the run as interrupted', async () => {
    await seed();
    const before = await fingerprintWrites(db.pool);
    const [leaving] = fake.assets.values();
    if (leaving) fake.delisted.add(leaving.mint);
    const outcome = await runUniverseJob(universeDeps(db, fake, { stop: { isStopping: () => true } }));
    assert.equal(summaryOf(outcome).status, 'interrupted');
    assert.deepEqual(await fingerprintWrites(db.pool), before);
  });
});
