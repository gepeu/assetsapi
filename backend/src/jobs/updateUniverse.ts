/**
 * Entry point for `update-universe`: one run that applies the rule, then exits. It resolves every
 * Kamino mint on each run, so both halves of the rule are checked, and changes nothing unless both
 * providers answered and enough active assets would remain.
 */
import { loadJobConfig } from "../config.ts";
import { createPool, inTransaction } from "../db/pool.ts";
import { deactivateAssets, listKnownAssets, reactivateAssets } from "../db/queries/assets.ts";
import { findSourceId } from "../db/queries/runs.ts";
import { createLogger } from "../logger.ts";
import { AuthOrQuotaError, NotFoundError } from "../providers/errors.ts";
import { createKaminoProvider } from "../providers/kamino/provider.ts";
import { createRwaXyzProvider } from "../providers/rwaXyz/provider.ts";
import type { AddressResolver, FinancialProvider, ReferenceProvider, UniverseProvider } from "../providers/types.ts";
import {
  type JobDeps,
  type JobOutcome,
  listenForStop,
  type RunReport,
  runTrackedJob,
  toExitCode,
} from "./runTracking.ts";
import { isSafeToApply, planUniverse, type ResolvedMint } from "./universeRules.ts";
import { createNewAsset, loadWriteCatalog, utcToday } from "./updateAsset.ts";

const LIST_SOURCE = "kamino";
const DATA_SOURCE = "rwa_xyz";

export interface UniverseJobDeps extends JobDeps {
  universe: UniverseProvider;
  resolver: AddressResolver;
  reference: ReferenceProvider;
  financial: FinancialProvider;
  today?: () => string;
}

const toErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The provider's ID, or null. A delisted lookup answers with NotFound as well as with nothing. */
async function resolveMint(resolver: AddressResolver, network: string, mint: string): Promise<string | null> {
  try {
    return await resolver.resolve(network, mint);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

export async function runUniverseJob(deps: UniverseJobDeps): Promise<JobOutcome> {
  return runTrackedJob(deps, "universe", LIST_SOURCE, async ({ runId, isLockHeld }): Promise<RunReport> => {
    const tokens = await deps.universe.listTokens();

    const resolved: ResolvedMint[] = [];
    for (const token of tokens) {
      if (deps.stop.isStopping()) {
        return {
          status: "interrupted",
          severity: "normal",
          summary: { listed: tokens.length, resolved: resolved.length },
        };
      }
      const ref = await resolveMint(deps.resolver, token.network, token.address);
      if (ref !== null) resolved.push({ mint: token.address, ref });
    }

    const known = await listKnownAssets(deps.pool);
    const plan = planUniverse(known, resolved);
    const counts = { listed: tokens.length, resolved: resolved.length, active: plan.active, remaining: plan.remaining };

    if (!isSafeToApply(plan)) {
      return {
        status: "failed",
        severity: "urgent",
        summary: { ...counts, error: "Fewer than 80% of active assets would remain, so nothing changed" },
      };
    }

    const context = {
      pool: deps.pool,
      runId,
      sourceId: await findSourceId(deps.pool, DATA_SOURCE),
      catalog: await loadWriteCatalog(deps.pool),
      reference: deps.reference,
      financial: deps.financial,
      today: deps.today ?? utcToday,
      fullHistory: true,
    };

    const created: string[] = [];
    const heldBack: { slug: string; assetClass: string }[] = [];
    const failed: { ref: string; error: string }[] = [];
    const newMeasures = new Set<string>();
    for (const { ref, mints } of plan.newAssets) {
      if (deps.stop.isStopping()) {
        return { status: "interrupted", severity: "normal", summary: { ...counts, created, heldBack, failed } };
      }
      if (!isLockHeld()) throw new Error("The job lock's connection dropped");
      try {
        const result = await createNewAsset(context, ref, mints);
        if (result.status === "held_back") {
          heldBack.push({ slug: result.slug, assetClass: result.assetClass });
          continue;
        }
        created.push(result.slug);
        for (const measure of result.result.newMeasures) newMeasures.add(measure);
      } catch (error) {
        if (error instanceof AuthOrQuotaError) throw error;
        deps.logger.warn({ err: error, ref }, "new asset failed, creating nothing");
        failed.push({ ref, error: toErrorMessage(error) });
      }
    }

    if (!isLockHeld()) throw new Error("The job lock's connection dropped");
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
    if (failed.length > 0) return { status: "partial", severity: "normal", summary };
    const needsAttention = heldBack.length > 0 || newMeasures.size > 0 || plan.moved.length > 0;
    return { status: "succeeded", severity: needsAttention ? "normal" : "none", summary };
  });
}

if (import.meta.main) {
  const logger = createLogger();
  const config = loadJobConfig();
  const pool = createPool({ connectionString: config.databaseUrl, max: 2, logger });
  try {
    const provider = createRwaXyzProvider({ apiKey: config.rwaXyzApiKey });
    const outcome = await runUniverseJob({
      connectionString: config.databaseUrl,
      pool,
      logger,
      monitorUrl: config.monitorUrl,
      stop: listenForStop(logger),
      universe: createKaminoProvider(),
      resolver: provider,
      reference: provider,
      financial: provider,
    });
    process.exitCode = toExitCode(outcome);
  } catch (error) {
    logger.error({ err: error }, "universe job failed");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
