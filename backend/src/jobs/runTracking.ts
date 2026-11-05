/**
 * Everything around a job's work: the schema check, the shared lock, stale runs, the run record, the
 * summary and the monitor ping. Both jobs run through `runTrackedJob`, so they fail the same way.
 */
import type pg from "pg";
import { type JobLock, tryAcquireLock } from "../db/lock.ts";
import { findPendingMigrations } from "../db/migrate.ts";
import { findSourceId, finishRun, type JobName, markStaleRuns, type RunStatus, startRun } from "../db/queries/runs.ts";
import type { Logger } from "../logger.ts";

const MONITOR_TIMEOUT_MS = 10_000;
/** Healthchecks.io keeps the first 100 kB of a ping body. Leave room rather than get cut mid-JSON. */
const MONITOR_BODY_LIMIT = 90_000;

export type Severity = "none" | "normal" | "urgent";

export interface StopSignal {
  isStopping(): boolean;
}

export interface JobDeps {
  connectionString: string;
  pool: pg.Pool;
  logger: Logger;
  monitorUrl: string | null;
  stop: StopSignal;
  fetchImpl?: typeof fetch;
}

export interface RunContext {
  runId: number;
  isLockHeld(): boolean;
}

/** What a job's work reports back. */
export interface RunReport {
  status: Exclude<RunStatus, "running">;
  severity: Severity;
  summary: Record<string, unknown>;
}

export type JobOutcome =
  | { kind: "finished"; runId: number; status: RunReport["status"]; summary: Record<string, unknown> }
  | { kind: "locked" }
  | { kind: "schema_behind"; pending: string[] };

/** A signal handler that lets the current asset finish. */
export function listenForStop(logger: Logger): StopSignal {
  let stopping = false;
  const onSignal = (signal: NodeJS.Signals) => {
    logger.info({ signal }, "stop signal received, finishing the current asset");
    stopping = true;
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);
  return { isStopping: () => stopping };
}

/** A monitor problem is logged and never fails the job, because the data work is already done. */
async function pingMonitor(deps: JobDeps, failed: boolean, body: unknown): Promise<void> {
  if (!deps.monitorUrl) return;
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const url = failed ? `${deps.monitorUrl.replace(/\/$/, "")}/fail` : deps.monitorUrl;
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body).slice(0, MONITOR_BODY_LIMIT),
      signal: AbortSignal.timeout(MONITOR_TIMEOUT_MS),
    });
    if (!response.ok) deps.logger.warn({ status: response.status }, "job monitor rejected the ping");
  } catch (error) {
    deps.logger.warn({ err: error }, "couldn't reach the job monitor");
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** Runs one job: schema check, lock, stale runs, run record, work, summary, monitor ping. */
export async function runTrackedJob(
  deps: JobDeps,
  job: JobName,
  sourceKey: string,
  work: (context: RunContext) => Promise<RunReport>,
): Promise<JobOutcome> {
  const { logger, pool } = deps;

  const pending = await findPendingMigrations(pool);
  if (pending.length > 0) {
    logger.error({ job, pending }, "the database schema is older than this code needs");
    await pingMonitor(deps, true, { job, severity: "urgent", error: "Schema is behind", pending });
    return { kind: "schema_behind", pending };
  }

  const lock: JobLock | null = await tryAcquireLock(deps.connectionString);
  if (!lock) {
    logger.warn({ job }, "another job holds the lock, exiting");
    return { kind: "locked" };
  }

  try {
    const stale = await markStaleRuns(pool);
    if (stale > 0) logger.warn({ job, stale }, "marked stale runs as failed");

    const sourceId = await findSourceId(pool, sourceKey);
    const runId = await startRun(pool, sourceId, job);

    let report: RunReport;
    try {
      report = await work({ runId, isLockHeld: lock.isHeld });
    } catch (error) {
      logger.error({ err: error, job, runId }, "run failed");
      report = { status: "failed", severity: "urgent", summary: { error: toErrorMessage(error) } };
    }

    await finishRun(pool, runId, report.status, report.summary);
    logger.info({ job, runId, status: report.status, summary: report.summary }, "run finished");
    await pingMonitor(deps, report.severity !== "none", {
      job,
      runId,
      status: report.status,
      severity: report.severity,
      summary: report.summary,
    });
    return { kind: "finished", runId, status: report.status, summary: report.summary };
  } finally {
    await lock.release();
  }
}

/** Failed runs and a schema mismatch exit non-zero, so Railway shows them as failed too. */
export function toExitCode(outcome: JobOutcome): number {
  if (outcome.kind === "schema_behind") return 1;
  if (outcome.kind === "finished" && outcome.status === "failed") return 1;
  return 0;
}
