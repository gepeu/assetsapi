import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { getAssetPage, listAssets } from "../api/assets";
import { dollars, HISTORY_METRICS, price, toAssetPage, toListAsset, date as formatDate, percent } from "../api/toView";
import { type AssetPageData, type ChartSeries, type Points, RETURN_COLUMNS, VAULT_SLUG } from "../model";
import {
  Card,
  FactLine,
  Icon,
  LinkButton,
  BigValue,
  Logo,
  MockChart,
  PageFrame,
  type Range,
  RangeTabs,
  SectionTitle,
  TagPill,
  toneClass,
} from "../components/parts";
import { useAsync } from "../components/useAsync";
import { VaultPage } from "./VaultPage";

const GREEN = "#059669";
const BLUE = "#5381c4";
const GREY = "#6b6b6b";

async function loadPage(slug: string): Promise<AssetPageData | null> {
  const [page, list] = await Promise.all([getAssetPage(slug, HISTORY_METRICS, "1y"), listAssets()]);
  return page ? toAssetPage(page, list.map(toListAsset)) : null;
}

export function AssetPage() {
  const { slug = "" } = useParams();
  const state = useAsync(() => loadPage(slug), slug);
  if (slug === VAULT_SLUG) return <VaultPage />;
  if (state.status === "loading") return <p className="py-24 text-center text-sm text-muted-foreground">Loading…</p>;
  if (state.status === "error") return <p className="py-24 text-center text-sm text-muted-foreground">The asset couldn’t be loaded. Try again later.</p>;
  return state.data ? <AssetView key={slug} page={state.data} /> : <Navigate to="/assets" replace />;
}

