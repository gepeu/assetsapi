import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listAssets } from "../api/assets";
import { toListAsset } from "../api/toView";
import { CLASS_TABS, type ClassKey, type ListAsset, MORE_CATEGORIES } from "../model";
import { Icon, Logo, useDismiss } from "../components/parts";
import { useAsync } from "../components/useAsync";

/** Largest on Solana first. */
async function loadAssets(): Promise<ListAsset[]> {
  return (await listAssets()).map(toListAsset).sort((a, b) => (b.tvlValue ?? -1) - (a.tvlValue ?? -1));
}

const GRID = "grid grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_minmax(0,1.05fr)_80px_90px_110px] items-center gap-4";

type Selection = { kind: "all" } | { kind: "class"; key: ClassKey } | { kind: "category"; key: string };

export function AssetsPage() {
  return (
    <div className="flex w-full flex-col gap-16">
      <Hero />
      <Explorer />
    </div>
  );
}

function Hero() {
  return (
    <section
      className="relative isolate flex min-h-[300px] w-full flex-col justify-between overflow-hidden rounded-2xl p-6 text-white md:min-h-[368px] md:p-10"
      style={{
        background:
          "radial-gradient(110% 130% at 0% 100%, #141414 0%, #1b2534 38%, rgba(27,37,52,0) 72%), linear-gradient(180deg, #d2e3f6 0%, #8fb2dd 28%, #4a78b2 62%, #3a679f 100%)",
      }}
    >
      <h1 className="text-5xl font-medium tracking-[-1.5px] md:text-[64px]">Assets</h1>
      <div className="flex flex-col gap-6">
        <p className="max-w-[460px] text-[15px] leading-6 md:text-base">
          Explore crypto, equities, fixed income and commodities.
          <br />
          Compare assets and invest directly on Kamino.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg bg-white px-5 text-[15px] font-medium text-foreground">
            <Icon name="wallet" size={16} />
            Connect wallet
          </button>
          <button type="button" className="h-11 cursor-pointer rounded-lg px-5 text-[15px] font-medium text-white hover:bg-white/10">
            See how it works
          </button>
        </div>
      </div>
      <HeroArt />
    </section>
  );
}

/** Line art after the Figma banner: an axis through a dot, with nested loops on either side. */
function HeroArt() {
  const loops = [0, 1, 2, 3];
  return (
    <svg
      className="pointer-events-none absolute right-[10%] top-1/2 -z-10 hidden h-[240px] w-[240px] -translate-y-1/2 sm:block"
      viewBox="-120 -120 240 240"
      fill="none"
      stroke="white"
      strokeWidth="1.2"
      aria-hidden="true"
    >
      <line x1="-112" y1="112" x2="112" y2="-112" />
      <g transform="rotate(45)">
        {loops.map((i) => (
          <g key={i} transform={`rotate(${(i - 1.5) * 6})`}>
            <ellipse cx={40 + i * 6} cy="0" rx={40 + i * 6} ry={24 + i * 8} />
            <ellipse cx={-(40 + i * 6)} cy="0" rx={40 + i * 6} ry={24 + i * 8} />
          </g>
        ))}
      </g>
      <circle cx="0" cy="0" r="9" fill="white" stroke="none" />
    </svg>
  );
}

function matches(asset: ListAsset, selection: Selection): boolean {
  if (selection.kind === "class") return asset.classKey === selection.key;
  if (selection.kind === "category") return asset.categories.includes(selection.key);
  return true;
}

