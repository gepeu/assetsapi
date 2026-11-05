import { lazy, Suspense, useMemo } from "react";
import type { AssetPage, FinancialRange } from "../api/assets";
import { dayToTime, formatDay, toChartInfo } from "./financialFormat";
import { Cell } from "./FinancialsSection";
import { factGroups, keyFigures, returnPeriods, signedPercent, type FactGroup, type ReturnPeriod } from "./investorFacts";

// The chart library is large, and only the chart needs it.
const FinancialChart = lazy(() => import("./FinancialChart").then((module) => ({ default: module.FinancialChart })));

/** The price, or the NAV for an asset with no price history. The page fetches both up front. */
export const OVERVIEW_HISTORY: readonly string[] = ["price_dollar", "net_asset_value_dollar"];
export const OVERVIEW_RANGE: FinancialRange = "1y";

/** One asset as an investor reads it: key figures, performance, then the facts behind each question. */
export function InvestorView({ asset }: { asset: AssetPage }) {
  const financials = asset;
  const figures = useMemo(() => keyFigures(financials), [financials]);
  const groups = useMemo(() => factGroups(asset, financials), [asset, financials]);
  const periods = useMemo(() => {
    const inception = asset.fields.categories.flatMap((category) => category.fields).find((field) => field.key === "identity.inception_date");
    return returnPeriods(financials, typeof inception?.value === "string" ? inception.value : null);
  }, [asset, financials]);
  const chart = useMemo(() => {
    const metric = OVERVIEW_HISTORY.find((name) => asset.history.some((history) => history.metric === name && history.points.length > 0));
    const series = asset.series.find((candidate) => candidate.metric === metric);
    return series ? toChartInfo(series) : null;
  }, [asset]);

  if (figures.length === 0 && groups.length === 0 && !chart) {
    return <p className="py-12 text-center text-sm text-muted-foreground">No data available for this asset yet.</p>;
  }

  return (
    <div className="flex min-w-0 max-w-[960px] flex-col gap-10">
      {figures.length > 0 && (
        <section aria-label="Key figures" className="flex flex-col gap-2">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-8">
            {figures.map((figure) => (
              <Cell key={figure.label} label={figure.label}>
                <span className="text-xl font-medium">{figure.value}</span>
              </Cell>
            ))}
          </div>
          {financials?.asOf && <p className="text-[11px] leading-4 text-muted-foreground">As of {formatDay(dayToTime(financials.asOf))}</p>}
        </section>
      )}

      {chart && (
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="text-lg font-medium">{chart.label} history</h2>
          <Suspense fallback={<div className="h-[440px] rounded-xl border border-border" />}>
            <FinancialChart
              slug={asset.slug}
              charts={[chart]}
              solanaOnlyNote={null}
              initialRange={OVERVIEW_RANGE}
              preloaded={asset.history}
            />
          </Suspense>
        </section>
      )}

      {periods.length > 0 && <Returns periods={periods} />}

      {groups.length > 0 && (
        <div className="flex flex-col border-b border-border">
          {groups.map((group) => (
            <Facts key={group.name} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}

function Returns({ periods }: { periods: ReturnPeriod[] }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="text-lg font-medium">Returns</h2>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-muted">
              <th scope="col" className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                <span className="sr-only">Return</span>
              </th>
              {periods.map((period) => (
                <th key={period.label} scope="col" className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">
                  {period.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <ReturnRow label="Cumulative" periods={periods} value={(period) => period.cumulative} />
            {periods.some((period) => period.averageMonthly !== null) && (
              <ReturnRow label="Average monthly" periods={periods} value={(period) => period.averageMonthly} />
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReturnRow({ label, periods, value }: { label: string; periods: ReturnPeriod[]; value: (period: ReturnPeriod) => number | null }) {
  return (
    <tr className="border-t border-border">
      <th scope="row" className="whitespace-nowrap px-3 py-2.5 text-sm font-medium">
        {label}
      </th>
      {periods.map((period) => {
        const shown = value(period);
        return (
          <td
            key={period.label}
            className={`whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums ${
              shown === null ? "text-muted-foreground" : shown > 0 ? "text-success" : ""
            }`}
          >
            {shown === null ? "–" : signedPercent(shown)}
          </td>
        );
      })}
    </tr>
  );
}

function Facts({ group }: { group: FactGroup }) {
  return (
    <section className="grid gap-x-8 gap-y-1 border-t border-border py-5 md:grid-cols-[160px_minmax(0,1fr)]">
      <h2 className="text-lg font-medium md:pt-1">{group.name}</h2>
      <dl className="flex min-w-0 flex-col">
        {group.facts.map((fact, index) => (
          <div
            key={fact.label}
            className={`grid grid-cols-[minmax(110px,220px)_minmax(0,1fr)] gap-x-6 py-2.5 ${index > 0 ? "border-t border-border" : ""}`}
          >
            <dt className="text-sm leading-5 text-muted-foreground">{fact.label}</dt>
            <dd className="text-sm leading-5 [overflow-wrap:anywhere]">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
