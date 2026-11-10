import { Link, Outlet, useMatch } from "react-router-dom";
import { listAssets, PRIMARY_SOURCE } from "../api/assets";
import { VAULT_SLUG } from "../model";
import { Icon } from "./parts";
import { useAsync } from "./useAsync";

const NAV = [
  { label: "Portfolio", icon: "portfolio" },
  { label: "Swap", icon: "swap" },
  { label: "Earn", icon: "earn" },
  { label: "Borrow", icon: "borrow" },
  { label: "Multiply", icon: "layers" },
];

/** Breadcrumb names for pages that aren't in the asset data. */
const OTHER_PAGES: Record<string, string> = { [VAULT_SLUG]: "kicUSDC" };

export function Layout() {
  const match = useMatch("/assets/:slug");
  const slug = match?.params.slug;
  const assets = useAsync(listAssets, "assets");
  const listed = assets.status === "ready" ? assets.data.find((a) => a.slug === slug)?.ticker : undefined;
  const crumb = slug ? (OTHER_PAGES[slug] ?? listed ?? "") : null;

  return (
    <div className="flex min-h-screen w-full bg-canvas">
      <aside className="sticky top-0 hidden h-screen w-[100px] shrink-0 flex-col items-center justify-between py-6 md:flex">
        <Link to="/assets" aria-label="Kamino" className="text-foreground">
          <KaminoMark />
        </Link>
        <nav aria-label="Primary" className="flex w-full flex-col items-center gap-2 px-2">
          {NAV.map((item) => (
            <span
              key={item.label}
              className="flex h-[66px] w-full cursor-default flex-col items-center justify-center gap-1.5 text-[13px] text-sidebar-foreground"
            >
              <Icon name={item.icon} size={17} />
              {item.label}
            </span>
          ))}
          <Link
            to="/assets"
            className="flex h-[66px] w-full flex-col items-center justify-center gap-1.5 text-[13px] font-medium text-foreground"
          >
            <Icon name="assets" size={17} />
            Assets
          </Link>
        </nav>
        <div className="flex flex-col items-center gap-6 text-sidebar-foreground">
          <Icon name="megaphone" size={17} />
          <Icon name="sun" size={17} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:py-2 md:pr-2">
        <div className="flex w-full min-w-0 flex-1 flex-col bg-background md:rounded-2xl">
          <header className="flex h-[76px] items-center gap-4 px-4 md:px-9">
            <div className="flex min-w-0 flex-1 items-center gap-3 text-[15px]">
              {crumb !== null && (
                <>
                  <Link to="/assets" className="text-muted-foreground hover:text-foreground">
                    Assets
                  </Link>
                  <Icon name="chevronDown" size={14} className="-rotate-90 text-muted-foreground" />
                  <span className="truncate">{crumb}</span>
                </>
              )}
            </div>
            <label className="hidden h-11 w-[400px] shrink-0 items-center gap-2.5 rounded-xl bg-muted px-4 lg:flex">
              <Icon name="search" size={16} className="text-muted-foreground" />
              <input
                type="search"
                placeholder="Search for vaults, stables and more.."
                aria-label="Search"
                className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
              />
              <span className="text-sm text-muted-foreground">/</span>
            </label>
            <div className="flex flex-1 items-center justify-end gap-2">
              {crumb !== null ? (
                <>
                  <button type="button" aria-label="Notifications" className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-border">
                    <Icon name="bell" size={17} />
                  </button>
                  <button type="button" className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-[15px] font-medium">
                    <span className="h-5 w-5 rounded-full bg-gradient-to-br from-[#a78bfa] to-[#6d4ce0]" />
                    0xaf1a...57d2
                    <Icon name="chevronDown" size={14} />
                  </button>
                </>
              ) : (
                <button type="button" className="h-10 cursor-pointer rounded-lg border border-border px-4 text-[15px] font-medium">
                  Connect Wallet
                </button>
              )}
            </div>
          </header>
          <main className="w-full flex-1 px-4 pb-24 pt-6 md:px-8 lg:px-[72px]">
            <Outlet />
          </main>
          <footer className="border-t border-border px-4 py-3 text-center text-xs text-muted-foreground md:px-8">
            Data obtained from {PRIMARY_SOURCE}
          </footer>
        </div>
      </div>
    </div>
  );
}

/** The Kamino "k" mark, drawn after the Figma's top-left logo. */
function KaminoMark() {
  return (
    <svg width="24" height="30" viewBox="0 0 24 30" fill="currentColor" aria-hidden="true">
      <rect x="0" y="0" width="5" height="30" rx="1" />
      <path d="M22 4c-6 1.5-11 6-11.5 11S15 26 22 26v-4.5c-4.5-.5-7-3-7-6.5s3-7 7-8z" />
    </svg>
  );
}
