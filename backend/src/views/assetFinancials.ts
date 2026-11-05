import type pg from "pg";

export type FinancialFormat = "dollar" | "price" | "percent" | "count";

/** How a measure's history reads best: levels as areas, rates and prices as lines, daily flows as bars. */
export type FinancialChartForm = "area" | "line" | "bar";

export interface FinancialFigure {
  key: string;
  label: string;
  format: FinancialFormat;
  value: number;
  /** Against 30 days ago: percentage points for a percent figure, otherwise a percent change. */
  change30d: number | null;
}

export interface FinancialFigureSection {
  title: string;
  figures: FinancialFigure[];
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
  /** Percent of the asset's value across all its networks. */
  share: number;
}

export interface FinancialChart {
  measure: string;
  label: string;
  group: string;
  format: FinancialFormat;
  form: FinancialChartForm;
  /** Whole-asset history, or history for the asset's Solana token alone. */
  scope: "asset" | "solana";
}

export interface AssetFinancialsView {
  asOf: string | null;
  overview: FinancialFigure[];
  sections: FinancialFigureSection[];
  terms: FinancialTerm[];
  networks: FinancialNetwork[];
  charts: FinancialChart[];
}

export interface FinancialHistoryView {
  measure: string;
  /** Oldest first, as [day, value]. */
  points: [string, number][];
}

interface FigureDefinition {
  metric: string;
  label: string;
  format: FinancialFormat;
  /**
   * A share of holders' balances, read from the Solana token. The asset-level figure adds up each
   * token's percentage, so it means nothing once an asset has more than one token.
   */
  holderShare?: true;
}

/** A holder share above 100% can't be true, though the source has some. These are stored but not served. */
const IMPOSSIBLE_SHARE = `(measure LIKE 'top%concentration' AND value > 100)`;

const OVERVIEW: readonly FigureDefinition[] = [
  { metric: "price_dollar", label: "Price", format: "price" },
  { metric: "net_asset_value_dollar", label: "NAV", format: "price" },
  { metric: "total_asset_value_dollar", label: "Total value", format: "dollar" },
  { metric: "apy_30_day", label: "APY (30-day)", format: "percent" },
  { metric: "holding_addresses_count", label: "Holders", format: "count" },
];

const SECTIONS: readonly { title: string; figures: readonly FigureDefinition[] }[] = [
  {
    title: "Returns and yield",
    figures: [
      { metric: "trailing_7_day_return_percent", label: "7 days", format: "percent" },
      { metric: "trailing_1_month_return_percent", label: "1 month", format: "percent" },
      { metric: "trailing_3_month_return_percent", label: "3 months", format: "percent" },
      { metric: "year_to_date_return_percent", label: "Year to date", format: "percent" },
      { metric: "trailing_1_year_return_percent", label: "1 year", format: "percent" },
      { metric: "since_inception_return_percent", label: "Since inception", format: "percent" },
      { metric: "apy_7_day", label: "APY (7-day)", format: "percent" },
    ],
  },
  {
    title: "Supply and holders",
    figures: [
      { metric: "total_supply_token", label: "Total supply", format: "count" },
      { metric: "circulating_supply_token", label: "Circulating supply", format: "count" },
      { metric: "market_value_dollar", label: "Market value", format: "dollar" },
      { metric: "top_holder_concentration", label: "Top holder share (Solana)", format: "percent", holderShare: true },
      { metric: "top_5_holder_concentration", label: "Top 5 holders share (Solana)", format: "percent", holderShare: true },
      { metric: "top_10_holder_concentration", label: "Top 10 holders share (Solana)", format: "percent", holderShare: true },
    ],
  },
  {
    title: "Activity",
    figures: [
      { metric: "trailing_30_day_transfer_volume", label: "30-day transfer volume", format: "dollar" },
      { metric: "trailing_30_day_transfer_count", label: "30-day transfers", format: "count" },
      { metric: "trailing_30_day_active_addresses_count", label: "30-day active addresses", format: "count" },
      { metric: "trailing_7_day_transfer_volume", label: "7-day transfer volume", format: "dollar" },
      { metric: "trailing_7_day_transfer_count", label: "7-day transfers", format: "count" },
      { metric: "trailing_7_day_active_addresses_count", label: "7-day active addresses", format: "count" },
    ],
  },
];

const HOLDER_SHARES = SECTIONS.flatMap((section) => section.figures)
  .filter((figure) => figure.holderShare)
  .map((figure) => figure.metric);

