/**
 * The universe rule, with no I/O: a token qualifies if its exact Solana mint is in both Kamino's
 * verified list and RWA.xyz. Tickers are never used, because they collide.
 */

export interface KnownAsset {
  id: number;
  slug: string;
  ref: string;
  active: boolean;
  solanaMints: readonly string[];
}

/** A mint in Kamino's list that the data provider also lists. */
export interface ResolvedMint {
  mint: string;
  ref: string;
}

export interface NewAssetMatch {
  ref: string;
  mints: string[];
}

export interface MovedMint {
  mint: string;
  slug: string;
  ref: string;
}

export interface UniversePlan {
  newAssets: NewAssetMatch[];
  deactivate: number[];
  reactivate: number[];
  /** A mint the provider moved to another ID. The owner is skipped, for a manual fix. */
  moved: MovedMint[];
  /** Currently active assets that stay active. */
  remaining: number;
  active: number;
}

/** Below this share of active assets remaining, a run assumes the data is wrong and changes nothing. */
const MIN_REMAINING_SHARE = 0.8;

export function planUniverse(known: readonly KnownAsset[], resolved: readonly ResolvedMint[]): UniversePlan {
  const ownerByMint = new Map<string, KnownAsset>();
  for (const asset of known) {
    for (const mint of asset.solanaMints) ownerByMint.set(mint, asset);
  }
  const assetByRef = new Map(known.map((asset) => [asset.ref, asset]));

  const qualifying = new Set<number>();
  const skipped = new Set<number>();
  const moved: MovedMint[] = [];
  const newByRef = new Map<string, string[]>();

  for (const { mint, ref } of resolved) {
    const owner = ownerByMint.get(mint);
    if (owner && owner.ref !== ref) {
      moved.push({ mint, slug: owner.slug, ref });
      skipped.add(owner.id);
      continue;
    }
    const asset = owner ?? assetByRef.get(ref);
    if (asset) qualifying.add(asset.id);
    else newByRef.set(ref, [...(newByRef.get(ref) ?? []), mint]);
  }

  const isUnchanged = (asset: KnownAsset) => skipped.has(asset.id);
  const deactivate = known
    .filter((asset) => asset.active && !qualifying.has(asset.id) && !isUnchanged(asset))
    .map((asset) => asset.id);
  const reactivate = known
    .filter((asset) => !asset.active && qualifying.has(asset.id) && !isUnchanged(asset))
    .map((asset) => asset.id);
  const active = known.filter((asset) => asset.active).length;

  return {
    newAssets: [...newByRef].map(([ref, mints]) => ({ ref, mints })),
    deactivate,
    reactivate,
    moved,
    remaining: active - deactivate.length,
    active,
  };
}

/** A short list usually means a bad response rather than dozens of real departures. */
export function isSafeToApply(plan: Pick<UniversePlan, "active" | "remaining">): boolean {
  return plan.remaining >= plan.active * MIN_REMAINING_SHARE;
}
