/** API key records. Only hashes reach this file. */
import type { Queryable } from "../pool.ts";

export interface ActiveKey {
  id: number;
  clientName: string;
  expiresAt: Date | null;
}

export async function findActiveKey(db: Queryable, keyHash: string): Promise<ActiveKey | null> {
  const { rows } = await db.query<{ id: number; client_name: string; expires_at: Date | null }>(
    `SELECT id, client_name, expires_at FROM api_key
     WHERE key_hash = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
    [keyHash],
  );
  const row = rows[0];
  return row ? { id: row.id, clientName: row.client_name, expiresAt: row.expires_at } : null;
}

export async function touchKey(db: Queryable, id: number): Promise<void> {
  await db.query("UPDATE api_key SET last_used_at = now() WHERE id = $1", [id]);
}

export interface NewKey {
  clientName: string;
  keyHash: string;
  keyPrefix: string;
  expiresAt: Date | null;
}

export async function insertKey(db: Queryable, key: NewKey): Promise<void> {
  await db.query("INSERT INTO api_key (client_name, key_hash, key_prefix, expires_at) VALUES ($1, $2, $3, $4)", [
    key.clientName,
    key.keyHash,
    key.keyPrefix,
    key.expiresAt,
  ]);
}