/** Primary market details the catalog already shows on the asset page, such as KYC, aren't repeated here. */
const TERMS: readonly { metric: string; label: string; kind: "bps" | "number" | "text" | "long_text" }[] = [
  { metric: "primary_market__subscription_frequency", label: "Subscriptions", kind: "text" },
  { metric: "primary_market__redemption_frequency", label: "Redemptions", kind: "text" },
  { metric: "primary_market__subscription_fee_bps", label: "Subscription fee", kind: "bps" },
  { metric: "primary_market__redemption_fee_bps", label: "Redemption fee", kind: "bps" },
  { metric: "primary_market__minimum_subscription_amt", label: "Minimum subscription", kind: "number" },
  { metric: "primary_market__base_asset_ticker", label: "Settled in", kind: "text" },
  { metric: "total_management_fee_bps", label: "Management fee", kind: "bps" },
  { metric: "total_performance_fee_bps", label: "Performance fee", kind: "bps" },
  { metric: "distribution_frequency_type", label: "Distributions", kind: "text" },
  { metric: "sp_rating", label: "S&P rating", kind: "text" },
  { metric: "annual_return_target_description", label: "Return target", kind: "long_text" },
  { metric: "fee_structure_description", label: "Fee structure", kind: "long_text" },
  { metric: "other_fees_description", label: "Other fees", kind: "long_text" },
];

const VALUE = "Value";
const YIELD = "Yield";
const SUPPLY_AND_HOLDERS = "Supply and holders";
const ACTIVITY = "Activity";

const CHARTS: readonly Omit<FinancialChart, "scope">[] = [
  { measure: "total_asset_value_dollar", label: "Total value", group: VALUE, format: "dollar", form: "area" },
  { measure: "market_value_dollar", label: "Market value", group: VALUE, format: "dollar", form: "area" },
  { measure: "price_dollar", label: "Price", group: VALUE, format: "price", form: "line" },
  { measure: "net_asset_value_dollar", label: "NAV", group: VALUE, format: "price", form: "line" },
  { measure: "hypothetical_10_000_performance", label: "Growth of $10,000", group: VALUE, format: "dollar", form: "line" },
  { measure: "apy_30_day", label: "APY (30-day)", group: YIELD, format: "percent", form: "line" },
  { measure: "apy_7_day", label: "APY (7-day)", group: YIELD, format: "percent", form: "line" },
  { measure: "total_supply_token", label: "Total supply", group: SUPPLY_AND_HOLDERS, format: "count", form: "area" },
  { measure: "circulating_supply_token", label: "Circulating supply", group: SUPPLY_AND_HOLDERS, format: "count", form: "area" },
  { measure: "holding_addresses_count", label: "Holders", group: SUPPLY_AND_HOLDERS, format: "count", form: "area" },
  { measure: "top_holder_concentration", label: "Top holder share", group: SUPPLY_AND_HOLDERS, format: "percent", form: "line" },
  { measure: "top_5_holder_concentration", label: "Top 5 holders share", group: SUPPLY_AND_HOLDERS, format: "percent", form: "line" },
  { measure: "top_10_holder_concentration", label: "Top 10 holders share", group: SUPPLY_AND_HOLDERS, format: "percent", form: "line" },
  { measure: "trailing_30_day_transfer_volume", label: "30-day transfer volume", group: ACTIVITY, format: "dollar", form: "area" },
  { measure: "daily_transfer_volume_dollar", label: "Daily transfer volume", group: ACTIVITY, format: "dollar", form: "bar" },
  { measure: "number_of_daily_transactions_count", label: "Daily transactions", group: ACTIVITY, format: "count", form: "bar" },
  { measure: "trailing_30_day_active_addresses_count", label: "30-day active addresses", group: ACTIVITY, format: "count", form: "area" },
  { measure: "daily_active_addresses_count", label: "Daily active addresses", group: ACTIVITY, format: "count", form: "bar" },
  { measure: "daily_mints_dollar", label: "Daily mints", group: ACTIVITY, format: "dollar", form: "bar" },
  { measure: "daily_burns_dollar", label: "Daily burns", group: ACTIVITY, format: "dollar", form: "bar" },
];

/** Days back from a series' own last point, so a series that has stopped still shows its final stretch. */
const RANGE_DAYS: Record<string, number | null> = {
  "7d": 7,
  "30d": 30,
  "3m": 90,
  "1y": 365,
  all: null,
};

interface MetricRow {
  metric: string;
  value: number | null;
  value_30d: number | null;
  raw: unknown;
  as_of: string;
}

function change30d(format: FinancialFormat, value: number, previous: number | null): number | null {
  if (previous === null) return null;
  if (format === "percent") return value - previous;
  return previous === 0 ? null : ((value - previous) / Math.abs(previous)) * 100;
}

interface Metrics {
  asset: Map<string, MetricRow>;
  solanaToken: Map<string, MetricRow>;
}

function toFigures(definitions: readonly FigureDefinition[], metrics: Metrics): FinancialFigure[] {
  return definitions.flatMap(({ metric, label, format, holderShare }) => {
    const row = (holderShare ? metrics.solanaToken : metrics.asset).get(metric);
    if (!row || row.value === null) return [];
    if (holderShare && row.value > 100) return [];
    const previous = holderShare && row.value_30d !== null && row.value_30d > 100 ? null : row.value_30d;
    return [{ key: metric, label, format, value: row.value, change30d: change30d(format, row.value, previous) }];
  });
}

