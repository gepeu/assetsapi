/**
 * Entry point for the `migrate` command, and the runner behind it. Applies migration files not yet
 * recorded, in filename order, while holding the job lock so a schema change never meets a running job.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type pg from "pg";
import { loadMigrationDatabaseUrl, settings } from "../config.ts";
import { createLogger } from "../logger.ts";
import { type JobLock, tryAcquireLock } from "./lock.ts";
import type { Queryable } from "./pool.ts";

async function listMigrationFiles(): Promise<string[]> {
  return (await readdir(settings.db.migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
}

/**
 * The migrations this code ships with that the database hasn't applied. A rolled-back image ships
 * fewer files than were applied and passes, because migrations must work with old and new code.
 */
export async function findPendingMigrations(db: Queryable): Promise<string[]> {
  const files = await listMigrationFiles();
  const { rows } = await db.query<{ exists: boolean }>("SELECT to_regclass('schema_migration') IS NOT NULL AS exists");
  if (!rows[0]?.exists) return files;
  const applied = await db.query<{ filename: string }>("SELECT filename FROM schema_migration");
  const done = new Set(applied.rows.map((row) => row.filename));
  return files.filter((file) => !done.has(file));
}

async function waitForLock(connectionString: string, timeoutMs: number, pollMs: number): Promise<JobLock> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const lock = await tryAcquireLock(connectionString);
    if (lock) return lock;
    if (Date.now() + pollMs > deadline) throw new Error("Timed out waiting for the job lock");
    await sleep(pollMs);
  }
}

async function applyMigration(client: pg.Client, file: string): Promise<void> {
  const sql = await readFile(join(settings.db.migrationsDir, file), "utf8");
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("INSERT INTO schema_migration (filename) VALUES ($1)", [file]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

interface MigrateOptions {
  lockTimeoutMs?: number;
  lockPollMs?: number;
}

/** Returns the files applied. */
export async function migrate(connectionString: string, options: MigrateOptions = {}): Promise<string[]> {
  const lock = await waitForLock(
    connectionString,
    options.lockTimeoutMs ?? settings.db.migrateLockWaitMs,
    options.lockPollMs ?? settings.db.migrateLockPollMs,
  );
  try {
    await lock.client.query(`
      CREATE TABLE IF NOT EXISTS schema_migration (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const pending = await findPendingMigrations(lock.client);
    for (const file of pending) await applyMigration(lock.client, file);
    return pending;
  } finally {
    await lock.release();
  }
}

if (import.meta.main) {
  const logger = createLogger();
  try {
    const applied = await migrate(loadMigrationDatabaseUrl());
    logger.info({ applied }, "migrations finished");
  } catch (error) {
    logger.error({ err: error }, "migration failed");
    process.exitCode = 1;
  }
}
