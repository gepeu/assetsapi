/** Tests for runTrackedJob. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { tryAcquireLock } from "../../src/db/lock.ts";
import { type JobDeps, type JobOutcome, runTrackedJob, toExitCode, toMonitorBody } from "../../src/jobs/runTracking.ts";
import { createTestDb, silentLogger, type TestDb } from "../helpers/testDb.ts";

describe("runTrackedJob", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  const deps = (overrides: Partial<JobDeps> = {}): JobDeps => ({
    connectionString: db.url,
    pool: db.pool,
    logger: silentLogger,
    monitorUrl: null,
    stop: { isStopping: () => false },
    ...overrides,
  });

  const succeed = async () => ({ status: "succeeded" as const, severity: "none" as const, summary: { done: 1 } });

  async function runRecord(runId: number) {
    const { rows } = await db.pool.query<{ status: string; job: string; summary: unknown; finished_at: Date | null }>(
      "SELECT status, job, summary, finished_at FROM ingestion_run WHERE id = $1",
      [runId],
    );
    return rows[0];
  }

  function recordingMonitor() {
    const pings: { url: string; body: string }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      pings.push({ url, body: String(init?.body) });
      return new Response("OK");
    }) as typeof fetch;
    return { pings, fetchImpl };
  }

  test("records the run and its summary", async () => {
    const outcome = await runTrackedJob(deps(), "update", "rwa_xyz", succeed);
    assert.equal(outcome.kind, "finished");
    if (outcome.kind !== "finished") return;
    const record = await runRecord(outcome.runId);
    assert.equal(record?.status, "succeeded");
    assert.equal(record?.job, "update");
    assert.deepEqual(record?.summary, { done: 1 });
    assert.ok(record?.finished_at);
  });

  test("a stale running record gets marked as failed", async () => {
    const { rows } = await db.pool.query<{ id: number }>(
      `INSERT INTO ingestion_run (source_id, job) SELECT id, 'update' FROM source WHERE key = 'rwa_xyz' RETURNING id`,
    );
    const staleId = rows[0]?.id ?? 0;
    await runTrackedJob(deps(), "update", "rwa_xyz", succeed);
    const record = await runRecord(staleId);
    assert.equal(record?.status, "failed");
    assert.ok(record?.finished_at);
  });

  test("a held lock makes a second job exit straight away, without a run record", async () => {
    const lock = await tryAcquireLock(db.url);
    assert.ok(lock);
    try {
      const { rows: before } = await db.pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM ingestion_run",
      );
      let worked = false;
      const outcome = await runTrackedJob(deps(), "update", "rwa_xyz", async () => {
        worked = true;
        return succeed();
      });
      assert.equal(outcome.kind, "locked");
      assert.equal(worked, false);
      const { rows: after } = await db.pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM ingestion_run",
      );
      assert.equal(after[0]?.count, before[0]?.count);
    } finally {
      await lock.release();
    }
  });

  test("the lock is free again after a job ends, even a failed one", async () => {
    await runTrackedJob(deps(), "update", "rwa_xyz", async () => {
      throw new Error("boom");
    });
    const lock = await tryAcquireLock(db.url);
    assert.ok(lock);
    await lock.release();
  });

  test("a lost lock connection is noticed", async () => {
    const lock = await tryAcquireLock(db.url);
    assert.ok(lock);
    assert.equal(lock.isHeld(), true);
    await lock.client.end();
    assert.equal(lock.isHeld(), false);
    await lock.release();
  });

  test("the server dropping the lock's connection is noticed, and frees the lock", async () => {
    const lock = await tryAcquireLock(db.url);
    assert.ok(lock);
    const { rows } = await lock.client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    const ended = new Promise((resolve) => lock.client.once("end", resolve));
    await db.pool.query("SELECT pg_terminate_backend($1)", [rows[0]?.pid]);
    await ended;
    assert.equal(lock.isHeld(), false);

    const next = await tryAcquireLock(db.url);
    assert.ok(next);
    await next.release();
  });

  test("the lock's connection has the server watch for a client that vanishes", async () => {
    const lock = await tryAcquireLock(db.url);
    assert.ok(lock);
    const show = async (setting: string) => {
      const { rows } = await lock.client.query<Record<string, string>>(`SHOW ${setting}`);
      return rows[0]?.[setting];
    };
    try {
      assert.equal(await show("tcp_keepalives_idle"), "60");
      assert.equal(await show("tcp_keepalives_interval"), "10");
      assert.equal(await show("tcp_keepalives_count"), "3");
    } finally {
      await lock.release();
    }
  });

  test("a job exits if the schema is older than it needs", async () => {
    await db.pool.query("DELETE FROM schema_migration WHERE filename = '002_catalog_seed.sql'");
    try {
      const { pings, fetchImpl } = recordingMonitor();
      let worked = false;
      const outcome = await runTrackedJob(
        deps({ monitorUrl: "https://monitor.test/abc", fetchImpl }),
        "update",
        "rwa_xyz",
        async () => {
          worked = true;
          return succeed();
        },
      );
      assert.equal(outcome.kind, "schema_behind");
      assert.equal(worked, false);
      assert.equal(toExitCode(outcome), 1);
      assert.equal(pings[0]?.url, "https://monitor.test/abc/fail");
    } finally {
      await db.pool.query("INSERT INTO schema_migration (filename) VALUES ('002_catalog_seed.sql')");
    }
  });

  test("a thrown error ends the run as failed, with the message in its summary", async () => {
    const outcome = await runTrackedJob(deps(), "update", "rwa_xyz", async () => {
      throw new Error("boom");
    });
    assert.equal(outcome.kind, "finished");
    if (outcome.kind !== "finished") return;
    assert.equal(outcome.status, "failed");
    assert.match(String(outcome.summary.error), /boom/);
    assert.equal(toExitCode(outcome), 1);
  });

  test("the monitor gets a success ping for a clean run", async () => {
    const { pings, fetchImpl } = recordingMonitor();
    await runTrackedJob(deps({ monitorUrl: "https://monitor.test/abc", fetchImpl }), "update", "rwa_xyz", succeed);
    assert.equal(pings[0]?.url, "https://monitor.test/abc");
  });

  test("the monitor gets a failure ping with the summary when something needs attention", async () => {
    const { pings, fetchImpl } = recordingMonitor();
    await runTrackedJob(
      deps({ monitorUrl: "https://monitor.test/abc/", fetchImpl }),
      "update",
      "rwa_xyz",
      async () => ({
        status: "partial",
        severity: "normal",
        summary: { failed: [{ slug: "x" }] },
      }),
    );
    assert.equal(pings[0]?.url, "https://monitor.test/abc/fail");
    assert.match(pings[0]?.body ?? "", /"slug":"x"/);
    assert.match(pings[0]?.body ?? "", /"severity":"normal"/);
  });

  test("a monitor that can't be reached doesn't fail the job", async () => {
    const fetchImpl = (async () => {
      throw new Error("down");
    }) as typeof fetch;
    const outcome = await runTrackedJob(
      deps({ monitorUrl: "https://monitor.test/abc", fetchImpl }),
      "update",
      "rwa_xyz",
      succeed,
    );
    assert.equal(outcome.kind, "finished");
  });

  test("a run whose ending can't be recorded still pings the monitor as failed", async () => {
    const { pings, fetchImpl } = recordingMonitor();
    const pool = {
      query: (sql: string, params?: unknown[]) =>
        /^UPDATE ingestion_run SET status = \$1/.test(sql)
          ? Promise.reject(new Error("Connection terminated unexpectedly"))
          : db.pool.query(sql, params),
    } as never;
    const outcome = await runTrackedJob(
      deps({ pool, monitorUrl: "https://monitor.test/abc", fetchImpl }),
      "update",
      "rwa_xyz",
      succeed,
    );
    assert.equal(outcome.kind, "finished");
    if (outcome.kind !== "finished") return;
    assert.equal(outcome.status, "failed");
    assert.equal(toExitCode(outcome), 1);
    assert.equal(pings[0]?.url, "https://monitor.test/abc/fail");
    assert.match(pings[0]?.body ?? "", /"severity":"urgent"/);
    assert.match(pings[0]?.body ?? "", /Connection terminated/);
    // The record is left for the next run to mark stale.
    assert.equal((await runRecord(outcome.runId))?.status, "running");

    const lock = await tryAcquireLock(db.url);
    assert.ok(lock);
    await lock.release();
  });

  test("a very long summary is cut but stays valid JSON, and a short one is untouched", () => {
    assert.equal(toMonitorBody({ a: 1 }), '{"a":1}');
    const quotes = Array.from({ length: 50_000 }, () => '"');
    const body = toMonitorBody({ quotes });
    assert.ok(body.length <= 100_000);
    const parsed = JSON.parse(body);
    assert.equal(parsed.truncated, true);
    assert.ok(parsed.start.startsWith('{"quotes"'));
  });

  test("exit codes: only failures and a schema mismatch are non-zero", () => {
    const finished = (status: "succeeded" | "partial" | "failed" | "interrupted"): JobOutcome => ({
      kind: "finished",
      runId: 1,
      status,
      summary: {},
    });
    assert.equal(toExitCode(finished("succeeded")), 0);
    assert.equal(toExitCode(finished("partial")), 0);
    assert.equal(toExitCode(finished("interrupted")), 0);
    assert.equal(toExitCode(finished("failed")), 1);
    assert.equal(toExitCode({ kind: "locked" }), 0);
    assert.equal(toExitCode({ kind: "schema_behind", pending: ["x"] }), 1);
  });
});
