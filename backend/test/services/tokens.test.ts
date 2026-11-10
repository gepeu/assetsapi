/** Tests for token service. */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { getAsset } from '../../src/services/assets.ts';
import { type FakeAsset, makeAsset, seedAssets, TODAY } from '../helpers/fakeProvider.ts';
import { createTestDb, type TestDb } from '../helpers/testDb.ts';

describe('token service', () => {
  let db: TestDb;
  let asset: FakeAsset;

  before(async () => {
    db = await createTestDb();
    asset = makeAsset({ ref: '1' });
    await seedAssets(db, [asset]);
  });
  after(() => db.close());

  async function load(network?: string) {
    const response = await getAsset(db.pool, 'asset-1', { include: 'tokens', ...(network && { network }) });
    assert.ok(response?.data.tokens);
    return response.data.tokens;
  }

  test('returns one row per token, ordered by network name', async () => {
    const data = await load();
    assert.deepEqual(
      data.map((row) => row.network),
      [
        { key: 'ethereum', name: 'Ethereum' },
        { key: 'solana', name: 'Solana' },
      ]
    );
  });

  test('each row has its address, issuance type, metrics and date', async () => {
    const solana = (await load()).find((row) => row.network.key === 'solana');
    assert.equal(solana?.address, asset.mint);
    assert.equal(solana?.issuanceType, 'native');
    assert.deepEqual(solana?.metrics, {
      total_asset_value_dollar: 1200,
      market_value_dollar: 1180,
      total_supply_token: 200,
      holding_addresses_count: 10,
    });
    assert.equal(solana?.asOf, TODAY);
  });

  test('a missing metric is null', async () => {
    const ethereum = (await load()).find((row) => row.network.key === 'ethereum');
    assert.equal(ethereum?.metrics.market_value_dollar, null);
    assert.equal(ethereum?.metrics.total_asset_value_dollar, 800);
  });

  test('token fields carry values, without repeating top-level properties', async () => {
    const solana = (await load()).find((row) => row.network.key === 'solana');
    const decimals = solana?.fields.find((field) => field.key === 'token.decimals');
    assert.equal(decimals?.value, 6);
    assert.equal(decimals?.valueType, 'integer');
    assert.deepEqual(solana?.fields.find((field) => field.key === 'token.standard')?.value, ['SPL']);
    assert.equal(solana?.fields.find((field) => field.key === 'token.dti')?.value, null);
    for (const hidden of ['token.network', 'token.contract_address', 'token.issuance_type']) {
      assert.ok(!solana?.fields.some((field) => field.key === hidden));
    }
  });

  test('filters by network', async () => {
    assert.deepEqual(
      (await load('solana')).map((row) => row.network.key),
      ['solana']
    );
    assert.deepEqual(await load('nowhere'), []);
  });

  test('a deactivated token is left out', async () => {
    await db.pool.query(
      `UPDATE token SET deactivated_at = now() WHERE network_id = (SELECT id FROM network WHERE key = 'ethereum')`
    );
    assert.deepEqual(
      (await load()).map((row) => row.network.key),
      ['solana']
    );
    await db.pool.query('UPDATE token SET deactivated_at = NULL');
  });

  test('an unknown asset is null', async () => {
    assert.equal(await getAsset(db.pool, 'nope', { include: 'tokens' }), null);
  });
});
