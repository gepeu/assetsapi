/** Tests for migrations on an empty database; findPendingMigrations. */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { tryAcquireLock } from '../../src/db/lock.ts';
import { findPendingMigrations, migrate } from '../../src/db/migrate.ts';
import {
  ASSET_MAPPINGS,
  type FieldMapping,
  ISSUER_MAPPINGS,
  NETWORK_MAPPINGS,
  PLATFORM_FIELD,
  TOKEN_MAPPINGS,
} from '../../src/providers/rwaXyz/mapping.ts';
import { createEmptyDb, createTestDb, type TestDb } from '../helpers/testDb.ts';

describe('migrations on an empty database', () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  const scalar = async (sql: string): Promise<unknown> => {
    const { rows } = await db.pool.query<{ value: unknown }>(sql);
    return rows[0]?.value;
  };

  test("every served table moves the data version, so a new one can't leave the API cache stale", async () => {
    const unserved = ['data_version', 'ingestion_run', 'schema_migration'];
    const { rows } = await db.pool.query<{ table_name: string; has_trigger: boolean }>(
      `SELECT t.table_name,
              EXISTS (SELECT 1 FROM information_schema.triggers g
                      WHERE g.event_object_table = t.table_name AND g.trigger_name = 'bump_data_version') AS has_trigger
       FROM information_schema.tables t
       WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'`
    );
    for (const row of rows) {
      assert.equal(row.has_trigger, !unserved.includes(row.table_name), row.table_name);
    }
    const before = await scalar('SELECT version AS value FROM data_version');
    await db.pool.query('UPDATE financial_measure SET label = label WHERE false');
    assert.notEqual(await scalar('SELECT version AS value FROM data_version'), before);
  });

  test('creates the final 15 tables and 2 views', async () => {
    const { rows } = await db.pool.query<{ table_name: string; table_type: string }>(
      `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1`
    );
    assert.deepEqual(
      rows.filter((row) => row.table_type === 'BASE TABLE').map((row) => row.table_name),
      [
        'asset',
        'asset_alias',
        'asset_organization',
        'data_version',
        'field',
        'field_value',
        'financial_current',
        'financial_measure',
        'financial_timeseries',
        'ingestion_run',
        'network',
        'organization',
        'schema_migration',
        'source',
        'token',
      ]
    );
    assert.deepEqual(
      rows.filter((row) => row.table_type === 'VIEW').map((row) => row.table_name),
      ['asset_field_status', 'asset_subject']
    );
  });

  test('seeds the catalog: 135 fields, 3 sources and 89 measures, 69 of them served', async () => {
    assert.equal(await scalar('SELECT count(*)::int AS value FROM field'), 135);
    assert.equal(await scalar("SELECT count(*)::int AS value FROM field WHERE key LIKE 'control.%'"), 0);
    const { rows } = await db.pool.query<{ key: string }>('SELECT key FROM source ORDER BY key');
    assert.deepEqual(
      rows.map((row) => row.key),
      ['kamino', 'manual', 'rwa_xyz']
    );
    assert.equal(await scalar('SELECT count(*)::int AS value FROM financial_measure'), 89);
    assert.equal(await scalar('SELECT count(*)::int AS value FROM financial_measure WHERE served'), 69);
  });

  test('the unserved measures are exactly the agreed ones', async () => {
    const { rows } = await db.pool.query<{ slug: string }>(
      'SELECT slug FROM financial_measure WHERE NOT served ORDER BY slug'
    );
    assert.deepEqual(
      rows.map((row) => row.slug),
      [
        'accounting_frequency_type_id',
        'bridged_token_market_cap_dollar',
        'bridged_token_supply_token',
        'bridged_token_value_dollar',
        'denomination_asset_id',
        'primary_market__base_asset_ticker',
        'primary_market__investor_types',
        'primary_market__is_kyc_required',
        'primary_market__kyc_provider_id',
        'primary_market__redemption_description',
        'primary_market__redemption_frequency',
        'primary_market__subscription_description',
        'primary_market__subscription_frequency',
        'primary_market_non_pegged_asset',
        'primary_market_pegged_asset',
        'primary_markets',
        'ratings',
        'raw_supply',
        'rebase_transfer_unit',
        'yield_to_maturity',
      ]
    );
  });

  test('every measure is fully described', async () => {
    assert.equal(
      await scalar(
        `SELECT count(*)::int AS value FROM financial_measure
         WHERE label IS NULL OR measure_group IS NULL OR kind IS NULL OR definition IS NULL OR sort_order IS NULL`
      ),
      0
    );
    assert.equal(
      await scalar(`SELECT count(*)::int AS value FROM financial_measure WHERE unit IN ('Dollars', 'Transfers')`),
      0
    );
    assert.equal(
      await scalar(`SELECT unit AS value FROM financial_measure WHERE slug = 'number_of_daily_transactions_count'`),
      'transaction'
    );
  });

  test("every provider mapping names a catalog field, with the catalog's type and level", async () => {
    const { rows } = await db.pool.query<{ key: string; value_type: string; level: string }>(
      'SELECT key, value_type, level FROM field'
    );
    const catalog = new Map(rows.map((row) => [row.key, row]));
    const check = (mappings: readonly FieldMapping[], level: string) => {
      for (const mapping of mappings) {
        const field = catalog.get(mapping.field);
        assert.ok(field, `${mapping.field} isn't in the catalog`);
        assert.equal(field.value_type, mapping.type, `${mapping.field} has the wrong type`);
        assert.equal(field.level, level, `${mapping.field} is on the wrong level`);
      }
    };
    check(ASSET_MAPPINGS, 'asset');
    check(ISSUER_MAPPINGS, 'organization');
    check(TOKEN_MAPPINGS, 'token');
    check(NETWORK_MAPPINGS, 'network');
    assert.equal(catalog.get(PLATFORM_FIELD)?.value_type, 'organization');
  });

  test('nothing is pending afterwards, and a second run applies nothing', async () => {
    assert.deepEqual(await findPendingMigrations(db.pool), []);
    assert.deepEqual(await migrate(db.url), []);
  });

  test("a JSON null can't be stored as a value", async () => {
    await assert.rejects(
      db.pool.query(`INSERT INTO field_value (field_id, asset_id, value, source_id)
                     SELECT f.id, NULL, 'null'::jsonb, 1 FROM field f LIMIT 1`)
    );
  });

  test('a value needs exactly one subject', async () => {
    await assert.rejects(
      db.pool.query(`INSERT INTO field_value (field_id, value, source_id) SELECT f.id, '"x"', 1 FROM field f LIMIT 1`)
    );
  });

  test("EVM addresses are normalised, and Solana's aren't", async () => {
    const asset = await db.pool.query<{ id: number }>(
      `INSERT INTO asset (slug, ticker, name, asset_class, asset_type) VALUES ('addr', 'A', 'A', 'C', 'stablecoin') RETURNING id`
    );
    const assetId = asset.rows[0]?.id;
    const networks = await db.pool.query<{ id: number; key: string }>(
      `INSERT INTO network (key, name, address_case_sensitive) VALUES ('e', 'E', false), ('s', 'S', true) RETURNING id, key`
    );
    for (const network of networks.rows) {
      await db.pool.query("INSERT INTO token (asset_id, network_id, address) VALUES ($1, $2, 'AbCd')", [
        assetId,
        network.id,
      ]);
    }
    const { rows } = await db.pool.query<{ key: string; address: string }>(
      `SELECT n.key, t.address FROM token t JOIN network n ON n.id = t.network_id WHERE t.asset_id = $1 ORDER BY n.key`,
      [assetId]
    );
    assert.deepEqual(rows, [
      { key: 'e', address: 'abcd' },
      { key: 's', address: 'AbCd' },
    ]);
  });

  test('a ticker can repeat, because tickers collide', async () => {
    await db.pool.query(
      `INSERT INTO asset (slug, ticker, name, asset_class, asset_type)
       VALUES ('t-one', 'SAME', 'One', 'C', 'stablecoin'), ('t-two', 'SAME', 'Two', 'C', 'stablecoin')`
    );
  });

  test('a migration waiting on the job lock fails cleanly when it times out', async () => {
    const lock = await tryAcquireLock(db.url);
    assert.ok(lock);
    try {
      await assert.rejects(
        migrate(db.url, { lockTimeoutMs: 50, lockPollMs: 20 }),
        /Timed out waiting for the job lock/
      );
    } finally {
      await lock.release();
    }
  });
});

describe('findPendingMigrations', () => {
  test('a brand new database has everything pending', async () => {
    const empty = await createEmptyDb();
    const pg = await import('pg');
    const client = new pg.default.Client({ connectionString: empty.url });
    await client.connect();
    try {
      assert.deepEqual(await findPendingMigrations(client), [
        '001_baseline.sql',
        '002_catalog_seed.sql',
        '003_stop_serving_duplicate_terms.sql',
        '004_data_version.sql',
        '005_drop_api_key.sql',
      ]);
    } finally {
      await client.end();
      await empty.drop();
    }
  });
});
