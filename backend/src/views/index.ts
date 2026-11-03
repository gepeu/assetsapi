import type pg from "pg";
import { loadAssetDetail } from "./assetDetail.ts";
import { loadAssetList } from "./assetList.ts";

/**
 * AssetModelViews: named sets of asset data with no display logic. The UI renders them, and
 * reports and chat can use the same ones, so all of them show the same data.
 */
export interface ViewDefinition {
  description: string;
  /** Resolves to null when what was asked for doesn't exist. */
  load(pool: pg.Pool, params: URLSearchParams): Promise<unknown>;
}

export const VIEWS: Record<string, ViewDefinition> = {
  asset_list: {
    description: "Every asset we track, with its issuer and asset class.",
    load: (pool) => loadAssetList(pool),
  },
  asset_detail: {
    description:
      "One asset's Facts and their source claims across every catalog category, plus its documents. Takes ?asset=<slug>.",
    load: (pool, params) => loadAssetDetail(pool, params.get("asset") ?? ""),
  },
};
