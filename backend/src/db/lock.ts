/**
 * The advisory lock shared by both jobs and the migrate step, held on a dedicated connection. A
 * session lock lives exactly as long as its connection, so a dropped connection means the lock is
 * gone, and the holder has to stop rather than carry on unprotected.
 */
import pg from "pg";

// Any fixed number works, as long as every holder uses the same one.
const LOCK_ID = 7_315_204;

// This connection sits idle for a whole run, so a silent network drop would otherwise go unnoticed
// on both ends: the job would carry on unprotected, and the server would hold the lock for hours.
const CLIENT_KEEPALIVE_DELAY_MS = 30_000;
const SERVER_KEEPALIVE_SETTINGS = `
  SET tcp_keepalives_idle = 60;
  SET tcp_keepalives_interval = 10;
  SET tcp_keepalives_count = 3;
`;

export interface JobLock {
  isHeld(): boolean;
  /** The lock's own connection, for a holder that needs its work on one session. */
  client: pg.Client;
  release(): Promise<void>;
}

/** Null when something else holds the lock. */
export async function tryAcquireLock(connectionString: string): Promise<JobLock | null> {
  const client = new pg.Client({
    connectionString,
    keepAlive: true,
    keepAliveInitialDelayMillis: CLIENT_KEEPALIVE_DELAY_MS,
  });
  await client.connect();

  let held = true;
  const markLost = () => {
    held = false;
  };
  client.on("error", markLost);
  client.on("end", markLost);

  await client.query(SERVER_KEEPALIVE_SETTINGS);
  const { rows } = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked", [LOCK_ID]);
  if (!rows[0]?.locked) {
    await client.end();
    return null;
  }

  return {
    client,
    isHeld: () => held,
    release: async () => {
      if (!held) return;
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => undefined);
      await client.end().catch(() => undefined);
    },
  };
}
