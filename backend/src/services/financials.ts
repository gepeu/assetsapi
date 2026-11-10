/**
 * Turns rows into an asset's `financials`, `terms`, `series` and `valueByNetwork`. Holder shares are
 * read from the Solana token, because the asset-level value adds up each token's percentage.
 */
import type {
  FinancialsSection,
  SeriesSection,
  TermsSection,
  ValueByNetworkSection,
} from "../api/schemas/financials.ts";
import type { FieldValue } from "../api/schemas/shared.ts";
import { settings } from "../config.ts";
import type { Queryable } from "../db/pool.ts";
import { listValueByNetwork, type ServedValueRow } from "../db/queries/financials.ts";
import { listAvailableSeries } from "../db/queries/history.ts";
import { chooseSeriesScope, HOLDER_SHARE_METRICS, toServableShare } from "./history.ts";
import { toShortName } from "./names.ts";

const groupLabelOf = (group: string | null): string => group ?? settings.api.otherGroupLabel;

type Financial = FinancialsSection[number];

function toFinancial(row: ServedValueRow, scope: Financial["scope"]): Financial | null {
  const isShare = scope === "solana";
  const value = isShare ? toServableShare(row.value) : row.value;
  if (value === null) return null;
  return {
    metric: row.metric,
    label: row.label,
    group: groupLabelOf(row.measure_group),
    unit: row.unit,
    scope,
    value,
    value7d: isShare ? toServableShare(row.value_7d) : row.value_7d,
    value30d: isShare ? toServableShare(row.value_30d) : row.value_30d,
    value90d: isShare ? toServableShare(row.value_90d) : row.value_90d,
    asOf: row.as_of,
  };
}

interface FinancialFilters {
  /** Short group names. Undefined means every group. */
  groups: readonly string[] | undefined;
  /** Metric names. Undefined means every metric. */
  metrics: readonly string[] | undefined;
}

export function toFinancials(
  assetRows: readonly ServedValueRow[],
  solanaRows: readonly ServedValueRow[],
  { groups, metrics }: FinancialFilters,
): FinancialsSection {
  const isWanted = (row: ServedValueRow) =>
    (groups === undefined || groups.includes(toShortName(groupLabelOf(row.measure_group)))) &&
    (metrics === undefined || metrics.includes(row.metric));

  const financials: Financial[] = [];
  for (const row of assetRows) {
    if (row.kind !== "figure" || HOLDER_SHARE_METRICS.includes(row.metric) || !isWanted(row)) continue;
    const financial = toFinancial(row, "asset");
    if (financial) financials.push(financial);
  }
  for (const row of solanaRows) {
    if (!isWanted(row)) continue;
    const financial = toFinancial(row, "solana");
    if (financial) financials.push(financial);
  }
  return financials;
}

function toTerm(row: ServedValueRow): FieldValue | null {
  const { raw } = row;
  const base = { key: row.metric, label: row.label, asOf: row.as_of };
  if (typeof raw === "string") {
    return raw.trim() === "" ? null : { ...base, valueType: "text", value: raw };
  }
  if (typeof raw === "number") return { ...base, valueType: "decimal", value: raw };
  if (typeof raw === "boolean") return { ...base, valueType: "boolean", value: raw };
  if (Array.isArray(raw)) {
    const items = raw.filter((item): item is string => typeof item === "string");
    return items.length === 0 ? null : { ...base, valueType: "list", value: items };
  }
  return null;
}

export function toTerms(assetRows: readonly ServedValueRow[]): TermsSection {
  return assetRows.flatMap((row) => {
    if (row.kind !== "term") return [];
    const term = toTerm(row);
    return term ? [term] : [];
  });
}

/** The latest date across a set of values, whichever metric it's on. */
export function findLatestAsOf(rows: readonly { as_of: string }[]): string | null {
  return rows.reduce<string | null>(
    (latest, row) => (latest === null || row.as_of > latest ? row.as_of : latest),
    null,
  );
}

export async function loadSeries(db: Queryable, assetId: number): Promise<SeriesSection> {
  const rows = await listAvailableSeries(db, assetId);
  return rows.flatMap((row) => {
    if (HOLDER_SHARE_METRICS.includes(row.slug) && !row.hasSolanaSeries) return [];
    return [
      {
        metric: row.slug,
        label: row.label,
        group: groupLabelOf(row.group),
        unit: row.unit,
        scope: chooseSeriesScope(row.slug, row),
      },
    ];
  });
}

export async function loadValueByNetwork(db: Queryable, assetId: number): Promise<ValueByNetworkSection> {
  const rows = await listValueByNetwork(db, assetId);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return rows.map((row) => ({ key: row.key, name: row.name, value: row.value, share: (row.value / total) * 100 }));
}
