/** Tests for the pool's behaviour when a connection is lost or goes quiet. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { settings } from "../../src/config.ts";
import { createPool, inTransaction, isDatabaseUnavailable } from "../../src/db/pool.ts";
import { createTestDb, type TestDb } from "../helpers/testDb.ts";

describe("pool", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  /** One connection, so a later query can only work if a broken connection was replaced. */
  const singlePool = (queryTimeoutMs?: number) => createPool({ connectionString: db.url, max: 1, queryTimeoutMs });

  async function backendPid(client: { query: typeof db.pool.query }): Promise<number> {
    const { rows } = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    return rows[0]?.pid ?? 0;
  }

  test("a connection cut mid-transaction rejects, rather than ending the process", async () => {
    const pool = singlePool();
    try {
      await assert.rejects(
        inTransaction(pool, async (client) => {
          const pid = await backendPid(client);
          setTimeout(() => void db.pool.query("SELECT pg_terminate_backend($1)", [pid]), 100);
          await client.query("SELECT pg_sleep(5)");
        }),
        (error) => isDatabaseUnavailable(error),
      );
      // Leaves time for an 'error' event that nothing hears, which is what used to end the process.
      await new Promise((resolve) => setTimeout(resolve, 200));
      const { rows } = await pool.query<{ ok: number }>("SELECT 1 AS ok");
      assert.equal(rows[0]?.ok, 1);
    } finally {
      await pool.end();
    }
  });

  test("a failed transaction rolls back and keeps its connection", async () => {
    const pool = singlePool();
    try {
      const pid = await backendPid(pool);
      await assert.rejects(
        inTransaction(pool, async (client) => {
          await client.query("INSERT INTO source (key, name) VALUES ('rolled_back', 'Rolled back')");
          throw new Error("boom");
        }),
        /boom/,
      );
      const { rows } = await pool.query("SELECT 1 FROM source WHERE key = 'rolled_back'");
      assert.equal(rows.length, 0);
      assert.equal(await backendPid(pool), pid);
    } finally {
      await pool.end();
    }
  });

  test("a query with no answer times out, reads as unavailable, and its connection is replaced", async () => {
    const pool = singlePool(200);
    try {
      const pid = await backendPid(pool);
      await assert.rejects(pool.query("SELECT pg_sleep(3)"), (error) => {
        assert.match((error as Error).message, /Query read timeout/);
        return isDatabaseUnavailable(error);
      });
      assert.notEqual(await backendPid(pool), pid);
    } finally {
      await pool.end();
    }
  });

  test("a timeout inside a transaction doesn't wait again for a rollback", async () => {
    const pool = singlePool(300);
    try {
      const started = Date.now();
      await assert.rejects(
        inTransaction(pool, (client) => client.query("SELECT pg_sleep(3)")),
        /Query read timeout/,
      );
      // A rollback queued behind the stuck query would take a second timeout to give up.
      assert.ok(Date.now() - started < 550);
      const { rows } = await pool.query<{ ok: number }>("SELECT 1 AS ok");
      assert.equal(rows[0]?.ok, 1);
    } finally {
      await pool.end();
    }
  });

  test("keepalive starts probing after seconds, not after the OS default", async () => {
    const pool = singlePool();
    try {
      assert.equal(pool.options.keepAlive, true);
      assert.equal(pool.options.keepAliveInitialDelayMillis, settings.db.keepaliveDelayMs);
      assert.ok(settings.db.keepaliveDelayMs <= 60_000);
    } finally {
      await pool.end();
    }
  });
});
