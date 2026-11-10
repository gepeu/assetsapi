/** Run records and source lookups. */
import type { Queryable } from '../pool.ts';

export type RunStatus = 'running' | 'succeeded' | 'partial' | 'failed' | 'interrupted';
export type JobName = 'universe' | 'update';

export async function findSourceId(db: Queryable, key: string): Promise<number> {
  const { rows } = await db.query<{ id: number }>('SELECT id FROM source WHERE key = $1', [key]);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`Unknown source: ${key}`);
  return id;
}

/** Only called while holding the job lock, so any run still marked running has died. */
export async function markStaleRuns(db: Queryable): Promise<number> {
  const { rowCount } = await db.query(
    `UPDATE ingestion_run
     SET status = 'failed', finished_at = now(), summary = summary || '{"error": "Marked stale by a later run"}'
     WHERE status = 'running'`
  );
  return rowCount ?? 0;
}

export async function startRun(db: Queryable, sourceId: number, job: JobName): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    'INSERT INTO ingestion_run (source_id, job) VALUES ($1, $2) RETURNING id',
    [sourceId, job]
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("Couldn't create a run record");
  return id;
}

export async function finishRun(db: Queryable, runId: number, status: RunStatus, summary: unknown): Promise<void> {
  await db.query('UPDATE ingestion_run SET status = $1, finished_at = now(), summary = $2 WHERE id = $3', [
    status,
    JSON.stringify(summary),
    runId,
  ]);
}
