// The frontend's only source of asset data. These types mirror backend/src/api/schemas/.

/** Named once, in the page banner, rather than beside every value. */
export const PRIMARY_SOURCE = "RWA.xyz";

/** The API's largest page. */
const PAGE_SIZE = 200;

/** Numbers by metric name. A metric with no value is null. */
export type Metrics = Record<string, number | null>;

export interface AssetListItem {
  slug: string;
  ticker: string;
  name: string;
  assetClass: string;
  assetType: string;
  issuer: string | null;
  asOf: string | null;
  metrics: Metrics;
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
  metrics: Metrics;
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
  metrics: Metrics;
  asOf: string | null;
}

export type FinancialRange = "7d" | "30d" | "3m" | "1y" | "all";

export type FinancialScope = "asset" | "solana";

export interface FinancialMetric {
  metric: string;
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
  metric: string;
  label: string;
  group: string;
  unit: string | null;
  scope: FinancialScope;
}

export interface AssetFinancials extends AssetDetail {
  financials: FinancialMetric[];
  series: FinancialSeries[];
  valueByNetwork: FinancialNetwork[];
  terms: FieldValue[];
}

export interface FinancialHistory {
  metric: string;
  points: [string, number][];
}

/** Everything the asset page shows, from one request. */
export interface AssetPage extends AssetFinancials {
  fields: AssetFields;
  tokens: AssetToken[];
  /** The series asked for up front, so the first chart needs no request of its own. */
  history: FinancialHistory[];
}

const API_PATH = "/tokenized_assets";

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
    const page = await fetchJson<AssetListResponse>(`${API_PATH}?limit=${PAGE_SIZE}&offset=${assets.length}`);
    if (!page) throw new Error("The asset list is missing");
    assets.push(...page.data);
    if (page.data.length === 0 || assets.length >= page.meta.total) return assets;
  }
}

/** The whole asset page in one call, with the history of `historyMetrics` over `range`. */
export function getAssetPage(slug: string, historyMetrics: readonly string[], range: FinancialRange): Promise<AssetPage | null> {
  const params = new URLSearchParams({
    include: "fields,tokens,financials,series,valueByNetwork,terms",
    history: historyMetrics.join(","),
    range,
  });
  return fetchData(`${API_PATH}/${slug}?${params}`);
}

export async function getFinancialHistory(slug: string, metric: string, range: FinancialRange): Promise<FinancialHistory | null> {
  const asset = await fetchData<{ history: FinancialHistory[] }>(`${API_PATH}/${slug}?${new URLSearchParams({ history: metric, range })}`);
  return asset?.history[0] ?? null;
}
