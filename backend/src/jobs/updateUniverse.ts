/**
 * Entry point for `update-universe`: one run that applies the rule, then exits. It resolves every
 * Kamino mint on each run, so both halves of the rule are checked, and changes nothing unless both
 * providers answered and enough active assets would remain.
 */
import { settings, toPercent } from '../config.ts';
import { inTransaction } from '../db/pool.ts';
import { deactivateAssets, listKnownAssets, reactivateAssets } from '../db/queries/assets.ts';
import { AuthOrQuotaError, NotFoundError } from '../providers/errors.ts';
import { createKaminoProvider } from '../providers/kamino/provider.ts';
import { createRwaXyzProvider } from '../providers/rwaXyz/provider.ts';
import type { AddressResolver, UniverseProvider } from '../providers/types.ts';
import {
  type JobDeps,
  type JobOutcome,
  LOCK_LOST_MESSAGE,
  type RunReport,
  runJobCommand,
  runTrackedJob,
  toErrorMessage,
} from './runTracking.ts';
import { isSafeToApply, type NewAssetMatch, planUniverse, type ResolvedMint } from './universeRules.ts';
import { type AssetContext, createAssetContext, createNewAsset, type DataProviders } from './updateAsset.ts';

const LIST_SOURCE = 'kamino';

export type UniverseJobDeps = JobDeps &
  DataProviders & {
    universe: UniverseProvider;
    resolver: AddressResolver;
  };

/** The provider's ID, or null. A delisted lookup answers with NotFound as well as with nothing. */
async function resolveMint(resolver: AddressResolver, network: string, mint: string): Promise<string | null> {
  try {
    return await resolver.resolve(network, mint);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

interface NewAssetOutcomes {
  created: string[];
  heldBack: { slug: string; assetClass: string }[];
  failed: { ref: string; error: string }[];
  newMeasures: Set<string>;
  interrupted: boolean;
}

/** A failed new asset creates nothing and the next run retries, so the others carry on. */
async function createNewAssets(
  deps: UniverseJobDeps,
  context: AssetContext,
  matches: readonly NewAssetMatch[],
  isLockHeld: () => boolean
): Promise<NewAssetOutcomes> {
  const outcomes: NewAssetOutcomes = {
    created: [],
    heldBack: [],
    failed: [],
    newMeasures: new Set(),
    interrupted: false,
  };
  for (const { ref, mints } of matches) {
    if (deps.stop.isStopping()) {
      outcomes.interrupted = true;
      return outcomes;
    }
    if (!isLockHeld()) throw new Error(LOCK_LOST_MESSAGE);
    try {
      const result = await createNewAsset(context, ref, mints);
      if (result.status === 'held_back') {
        outcomes.heldBack.push({ slug: result.slug, assetClass: result.assetClass });
        continue;
      }
      outcomes.created.push(result.slug);
      for (const measure of result.result.newMeasures) outcomes.newMeasures.add(measure);
    } catch (error) {
      if (error instanceof AuthOrQuotaError) throw error;
      deps.logger.warn({ err: error, ref }, 'new asset failed, creating nothing');
      outcomes.failed.push({ ref, error: toErrorMessage(error) });
    }
  }
  return outcomes;
}

export async function runUniverseJob(deps: UniverseJobDeps): Promise<JobOutcome> {
  return runTrackedJob(deps, 'universe', LIST_SOURCE, async ({ runId, isLockHeld }): Promise<RunReport> => {
    const tokens = await deps.universe.listTokens();

    const resolved: ResolvedMint[] = [];
    for (const token of tokens) {
      if (deps.stop.isStopping()) {
        const summary = { listed: tokens.length, resolved: resolved.length };
        return { status: 'interrupted', severity: 'normal', summary };
      }
      const ref = await resolveMint(deps.resolver, token.network, token.address);
      if (ref !== null) resolved.push({ mint: token.address, ref });
    }

    const known = await listKnownAssets(deps.pool);
    const plan = planUniverse(known, resolved);
    const counts = { listed: tokens.length, resolved: resolved.length, active: plan.active, remaining: plan.remaining };

    if (!isSafeToApply(plan)) {
      const minimum = toPercent(settings.jobs.universeMinRemainingShare);
      const error = `Fewer than ${minimum} of active assets would remain, so nothing changed`;
      return { status: 'failed', severity: 'urgent', summary: { ...counts, error } };
    }

    const context = await createAssetContext(deps, runId);
    const { created, heldBack, failed, newMeasures, interrupted } = await createNewAssets(
      deps,
      context,
      plan.newAssets,
      isLockHeld
    );
    if (interrupted) {
      return { status: 'interrupted', severity: 'normal', summary: { ...counts, created, heldBack, failed } };
    }

    if (!isLockHeld()) throw new Error(LOCK_LOST_MESSAGE);
    await inTransaction(deps.pool, async (db) => {
      await deactivateAssets(db, plan.deactivate);
      await reactivateAssets(db, plan.reactivate);
    });

    const slugOf = (id: number) => known.find((asset) => asset.id === id)?.slug ?? String(id);
    const summary = {
      ...counts,
      created,
      heldBack,
      failed,
      newMeasures: [...newMeasures],
      deactivated: plan.deactivate.map(slugOf),
      reactivated: plan.reactivate.map(slugOf),
      moved: plan.moved,
    };
    if (failed.length > 0) return { status: 'partial', severity: 'normal', summary };
    const needsAttention = heldBack.length > 0 || newMeasures.size > 0 || plan.moved.length > 0;
    return { status: 'succeeded', severity: needsAttention ? 'normal' : 'none', summary };
  });
}

if (import.meta.main) {
  await runJobCommand('universe', (deps, config) => {
    const provider = createRwaXyzProvider({ apiKey: config.rwaXyzApiKey });
    return runUniverseJob({
      ...deps,
      universe: createKaminoProvider(),
      resolver: provider,
      reference: provider,
      financial: provider,
    });
  });
}