function Explorer() {
  const [selection, setSelection] = useState<Selection>({ kind: "all" });
  const [query, setQuery] = useState("");
  const assets = useAsync(loadAssets, "assets");

  const visible = useMemo(() => {
    if (assets.status !== "ready") return [];
    const q = query.trim().toLowerCase();
    return assets.data.filter(
      (a) => matches(a, selection) && (!q || [a.ticker, a.name, a.issuer ?? ""].some((s) => s.toLowerCase().includes(q))),
    );
  }, [assets, selection, query]);

  return (
    <section className="flex w-full flex-col gap-7">
      <div className="flex flex-col gap-2.5">
        <h2 className="text-[22px] font-medium">Explore assets</h2>
        <p className="text-[17px] text-muted-foreground">Browse assets by class and refine your selection by subcategory.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <Tab active={selection.kind === "all"} onClick={() => setSelection({ kind: "all" })} icon="grid">
            All assets
          </Tab>
          {CLASS_TABS.map((tab) => (
            <Tab
              key={tab.key}
              active={selection.kind === "class" && selection.key === tab.key}
              onClick={() => setSelection({ kind: "class", key: tab.key })}
              icon={tab.icon}
            >
              {tab.label}
            </Tab>
          ))}
          <MoreCategories
            selected={selection.kind === "category" ? selection.key : null}
            onChoose={(key) => setSelection({ kind: "category", key })}
          />
        </div>
        <div className="flex min-w-[220px] flex-1 items-center justify-end gap-2">
          <label className="flex h-10 min-w-0 max-w-[240px] flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3">
            <Icon name="search" size={15} className="text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search assets..."
              aria-label="Search assets"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            />
          </label>
          <button type="button" className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3.5 text-sm font-medium">
            <Icon name="filter" size={15} />
            Filters
          </button>
        </div>
      </div>

      <div className="w-full overflow-x-auto rounded-xl bg-card">
        <div className="min-w-[900px] p-1">
          <div className={`${GRID} h-12 px-5 text-[14px] text-muted-foreground`}>
            <span>Asset</span>
            <span>Asset class</span>
            <span>Issuer</span>
            <span className="text-right">Yield</span>
            <span className="text-right">YoY</span>
            <span className="text-right">TVL on Solana</span>
          </div>
          {assets.status !== "ready" ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {assets.status === "loading" ? "Loading assets…" : "The assets couldn’t be loaded. Try again later."}
            </p>
          ) : visible.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">No assets match.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {visible.map((asset) => (
                <li key={asset.slug}>
                  <AssetRow asset={asset} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function AssetRow({ asset }: { asset: ListAsset }) {
  const yoyTone = asset.yoy?.startsWith("+") ? "text-success" : asset.yoy?.startsWith("−") ? "text-warning" : "";
  const cells = (
    <>
      <div className="flex min-w-0 items-center gap-4">
        <Logo name={asset.logo ?? ""} size={40} label={asset.ticker} />
        <div className="min-w-0">
          <p className="truncate text-[16px] font-medium">{asset.ticker}</p>
          <p className="truncate text-[14px] text-muted-foreground">{asset.name}</p>
        </div>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[16px] font-medium">{asset.className}</p>
        <p className="truncate text-[15.5px] text-muted-foreground">{asset.subclass}</p>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        {asset.issuer && <Logo name={asset.issuerLogo ?? ""} size={20} label={asset.issuer} />}
        <span className="truncate text-[16px] font-medium">{asset.issuer ?? "–"}</span>
      </div>
      <Figure value={asset.yield} />
      <Figure value={asset.yoy} tone={yoyTone} />
      <Figure value={asset.tvl} strong />
    </>
  );
  const look = `${GRID} min-h-[80px] rounded-lg bg-background px-5 py-3`;
  return (
    <Link to={`/assets/${asset.slug}`} aria-label={`View ${asset.name}`} className={`${look} transition-colors hover:bg-canvas-hover`}>
      {cells}
    </Link>
  );
}

function Figure({ value, tone = "", strong }: { value: string | null; tone?: string; strong?: boolean }) {
  return (
    <span className={`text-right font-mono text-[15px] ${strong ? "font-medium" : ""} ${value === null ? "text-muted-foreground" : tone}`}>
      {value ?? "–"}
    </span>
  );
}

function Tab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: string; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg px-3 text-[15px] transition-colors ${
        active ? "bg-[#edf2fa] text-secondary" : "text-sidebar-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <Icon name={icon} size={17} />
      {children}
    </button>
  );
}

function MoreCategories({ selected, onChoose }: { selected: string | null; onChoose: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, setOpen);
  const chosen = MORE_CATEGORIES.find((c) => c.key === selected) ?? null;
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex h-10 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border-2 px-3 text-[15px] transition-colors ${
          chosen
            ? "border-transparent bg-[#edf2fa] text-secondary"
            : open
              ? "border-border text-foreground"
              : "border-transparent text-sidebar-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        {chosen && <Icon name={chosen.icon} size={17} />}
        {chosen?.label ?? (open ? "More categories" : "More")}
        <Icon name={open ? "chevronUp" : "chevronDown"} size={14} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-20 mt-2 flex min-w-[260px] flex-col rounded-xl border border-border bg-background p-2 shadow-lg">
          {MORE_CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              role="menuitemradio"
              aria-checked={c.key === selected}
              onClick={() => {
                onChoose(c.key);
                setOpen(false);
              }}
              className={`flex h-10 cursor-pointer items-center gap-3 whitespace-nowrap rounded-lg px-3 text-left text-[16px] hover:bg-muted ${
                c.key === selected ? "text-secondary" : "text-foreground"
              }`}
            >
              <Icon name={c.icon} size={17} className="text-sidebar-foreground" />
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
