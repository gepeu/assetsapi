/**
 * Connection pools and transactions. Each process sets its own pool size, and a pool error never
 * crashes the process: pg reports dropped idle connections this way and replaces them.
 */
import pg from 'pg';
import { settings } from '../config.ts';
import type { Logger } from '../logger.ts';

/** Anything queries can run on: the pool, or one client inside a transaction. */
export type Queryable = pg.Pool | pg.PoolClient | pg.Client;

interface PoolOptions {
  connectionString: string;
  max: number;
  /** How long to wait for a free connection. */
  connectionTimeoutMs?: number;
  /**
   * How long to wait for a query's answer before giving up on its connection, so a connection that
   * died silently can't hold a pool slot. A server-side timeout can't cover this: it never hears.
   */
  queryTimeoutMs?: number;
  logger?: Logger;
}

// Plain numbers: pg returns bigint as text, and the IDs we read this way fit safely.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

export function createPool({
  connectionString,
  max,
  connectionTimeoutMs,
  queryTimeoutMs,
  logger,
}: PoolOptions): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max,
    connectionTimeoutMillis: connectionTimeoutMs,
    query_timeout: queryTimeoutMs,
    keepAlive: true,
    keepAliveInitialDelayMillis: settings.db.keepaliveDelayMs,
  });
  pool.on('error', (error) => logger?.warn({ err: error }, 'idle database connection failed'));
  return pool;
}

/** Fails if the database can't be reached. */
export async function checkConnection(db: Queryable): Promise<void> {
  await db.query('SELECT 1');
}

/** pg's error when `queryTimeoutMs` runs out. It has no code. */
const isQueryTimeout = (error: unknown): error is Error =>
  error instanceof Error && error.message === 'Query read timeout';

/**
 * Runs the callback in one transaction, rolling back if it throws. A connection lost along the way
 * surfaces as that error, and the connection is thrown away rather than going back to the pool.
 */
export async function inTransaction<T>(pool: pg.Pool, callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let lostConnection: Error | undefined;
  // The pool stops listening while a client is checked out, and an unheard 'error' ends the process.
  const onError = (error: Error) => {
    lostConnection = error;
  };
  client.on('error', onError);
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    // A query that timed out still occupies the connection, so a rollback would only wait behind it.
    if (isQueryTimeout(error)) lostConnection ??= error;
    if (!lostConnection) {
      await client.query('ROLLBACK').catch((rollbackError: Error) => {
        lostConnection = rollbackError;
      });
    }
    throw error;
  } finally {
    client.removeListener('error', onError);
    client.release(lostConnection);
  }
}

const UNAVAILABLE_NODE_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN']);

/** Whether an error means the database can't serve this request, rather than a fault in the request. */
export function isDatabaseUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // pg has no code for these three: a full pool, a connection that went away, and one that went quiet.
  if (/timeout exceeded when trying to connect|Connection terminated|Query read timeout/i.test(error.message)) {
    return true;
  }
  const code = (error as { code?: unknown }).code;
  if (typeof code !== 'string') return false;
  if (UNAVAILABLE_NODE_CODES.has(code)) return true;
  // Connection failures, too many connections, statement timeouts and server shutdowns.
  return code.startsWith('08') || code.startsWith('53') || code === '57014' || /^57P0[1-3]$/.test(code);
}
