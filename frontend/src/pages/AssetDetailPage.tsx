import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getAssetPage, type AssetPage } from "../api/assets";
import { AssetDataView } from "../components/AssetDataView";
import { DashboardView } from "../components/DashboardView";
import { InvestorView, OVERVIEW_HISTORY, OVERVIEW_RANGE } from "../components/InvestorView";
import { useAsync } from "../components/useAsync";

/** The overview answers an investor's questions. All data lists every field the asset has. */
const VIEWS = ["Overview", "Dashboard", "All data"] as const;

export function AssetDetailPage() {
  const { slug = "" } = useParams();
  const state = useAsync(() => getAssetPage(slug, OVERVIEW_HISTORY, OVERVIEW_RANGE), slug);

  if (state.status === "loading") return <Status>Loading asset…</Status>;
  if (state.status === "error") return <Status>Couldn't load this asset.</Status>;

  const asset = state.data;
  if (!asset) {
    return (
      <Status>
        Asset not found.{" "}
        <Link to="/assets" className="text-secondary hover:underline">
          Back to all assets
        </Link>
      </Status>
    );
  }
  return <Detail asset={asset} />;
}

function Status({ children }: { children: React.ReactNode }) {
  return <p className="py-16 text-center text-sm text-muted-foreground">{children}</p>;
}

function Detail({ asset }: { asset: AssetPage }) {
  const [view, setView] = useState<(typeof VIEWS)[number]>("Overview");

  return (
    <article className="flex w-full flex-col gap-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs">
        <Link to="/assets" className="text-muted-foreground hover:text-foreground">
          Assets
        </Link>
        <span className="text-muted-foreground" aria-hidden="true">
          /
        </span>
        <span className="font-medium">{asset.ticker}</span>
      </nav>

      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-[26px] font-medium leading-8 tracking-[-0.5px]">{asset.name}</h1>
        <span className="font-mono text-sm font-medium text-muted-foreground">{asset.ticker}</span>
        <Separator />
        <span className="text-sm">{asset.assetClass}</span>
        <Separator />
        <span className="text-sm text-muted-foreground">{asset.issuer ?? "Issuer not known"}</span>
      </header>

      <Description key={asset.slug} text={asset.description} />

      <div className="flex gap-1" role="group" aria-label="View">
        {VIEWS.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={view === name}
            onClick={() => setView(name)}
            className={`inline-flex h-7 cursor-pointer items-center whitespace-nowrap rounded-lg px-2.5 text-xs transition-colors hover:bg-canvas-hover ${
              view === name ? "bg-canvas font-medium" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {view === "Overview" ? (
        <InvestorView key={`overview-${asset.slug}`} asset={asset} />
      ) : view === "Dashboard" ? (
        <DashboardView key={`dashboard-${asset.slug}`} asset={asset} />
      ) : (
        <AssetDataView key={`data-${asset.slug}`} asset={asset} />
      )}
    </article>
  );
}

function Separator() {
  return (
    <span className="text-muted-foreground" aria-hidden="true">
      ·
    </span>
  );
}

function Description({ text }: { text: string | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!text) {
    return <p className="text-sm text-muted-foreground">No description available yet.</p>;
  }

  return (
    <div className="flex max-w-[760px] flex-col items-start gap-2 text-sm leading-[22px] text-muted-foreground">
      <p className={expanded ? "whitespace-pre-line" : "line-clamp-2"}>{text}</p>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
        className="cursor-pointer font-medium text-secondary hover:underline"
      >
        {expanded ? "Show less" : "Read more"}
      </button>
    </div>
  );
}
