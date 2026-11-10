/** A fresh real Postgres database per test file, migrated by the same code production uses. */
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { loadTestDatabaseUrl } from '../../src/config.ts';
import { migrate } from '../../src/db/migrate.ts';
import { createPool } from '../../src/db/pool.ts';
import { createLogger, type Logger } from '../../src/logger.ts';

export const silentLogger: Logger = createLogger('silent');

export interface TestDb {
  name: string;
  url: string;
  pool: pg.Pool;
  close(): Promise<void>;
}

export function withDatabase(url: string, database: string): string {
  const target = new URL(url);
  target.pathname = `/${database}`;
  return target.toString();
}

async function runAdmin(sql: string): Promise<void> {
  const admin = new pg.Client({ connectionString: loadTestDatabaseUrl() });
  await admin.connect();
  try {
    await admin.query(sql);
  } finally {
    await admin.end();
  }
}

/** An empty database, for tests that control what happens first. */
export async function createEmptyDb(): Promise<Omit<TestDb, 'pool'> & { drop(): Promise<void> }> {
  const name = `rwa_test_${randomBytes(6).toString('hex')}`;
  await runAdmin(`CREATE DATABASE ${name}`);
  const url = withDatabase(loadTestDatabaseUrl(), name);
  const drop = () => runAdmin(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  return { name, url, close: drop, drop };
}

export async function createTestDb(): Promise<TestDb> {
  const { name, url, drop } = await createEmptyDb();
  await migrate(url);
  const pool = createPool({ connectionString: url, max: 5 });
  return {
    name,
    url,
    pool,
    close: async () => {
      await pool.end();
      await drop();
    },
  };
}

const DATA_TABLES = [
  'asset',
  'asset_alias',
  'asset_organization',
  'financial_current',
  'financial_measure',
  'financial_timeseries',
  'field_value',
  'network',
  'organization',
  'token',
] as const;

/** Changes whenever any row in a data table is written, even if the values come out the same. */
export async function fingerprintWrites(pool: pg.Pool): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const table of DATA_TABLES) {
    const { rows } = await pool.query<{ fingerprint: string }>(
      `SELECT count(*)::text || ':' || coalesce(sum(xmin::text::bigint), 0)::text AS fingerprint FROM ${table}`
    );
    result[table] = rows[0]?.fingerprint ?? '';
  }
  return result;
}
