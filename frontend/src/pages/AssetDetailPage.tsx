import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getAsset, type AssetDetail } from "../api/assets";
import { useAsync } from "../components/useAsync";

export function AssetDetailPage() {
  const { slug = "" } = useParams();
  const state = useAsync(() => getAsset(slug), slug);

  if (state.status === "loading") return <Status>Loading asset…</Status>;
  if (state.status === "error") return <Status>Couldn't load this asset.</Status>;
  if (!state.data) {
    return (
      <Status>
        Asset not found.{" "}
        <Link to="/assets" className="text-secondary hover:underline">
          Back to all assets
        </Link>
      </Status>
    );
  }
  return <Detail asset={state.data} />;
}

function Status({ children }: { children: React.ReactNode }) {
  return <p className="py-16 text-center text-sm text-muted-foreground">{children}</p>;
}

function Detail({ asset }: { asset: AssetDetail }) {
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
        <span className="text-sm text-muted-foreground">{asset.issuer}</span>
      </header>

      <Description key={asset.slug} paragraphs={asset.description} />
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

function Description({ paragraphs }: { paragraphs: string[] | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!paragraphs) {
    return <p className="text-sm text-muted-foreground">No description available yet.</p>;
  }

  return (
    <div className="flex max-w-[760px] flex-col items-start gap-2 text-sm leading-[22px] text-muted-foreground">
      {expanded ? (
        paragraphs.map((p) => (
          <p key={p} className="whitespace-pre-line">
            {p}
          </p>
        ))
      ) : (
        <p className="line-clamp-2">{paragraphs.join(" ")}</p>
      )}
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
