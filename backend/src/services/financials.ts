/**
 * Turns rows into `/assets/{slug}/financials`. Holder shares are read from the Solana token, because
 * the asset-level figure adds up each token's percentage, and a share above 100% is stored but not served.
 */
import type { FinancialsResponse } from "../api/schemas/financials.ts";
import type { FieldValue } from "../api/schemas/shared.ts";
import { settings } from "../config.ts";
import type { Queryable } from "../db/pool.ts";
import { findActiveAssetBySlug } from "../db/queries/assets.ts";
import {
  listServedAssetValues,
  listServedSolanaValues,
  listValueByNetwork,
  type ServedValueRow,
} from "../db/queries/financials.ts";
import { listAvailableSeries } from "../db/queries/history.ts";
import { chooseSeriesScope, HOLDER_SHARE_MEASURES } from "./history.ts";

const OTHER_GROUP = settings.api.otherGroupLabel;

/** A share above 100% can't be true. */
const toServableShare = (value: number | null): number | null => (value !== null && value > 100 ? null : value);

type Figure = FinancialsResponse["data"]["figures"][number];

function toFigure(row: ServedValueRow, scope: Figure["scope"]): Figure | null {
  const isShare = scope === "solana";
  const value = isShare ? toServableShare(row.value) : row.value;
  if (value === null) return null;
  return {
    measure: row.metric,
    label: row.label,
    group: row.measure_group ?? OTHER_GROUP,
    unit: row.unit,
    scope,
    value,
    value7d: isShare ? toServableShare(row.value_7d) : row.value_7d,
    value30d: isShare ? toServableShare(row.value_30d) : row.value_30d,
    value90d: isShare ? toServableShare(row.value_90d) : row.value_90d,
    asOf: row.as_of,
  };
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

/** The latest date across a set of values, whichever measure it's on. */
export function findLatestAsOf(rows: readonly { as_of: string }[]): string | null {
  return rows.reduce<string | null>(
    (latest, row) => (latest === null || row.as_of > latest ? row.as_of : latest),
    null,
  );
}

/** Null when the asset is unknown or deactivated. */
export async function getAssetFinancials(db: Queryable, slug: string): Promise<FinancialsResponse | null> {
  const asset = await findActiveAssetBySlug(db, slug);
  if (!asset) return null;

  const [assetRows, solanaRows, networkRows, seriesRows] = await Promise.all([
    listServedAssetValues(db, asset.id),
    listServedSolanaValues(db, asset.id, HOLDER_SHARE_MEASURES),
    listValueByNetwork(db, asset.id),
    listAvailableSeries(db, asset.id),
  ]);

  const figures: Figure[] = [];
  for (const row of assetRows) {
    if (row.kind !== "figure" || HOLDER_SHARE_MEASURES.includes(row.metric)) continue;
    const figure = toFigure(row, "asset");
    if (figure) figures.push(figure);
  }
  for (const row of solanaRows) {
    const figure = toFigure(row, "solana");
    if (figure) figures.push(figure);
  }

  const terms = assetRows.flatMap((row) => {
    if (row.kind !== "term") return [];
    const term = toTerm(row);
    return term ? [term] : [];
  });

  const networkTotal = networkRows.reduce((sum, row) => sum + row.value, 0);

  const history = seriesRows.flatMap((row) => {
    if (HOLDER_SHARE_MEASURES.includes(row.slug) && !row.hasSolanaSeries) return [];
    const scope = chooseSeriesScope(row.slug, row);
    return [{ measure: row.slug, label: row.label, group: row.group ?? OTHER_GROUP, unit: row.unit, scope }];
  });

  return {
    data: {
      asOf: findLatestAsOf(assetRows),
      figures,
      terms,
      networks: networkRows.map((row) => ({
        key: row.key,
        name: row.name,
        value: row.value,
        share: (row.value / networkTotal) * 100,
      })),
      history,
    },
  };
}
