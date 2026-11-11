/** Tests for database roles. */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { setupRoles } from '../../scripts/setupRoles.ts';
import { loadTestDatabaseUrl } from '../../src/config.ts';
import { migrate } from '../../src/db/migrate.ts';
import { createEmptyDb, withDatabase } from '../helpers/testDb.ts';

// Roles are cluster-wide, so these match .env.example rather than changing a local setup's passwords.
const PASSWORDS = { owner: 'local_owner', job: 'local_job', api: 'local_api' };

const asRole = (database: string, role: string, password: string): string => {
  const url = new URL(withDatabase(loadTestDatabaseUrl(), database));
  url.username = role;
  url.password = password;
  return url.toString();
};

describe('database roles', () => {
  let empty: Awaited<ReturnType<typeof createEmptyDb>>;
  let owner: pg.Pool;
  let job: pg.Pool;
  let api: pg.Pool;

  before(async () => {
    empty = await createEmptyDb();
    await setupRoles(empty.url, PASSWORDS);
    await migrate(asRole(empty.name, 'rwa_owner', PASSWORDS.owner));
    owner = new pg.Pool({ connectionString: asRole(empty.name, 'rwa_owner', PASSWORDS.owner), max: 1 });
    job = new pg.Pool({ connectionString: asRole(empty.name, 'rwa_job', PASSWORDS.job), max: 1 });
    api = new pg.Pool({ connectionString: asRole(empty.name, 'rwa_api', PASSWORDS.api), max: 1 });
  });

  after(async () => {
    await Promise.all([owner.end(), job.end(), api.end()]);
    await empty.drop();
  });

  const denied = (promise: Promise<unknown>) => assert.rejects(promise, /permission denied/);

  test('rwa_owner runs migrations', async () => {
    const { rows } = await owner.query<{ n: number }>('SELECT count(*)::int AS n FROM schema_migration');
    assert.equal(rows[0]?.n, 5);
  });

  test('rwa_owner owns what it creates', async () => {
    const { rows } = await owner.query<{ tableowner: string }>(
      "SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'asset'"
    );
    assert.equal(rows[0]?.tableowner, 'rwa_owner');
  });

  test('rwa_job reads and writes data tables, which moves the data version', async () => {
    const before = await job.query<{ version: string }>('SELECT version FROM data_version');
    await job.query(`INSERT INTO organization (slug, brand_name) VALUES ('job-org', 'Job Org')`);
    const after = await job.query<{ version: string }>('SELECT version FROM data_version');
    assert.ok(BigInt(after.rows[0]?.version ?? 0) > BigInt(before.rows[0]?.version ?? 0));
    await job.query(`UPDATE organization SET legal_name = 'L' WHERE slug = 'job-org'`);
    await job.query(`DELETE FROM organization WHERE slug = 'job-org'`);
    await job.query(`INSERT INTO ingestion_run (source_id, job) SELECT id, 'update' FROM source WHERE key = 'rwa_xyz'`);
    await job.query(`INSERT INTO financial_measure (slug, label) VALUES ('job_measure', 'J')`);
  });

  test("rwa_job reads the catalog and migration record but can't change them", async () => {
    await job.query('SELECT * FROM field LIMIT 1');
    await job.query('SELECT * FROM source LIMIT 1');
    await job.query('SELECT * FROM schema_migration LIMIT 1');
    await denied(job.query(`UPDATE field SET label = 'x'`));
    await denied(job.query(`INSERT INTO source (key, name) VALUES ('x', 'x')`));
    await denied(job.query(`INSERT INTO schema_migration (filename) VALUES ('x')`));
  });

  test("rwa_job can't change the schema", async () => {
    await denied(job.query('CREATE TABLE job_table (id int)'));
    await assert.rejects(job.query('DROP TABLE asset'), /must be owner/);
  });

  test("rwa_api reads data tables and can't write them", async () => {
    await api.query('SELECT * FROM asset LIMIT 1');
    await api.query('SELECT * FROM field_value LIMIT 1');
    await api.query('SELECT * FROM asset_field_status LIMIT 1');
    await api.query('SELECT version FROM data_version');
    await denied(api.query('UPDATE data_version SET version = version + 1'));
    await denied(api.query(`INSERT INTO organization (slug, brand_name) VALUES ('x', 'x')`));
    await denied(api.query(`UPDATE asset SET name = 'x'`));
    await denied(api.query('DELETE FROM financial_timeseries'));
  });

  test('only rwa_api has a statement timeout', async () => {
    const show = async (pool: pg.Pool) =>
      (await pool.query<{ statement_timeout: string }>('SHOW statement_timeout')).rows[0]?.statement_timeout;
    assert.equal(await show(api), '5s');
    assert.equal(await show(job), '0');
    assert.equal(await show(owner), '0');
  });

  test('tables that later migrations add get the right access', async () => {
    await owner.query('CREATE TABLE later_table (id int)');
    await job.query('INSERT INTO later_table VALUES (1)');
    await api.query('SELECT * FROM later_table');
    await denied(api.query('INSERT INTO later_table VALUES (2)'));
  });

  test('setup is safe to re-run, and keeps the exceptions', async () => {
    await setupRoles(empty.url, PASSWORDS);
    await denied(job.query(`UPDATE field SET label = 'x'`));
    await job.query('SELECT * FROM schema_migration LIMIT 1');
    await denied(job.query(`INSERT INTO schema_migration (filename) VALUES ('y')`));
  });

  test("after restoring a dump that still has the key table, rwa_job can't touch it", async () => {
    await owner.query('CREATE TABLE api_key (id int, key_hash text)');
    try {
      await setupRoles(empty.url, PASSWORDS);
      await denied(job.query('SELECT * FROM api_key'));
      await denied(job.query(`INSERT INTO api_key VALUES (1, 'x')`));
      await api.query('SELECT * FROM api_key');
    } finally {
      await owner.query('DROP TABLE api_key');
    }
  });
});
