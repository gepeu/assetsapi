/**
 * Unit fixes and measure conversion: RWA.xyz's financial fields and history series, turned into our
 * measure names and numbers.
 */
import { ContractBrokenError } from "../errors.ts";
import { isDay } from "../types.ts";
import { type ApiRecord, isRecord } from "./client.ts";

const FINANCIAL_FIELD =
  /price|net_asset|^nav|apy|yield|return|_fee|fee_|fees|supply|market_|^primary_markets$|_dollar|volume|concentration|holding_addresses|active_addresses|transactions|transfer_count|bridge|mints|burns|capacity|idle|cash_drag|principal|loan|interest|repo|collateral|issued|asset_value|minimum|m2_|sofr|overnight|performance|inflow|outflow|funded|drawndown|recovered|written_off|maturity|rebase|accounting|fair_value|hypothetical|rating|distribut|income|investable|outstanding|total_contracts|_token$|denomination/i;

/** The same measure under two names on RWA.xyz. */
const RENAMED_MEASURES: Readonly<Record<string, string>> = {
  yield_to_maturity_percent: "yield_to_maturity",
};

const UNIT_FIXES: Readonly<Record<string, string>> = {
  Dollars: "dollar",
  Transfers: "transfer",
};

/** RWA.xyz labels this measure's unit `address`, which is wrong. */
const UNIT_OVERRIDES: Readonly<Record<string, string>> = {
  number_of_daily_transactions_count: "transaction",
};

export function toMeasureName(name: string): string {
  return RENAMED_MEASURES[name] ?? name;
}

export function toStandardUnit(measure: string, unit: string | null): string | null {
  const override = UNIT_OVERRIDES[measure];
  if (override) return override;
  return unit === null ? null : (UNIT_FIXES[unit] ?? unit);
}

/** Whether a top-level field on an asset or token record is financial data. */
function isFinancialField(name: string): boolean {
  return FINANCIAL_FIELD.test(name);
}

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function hasNoValue(raw: unknown): boolean {
  if (raw === null || raw === undefined || raw === "") return true;
  if (Array.isArray(raw)) return raw.length === 0;
  if (isRecord(raw)) return Object.values(raw).every((value) => value === null || value === undefined);
  return false;
}

interface ConvertedMetric {
  metric: string;
  value: number | null;
  value7d: number | null;
  value30d: number | null;
  value90d: number | null;
  raw: unknown;
}

/** Every financial field that has a value. A false or a zero is a value; a null is not. */
export function toMetrics(record: ApiRecord): ConvertedMetric[] {
  const metrics = new Map<string, ConvertedMetric>();
  for (const [name, raw] of Object.entries(record)) {
    if (!isFinancialField(name) || hasNoValue(raw)) continue;
    const tracked = isRecord(raw) && "val" in raw ? raw : null;
    const metric = toMeasureName(name);
    // Should RWA.xyz send both spellings of a measure, its own current name wins.
    if (metrics.has(metric) && metric !== name) continue;
    metrics.set(metric, {
      metric,
      value: numberOrNull(tracked ? tracked.val : raw),
      value7d: numberOrNull(tracked?.val_7d),
      value30d: numberOrNull(tracked?.val_30d),
      value90d: numberOrNull(tracked?.val_90d),
      raw,
    });
  }
  return [...metrics.values()];
}

/**
 * The day's points, oldest first. A point with no number is skipped, the API can repeat a day (the
 * last one stands), and the current UTC day is dropped because it's incomplete: trailing counts read
 * far lower than the day before it (955,639 falling to 603,463 on SPYx).
 */
export function toDailyPoints(points: readonly unknown[], today: string): [string, number][] {
  const byDay = new Map<string, number>();
  for (const point of points) {
    if (!Array.isArray(point)) throw new ContractBrokenError("RWA.xyz series has a malformed point");
    const [rawDay, rawValue] = point as unknown[];
    if (typeof rawDay !== "string") throw new ContractBrokenError("RWA.xyz series has a point without a day");
    const day = rawDay.slice(0, 10);
    if (!isDay(day)) throw new ContractBrokenError("RWA.xyz series has a malformed day");
    const value = numberOrNull(rawValue);
    if (value !== null && day < today) byDay.set(day, value);
  }
  return [...byDay].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
