import { useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getFinancialHistory, type FinancialRange } from "../api/assets";
import { changeBetween, dayToTime, formatChange, formatDay, formatValue, timeAxis, valueAxis, type ChartInfo } from "./financialFormat";
import { useAsync } from "./useAsync";

const RANGES: { value: FinancialRange; label: string }[] = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "3m", label: "3M" },
  { value: "1y", label: "1Y" },
  { value: "all", label: "All" },
];

const SERIES = "var(--color-secondary)";
const SURFACE = "var(--color-background)";
const HAIRLINE = "var(--color-border)";
const AXIS_TEXT = { fontSize: 11, fill: "var(--color-muted-foreground)" };
const PLOT_HEIGHT = 280;

/** Rounded bar ends only read as such once bars are wide enough to show them. */
const ROUNDED_BARS_UP_TO = 45;

interface Shown {
  chart: ChartInfo;
  points: [string, number][];
}

export function FinancialChart({
  slug,
  charts,
  solanaOnlyNote,
}: {
  slug: string;
  charts: ChartInfo[];
  /** Shown beside history that covers only the Solana token of an asset on other networks too. */
  solanaOnlyNote: string | null;
}) {
  const [measure, setMeasure] = useState(charts[0].measure);
  const [range, setRange] = useState<FinancialRange>("3m");
  const [asTable, setAsTable] = useState(false);
  const selected = charts.find((chart) => chart.measure === measure) ?? charts[0];
  const groups = [...new Set(charts.map((chart) => chart.group))];

  const state = useAsync(() => getFinancialHistory(slug, selected.measure, range), `${selected.measure}|${range}`);

  // The last good render stays up, dimmed, while the next one loads.
  const [shown, setShown] = useState<Shown | null>(null);
  useEffect(() => {
    if (state.status === "ready") setShown({ chart: selected, points: state.data?.points ?? [] });
    // `selected` only changes along with the request that produced `state`.
  }, [state]);

  const loading = state.status === "loading";
  const failed = state.status === "error";

  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-border p-4">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Chart group">
        {groups.map((group) => (
          <Choice
            key={group}
            active={selected.group === group}
            onClick={() => setMeasure(charts.find((chart) => chart.group === group)!.measure)}
          >
            {group}
          </Choice>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-3">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Metric">
          {charts
            .filter((chart) => chart.group === selected.group)
            .map((chart) => (
              <Choice key={chart.measure} active={chart.measure === selected.measure} onClick={() => setMeasure(chart.measure)}>
                {chart.label}
              </Choice>
            ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <div className="flex gap-1" role="group" aria-label="Date range">
            {RANGES.map((option) => (
              <Choice key={option.value} active={option.value === range} onClick={() => setRange(option.value)}>
                {option.label}
              </Choice>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={asTable}
            onClick={() => setAsTable((table) => !table)}
            className="ml-2 inline-flex h-7 cursor-pointer items-center rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-canvas-hover hover:text-foreground"
          >
            {asTable ? "Chart" : "Table"}
          </button>
        </div>
      </div>

      {failed && <p className="py-16 text-center text-sm text-muted-foreground">Couldn't load this chart.</p>}
      {!failed && shown === null && <div style={{ height: PLOT_HEIGHT + 56 }} />}
      {!failed && shown !== null && (
        <div aria-busy={loading} className={`flex min-w-0 flex-col gap-3 transition-opacity ${loading ? "opacity-50" : ""}`}>
          {shown.points.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">No history for this metric.</p>
          ) : (
            <>
              <Headline shown={shown} note={shown.chart.scope === "solana" ? solanaOnlyNote : null} />
              {asTable ? <HistoryTable shown={shown} /> : <Plot shown={shown} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-7 cursor-pointer items-center whitespace-nowrap rounded-lg px-2.5 text-xs transition-colors hover:bg-canvas-hover ${
        active ? "bg-canvas font-medium" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Headline({ shown, note }: { shown: Shown; note: string | null }) {
  const { chart, points } = shown;
  const first = points[0];
  const last = points[points.length - 1];
  // A daily flow's first and last days say nothing about its direction.
  const change = chart.form !== "bar" && points.length > 1 ? changeBetween(first[1], last[1], chart.format) : null;

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{chart.label}</span>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-xl font-medium">{formatValue(last[1], chart.format)}</span>
        {change !== null && (
          <span className="text-xs text-muted-foreground">
            {formatChange(change, chart.format)} since {formatDay(dayToTime(first[0]))}
          </span>
        )}
      </div>
      <span className="text-[11px] leading-4 text-muted-foreground">
        {formatDay(dayToTime(last[0]))}
        {note ? ` · ${note}` : ""}
      </span>
    </div>
  );
}

function Plot({ shown }: { shown: Shown }) {
  const { chart, points } = shown;
  const data = useMemo(() => points.map(([day, value]) => ({ time: dayToTime(day), value })), [points]);
  const y = useMemo(
    () =>
      valueAxis(
        data.map((point) => point.value),
        chart.format,
        chart.form !== "line",
      ),
    [data, chart],
  );
  const first = data[0].time;
  const last = data[data.length - 1];
  const x = useMemo(() => timeAxis(first, last.time), [first, last.time]);

  return (
    <div style={{ height: PLOT_HEIGHT }} role="img" aria-label={`${chart.label} over time. Use the Table button to read the values.`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barGap={0}>
          <CartesianGrid vertical={false} stroke={HAIRLINE} />
          <XAxis
            dataKey="time"
            type="number"
            domain={[first, last.time]}
            ticks={x.ticks}
            tickFormatter={x.label}
            tick={AXIS_TEXT}
            axisLine={{ stroke: HAIRLINE }}
            tickLine={false}
            minTickGap={32}
            padding={chart.form === "bar" ? { left: 8, right: 8 } : undefined}
          />
          <YAxis
            type="number"
            domain={y.domain}
            ticks={y.ticks}
            tickFormatter={y.label}
            tick={AXIS_TEXT}
            axisLine={false}
            tickLine={false}
            width={68}
            allowDataOverflow
          />
          <Tooltip
            isAnimationActive={false}
            cursor={chart.form === "bar" ? { fill: "var(--color-canvas)" } : { stroke: "var(--color-muted-foreground)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as { time: number; value: number } | undefined;
              if (!active || !point) return null;
              return (
                <div className="flex flex-col rounded-lg border border-border bg-background px-3 py-2">
                  <span className="text-sm font-medium">{formatValue(point.value, chart.format)}</span>
                  <span className="text-[11px] leading-4 text-muted-foreground">{formatDay(point.time)}</span>
                </div>
              );
            }}
          />
          {chart.form === "area" && (
            <Area
              dataKey="value"
              stroke={SERIES}
              strokeWidth={2}
              fill={SERIES}
              fillOpacity={0.1}
              dot={false}
              activeDot={{ r: 4, fill: SERIES, stroke: SURFACE, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          )}
          {chart.form === "line" && (
            <Line
              dataKey="value"
              stroke={SERIES}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: SERIES, stroke: SURFACE, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          )}
          {chart.form === "bar" && (
            <Bar
              dataKey="value"
              fill={SERIES}
              maxBarSize={24}
              radius={data.length <= ROUNDED_BARS_UP_TO ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            />
          )}
          {chart.form !== "bar" && <ReferenceDot x={last.time} y={last.value} r={4} fill={SERIES} stroke={SURFACE} strokeWidth={2} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function HistoryTable({ shown }: { shown: Shown }) {
  const { chart, points } = shown;
  const newestFirst = useMemo(() => [...points].reverse(), [points]);

  return (
    <div className="overflow-y-auto rounded-lg border border-border" style={{ maxHeight: PLOT_HEIGHT }}>
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0">
          <tr className="bg-muted">
            <th scope="col" className="px-3 py-2 text-xs font-medium text-muted-foreground">
              Date
            </th>
            <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
              {chart.label}
            </th>
          </tr>
        </thead>
        <tbody>
          {newestFirst.map(([day, value]) => (
            <tr key={day} className="border-t border-border">
              <td className="px-3 py-2 text-sm">{formatDay(dayToTime(day))}</td>
              <td className="px-3 py-2 text-right text-sm tabular-nums">{formatValue(value, chart.format)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
