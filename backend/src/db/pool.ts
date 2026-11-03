import pg from "pg";
import { requireEnv } from "../env.ts";

/** Read at call time, so the backend can start without a database configured. */
export function createPool(connectionString: string = requireEnv("DATABASE_URL")): pg.Pool {
  return new pg.Pool({ connectionString });
}

/** Runs the callback in one transaction, rolling back if it throws. */
export async function inTransaction<T>(
  pool: pg.Pool,
  callback: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
