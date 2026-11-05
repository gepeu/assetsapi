import { useRef, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { PRIMARY_SOURCE } from "../api/assets";
import { logout } from "../api/auth";
import { AgentChat } from "./AgentChat";

export function Layout() {
  const [chatOpen, setChatOpen] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const chatToggleRef = useRef<HTMLButtonElement>(null);

  function closeChat() {
    setChatOpen(false);
    chatToggleRef.current?.focus();
  }

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
            <button
              ref={chatToggleRef}
              type="button"
              aria-expanded={chatOpen}
              aria-controls="agent-chat"
              onClick={() => (chatOpen ? closeChat() : setChatOpen(true))}
              className="ml-auto inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg bg-foreground px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M21 12a8 8 0 0 1-8 8H4l1.8-3.2A8 8 0 1 1 21 12Z" />
              </svg>
              Ask agent
            </button>
            <button
              type="button"
              onClick={() => {
                setSignOutFailed(false);
                logout().catch(() => setSignOutFailed(true));
              }}
              className="inline-flex h-8 cursor-pointer items-center whitespace-nowrap rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-canvas-hover hover:text-foreground"
            >
              {signOutFailed ? "Sign out failed, retry" : "Sign out"}
            </button>
          </header>
          <main className="w-full px-4 pb-20 pt-8 md:px-20 md:pb-44">
            <Outlet />
          </main>
          <footer className="sticky bottom-0 mt-auto border-t border-border bg-background px-4 py-2 text-center text-xs text-muted-foreground md:rounded-b-2xl md:px-8">
            Data obtained from {PRIMARY_SOURCE}
          </footer>
        </div>
      </div>
      <AgentChat open={chatOpen} onClose={closeChat} />
    </div>
  );
}