function AssetView({ page }: { page: AssetPageData }) {
  const underlying = page.underlying && (page.underlying.rows.length > 0 || page.underlying.chart) ? page.underlying : null;
  return (
    <PageFrame panel={<BuyPanel page={page} />}>
      <div className="flex flex-col gap-10">
        <header className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <Logo name={page.logo ?? ""} size={50} label={page.ticker} />
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-[22px] font-medium">{page.name}</h1>
                <TagPill tag={page.tag} />
              </div>
              <p className="text-[16px] text-muted-foreground">{page.ticker}</p>
            </div>
          </div>
          {page.description && <p className="text-[16px] leading-6 text-sidebar-foreground">{page.description}</p>}
        </header>

        {page.overview.length > 0 && (
          <section>
            <SectionTitle>Overview</SectionTitle>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {page.overview.map((tile) => (
                <div key={tile.label} className="flex min-w-0 flex-col gap-3 rounded-xl bg-muted px-4 py-5">
                  <span className="flex items-center gap-2 whitespace-nowrap text-[15px] text-sidebar-foreground">
                    <Icon name={tile.icon} size={16} className="text-secondary" />
                    {tile.label}
                  </span>
                  <span className={`font-mono text-[22px] ${toneClass(tile.tone)}`}>{tile.value}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {page.growth && (
        <section>
          <SectionTitle>Growth</SectionTitle>
          <ChartCard series={page.growth} color={GREEN} format={dollars} />
        </section>
      )}

      {page.performance && (
        <section className={page.growth ? "-mt-4" : ""}>
          <SectionTitle>Performance</SectionTitle>
          <ChartCard series={page.performance} color={BLUE} format={price} />
        </section>
      )}

      {page.returns && <Returns page={page} />}
      {underlying && <Underlying underlying={underlying} />}
      {page.organization && <Organization page={page} />}
      {page.similar.length > 0 && <Similar page={page} />}
      {page.onchain && <Onchain page={page} />}
      {page.documents.length > 0 && <Documents page={page} />}
    </PageFrame>
  );
}

// ----- Charts -----

const RANGE_DAYS: Record<Range, number> = { "1M": 30, "3M": 91, "6M": 182, "1Y": 366 };

/** The points within `range` of the latest one. */
function within(points: Points, range: Range): Points {
  const last = Date.parse(points[points.length - 1][0]);
  const cutoff = last - RANGE_DAYS[range] * 86_400_000;
  return points.filter(([d]) => Date.parse(d) >= cutoff);
}

/** Lines on one shared scale, keeping only the dates every line has, with axis labels. */
function scale(lines: Points[], format: (v: number) => string) {
  const dates = lines.map((l) => new Set(l.map(([d]) => d)));
  const common = lines[0].map(([d]) => d).filter((d) => dates.every((set) => set.has(d)));
  const aligned = lines.map((l) => {
    const byDate = new Map(l);
    return common.map((d) => byDate.get(d)!);
  });
  const all = aligned.flat();
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (max === min) {
    max += Math.abs(max) * 0.01 || 1;
    min -= Math.abs(min) * 0.01 || 1;
  }
  const pad = (max - min) * 0.08;
  const lo = min - pad;
  const hi = max + pad;
  const ticks = 5;
  const yLabels = Array.from({ length: ticks }, (_, i) => format(hi - ((hi - lo) * i) / (ticks - 1)));
  const xLabels = Array.from({ length: ticks }, (_, i) => formatDate(common[Math.round(((common.length - 1) * i) / (ticks - 1))], false));
  return { values: aligned.map((l) => l.map((v) => (v - lo) / (hi - lo))), yLabels, xLabels, count: common.length };
}

function ChartCard({ series, color, format }: { series: ChartSeries; color: string; format: (v: number) => string }) {
  const [range, setRange] = useState<Range>("1M");
  const points = within(series.points, range);
  const first = points[0][1];
  const last = points[points.length - 1][1];
  const change = last - first;
  const chart = scale([points], format);
  return (
    <div className="flex flex-col gap-5 rounded-xl bg-muted p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[15.5px] text-sidebar-foreground">{series.label}</span>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className="text-[29px] font-medium tracking-tight">
              <BigValue value={format(last)} />
            </span>
            <span className={`font-mono text-[16px] ${toneClass(change < 0 ? "down" : "up")}`}>
              {change < 0 ? "\u2212" : "+"}
              {format(Math.abs(change))} ({percent(first === 0 ? 0 : (change / first) * 100)})
            </span>
          </div>
        </div>
        <RangeTabs value={range} onChange={setRange} />
      </div>
      {chart.count > 1 ? (
        <MockChart lines={[{ values: chart.values[0], color }]} yLabels={chart.yLabels} xLabels={chart.xLabels} />
      ) : (
        <p className="py-16 text-center text-sm text-muted-foreground">Not enough history for this range.</p>
      )}
      <p className="text-[13.5px] text-sidebar-foreground">
        Based on the asset’s realised historical performance. Past performance does not guarantee future results.
      </p>
    </div>
  );
}

function Returns({ page }: { page: AssetPageData }) {
  const returns = page.returns!;
  const columns = [...RETURN_COLUMNS, returns.lastColumn];
  return (
    <Card className="flex flex-col gap-5 p-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[20px] font-medium">Historical returns</h2>
        <p className="text-[15.5px] text-sidebar-foreground">Cumulative{returns.asOf ? `, as of ${returns.asOf}` : ""}</p>
      </div>
      <div className="overflow-x-auto rounded-xl bg-muted p-1">
        <table className="w-full min-w-[620px] border-separate border-spacing-y-1 text-[15px]">
          <thead>
            <tr className="text-[13.5px] text-sidebar-foreground">
              <th className="px-5 py-2 text-left font-normal" />
              {columns.map((c) => (
                <th key={c} className="px-3 py-2 text-right font-normal">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-background">
              <td className="rounded-l-lg px-5 py-3 text-sidebar-foreground">{page.ticker}</td>
              {returns.values.map((v, j) => (
                <td
                  key={columns[j]}
                  className={`px-3 py-3 text-right font-mono last:rounded-r-lg ${v === null ? "text-muted-foreground" : toneClass(v.startsWith("\u2212") ? "down" : "up")}`}
                >
                  {v ?? "–"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="border-t border-border pt-4 text-[13.5px] text-sidebar-foreground">{returns.note}</p>
    </Card>
  );
}

function Underlying({ underlying }: { underlying: NonNullable<AssetPageData["underlying"]> }) {
  const chart = underlying.chart && scale(underlying.chart.lines.map((l) => l.points), price);
  const colors = [BLUE, GREY];
  return (
    <section>
      <h2 className="text-[19px] font-medium">The underlying</h2>
      {underlying.intro && <p className="mt-2 text-[16px] leading-6 text-sidebar-foreground">{underlying.intro}</p>}
      <Card className="mt-4 px-5 py-3">
        {underlying.chart && chart && chart.count > 1 && (
          <div className="flex flex-col gap-4 pb-4 pt-3">
            <h3 className="text-[16px] font-medium">{underlying.chart.title}</h3>
            <MockChart
              lines={chart.values.map((values, i) => ({ values, color: colors[i], fill: i === 0 }))}
              yLabels={chart.yLabels}
              xLabels={chart.xLabels}
              height={240}
            />
            <div className="flex flex-wrap gap-5 text-[15px] font-medium">
              {underlying.chart.lines.map((line, i) => (
                <span key={line.label} className="flex items-center gap-2">
                  <svg width="18" height="8" viewBox="0 0 18 8" aria-hidden="true">
                    <line x1="0" y1="4" x2="18" y2="4" stroke={colors[i]} strokeWidth="1.5" />
                    <circle cx="9" cy="4" r="2.5" fill="white" stroke={colors[i]} strokeWidth="1.5" />
                  </svg>
                  {line.label}
                </span>
              ))}
            </div>
          </div>
        )}
        {underlying.rows.map((r) => (
          <FactLine key={r.label} label={r.label} value={r.value} />
        ))}
      </Card>
    </section>
  );
}

function Organization({ page }: { page: AssetPageData }) {
  const org = page.organization!;
  return (
    <section>
      <SectionTitle>Issuer</SectionTitle>
      <Card className="flex flex-col p-5">
        <div className="mb-3 flex items-start gap-4">
          <Logo name={org.logo ?? ""} size={50} label={org.name} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-[20px] font-medium">{org.name}</h3>
              {org.link && (
                <a
                  href={org.link.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex min-w-0 items-center gap-1.5 text-[15px] text-sidebar-foreground hover:text-foreground"
                >
                  <span className="truncate">{org.link.label}</span>
                  <Icon name="arrowUpRight" size={15} />
                </a>
              )}
            </div>
            {org.subtitle && <p className="text-[15.5px] leading-6 text-sidebar-foreground">{org.subtitle}</p>}
          </div>
        </div>
        {org.rows.map((r) => (
          <FactLine key={r.label} icon={r.icon} label={r.label} value={r.value} />
        ))}
        {org.buttons.length > 0 && (
          <div className="mt-2 flex flex-col gap-2.5">
            {org.buttons.map((b) => (
              <LinkButton key={b.label} href={b.href}>
                {b.label}
              </LinkButton>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}

function Similar({ page }: { page: AssetPageData }) {
  return (
    <section>
      <SectionTitle
        aside={
          <Link to="/assets" className="flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-[15.5px] hover:bg-muted">
            View more
            <Icon name="arrowUpRight" size={15} />
          </Link>
        }
      >
        Similar assets
      </SectionTitle>
      <div className="grid gap-5 md:grid-cols-3">
        {page.similar.map((s) => (
          <Link key={s.slug} to={`/assets/${s.slug}`} className="flex flex-col rounded-xl border border-border bg-background p-5 transition-colors hover:bg-muted">
            <div className="flex items-center gap-3 pb-5">
              <Logo name={s.logo ?? ""} size={44} label={s.ticker} />
              <div className="min-w-0">
                <p className="text-[18px] font-medium">{s.ticker}</p>
                <p className="truncate text-[14px] text-sidebar-foreground">{s.issuer}</p>
              </div>
            </div>
            {s.yield && (
              <div className="flex flex-col gap-1 pb-5">
                <p className="flex items-baseline gap-2.5">
                  <span className="font-mono text-[32px] font-medium">{s.yield.value}</span>
                  <span className="text-[16px] text-sidebar-foreground">Yield</span>
                </p>
                <p className={`text-[15px] ${toneClass(s.yield.tone)}`}>{s.yield.versus}</p>
              </div>
            )}
            <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
              <div className="flex flex-col gap-1">
                <span className="whitespace-nowrap text-[14px] text-sidebar-foreground">TVL on Solana</span>
                <span className="font-mono text-[16px] font-medium">{s.tvl}</span>
              </div>
              <TagPill tag={s.tag} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Onchain({ page }: { page: AssetPageData }) {
  const onchain = page.onchain!;
  const twoColumns = onchain.chains.length > 4;
  const cards = (onchain.token.length > 0 ? 1 : 0) + (onchain.activity.length > 0 ? 1 : 0);
  return (
    <section>
      <SectionTitle>Onchain transparency</SectionTitle>
      <div className="flex flex-col gap-5">
        {cards > 0 && (
          <div className={`grid gap-5 ${cards === 2 ? "md:grid-cols-2" : ""}`}>
            {onchain.token.length > 0 && (
              <Card className="px-5 pb-2 pt-5">
                <h3 className="mb-1 text-[17px] font-medium">Token</h3>
                {onchain.token.map((r) => (
                  <FactLine
                    key={r.label}
                    label={r.label}
                    value={
                      r.label === "Network" ? (
                        <span className="flex items-center gap-2">
                          <Logo name={r.value.toLowerCase()} size={24} label={r.value} />
                          {r.value}
                        </span>
                      ) : (
                        r.value
                      )
                    }
                  />
                ))}
                {onchain.explorer && (
                  <FactLine
                    label="Explorer"
                    value={
                      <a href={onchain.explorer.href} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 text-[14px] hover:underline">
                        {onchain.explorer.label}
                        <Icon name="arrowUpRight" size={15} className="text-muted-foreground" />
                      </a>
                    }
                  />
                )}
              </Card>
            )}
            {onchain.activity.length > 0 && (
              <Card className="px-5 pb-2 pt-5">
                <h3 className="text-[17px] font-medium">Activity</h3>
                {onchain.activityNote && <p className="mb-1 mt-1 text-[14px] text-sidebar-foreground">{onchain.activityNote}</p>}
                {onchain.activity.map((r) => (
                  <FactLine key={r.label} label={r.label} value={r.value} mono />
                ))}
              </Card>
            )}
          </div>
        )}
        {onchain.chains.length > 0 && (
          <Card className="p-5">
            <h3 className="text-[17px] font-medium">Chains</h3>
            <p className="mt-1.5 text-[15.5px] text-sidebar-foreground">Value per deployment.</p>
            <div
              className={`mt-3 grid grid-cols-[minmax(0,1fr)] gap-x-14 ${twoColumns ? "md:grid-flow-col md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""}`}
              style={twoColumns ? { gridTemplateRows: `repeat(${Math.ceil(onchain.chains.length / 2)}, auto)` } : undefined}
            >
              {onchain.chains.map((c) => (
                <div key={c.name} className="flex items-center justify-between gap-4 border-b border-dashed border-border py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Logo name={c.logo} size={twoColumns ? 38 : 30} label={c.name} />
                    <div className="min-w-0">
                      <p className="text-[15.5px]">{c.name}</p>
                      <p className="truncate text-[14px] text-sidebar-foreground">{c.detail}</p>
                    </div>
                  </div>
                  <span className="font-mono text-[15px] font-medium">{c.value}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </section>
  );
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function Documents({ page }: { page: AssetPageData }) {
  return (
    <section>
      <SectionTitle>Documents</SectionTitle>
      <div className="flex flex-col gap-1 rounded-xl bg-muted p-1">
        {page.documents.map((d) => (
          <a
            key={d.href}
            href={d.href}
            target="_blank"
            rel="noreferrer noopener"
            className="flex min-h-16 items-center gap-6 rounded-lg bg-background px-7 py-3 text-[15.5px] transition-colors hover:bg-canvas-hover"
          >
            <span className="w-28 shrink-0 text-sidebar-foreground">{d.kind}</span>
            <span className="min-w-0 flex-1 font-medium">{d.title}</span>
            <span className="hidden shrink-0 items-center gap-2 text-[14px] text-sidebar-foreground sm:flex">
              {hostOf(d.href)}
              <Icon name="arrowUpRight" size={15} />
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

// ----- Side panels -----

const fixed = (value: number, digits: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const PRESETS: [string, number][] = [
  ["$100", 100],
  ["$500", 500],
  ["$1K", 1000],
  ["$5k", 5000],
];
const BALANCE = 12438.2;

function BuyPanel({ page }: { page: AssetPageData }) {
  const [mode, setMode] = useState<"buy" | "multiply">("buy");
  if (!page.buy.multiply) {
    return (
      <div className="flex flex-col gap-5">
        <h2 className="text-[20px] font-medium">Buy {page.ticker}</h2>
        <BuyForm page={page} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 rounded-lg border border-border bg-background p-1">
        {(
          [
            ["buy", "Buy"],
            ["multiply", "Buy + Multiply"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={mode === key}
            onClick={() => setMode(key)}
            className={`h-9 cursor-pointer rounded-md text-[14.5px] ${mode === key ? "bg-muted text-foreground" : "text-sidebar-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "buy" ? <BuyForm page={page} /> : <MultiplyForm ticker={page.ticker} logoName={page.logo ?? ""} />}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[14px] font-medium">
      {children}
    </span>
  );
}

function AmountInput({ value, onChange, muted }: { value: string; onChange?: (v: string) => void; muted?: boolean }) {
  return (
    <input
      inputMode="decimal"
      value={value}
      readOnly={!onChange}
      onChange={(e) => onChange?.(e.target.value.replace(/[^\d.]/g, ""))}
      aria-label="Amount"
      className={`w-full min-w-0 bg-transparent font-mono text-[34px] font-medium outline-none ${muted ? "text-muted-foreground" : ""}`}
    />
  );
}

function BuyForm({ page }: { page: AssetPageData }) {
  const [amount, setAmount] = useState("100");
  const dollars = Number(amount) || 0;
  const { price: tokenPrice, yieldRate, minimum } = page.buy;
  const holding = tokenPrice === null ? `– ${page.ticker}` : `${fixed(dollars / tokenPrice, 4)} ${page.ticker}`;
  const rows: [string, string][] = [["Estimated holding", holding]];
  if (yieldRate !== null) rows.push(["Projected annual yield", `+$${fixed((dollars * yieldRate) / 100, 2)}`]);
  if (minimum) rows.push(["Min subscription", minimum]);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 rounded-xl bg-muted p-5">
        <div className="flex items-center justify-between">
          <span className="text-[15.5px] text-sidebar-foreground">You’re buying</span>
          <Chip>
            USD
            <Icon name="swapHorizontal" size={15} className="text-muted-foreground" />
          </Chip>
        </div>
        <div className="flex items-center justify-between gap-3">
          <AmountInput value={amount} onChange={setAmount} />
          <span className="shrink-0 text-[13.5px] text-sidebar-foreground">≈ {holding}</span>
        </div>
        <div className="flex justify-end">
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-1.5">
              {PRESETS.map(([label, v]) => (
                <button key={label} type="button" onClick={() => setAmount(String(v))} className="h-6 cursor-pointer rounded-md bg-background px-2 text-[13px] font-medium">
                  {label}
                </button>
              ))}
              <button type="button" onClick={() => setAmount(String(BALANCE))} className="h-6 cursor-pointer rounded-md bg-background px-2 text-[13px] font-medium">
                Max
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1 rounded-xl bg-muted p-5">
        <div className="flex items-center justify-between">
          <span className="text-[15.5px] text-sidebar-foreground">Pay with</span>
          <Chip>
            <Logo name="usdc" size={18} label="USDC" />
            USDC
            <Icon name="chevronDown" size={13} />
          </Chip>
        </div>
        <div className="flex items-center justify-between gap-3">
          <AmountInput value={fixed(dollars * 1.0001, 2)} />
          <span className="shrink-0 font-mono text-[13.5px] text-sidebar-foreground">≈ ${fixed(dollars * 1.0001, 2)}</span>
        </div>
        <span className="text-[13.5px] text-sidebar-foreground">Balance {fixed(BALANCE, 2)} USDC</span>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between text-[14px]">
            <span className="text-sidebar-foreground">{label}</span>
            <span className="font-mono">{value}</span>
          </div>
        ))}
      </div>

      <button type="button" className="h-12 cursor-pointer rounded-lg bg-[#222] text-[15.5px] font-medium text-white hover:bg-black">
        Buy ${fixed(dollars, dollars % 1 === 0 ? 0 : 2)} of {page.ticker}
      </button>
    </div>
  );
}

function MultiplyForm({ ticker, logoName }: { ticker: string; logoName: string }) {
  const [leverage, setLeverage] = useState(2.7);
  const min = 1.1;
  const max = 5.8;
  const share = ((leverage - min) / (max - min)) * 100;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1 rounded-xl bg-muted p-5">
        <div className="flex items-center justify-between">
          <span className="text-[15.5px] text-sidebar-foreground">Pay with</span>
          <Chip>
            <Logo name="usdc" size={18} label="USDC" />
            USDC
            <Icon name="chevronDown" size={13} />
          </Chip>
        </div>
        <div className="flex items-center justify-between gap-3">
          <AmountInput value="8,000" />
          <span className="flex shrink-0 items-center gap-1 font-mono text-[13.5px] text-sidebar-foreground">
            $7,999.25
            <Icon name="swapVertical" size={13} />
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[13.5px] text-sidebar-foreground">Available: 10,000 USDC</span>
          <div className="flex gap-1.5">
            <span className="rounded-md bg-background px-2 text-[13px] font-medium">Half</span>
            <span className="rounded-md bg-background px-2 text-[13px] font-medium">Max</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1 rounded-xl bg-muted p-5">
        <div className="flex items-center justify-between">
          <span className="text-[15.5px] text-sidebar-foreground">Buy &amp; Deposit</span>
          <Chip>
            <Logo name={logoName} size={18} label={ticker} />
            {ticker}
          </Chip>
        </div>
        <div className="flex items-center justify-between gap-3">
          <AmountInput value="6141.4144" />
          <span className="flex shrink-0 items-center gap-1 font-mono text-[13.5px] text-sidebar-foreground">
            $7,949.25
            <Icon name="swapVertical" size={13} />
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="text-[15.5px] text-sidebar-foreground">Borrow asset</span>
        <button type="button" className="flex h-12 cursor-pointer items-center justify-between rounded-xl bg-muted px-4 text-[15.5px]">
          <span className="flex items-center gap-2">
            <Logo name="usdc" size={20} label="USDC" />
            USDC
            <span className="text-muted-foreground">·</span>
            <span className="font-mono text-warning">6.00%</span>
          </span>
          <Icon name="chevronDown" size={15} />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[15.5px] text-sidebar-foreground">Leverage</span>
          <span className="inline-flex items-center gap-1 rounded bg-[#e8f6ef] px-1.5 py-0.5 font-mono text-[12.5px] text-success">
            <Icon name="shieldCheck" size={12} />
            47%
          </span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={0.1}
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          aria-label="Leverage"
          className="w-full accent-secondary"
          style={{ background: `linear-gradient(90deg, ${BLUE} ${share}%, #e5e5e5 ${share}%)`, height: 4, borderRadius: 4 }}
        />
        <div className="flex justify-between font-mono text-[13px]">
          <span className="text-sidebar-foreground">{min}x</span>
          <span>{leverage.toFixed(1)}x</span>
          <span className="text-sidebar-foreground">{max}x</span>
        </div>
      </div>

      <button type="button" className="h-12 cursor-pointer rounded-lg bg-[#222] text-[15.5px] font-medium text-white hover:bg-black">
        Review transaction
      </button>

      <div className="flex items-start justify-between rounded-xl bg-muted p-4">
        <div className="flex flex-col gap-1">
          <span className="text-[13.5px] text-sidebar-foreground">Projected net APY</span>
          <span className="font-mono text-[22px] font-medium text-success">15.02%</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[13.5px] text-sidebar-foreground">Est. annual yield</span>
          <span className="font-mono text-[15px] text-success">+$2,210.10</span>
        </div>
      </div>
    </div>
  );
}
