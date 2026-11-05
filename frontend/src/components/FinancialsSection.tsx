import { lazy, Suspense, useMemo, useState } from "react";
import type { AssetFinancials, FieldValue, FinancialMetric, FinancialNetwork } from "../api/assets";
import { displayText } from "./fieldValues";
import { changeBetween, chartFormFor, dayToTime, formatChange, formatDay, formatFor, formatValue, toChartInfo } from "./financialFormat";
import { SectionHeader } from "./SectionHeader";

// The chart library is large, and only this section needs it.
const FinancialChart = lazy(() => import("./FinancialChart").then((module) => ({ default: module.FinancialChart })));

/** Beyond this many, the smallest networks are folded into one row. */
const NETWORKS_SHOWN = 8;

/** Term text longer than this gets a row of its own. */
const LONG_TERM_CHARS = 80;

/** Shown large, in this order. Every other metric is listed under its group. */
const OVERVIEW_METRICS: readonly string[] = [
  "price_dollar",
  "net_asset_value_dollar",
  "total_asset_value_dollar",
  "apy_30_day",
  "holding_addresses_count",
];

export function hasFinancials(view: AssetFinancials | null): view is AssetFinancials {
  return view !== null && (view.financials.length > 0 || view.series.length > 0);
}

/** Whether a search should bring up this section, which is shown whole rather than filtered. */
export function financialsMatch(view: AssetFinancials, query: string): boolean {
  const labels = [
    "financials",
    ...[...view.financials, ...view.terms, ...view.series].map((item) => item.label),
    ...view.financials.map((row) => row.group),
  ];
  return labels.some((label) => label.toLowerCase().includes(query));
}

export function FinancialsSection({ slug, view }: { slug: string; view: AssetFinancials }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <SectionHeader title="Financials" collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      {!collapsed && <Content slug={slug} view={view} />}
    </section>
  );
}

function Content({ slug, view }: { slug: string; view: AssetFinancials }) {
  const overview = OVERVIEW_METRICS.flatMap((metric) => view.financials.filter((row) => row.metric === metric));
  const others = view.financials.filter((row) => !OVERVIEW_METRICS.includes(row.metric));
  const groups = [...new Set(others.map((row) => row.group))];
  const isLong = (term: FieldValue) => typeof term.value === "string" && term.value.length > LONG_TERM_CHARS;
  const charts = useMemo(() => view.series.map(toChartInfo), [view.series]);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {overview.length > 0 && <MetricGrid rows={overview} large />}
      {view.asOf && <p className="-mt-4 text-[11px] leading-4 text-muted-foreground">As of {formatDay(dayToTime(view.asOf))}</p>}

      {charts.length > 0 && (
        <Suspense fallback={<div className="h-[440px] rounded-xl border border-border" />}>
          <FinancialChart slug={slug} charts={charts} solanaOnlyNote={solanaOnlyNote(view.valueByNetwork)} />
        </Suspense>
      )}

      {groups.map((group) => (
        <Group key={group} title={group}>
          <MetricGrid rows={others.filter((row) => row.group === group)} />
        </Group>
      ))}

      {view.valueByNetwork.length > 1 && (
        <Group title="Value by network">
          <NetworkBars networks={view.valueByNetwork} />
        </Group>
      )}

      {view.terms.length > 0 && (
        <Group title="Terms and fees">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-8">
            {view.terms
              .filter((term) => !isLong(term))
              .map((term) => (
                <Cell key={term.key} label={term.label}>
                  <span className="text-sm leading-5 [overflow-wrap:anywhere]">{displayText(term.value)}</span>
                </Cell>
              ))}
            {view.terms.filter(isLong).map((term) => (
              <Cell key={term.key} label={term.label} wide>
                <span className="max-w-[760px] whitespace-pre-line text-sm leading-[22px]">{displayText(term.value)}</span>
              </Cell>
            ))}
          </div>
        </Group>
      )}
    </div>
  );
}

/** Nothing to say when Solana is the asset's only network: its history is then the whole story. */
function solanaOnlyNote(networks: FinancialNetwork[]): string | null {
  if (networks.length === 1 && networks[0].key === "solana") return null;
  return "Solana only. The numbers above cover all networks.";
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </div>
  );
}

function Cell({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 border-t border-border py-3 ${wide ? "col-span-full" : ""}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function MetricGrid({ rows, large }: { rows: FinancialMetric[]; large?: boolean }) {
  return (
    <div className={`grid gap-x-8 ${large ? "grid-cols-[repeat(auto-fit,minmax(150px,1fr))]" : "grid-cols-[repeat(auto-fill,minmax(150px,1fr))]"}`}>
      {rows.map((row) => {
        const format = formatFor(row.metric, row.unit);
        // A daily flow compared with one other day says nothing about its direction.
        const isFlow = chartFormFor(row.metric, row.unit) === "bar";
        const change = row.value30d === null || isFlow ? null : changeBetween(row.value30d, row.value, format);
        return (
          <Cell key={row.metric} label={row.scope === "solana" ? `${row.label} (Solana)` : row.label}>
            <span className={large ? "text-xl font-medium" : "text-sm leading-5"}>{formatValue(row.value, format)}</span>
            {change !== null && <span className="text-[11px] leading-4 text-muted-foreground">{formatChange(change, format)} in 30 days</span>}
          </Cell>
        );
      })}
    </div>
  );
}

const formatShare = (share: number) => (share < 0.01 ? "<0.01%" : `${share.toFixed(2)}%`);

function NetworkBars({ networks }: { networks: FinancialNetwork[] }) {
  // One row replaces at least two, so it never hides a single network behind "1 other".
  const folds = networks.length > NETWORKS_SHOWN + 1;
  const top = folds ? networks.slice(0, NETWORKS_SHOWN) : networks;
  const rest = folds ? networks.slice(NETWORKS_SHOWN) : [];
  const rows = [
    ...top,
    ...(rest.length > 0
      ? [
          {
            key: "other",
            name: `${rest.length} other networks`,
            value: rest.reduce((sum, network) => sum + network.value, 0),
            share: rest.reduce((sum, network) => sum + network.share, 0),
          },
        ]
      : []),
  ];
  const widest = Math.max(...rows.map((row) => row.share));

  return (
    <ul className="flex flex-col border-t border-border py-2">
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[minmax(90px,160px)_1fr_auto] items-center gap-x-4 py-1.5">
          <span className="truncate text-sm" title={row.name}>
            {row.name}
          </span>
          <span className="h-2 min-w-0" aria-hidden="true">
            <span
              className="block h-full min-w-px rounded-r bg-secondary"
              style={{ width: `${(row.share / widest) * 100}%` }}
            />
          </span>
          <span className="flex items-baseline justify-end gap-3 text-sm tabular-nums">
            <span>{formatValue(row.value, "dollar")}</span>
            <span className="w-14 text-right text-xs text-muted-foreground">{formatShare(row.share)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
