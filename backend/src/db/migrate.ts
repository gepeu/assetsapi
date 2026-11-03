import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type pg from "pg";
import { inTransaction } from "./pool.ts";

const MIGRATIONS_DIR = join(import.meta.dirname, "../../db/migrations");

/** Applies any migration files not yet recorded, in filename order. Returns those applied. */
export async function migrate(pool: pg.Pool): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await pool.query<{ filename: string }>("SELECT filename FROM schema_migration");
  const applied = new Set(rows.map((row) => row.filename));
  const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".sql")).sort();

  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    await inTransaction(pool, async (client) => {
      await client.query(sql);
      await client.query("INSERT INTO schema_migration (filename) VALUES ($1)", [file]);
    });
    newlyApplied.push(file);
  }
  return newlyApplied;
}
