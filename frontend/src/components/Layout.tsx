import { Link, NavLink, Outlet } from "react-router-dom";
import { PRIMARY_SOURCE } from "../api/assets";

export function Layout() {
  return (
    <div className="flex min-h-screen w-full bg-canvas">
      <aside className="sticky top-0 hidden h-screen w-[92px] shrink-0 flex-col items-center self-start md:flex">
        <nav
          aria-label="Primary"
          className="flex w-full flex-1 items-center justify-center px-2.5 py-6"
        >
          <NavLink
            to="/assets"
            className="flex h-14 w-full flex-col items-center justify-center gap-1.5 rounded p-2 text-xs font-medium text-sidebar-accent-foreground"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M4 3v2h16V3H4ZM2 7v13h20V7H2Z" />
            </svg>
            Assets
          </NavLink>
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col md:py-2 md:pr-2">
        <div className="flex w-full min-w-0 flex-1 flex-col bg-background pt-5 md:rounded-2xl">
          <header className="flex h-10 items-center gap-2.5 px-4 text-sm md:px-8">
            <Link to="/assets" className="text-muted-foreground hover:text-foreground">
              Assets
            </Link>
            <svg className="text-muted-foreground" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m9 5 7 7-7 7" />
            </svg>
            <span>Explore Assets</span>
          </header>
          <main className="w-full px-4 pb-20 pt-8 md:px-20 md:pb-44">
            <Outlet />
          </main>
          <footer className="sticky bottom-0 mt-auto border-t border-border bg-background px-4 py-2 text-center text-xs text-muted-foreground md:rounded-b-2xl md:px-8">
            Data obtained from {PRIMARY_SOURCE}
          </footer>
        </div>
      </div>
    </div>
  );
}
