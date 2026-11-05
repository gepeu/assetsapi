import type pg from "pg";
import { loadAssetDetail } from "./assetDetail.ts";
import { loadAssetFinancialHistory, loadAssetFinancials } from "./assetFinancials.ts";
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
  asset_financials: {
    description:
      "One asset's latest financial figures, fund terms and value by network, plus the history charts it has data for. Takes ?asset=<slug>.",
    load: (pool, params) => loadAssetFinancials(pool, params.get("asset") ?? ""),
  },
  asset_financial_history: {
    description:
      "One asset's daily history for one measure. Takes ?asset=<slug>&measure=<slug>&range=<7d|30d|3m|1y|all>, and range defaults to all.",
    load: (pool, params) =>
      loadAssetFinancialHistory(pool, params.get("asset") ?? "", params.get("measure") ?? "", params.get("range") ?? "all"),
  },
};
