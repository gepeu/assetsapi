/**
 * Entry point for `update-data`: one run over the active assets, then exit. Assets update one by one,
 * each in its own transaction, so a crash leaves finished assets updated and the next run does the rest.
 */
import { settings, toPercent } from '../config.ts';
import { listActiveAssets } from '../db/queries/assets.ts';
import { AuthOrQuotaError } from '../providers/errors.ts';
import { createRwaXyzProvider } from '../providers/rwaXyz/provider.ts';
import {
  type JobDeps,
  type JobOutcome,
  LOCK_LOST_MESSAGE,
  type RunReport,
  runJobCommand,
  runTrackedJob,
  toErrorMessage,
} from './runTracking.ts';
import {
  type AssetWriteResult,
  createAssetContext,
  DATA_SOURCE,
  type DataProviders,
  updateAsset,
} from './updateAsset.ts';

export type UpdateJobDeps = JobDeps & DataProviders;

/** Why a run should stop after this many failures, or null to carry on. */
function findFailureLimit(consecutive: number, failed: number, total: number): string | null {
  const { maxConsecutiveFailures, maxFailedShare } = settings.jobs;
  if (consecutive >= maxConsecutiveFailures) return `${maxConsecutiveFailures} assets failed in a row`;
  if (failed > total * maxFailedShare) return `More than ${toPercent(maxFailedShare)} of active assets failed`;
  return null;
}

export async function runUpdateJob(deps: UpdateJobDeps): Promise<JobOutcome> {
  return runTrackedJob(deps, 'update', DATA_SOURCE, async ({ runId, isLockHeld }): Promise<RunReport> => {
    const context = await createAssetContext(deps, runId);
    const assets = await listActiveAssets(deps.pool);

    const totals = {
      fieldValuesWritten: 0,
      currentWritten: 0,
      historyDaysWritten: 0,
      valuesMarkedMissing: 0,
      valuesDeleted: 0,
    };
    const failed: { slug: string; error: string }[] = [];
    const newMeasures = new Set<string>();
    const swings: ({ slug: string } & AssetWriteResult['swings'][number])[] = [];
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
        stoppedBy = LOCK_LOST_MESSAGE;
        break;
      }
      try {
        const result = await updateAsset(context, asset);
        for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += result[key];
        for (const measure of result.newMeasures) newMeasures.add(measure);
        for (const swing of result.swings) swings.push({ slug: asset.slug, ...swing });
        for (const note of result.notes) notes.push({ slug: asset.slug, note });
        updated++;
        consecutiveFailures = 0;
      } catch (error) {
        deps.logger.warn({ err: error, slug: asset.slug }, 'asset failed, keeping its last good data');
        failed.push({ slug: asset.slug, error: toErrorMessage(error) });
        consecutiveFailures++;
        stoppedBy =
          error instanceof AuthOrQuotaError
            ? 'The provider rejected the key or the quota is used up'
            : findFailureLimit(consecutiveFailures, failed.length, assets.length);
        if (stoppedBy) break;
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
    if (stoppedBy) return { status: 'failed', severity: 'urgent', summary };
    if (interrupted) return { status: 'interrupted', severity: 'normal', summary };
    if (failed.length > 0) return { status: 'partial', severity: 'normal', summary };
    return { status: 'succeeded', severity: newMeasures.size > 0 ? 'normal' : 'none', summary };
  });
}

if (import.meta.main) {
  await runJobCommand('update', (deps, config) => {
    const provider = createRwaXyzProvider({ apiKey: config.rwaXyzApiKey });
    return runUpdateJob({ ...deps, reference: provider, financial: provider });
  });
}
