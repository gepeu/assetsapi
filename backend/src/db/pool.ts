/**
 * Connection pools and transactions. Each process sets its own pool size, and a pool error never
 * crashes the process: pg reports dropped idle connections this way and replaces them.
 */
import pg from "pg";
import type { Logger } from "../logger.ts";

/** Anything queries can run on: the pool, or one client inside a transaction. */
export type Queryable = pg.Pool | pg.PoolClient | pg.Client;

export interface PoolOptions {
  connectionString: string;
  max: number;
  /** How long to wait for a free connection. */
  connectionTimeoutMs?: number;
  logger?: Logger;
}

// Plain numbers: pg returns bigint as text, and the IDs we read this way fit safely.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

export function createPool({ connectionString, max, connectionTimeoutMs, logger }: PoolOptions): pg.Pool {
  const pool = new pg.Pool({ connectionString, max, connectionTimeoutMillis: connectionTimeoutMs });
  pool.on("error", (error) => logger?.warn({ err: error }, "idle database connection failed"));
  return pool;
}

/** Runs the callback in one transaction, rolling back if it throws. */
export async function inTransaction<T>(pool: pg.Pool, callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

const UNAVAILABLE_NODE_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "EPIPE", "EAI_AGAIN"]);

/** Whether an error means the database can't serve this request, rather than a fault in the request. */
export function isDatabaseUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // pg has no code for these two: a full pool, and a connection that went away.
  if (/timeout exceeded when trying to connect|Connection terminated/i.test(error.message)) return true;
  const code = (error as { code?: unknown }).code;
  if (typeof code !== "string") return false;
  if (UNAVAILABLE_NODE_CODES.has(code)) return true;
  // Connection failures, too many connections, statement timeouts and server shutdowns.
  return code.startsWith("08") || code.startsWith("53") || code === "57014" || /^57P0[1-3]$/.test(code);
}
