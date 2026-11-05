/**
 * Entry point for `update-data`: one run over the active assets, then exit. Assets update one by one,
 * each in its own transaction, so a crash leaves finished assets updated and the next run does the rest.
 */
import { loadJobConfig } from "../config.ts";
import { createPool } from "../db/pool.ts";
import { listActiveAssets } from "../db/queries/assets.ts";
import { findSourceId } from "../db/queries/runs.ts";
import { createLogger } from "../logger.ts";
import { AuthOrQuotaError } from "../providers/errors.ts";
import { createRwaXyzProvider } from "../providers/rwaXyz/provider.ts";
import type { FinancialProvider, ReferenceProvider } from "../providers/types.ts";
import {
  type JobDeps,
  type JobOutcome,
  listenForStop,
  type RunReport,
  runTrackedJob,
  toExitCode,
} from "./runTracking.ts";
import { type AssetWriteResult, loadWriteCatalog, updateAsset, utcToday } from "./updateAsset.ts";

const MAX_CONSECUTIVE_FAILURES = 5;
const MAX_FAILED_SHARE = 0.1;
const DATA_SOURCE = "rwa_xyz";

export interface UpdateJobDeps extends JobDeps {
  reference: ReferenceProvider;
  financial: FinancialProvider;
  today?: () => string;
  fullHistory?: boolean;
}

const toErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

interface Totals {
  fieldValuesWritten: number;
  currentWritten: number;
  historyDaysWritten: number;
  valuesMarkedMissing: number;
  valuesDeleted: number;
}

function addTotals(totals: Totals, result: AssetWriteResult): void {
  totals.fieldValuesWritten += result.fieldValuesWritten;
  totals.currentWritten += result.currentWritten;
  totals.historyDaysWritten += result.historyDaysWritten;
  totals.valuesMarkedMissing += result.valuesMarkedMissing;
  totals.valuesDeleted += result.valuesDeleted;
}

export async function runUpdateJob(deps: UpdateJobDeps): Promise<JobOutcome> {
  return runTrackedJob(deps, "update", DATA_SOURCE, async ({ runId, isLockHeld }): Promise<RunReport> => {
    const sourceId = await findSourceId(deps.pool, DATA_SOURCE);
    const catalog = await loadWriteCatalog(deps.pool);
    const assets = await listActiveAssets(deps.pool);
    const context = {
      pool: deps.pool,
      runId,
      sourceId,
      catalog,
      reference: deps.reference,
      financial: deps.financial,
      today: deps.today ?? utcToday,
      fullHistory: deps.fullHistory ?? false,
    };

    const totals: Totals = {
      fieldValuesWritten: 0,
      currentWritten: 0,
      historyDaysWritten: 0,
      valuesMarkedMissing: 0,
      valuesDeleted: 0,
    };
    const failed: { slug: string; error: string }[] = [];
    const newMeasures = new Set<string>();
    const swings: { slug: string; metric: string; from: number; to: number }[] = [];
    const notes: { slug: string; note: string }[] = [];
    let updated = 0;
    let consecutiveFailures = 0;
    let stoppedBy: string | null = null;
    let interrupted = false;

    for (const asset of assets) {
      if (deps.stop.isStopping()) {
        interrupted = true;
        break;
      }
      if (!isLockHeld()) {
        stoppedBy = "The job lock's connection dropped";
        break;
      }
      try {
        const result = await updateAsset(context, asset);
        addTotals(totals, result);
        for (const measure of result.newMeasures) newMeasures.add(measure);
        for (const swing of result.swings) swings.push({ slug: asset.slug, ...swing });
        for (const note of result.notes) notes.push({ slug: asset.slug, note });
        updated++;
        consecutiveFailures = 0;
      } catch (error) {
        deps.logger.warn({ err: error, slug: asset.slug }, "asset failed, keeping its last good data");
        failed.push({ slug: asset.slug, error: toErrorMessage(error) });
        if (error instanceof AuthOrQuotaError) {
          stoppedBy = "The provider rejected the key or the quota is used up";
          break;
        }
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          stoppedBy = `${MAX_CONSECUTIVE_FAILURES} assets failed in a row`;
          break;
        }
        if (failed.length > assets.length * MAX_FAILED_SHARE) {
          stoppedBy = `More than ${MAX_FAILED_SHARE * 100}% of active assets failed`;
          break;
        }
      }
    }

    const summary = {
      assets: assets.length,
      updated,
      ...totals,
      failed,
      stoppedBy,
      newMeasures: [...newMeasures],
      swings,
      notes,
    };
    if (stoppedBy) return { status: "failed", severity: "urgent", summary };
    if (interrupted) return { status: "interrupted", severity: "normal", summary };
    if (failed.length > 0) return { status: "partial", severity: "normal", summary };
    return { status: "succeeded", severity: newMeasures.size > 0 ? "normal" : "none", summary };
  });
}

if (import.meta.main) {
  const logger = createLogger();
  const config = loadJobConfig();
  const pool = createPool({ connectionString: config.databaseUrl, max: 2, logger });
  try {
    const provider = createRwaXyzProvider({ apiKey: config.rwaXyzApiKey });
    const outcome = await runUpdateJob({
      connectionString: config.databaseUrl,
      pool,
      logger,
      monitorUrl: config.monitorUrl,
      stop: listenForStop(logger),
      reference: provider,
      financial: provider,
      fullHistory: config.fullHistory,
    });
    process.exitCode = toExitCode(outcome);
  } catch (error) {
    logger.error({ err: error }, "update job failed");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
