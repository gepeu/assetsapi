import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listAssets, type AssetListItem } from "../api/assets";
import { useAsync } from "../components/useAsync";

const COLUMNS = {
  asset: "w-2/5 min-w-0",
  issuer: "w-[35%] min-w-0",
  assetClass: "w-1/4 min-w-0",
};

export function AssetsPage() {
  const state = useAsync(listAssets, "assets");

  if (state.status === "loading") return <Status>Loading assets…</Status>;
  if (state.status === "error") return <Status>Couldn't load assets.</Status>;
  return <Catalog assets={state.data} />;
}

function Status({ children }: { children: string }) {
  return <p className="py-16 text-center text-sm text-muted-foreground">{children}</p>;
}

function Catalog({ assets }: { assets: AssetListItem[] }) {
  const [query, setQuery] = useState("");
  const [assetClass, setAssetClass] = useState<string | null>(null);

  const assetClasses = useMemo(() => [...new Set(assets.map((a) => a.assetClass))].sort(), [assets]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets
      .filter(
        (a) =>
          (!assetClass || a.assetClass === assetClass) &&
          (!q || [a.ticker, a.name, a.issuer ?? ""].some((s) => s.toLowerCase().includes(q))),
      )
      .sort((a, b) => a.ticker.localeCompare(b.ticker, undefined, { sensitivity: "base" }));
  }, [assets, query, assetClass]);

  return (
    <div className="flex w-full flex-col gap-10">
      <Summary />

      <section className="flex w-full flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-medium">Explore Assets</h2>
          <p className="text-xs text-muted-foreground">
            {visible.length} of {assets.length} assets
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex h-8 min-w-[240px] max-w-[320px] flex-1 items-center gap-2 rounded-lg bg-muted px-3">
            <svg className="shrink-0 text-muted-foreground opacity-60" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ticker, name, issuer…"
              aria-label="Search assets"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div className="hidden h-5 w-px shrink-0 bg-border md:block" />
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip active={assetClass === null} onClick={() => setAssetClass(null)}>
              All
            </FilterChip>
            {assetClasses.map((c) => (
              <FilterChip key={c} active={assetClass === c} onClick={() => setAssetClass(c)}>
                {c}
              </FilterChip>
            ))}
          </div>
        </div>

        <div className="w-full overflow-x-auto rounded-xl bg-card">
          <div className="min-w-[560px]">
            <div className="flex h-10 items-center bg-muted px-1 text-xs font-medium text-muted-foreground">
              <div className={`${COLUMNS.asset} px-3`}>Asset</div>
              <div className={`${COLUMNS.issuer} px-3`}>Issuer</div>
              <div className={`${COLUMNS.assetClass} px-3`}>Asset class</div>
            </div>

            {visible.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                No assets match your search.
              </p>
            ) : (
              <ul className="flex flex-col gap-1 p-1">
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
    </div>
  );
}

function Summary() {
  return (
    <div className="flex w-full flex-col items-start gap-2">
      <h1 className="text-[30px] font-medium leading-9 tracking-[-0.6px]">Tokenized Assets</h1>
      <p className="text-sm text-muted-foreground">
        Explore a wide range of tokenized assets — real-world and crypto-native
      </p>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  const look = active
    ? "border-foreground bg-foreground text-primary-foreground"
    : "border-border bg-white text-muted-foreground hover:bg-canvas-hover hover:text-foreground";
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-7 cursor-pointer items-center whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium transition-colors ${look}`}
    >
      {children}
    </button>
  );
}

function AssetRow({ asset }: { asset: AssetListItem }) {
  return (
    <Link
      to={`/assets/${asset.slug}`}
      aria-label={`View ${asset.name} (${asset.ticker})`}
      className="flex h-16 items-center rounded-lg bg-background py-2 text-sm transition-colors hover:bg-canvas-hover"
    >
      <div className={`${COLUMNS.asset} px-3`}>
        <p className="truncate font-medium">{asset.ticker}</p>
        <p className="truncate text-muted-foreground">{asset.name}</p>
      </div>
      <p className={`${COLUMNS.issuer} truncate px-3`}>{asset.issuer}</p>
      <p className={`${COLUMNS.assetClass} truncate px-3`}>{asset.assetClass}</p>
    </Link>
  );
}
