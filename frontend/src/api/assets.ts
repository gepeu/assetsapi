// The frontend's only source of asset data. These functions return sample data
// until the backend exists; swap their bodies for fetch() calls to the
// AssetModelViews API and nothing else in the UI has to change.
import fixtures from "./fixtures.json";

export type AssetClass =
  | "Treasuries"
  | "Private Credit"
  | "Reinsurance"
  | "Onchain-Yield"
  | "Cryptocurrency"
  | "Equity"
  | "Commodities"
  | "Structured";

export const ASSET_CLASSES: AssetClass[] = [
  "Treasuries",
  "Private Credit",
  "Reinsurance",
  "Onchain-Yield",
  "Cryptocurrency",
  "Equity",
  "Commodities",
  "Structured",
];

export interface AssetListItem {
  slug: string;
  ticker: string;
  name: string;
  issuer: string;
  assetClass: AssetClass;
}

export interface AssetDetail extends AssetListItem {
  /** Paragraphs of the description; null when we don't have one yet. */
  description: string[] | null;
}

const assets = fixtures as AssetDetail[];

export async function listAssets(): Promise<AssetListItem[]> {
  return assets.map(({ description: _description, ...item }) => item);
}

export async function getAsset(slug: string): Promise<AssetDetail | null> {
  return assets.find((a) => a.slug === slug) ?? null;
}
