// The frontend's only source of asset data. These types mirror backend/src/api/schemas/.

/** Named once, in the page banner, rather than beside every value. */
export const PRIMARY_SOURCE = "RWA.xyz";

/** The API's largest page. */
const PAGE_SIZE = 200;

export interface Figures {
  price_dollar: number | null;
  net_asset_value_dollar: number | null;
  total_asset_value_dollar: number | null;
  apy_30_day: number | null;
  holding_addresses_count: number | null;
}

export interface AssetListItem {
  slug: string;
  ticker: string;
  name: string;
  assetClass: string;
  assetType: string;
  issuer: string | null;
  asOf: string | null;
  figures: Figures;
}

interface AssetListResponse {
  data: AssetListItem[];
  meta: { total: number };
}

export interface NetworkRef {
  key: string;
  name: string;
}

export interface AssetDetail {
  slug: string;
  ticker: string;
  name: string;
  assetClass: string;
  assetType: string;
  description: string | null;
  issuer: string | null;
  organizations: { slug: string; name: string; role: string; legalName: string | null }[];
  networks: NetworkRef[];
  asOf: string | null;
  figures: Figures;
}

export type DataValue = string | number | boolean | string[];

export interface FieldValue {
  key: string;
  label: string;
  valueType: string;
  value: DataValue | null;
  asOf: string | null;
}

export interface FieldCategory {
  name: string;
  fields: FieldValue[];
  records: { group: string; key: string; fields: FieldValue[] }[];
}

export interface AssetFields {
  categories: FieldCategory[];
}

export interface AssetToken {
  network: NetworkRef;
  address: string;
  issuanceType: string;
  fields: FieldValue[];
  figures: {
    total_asset_value_dollar: number | null;
    market_value_dollar: number | null;
    total_supply_token: number | null;
    holding_addresses_count: number | null;
  };
  asOf: string | null;
}

export type FinancialRange = "7d" | "30d" | "3m" | "1y" | "all";

export type FinancialScope = "asset" | "solana";

export interface FinancialFigure {
  measure: string;
  label: string;
  group: string;
  unit: string | null;
  scope: FinancialScope;
  value: number;
  value7d: number | null;
  value30d: number | null;
  value90d: number | null;
  asOf: string;
}

export interface FinancialNetwork {
  key: string;
  name: string;
  value: number;
  share: number;
}

export interface FinancialSeries {
  measure: string;
  label: string;
  group: string;
  unit: string | null;
  scope: FinancialScope;
}

export interface AssetFinancials {
  asOf: string | null;
  figures: FinancialFigure[];
  terms: FieldValue[];
  networks: FinancialNetwork[];
  history: FinancialSeries[];
}

export interface FinancialHistory {
  measure: string;
  points: [string, number][];
}

/** Null on a 404. */
async function fetchJson<T>(path: string): Promise<T | null> {
  const response = await fetch(path);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return (await response.json()) as T;
}

async function fetchData<T>(path: string): Promise<T | null> {
  return (await fetchJson<{ data: T }>(path))?.data ?? null;
}

/** All active assets. They're filtered in the browser, so one page of them is one call. */
export async function listAssets(): Promise<AssetListItem[]> {
  const assets: AssetListItem[] = [];
  for (;;) {
    const page = await fetchJson<AssetListResponse>(`/assets?limit=${PAGE_SIZE}&offset=${assets.length}`);
    if (!page) throw new Error("The asset list is missing");
    assets.push(...page.data);
    if (page.data.length === 0 || assets.length >= page.meta.total) return assets;
  }
}

export function getAsset(slug: string): Promise<AssetDetail | null> {
  return fetchData(`/assets/${slug}`);
}

export function getAssetFields(slug: string): Promise<AssetFields | null> {
  return fetchData(`/assets/${slug}/fields`);
}

export function getAssetTokens(slug: string): Promise<AssetToken[] | null> {
  return fetchData(`/assets/${slug}/tokens`);
}

export function getAssetFinancials(slug: string): Promise<AssetFinancials | null> {
  return fetchData(`/assets/${slug}/financials`);
}

export function getFinancialHistory(slug: string, measure: string, range: FinancialRange): Promise<FinancialHistory | null> {
  return fetchData(`/assets/${slug}/history?${new URLSearchParams({ measure, range })}`);
}
