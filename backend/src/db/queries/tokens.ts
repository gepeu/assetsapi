/** Networks and tokens. */
import type { Queryable } from '../pool.ts';

interface NetworkIdentity {
  key: string;
  name: string;
  addressCaseSensitive: boolean;
}

/** Reads before writing, so an unchanged network writes nothing. */
export async function ensureNetwork(db: Queryable, network: NetworkIdentity): Promise<number> {
  const { rows } = await db.query<{ id: number; name: string; address_case_sensitive: boolean }>(
    'SELECT id, name, address_case_sensitive FROM network WHERE key = $1',
    [network.key]
  );
  const existing = rows[0];
  if (existing) {
    if (existing.name !== network.name || existing.address_case_sensitive !== network.addressCaseSensitive) {
      await db.query('UPDATE network SET name = $2, address_case_sensitive = $3 WHERE id = $1', [
        existing.id,
        network.name,
        network.addressCaseSensitive,
      ]);
    }
    return existing.id;
  }
  const inserted = await db.query<{ id: number }>(
    'INSERT INTO network (key, name, address_case_sensitive) VALUES ($1, $2, $3) RETURNING id',
    [network.key, network.name, network.addressCaseSensitive]
  );
  const id = inserted.rows[0]?.id;
  if (id === undefined) throw new Error("Couldn't create a network");
  return id;
}

interface TokenWrite {
  assetId: number;
  networkId: number;
  address: string;
  issuanceType: string;
}

/**
 * Creates or refreshes a token, and clears its deactivation. Null when the address already belongs
 * to another of our assets, which is left for a manual fix rather than moved silently.
 */
export async function saveToken(db: Queryable, token: TokenWrite): Promise<number | null> {
  const { rows } = await db.query<{
    id: number;
    asset_id: number;
    issuance_type: string;
    deactivated_at: Date | null;
  }>(
    `SELECT t.id, t.asset_id, t.issuance_type, t.deactivated_at
     FROM token t
     WHERE t.network_id = $1
       AND t.address = CASE WHEN (SELECT address_case_sensitive FROM network WHERE id = $1) THEN $2 ELSE lower($2) END`,
    [token.networkId, token.address]
  );
  const existing = rows[0];
  if (existing) {
    if (existing.asset_id !== token.assetId) return null;
    if (existing.issuance_type !== token.issuanceType || existing.deactivated_at !== null) {
      await db.query('UPDATE token SET issuance_type = $2, deactivated_at = NULL WHERE id = $1', [
        existing.id,
        token.issuanceType,
      ]);
    }
    return existing.id;
  }
  const inserted = await db.query<{ id: number }>(
    'INSERT INTO token (asset_id, network_id, address, issuance_type) VALUES ($1, $2, $3, $4) RETURNING id',
    [token.assetId, token.networkId, token.address, token.issuanceType]
  );
  const id = inserted.rows[0]?.id;
  if (id === undefined) throw new Error("Couldn't create a token");
  return id;
}

/** Tokens the provider has stopped listing. Their history stays. */
export async function deactivateOtherTokens(db: Queryable, assetId: number, keepIds: readonly number[]): Promise<void> {
  await db.query(
    `UPDATE token SET deactivated_at = now()
     WHERE asset_id = $1 AND deactivated_at IS NULL AND NOT (id = ANY($2::int[]))`,
    [assetId, keepIds]
  );
}

/** Every token of the asset, active or not, because all their values belong to the asset's load. */
export async function listAllTokenIds(db: Queryable, assetId: number): Promise<number[]> {
  const { rows } = await db.query<{ id: number }>('SELECT id FROM token WHERE asset_id = $1', [assetId]);
  return rows.map((row) => row.id);
}

interface AssetTokenRow {
  id: number;
  asset_id: number;
  address: string;
  issuance_type: 'native' | 'bridged' | 'wrapper' | 'unknown';
  network_key: string;
  network_name: string;
}

export async function listActiveTokens(
  db: Queryable,
  assetIds: readonly number[],
  networkKey: string | null
): Promise<AssetTokenRow[]> {
  const { rows } = await db.query<AssetTokenRow>(
    `SELECT t.id, t.asset_id, t.address, t.issuance_type, n.key AS network_key, n.name AS network_name
     FROM token t
     JOIN network n ON n.id = t.network_id
     WHERE t.asset_id = ANY($1::int[]) AND t.deactivated_at IS NULL AND ($2::text IS NULL OR n.key = $2)
     ORDER BY n.name, t.address`,
    [assetIds, networkKey]
  );
  return rows;
}

export interface AssetNetworkRow {
  id: number;
  key: string;
  name: string;
}

export async function listAssetNetworks(db: Queryable, assetId: number): Promise<AssetNetworkRow[]> {
  const { rows } = await db.query<AssetNetworkRow>(
    `SELECT DISTINCT n.id, n.key, n.name
     FROM token t JOIN network n ON n.id = t.network_id
     WHERE t.asset_id = $1 AND t.deactivated_at IS NULL
     ORDER BY n.name`,
    [assetId]
  );
  return rows;
}
