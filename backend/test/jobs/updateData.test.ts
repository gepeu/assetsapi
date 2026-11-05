/** Tests for update job; update job with a large universe. */
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import { runUpdateJob } from "../../src/jobs/updateData.ts";
import { runUniverseJob } from "../../src/jobs/updateUniverse.ts";
import { AuthOrQuotaError, ContractBrokenError, NotFoundError, TransientError } from "../../src/providers/errors.ts";
import { createFakeProvider, type FakeProvider, makeAsset, universeDeps, updateDeps } from "../helpers/fakeProvider.ts";
import { createTestDb, fingerprintWrites, type TestDb } from "../helpers/testDb.ts";

const ASSET_COUNT = 20;

describe("update job", () => {
  let db: TestDb;
  let fake: FakeProvider;

  before(async () => {
    db = await createTestDb();
    fake = createFakeProvider(Array.from({ length: ASSET_COUNT }, (_, index) => makeAsset({ ref: String(index + 1) })));
    await runUniverseJob(universeDeps(db, fake));
  });
  after(() => db.close());

  beforeEach(() => {
    fake.historyCalls.length = 0;
  });
  afterEach(() => {
    for (const asset of fake.assets.values()) delete asset.error;
  });

  const run = () => runUpdateJob(updateDeps(db, fake));
  const assetAt = (position: number) => {
    const asset = [...fake.assets.values()].sort((a, b) => a.reference.slug.localeCompare(b.reference.slug))[position];
    assert.ok(asset);
    return asset;
  };

  function finished(outcome: Awaited<ReturnType<typeof run>>) {
    assert.equal(outcome.kind, "finished");
    if (outcome.kind !== "finished") throw new Error("unreachable");
    return outcome;
  }

  test("a clean run over every active asset succeeds", async () => {
    const { status, summary } = finished(await run());
    assert.equal(status, "succeeded");
    assert.equal(summary.assets, ASSET_COUNT);
    assert.equal(summary.updated, ASSET_COUNT);
  });

  test("a second run with the same data writes nothing", async () => {
    await run();
    const fingerprint = await fingerprintWrites(db.pool);
    const { summary } = finished(await run());
    assert.deepEqual(await fingerprintWrites(db.pool), fingerprint);
    assert.equal(summary.fieldValuesWritten, 0);
    assert.equal(summary.currentWritten, 0);
    assert.equal(summary.historyDaysWritten, 0);
  });

  test("a failed asset keeps its last good data and rolls back", async () => {
    const asset = assetAt(0);
    const fingerprint = await fingerprintWrites(db.pool);
    asset.error = new TransientError("Timed out");
    const { status, summary } = finished(await run());
    assert.equal(status, "partial");
    assert.deepEqual(summary.failed, [{ slug: asset.reference.slug, error: "Timed out" }]);
    assert.deepEqual(await fingerprintWrites(db.pool), fingerprint);
  });

  test("a format error fails only that asset, and the run continues", async () => {
    const asset = assetAt(1);
    const other = assetAt(2);
    const description = other.reference.fields.find((field) => field.field === "identity.description");
    assert.ok(description);
    const saved = description.value;
    description.value = "Updated while the other failed";
    description.raw = description.value;
    asset.error = new ContractBrokenError("Response format changed");

    const { status, summary } = finished(await run());
    assert.equal(status, "partial");
    assert.equal(summary.updated, ASSET_COUNT - 1);
    const { rows } = await db.pool.query<{ value: unknown }>(
      `SELECT v.value FROM field_value v
       JOIN field f ON f.id = v.field_id AND f.key = 'identity.description'
       JOIN asset a ON a.id = v.asset_id AND a.slug = $1`,
      [other.reference.slug],
    );
    assert.equal(rows[0]?.value, "Updated while the other failed");

    description.value = saved;
    description.raw = saved;
    delete asset.error;
    await run();
  });

  test("data that fails validation fails that asset", async () => {
    const asset = assetAt(3);
    const [row] = asset.current.values;
    assert.ok(row);
    const saved = row.asOf;
    row.asOf = "2030-01-01";
    const { status, summary } = finished(await run());
    assert.equal(status, "partial");
    assert.match(JSON.stringify(summary.failed), /future/);
    row.asOf = saved;
  });

  test("a delisted asset fails, keeping its data, and the run continues", async () => {
    const asset = assetAt(4);
    asset.error = new NotFoundError("404");
    const { status, summary } = finished(await run());
    assert.equal(status, "partial");
    assert.equal(summary.updated, ASSET_COUNT - 1);
  });

  test("more than 10% of active assets failing stops the run", async () => {
    // Spread out, so the run in a row never reaches five. 3 of 20 is over 10%.
    for (const position of [0, 2, 4]) assetAt(position).error = new TransientError("Down");
    const { status, summary } = finished(await run());
    assert.equal(status, "failed");
    assert.match(String(summary.stoppedBy), /10%/);
    assert.equal((summary.failed as unknown[]).length, 3);
    assert.equal(summary.updated, 2);
  });

  test("exactly 10% failing doesn't stop the run", async () => {
    for (const position of [0, 2]) assetAt(position).error = new TransientError("Down");
    const { status, summary } = finished(await run());
    assert.equal(status, "partial");
    assert.equal(summary.stoppedBy, null);
    assert.equal(summary.updated, ASSET_COUNT - 2);
  });

  test("a rejected key stops the run straight away, and written assets stay", async () => {
    assetAt(2).error = new AuthOrQuotaError("Key rejected");
    const { status, summary } = finished(await run());
    assert.equal(status, "failed");
    assert.match(String(summary.stoppedBy), /rejected the key/);
    assert.equal(summary.updated, 2);
    assert.equal((summary.failed as unknown[]).length, 1);
  });

  test("a stop signal finishes the current asset and marks the run interrupted", async () => {
    let checks = 0;
    const outcome = await runUpdateJob(
      updateDeps(db, fake, {
        stop: {
          isStopping: () => {
            checks++;
            return checks > 3;
          },
        },
      }),
    );
    const { status, summary, runId } = finished(outcome);
    assert.equal(status, "interrupted");
    assert.equal(summary.updated, 3);
    const { rows } = await db.pool.query<{ status: string }>("SELECT status FROM ingestion_run WHERE id = $1", [runId]);
    assert.equal(rows[0]?.status, "interrupted");
  });

  test("a deactivated asset isn't updated", async () => {
    const asset = assetAt(19);
    await db.pool.query("UPDATE asset SET deactivated_at = now() WHERE slug = $1", [asset.reference.slug]);
    const { summary } = finished(await run());
    assert.equal(summary.assets, ASSET_COUNT - 1);
    assert.ok(!fake.historyCalls.some((call) => call.ref === asset.ref));
    await db.pool.query("UPDATE asset SET deactivated_at = NULL WHERE slug = $1", [asset.reference.slug]);
  });
});

