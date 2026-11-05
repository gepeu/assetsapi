import type { FinancialScope, FinancialSeries } from "../api/assets";

export type FinancialFormat = "dollar" | "price" | "percent" | "count";

/** How a measure's history reads best: levels as areas, rates and prices as lines, daily flows as bars. */
export type ChartForm = "area" | "line" | "bar";

export interface ChartInfo {
  measure: string;
  label: string;
  group: string;
  scope: FinancialScope;
  format: FinancialFormat;
  form: ChartForm;
}

const PRICE_MEASURES: ReadonlySet<string> = new Set(["price_dollar", "net_asset_value_dollar"]);

/** Levels that aren't amounts of anything, so a chart starting from zero would flatten them. */
const LINE_MEASURES: ReadonlySet<string> = new Set([
  "net_asset_value_token",
  "hypothetical_10_000_performance",
  "rebase_multiplier",
]);

const DAILY_FLOW = /^(adjusted_daily|daily|number_of_daily)_/;

/** The API gives each measure a unit. Prices are dollars that need more decimals than totals do. */
export function formatFor(measure: string, unit: string | null): FinancialFormat {
  if (unit === "percent") return "percent";
  if (unit === "dollar") return PRICE_MEASURES.has(measure) ? "price" : "dollar";
  return "count";
}

export function chartFormFor(measure: string, unit: string | null): ChartForm {
  if (unit === "percent" || PRICE_MEASURES.has(measure) || LINE_MEASURES.has(measure)) return "line";
  return DAILY_FLOW.test(measure) ? "bar" : "area";
}

export function toChartInfo(series: FinancialSeries): ChartInfo {
  return {
    measure: series.measure,
    label: series.label,
    group: series.group,
    scope: series.scope,
    format: formatFor(series.measure, series.unit),
    form: chartFormFor(series.measure, series.unit),
  };
}

const MINUS = "−";

const fixed = (value: number, digits: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const compact = (value: number) =>
  value.toLocaleString("en-US", { notation: "compact", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function magnitude(value: number, format: FinancialFormat): string {
  switch (format) {
    case "price":
      return `$${fixed(value, value < 10 ? 4 : 2)}`;
    case "dollar":
      if (value >= 1_000_000) return `$${compact(value)}`;
      return `$${fixed(value, value >= 1000 ? 0 : 2)}`;
    case "percent":
      return `${fixed(value, 2)}%`;
    case "count":
      if (value >= 10_000) return compact(value);
      return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
}

export function formatValue(value: number, format: FinancialFormat): string {
  return `${value < 0 ? MINUS : ""}${magnitude(Math.abs(value), format)}`;
}

/** A change in percentage points for a percent figure, otherwise a percent change. */
export function formatChange(change: number, format: FinancialFormat): string {
  const size = Math.abs(change);
  const shown = fixed(size, size >= 1000 ? 0 : 2);
  const sign = Number(shown.replaceAll(",", "")) === 0 ? "" : change < 0 ? MINUS : "+";
  return format === "percent" ? `${sign}${shown} pts` : `${sign}${shown}%`;
}

/** The change between two points of a series, in the same terms as `formatChange`. Null if it has no meaning. */
export function changeBetween(first: number, last: number, format: FinancialFormat): number | null {
  if (format === "percent") return last - first;
  return first === 0 ? null : ((last - first) / Math.abs(first)) * 100;
}

const niceStep = (rough: number) => {
  const power = 10 ** Math.floor(Math.log10(rough));
  const scaled = rough / power;
  return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * power;
};

export interface ValueAxis {
  domain: [number, number];
  ticks: number[];
  label: (value: number) => string;
}

/** Clean ticks that cover the data, with as many decimals as the step needs and no more. */
export function valueAxis(values: readonly number[], format: FinancialFormat, fromZero: boolean): ValueAxis {
  let low = Math.min(...values);
  let high = Math.max(...values);
  if (fromZero) low = Math.min(low, 0);
  if (low === high) {
    const pad = Math.abs(high) * 0.01 || 1;
    low -= pad;
    high += pad;
  }
  const step = niceStep((high - low) / 5);
  const firstIndex = Math.floor(low / step);
  const lastIndex = Math.ceil(high / step);
  const ticks = Array.from({ length: lastIndex - firstIndex + 1 }, (_, i) => (firstIndex + i) * step);

  const top = Math.max(Math.abs(ticks[0]), Math.abs(ticks[ticks.length - 1]));
  const [divisor, suffix] =
    top >= 1e12 ? [1e12, "T"] : top >= 1e9 ? [1e9, "B"] : top >= 1e6 ? [1e6, "M"] : top >= 1e4 ? [1e3, "K"] : [1, ""];
  const decimals = Math.max(0, Math.ceil(-Math.log10(step / divisor) - 1e-9));
  const prefix = format === "dollar" || format === "price" ? "$" : "";
  const unit = format === "percent" ? "%" : "";

  return {
    domain: [ticks[0], ticks[ticks.length - 1]],
    ticks,
    label: (value) => {
      const shown = fixed(Math.abs(value) / divisor, decimals);
      const isZero = Number(shown.replaceAll(",", "")) === 0;
      return `${value < 0 && !isZero ? MINUS : ""}${prefix}${shown}${suffix}${unit}`;
    },
  };
}

const DAY_MS = 86_400_000;

/** Days are plain dates, so they're read and shown in UTC to stay the same day in every timezone. */
export const dayToTime = (day: string) => Date.parse(`${day}T00:00:00Z`);

export const formatDay = (time: number) =>
  new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Evenly spaced dates across a series, labelled by month once it spans more than a year. */
export function timeAxis(first: number, last: number): { ticks: number[]; label: (time: number) => string } {
  const days = Math.round((last - first) / DAY_MS);
  const count = days < 7 ? days + 1 : 6;
  // Whole days only, so a tick sits under the data for the day it names.
  const ticks = Array.from({ length: count }, (_, i) =>
    count === 1 ? first : first + Math.round((days * i) / (count - 1)) * DAY_MS,
  );
  const long = last - first > 400 * DAY_MS;
  const options: Intl.DateTimeFormatOptions = long
    ? { month: "short", year: "numeric", timeZone: "UTC" }
    : { month: "short", day: "numeric", timeZone: "UTC" };
  return { ticks, label: (time) => new Date(time).toLocaleDateString("en-US", options) };
}
