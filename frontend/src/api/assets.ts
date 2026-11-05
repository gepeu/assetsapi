// The frontend's only source of asset data: the backend's AssetModelViews.
// These types mirror backend/src/views/.
import { notifySignedOut } from "./auth";

/** Named once, in the page banner, rather than beside every value. Must match the backend's source name. */
export const PRIMARY_SOURCE = "RWA.xyz";

export interface AssetListItem {
  slug: string;
  ticker: string;
  name: string;
  issuer: string | null;
  assetClass: string;
}

export type FieldStatus = "disclosed" | "not_disclosed" | "not_applicable" | "attributed_only" | "never_checked";

export type DataValue = string | number | boolean | string[];

export interface CoverageCounts {
  disclosed: number;
  applicable: number;
  notDisclosed: number;
  attributedOnly: number;
  neverChecked: number;
  notApplicable: number;
  conflicts: number;
}

export interface ClaimCitation {
  documentId: number;
  title: string;
  quote: string;
  locator: string | null;
  verified: boolean;
}

export interface SourceClaim {
  source: string;
  status: "disclosed" | "not_disclosed" | "not_applicable";
  value: DataValue | null;
  asOf: string | null;
  observedAt: string;
  method: string;
  isFact: boolean;
  isAttributedOnly: boolean;
  overrideReason: string | null;
  citations: ClaimCitation[];
}

export interface FactValue {
  status: FieldStatus;
  value: DataValue | null;
  source: string | null;
  asOf: string | null;
  hasConflict: boolean;
  claims: SourceClaim[];
}

export interface FieldDescriptor {
  key: string;
  label: string;
  valueType: string;
  requiresAsOf: boolean;
  conflictPolicy: "chain_first" | "documents_first";
  status: FieldStatus;
  hasConflict: boolean;
}

export type FieldEntry = FieldDescriptor & FactValue;

export interface FieldsBlock {
  kind: "fields";
  fields: FieldEntry[];
}

export interface RecordsBlock {
  kind: "records";
  key: string;
  title: string;
  rowLabelHeader: string | null;
  columns: FieldDescriptor[];
  rows: { key: string; label: string | null; cells: FactValue[] }[];
  sources: string[];
}

export interface CategoryView {
  name: string;
  coverage: CoverageCounts;
  blocks: (FieldsBlock | RecordsBlock)[];
}

export interface AssetDocument {
  id: number;
  title: string;
  url: string;
  category: string;
  isOfficial: boolean;
  lastCheckedAt: string | null;
  hasSavedCopy: boolean;
}

export interface AssetDetailView {
  asset: {
    slug: string;
    ticker: string;
    name: string;
    assetClass: string;
    assetType: string;
    issuer: string | null;
    description: string | null;
    reviewNote: string | null;
  };
  catalogFieldCount: number;
  coverage: CoverageCounts;
  conflictOrders: Record<FieldDescriptor["conflictPolicy"], string[]>;
  categories: CategoryView[];
  documents: AssetDocument[];
}

/** Null when the view says there's nothing there. */
async function fetchView<T>(name: string, params?: Record<string, string>): Promise<T | null> {
  const query = params ? `?${new URLSearchParams(params)}` : "";
  const response = await fetch(`/api/views/${name}${query}`);
  if (response.status === 401) notifySignedOut();
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`View request failed: ${response.status}`);
  return (await response.json()) as T;
}

export async function listAssets(): Promise<AssetListItem[]> {
  return (await fetchView<AssetListItem[]>("asset_list")) ?? [];
}

export function getAsset(slug: string): Promise<AssetDetailView | null> {
  return fetchView<AssetDetailView>("asset_detail", { asset: slug });
}

export type FinancialFormat = "dollar" | "price" | "percent" | "count";

export type FinancialRange = "7d" | "30d" | "3m" | "1y" | "all";

export interface FinancialFigure {
  key: string;
  label: string;
  format: FinancialFormat;
  value: number;
  change30d: number | null;
}

export interface FinancialTerm {
  key: string;
  label: string;
  format: "percent" | "count" | "text" | "long_text";
  value: number | string;
}

export interface FinancialNetwork {
  key: string;
  name: string;
  value: number;
  share: number;
}

export interface FinancialChart {
  measure: string;
  label: string;
  group: string;
  format: FinancialFormat;
  form: "area" | "line" | "bar";
  scope: "asset" | "solana";
}

export interface AssetFinancialsView {
  asOf: string | null;
  overview: FinancialFigure[];
  sections: { title: string; figures: FinancialFigure[] }[];
  terms: FinancialTerm[];
  networks: FinancialNetwork[];
  charts: FinancialChart[];
}

export interface FinancialHistoryView {
  measure: string;
  points: [string, number][];
}

export function getAssetFinancials(slug: string): Promise<AssetFinancialsView | null> {
  return fetchView<AssetFinancialsView>("asset_financials", { asset: slug });
}

export function getFinancialHistory(slug: string, measure: string, range: FinancialRange): Promise<FinancialHistoryView | null> {
  return fetchView<FinancialHistoryView>("asset_financial_history", { asset: slug, measure, range });
}