function toTerms(metrics: Map<string, MetricRow>): FinancialTerm[] {
  return TERMS.flatMap(({ metric, label, kind }): FinancialTerm[] => {
    const row = metrics.get(metric);
    if (!row) return [];
    if (kind === "text" || kind === "long_text") {
      return typeof row.raw === "string" && row.raw.trim() ? [{ key: metric, label, format: kind, value: row.raw }] : [];
    }
    if (row.value === null) return [];
    return kind === "bps"
      ? [{ key: metric, label, format: "percent", value: row.value / 100 }]
      : [{ key: metric, label, format: "count", value: row.value }];
  });
}

export async function loadAssetFinancials(pool: pg.Pool, slug: string): Promise<AssetFinancialsView | null> {
  const { rows: assets } = await pool.query<{ id: number }>(`SELECT id FROM asset WHERE slug = $1`, [slug]);
  const assetId = assets[0]?.id;
  if (assetId === undefined) return null;

  const [{ rows: metricRows }, { rows: solanaRows }, { rows: networkRows }, { rows: seriesRows }] = await Promise.all([
    pool.query<MetricRow>(
      `SELECT metric, value, value_30d, raw, as_of::text AS as_of
       FROM financial_latest WHERE asset_id = $1 AND token_id IS NULL`,
      [assetId],
    ),
    pool.query<MetricRow>(
      `SELECT f.metric, f.value, f.value_30d, f.raw, f.as_of::text AS as_of
       FROM financial_latest f
       JOIN token t ON t.id = f.token_id
       JOIN network n ON n.id = t.network_id
       WHERE f.asset_id = $1 AND n.key = 'solana' AND f.metric = ANY($2::text[])`,
      [assetId, HOLDER_SHARES],
    ),
    pool.query<{ key: string; name: string; value: number }>(
      `SELECT n.key, n.name, sum(f.value) AS value
       FROM financial_latest f
       JOIN token t ON t.id = f.token_id
       JOIN network n ON n.id = t.network_id
       WHERE f.asset_id = $1 AND f.metric = 'total_asset_value_dollar'
       GROUP BY n.key, n.name
       HAVING sum(f.value) > 0
       ORDER BY value DESC, n.key`,
      [assetId],
    ),
    pool.query<{ measure: string; is_asset: boolean }>(
      `SELECT DISTINCT measure, token_id IS NULL AS is_asset
       FROM financial_timeseries
       WHERE asset_id = $1 AND measure = ANY($2::text[]) AND NOT ${IMPOSSIBLE_SHARE}`,
      [assetId, CHARTS.map((chart) => chart.measure)],
    ),
  ]);

  const assetMetrics = new Map(metricRows.map((row) => [row.metric, row]));
  const metrics: Metrics = { asset: assetMetrics, solanaToken: new Map(solanaRows.map((row) => [row.metric, row])) };
  const networkTotal = networkRows.reduce((sum, row) => sum + row.value, 0);
  const assetLevel = new Set(seriesRows.filter((row) => row.is_asset).map((row) => row.measure));
  const available = new Set(seriesRows.map((row) => row.measure));

  return {
    asOf: metricRows.reduce<string | null>((latest, row) => (latest === null || row.as_of > latest ? row.as_of : latest), null),
    overview: toFigures(OVERVIEW, metrics),
    sections: SECTIONS.map(({ title, figures }) => ({ title, figures: toFigures(figures, metrics) })).filter(
      (section) => section.figures.length > 0,
    ),
    terms: toTerms(assetMetrics),
    networks: networkRows.map((row) => ({ ...row, share: (row.value / networkTotal) * 100 })),
    charts: CHARTS.filter((chart) => available.has(chart.measure)).map((chart) => ({
      ...chart,
      scope: assetLevel.has(chart.measure) ? "asset" : "solana",
    })),
  };
}

/** One measure's history. Null when the asset has no such series, or the range isn't one we offer. */
export async function loadAssetFinancialHistory(
  pool: pg.Pool,
  slug: string,
  measure: string,
  range: string,
): Promise<FinancialHistoryView | null> {
  if (!Object.hasOwn(RANGE_DAYS, range)) return null;
  const { rows } = await pool.query<{ day: string; value: number }>(
    `WITH series AS (
       SELECT t.day, t.value
       FROM financial_timeseries t
       JOIN asset a ON a.id = t.asset_id
       WHERE a.slug = $1 AND t.measure = $2 AND NOT ${IMPOSSIBLE_SHARE}
     )
     SELECT day::text AS day, value FROM series
     WHERE $3::int IS NULL OR day > (SELECT max(day) FROM series) - $3::int
     ORDER BY day`,
    [slug, measure, RANGE_DAYS[range]],
  );
  if (rows.length === 0) return null;
  return { measure, points: rows.map((row) => [row.day, row.value]) };
}