describe("update job with a large universe", () => {
  // Enough assets that five failures stay under the 10% limit, so the run in a row is what stops it.
  const LARGE_COUNT = 60;
  let db: TestDb;
  let fake: FakeProvider;

  before(async () => {
    db = await createTestDb();
    fake = createFakeProvider(Array.from({ length: LARGE_COUNT }, (_, index) => makeAsset({ ref: String(index + 1) })));
    await runUniverseJob(universeDeps(db, fake));
  });
  after(() => db.close());

  test("five failures in a row stop the run", async () => {
    const sorted = [...fake.assets.values()].sort((a, b) => a.reference.slug.localeCompare(b.reference.slug));
    for (const asset of sorted.slice(0, 5)) asset.error = new TransientError("Down");
    const pings: string[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      pings.push(`${url} ${String(init?.body)}`);
      return new Response("OK");
    }) as typeof fetch;
    const outcome = await runUpdateJob(updateDeps(db, fake, { monitorUrl: "https://monitor.test/a", fetchImpl }));
    assert.equal(outcome.kind, "finished");
    if (outcome.kind !== "finished") return;
    assert.equal(outcome.status, "failed");
    assert.match(String(outcome.summary.stoppedBy), /5 assets failed in a row/);
    assert.equal((outcome.summary.failed as unknown[]).length, 5);
    assert.equal(outcome.summary.updated, 0);
    assert.match(pings[0] ?? "", /\/fail .*"severity":"urgent"/);
  });

  test("four in a row followed by a success don't", async () => {
    const sorted = [...fake.assets.values()].sort((a, b) => a.reference.slug.localeCompare(b.reference.slug));
    for (const asset of fake.assets.values()) delete asset.error;
    for (const asset of sorted.slice(0, 4)) asset.error = new TransientError("Down");
    const outcome = await runUpdateJob(updateDeps(db, fake));
    assert.equal(outcome.kind === "finished" && outcome.status, "partial");
  });
});
