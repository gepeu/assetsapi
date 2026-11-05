/**
 * The advisory lock shared by both jobs and the migrate step, held on a dedicated connection. A
 * session lock lives exactly as long as its connection, so a dropped connection means the lock is
 * gone, and the holder has to stop rather than carry on unprotected.
 */
import pg from "pg";

// Any fixed number works, as long as every holder uses the same one.
const LOCK_ID = 7_315_204;

export interface JobLock {
  isHeld(): boolean;
  /** The lock's own connection, for a holder that needs its work on one session. */
  client: pg.Client;
  release(): Promise<void>;
}

/** Null when something else holds the lock. */
export async function tryAcquireLock(connectionString: string): Promise<JobLock | null> {
  const client = new pg.Client({ connectionString });
  await client.connect();

  let held = true;
  const markLost = () => {
    held = false;
  };
  client.on("error", markLost);
  client.on("end", markLost);

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
