import { lazy, Suspense, useMemo } from "react";
import type { AssetPage, FinancialMetric } from "../api/assets";
import { changeBetween, dayToTime, formatChange, formatDay, formatFor, formatValue, toChartInfo } from "./financialFormat";
import { factGroups, returnPeriods, signedPercent, type Fact } from "./investorFacts";
import { OVERVIEW_HISTORY, OVERVIEW_RANGE, Returns } from "./InvestorView";

const FinancialChart = lazy(() => import("./FinancialChart").then((module) => ({ default: module.FinancialChart })));

const TILE_COUNT = 4;

/** In order of preference. The first four the asset has are shown. A yield of zero says nothing, so it's skipped. */
const TILES: readonly { metric: string; label: string; signed?: boolean; skipZero?: boolean }[] = [
  { metric: "price_dollar", label: "Price" },
  { metric: "total_asset_value_dollar", label: "Total value" },
  { metric: "holding_addresses_count", label: "Holders" },
  { metric: "apy_30_day", label: "30-day APY", skipZero: true },
  { metric: "trailing_1_year_return_percent", label: "1-year return", signed: true },
];

/** The side panel: the facts that say what the token is, renamed where the short name reads better. */
const DETAILS: readonly [string, string][] = [
  ["Tracks", "Underlying"],
  ["Issuer", "Issuer"],
  ["Backing", "Backing"],
  ["Custodian", "Custodian"],
  ["Regulator", "Regulator"],
  ["Who can buy", "Who can buy"],
  ["Minimum", "Minimum"],
  ["Redemption", "Redemption"],
  ["Networks", "Networks"],
];

/** One asset as a dashboard: headline figures, then the token's main facts beside its price chart and returns. */
export function DashboardView({ asset }: { asset: AssetPage }) {
  const tiles = useMemo(() => {
    const rows = TILES.flatMap((tile) => {
      const row = asset.financials.find((candidate) => candidate.metric === tile.metric && candidate.scope === "asset");
      return row && !(tile.skipZero && row.value === 0) ? [{ ...tile, row }] : [];
    });
    return rows.slice(0, TILE_COUNT);
  }, [asset]);

  const details = useMemo(() => {
    const facts = new Map(factGroups(asset, asset).flatMap((group) => group.facts.map((fact) => [fact.label, fact.value])));
    const category = [facts.get("Asset class"), facts.get("Sector")].filter(Boolean).join(" · ");
    const rows = DETAILS.flatMap(([from, label]): Fact[] => {
      const value = facts.get(from);
      return value ? [{ label, value }] : [];
    });
    // Category reads best right after what the token tracks.
    rows.splice(rows[0]?.label === "Underlying" ? 1 : 0, 0, ...(category ? [{ label: "Category", value: category }] : []));
    return rows;
  }, [asset]);

  const periods = useMemo(() => {
    const inception = asset.fields.categories.flatMap((category) => category.fields).find((field) => field.key === "identity.inception_date");
    return returnPeriods(asset, typeof inception?.value === "string" ? inception.value : null);
  }, [asset]);

  const chart = useMemo(() => {
    const metric = OVERVIEW_HISTORY.find((name) => asset.history.some((history) => history.metric === name && history.points.length > 0));
    const series = asset.series.find((candidate) => candidate.metric === metric);
    return series ? toChartInfo(series) : null;
  }, [asset]);

  if (tiles.length === 0 && details.length === 0 && !chart) {
    return <p className="py-12 text-center text-sm text-muted-foreground">No data available for this asset yet.</p>;
  }

  return (
    <div className="flex min-w-0 max-w-[1200px] flex-col gap-4">
      {tiles.length > 0 && (
        <section aria-label="Key figures" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {tiles.map(({ label, signed, row }) => (
            <Tile key={label} label={label} row={row} signed={signed} />
          ))}
        </section>
      )}

      {/* Key details on the left run the height of the chart and returns beside them. On a phone the chart comes first. */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(280px,1fr)_minmax(0,2.4fr)]">
        {details.length > 0 && <Details facts={details} />}
        {(chart || periods.length > 0) && (
          <div className="order-first flex min-w-0 flex-col gap-6 lg:order-none">
            {chart && (
              <Suspense fallback={<div className="h-[440px] rounded-xl border border-border" />}>
                <FinancialChart slug={asset.slug} charts={[chart]} solanaOnlyNote={null} initialRange={OVERVIEW_RANGE} preloaded={asset.history} />
              </Suspense>
            )}
            {periods.length > 0 && <Returns periods={periods} />}
          </div>
        )}
      </div>

      {asset.asOf && <p className="text-[11px] leading-4 text-muted-foreground">As of {formatDay(dayToTime(asset.asOf))}</p>}
    </div>
  );
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`flex min-w-0 flex-col gap-4 rounded-xl border border-border p-4 ${className}`}>
      <h2 className="text-xs font-medium uppercase tracking-[0.4px] text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Tile({ label, row, signed }: { label: string; row: FinancialMetric; signed?: boolean }) {
  const format = formatFor(row.metric, row.unit);
  const change = row.value30d === null ? null : changeBetween(row.value30d, row.value, format);
  return (
    <Card title={label} className="gap-2">
      <span className="text-[28px] font-medium leading-9 tracking-[-0.5px] tabular-nums">
        {signed ? signedPercent(row.value) : formatValue(row.value, format)}
      </span>
      {change !== null && (
        <span className="text-xs text-muted-foreground">
          <span className={change > 0 ? "text-success" : change < 0 ? "text-warning-foreground" : ""}>
            {change > 0 ? "↑ " : change < 0 ? "↓ " : ""}
            {formatChange(change, format)}
          </span>{" "}
          vs 30 days ago
        </span>
      )}
    </Card>
  );
}

function Details({ facts }: { facts: Fact[] }) {
  return (
    <Card title="Key details" className="gap-2">
      <dl className="flex min-w-0 flex-col">
        {facts.map((fact, index) => (
          <div key={fact.label} className={`grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 py-1.5 ${index > 0 ? "border-t border-border" : ""}`}>
            <dt className="text-xs leading-5 text-muted-foreground">{fact.label}</dt>
            <dd className="text-[13px] leading-5 [overflow-wrap:anywhere]">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
