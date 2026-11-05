/**
 * Everything around a job's work: the schema check, the shared lock, stale runs, the run record, the
 * summary and the monitor ping. Both jobs run through `runTrackedJob`, so they fail the same way.
 */
import type pg from "pg";
import { type JobConfig, loadJobConfig, settings } from "../config.ts";
import { type JobLock, tryAcquireLock } from "../db/lock.ts";
import { findPendingMigrations } from "../db/migrate.ts";
import { createPool } from "../db/pool.ts";
import { findSourceId, finishRun, type JobName, markStaleRuns, type RunStatus, startRun } from "../db/queries/runs.ts";
import { createLogger, type Logger } from "../logger.ts";

type Severity = "none" | "normal" | "urgent";

interface StopSignal {
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

interface RunContext {
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
function listenForStop(logger: Logger): StopSignal {
  let stopping = false;
  const onSignal = (signal: NodeJS.Signals) => {
    logger.info({ signal }, "stop signal received, finishing the current asset");
    stopping = true;
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);
  return { isStopping: () => stopping };
}

/** A very long run summary is cut, but the body stays valid JSON and says so. */
export function toMonitorBody(body: unknown): string {
  const text = JSON.stringify(body);
  const limit = settings.jobs.monitorBodyLimit;
  if (text.length <= limit) return text;
  // Half, because escaping the quotes in the cut text can up to double its length.
  return JSON.stringify({ truncated: true, start: text.slice(0, Math.floor(limit / 2)) });
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
      body: toMonitorBody(body),
      signal: AbortSignal.timeout(settings.jobs.monitorTimeoutMs),
    });
    if (!response.ok) deps.logger.warn({ status: response.status }, "job monitor rejected the ping");
  } catch (error) {
    deps.logger.warn({ err: error }, "couldn't reach the job monitor");
  }
}

export const LOCK_LOST_MESSAGE = "The job lock's connection dropped";

export const toErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

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

    try {
      await finishRun(pool, runId, report.status, report.summary);
    } catch (error) {
      // The database may be what stopped this run, and the monitor still has to hear about it.
      // The record stays "running" until the next run marks it stale.
      logger.error({ err: error, job, runId }, "couldn't record the end of the run");
      report = {
        status: "failed",
        severity: "urgent",
        summary: { ...report.summary, recordError: toErrorMessage(error) },
      };
    }
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

/** A job's command: reads the config, runs the job, and sets the exit code. */
export async function runJobCommand(
  name: string,
  run: (deps: JobDeps, config: JobConfig) => Promise<JobOutcome>,
): Promise<void> {
  const logger = createLogger();
  const config = loadJobConfig();
  const pool = createPool({
    connectionString: config.databaseUrl,
    max: settings.jobs.poolSize,
    connectionTimeoutMs: settings.jobs.connectTimeoutMs,
    queryTimeoutMs: settings.jobs.queryTimeoutMs,
    logger,
  });
  try {
    const deps: JobDeps = {
      connectionString: config.databaseUrl,
      pool,
      logger,
      monitorUrl: config.monitorUrl,
      stop: listenForStop(logger),
    };
    process.exitCode = toExitCode(await run(deps, config));
  } catch (error) {
    logger.error({ err: error }, `${name} job failed`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
