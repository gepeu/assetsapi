import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Markdown, { type Components } from "react-markdown";
import { useMatch } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { documentDownloadUrl, sendMessage, type ChatMessage, type Citation } from "../api/agent";
import { listAssets, type AssetListItem } from "../api/assets";
import { useAsync } from "./useAsync";

const NOT_FOUND_TEXT = "I couldn't find that in our documents.";

const GENERAL_SUGGESTIONS = [
  "Which assets are tokenized treasuries?",
  "Which issuers have the most assets?",
  "Create a report template",
];

function assetSuggestions(ticker: string) {
  return [
    `Summarize ${ticker}`,
    `Who issues ${ticker} and how is it structured?`,
    `Generate a report on ${ticker}`,
  ];
}

type AssetRef = Pick<AssetListItem, "slug" | "ticker" | "name">;

interface ChatSession {
  id: number;
  /** The asset the chat is about, fixed by its first message. Null for a general chat. */
  asset: AssetRef | null;
  messages: ChatMessage[];
  draft: string;
  pending: boolean;
  failed: boolean;
  updatedAt: number;
}

let nextSessionId = 1;

function newSession(): ChatSession {
  return {
    id: nextSessionId++,
    asset: null,
    messages: [],
    draft: "",
    pending: false,
    failed: false,
    updatedAt: Date.now(),
  };
}

/** Sessions the user hasn't typed anything into stay out of the list and get discarded. */
function isStarted(session: ChatSession) {
  return session.messages.length > 0 || session.draft.trim() !== "";
}

function sessionTitle(session: ChatSession) {
  return (
    session.asset?.name ??
    session.messages.find((m) => m.role === "user")?.text ??
    session.draft.trim()
  );
}

/** The latest message as one line of plain text. */
function sessionPreview(session: ChatSession) {
  const latest = session.messages[session.messages.length - 1];
  if (!latest) return "";
  return latest.text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\d+\]/g, "")
    .replace(/[#*`>|~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function timeAgo(time: number) {
  const minutes = Math.floor((Date.now() - time) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

function isToday(time: number) {
  return new Date(time).toDateString() === new Date().toDateString();
}

const ICON_BUTTON =
  "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-canvas-hover hover:text-foreground";

/**
 * Stays mounted while closed so chats survive closing the panel and moving between
 * pages. They aren't saved beyond that (see project.md).
 */
export function AgentChat({ open, onClose }: { open: boolean; onClose: () => void }) {
  const slug = useMatch("/assets/:slug")?.params.slug ?? null;
  const assetState = useAsync(
    async (): Promise<AssetRef | null> =>
      slug ? ((await listAssets()).find((asset) => asset.slug === slug) ?? null) : null,
    slug,
  );
  const pageAsset = assetState.status === "ready" ? assetState.data : null;

  const [sessions, setSessions] = useState<ChatSession[]>(() => [newSession()]);
  const [activeId, setActiveId] = useState(sessions[0].id);
  const [view, setView] = useState<"chat" | "list">("chat");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const newChatRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const active = sessions.find((s) => s.id === activeId) ?? sessions[0];
  const { messages, draft, pending, failed } = active;

  useEffect(() => {
    if (!open) return;
    if (view === "chat") inputRef.current?.focus();
    else newChatRef.current?.focus();
  }, [open, view, activeId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending, failed, open, view]);

  function updateSession(id: number, changes: Partial<ChatSession>) {
    setSessions((all) => all.map((s) => (s.id === id ? { ...s, ...changes } : s)));
  }

  function openSession(id: number) {
    setSessions((all) => all.filter((s) => s.id === id || isStarted(s)));
    setActiveId(id);
    setView("chat");
  }

  function startNewChat() {
    setView("chat");
    if (!isStarted(active)) {
      inputRef.current?.focus();
      return;
    }
    const session = newSession();
    setSessions((all) => [...all.filter(isStarted), session]);
    setActiveId(session.id);
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;

    // A reply can arrive after the user has moved to another chat, so everything
    // below goes through this session's id.
    const { id, messages: previous } = active;
    const asset = previous.length === 0 ? pageAsset : active.asset;
    const conversation: ChatMessage[] = [...previous, { role: "user", text: trimmed }];
    updateSession(id, {
      asset: asset && { slug: asset.slug, ticker: asset.ticker, name: asset.name },
      messages: conversation,
      draft: "",
      failed: false,
      pending: true,
      updatedAt: Date.now(),
    });
    try {
      const { answer, citations } = await sendMessage(conversation, {
        assetSlug: (asset ?? pageAsset)?.slug ?? null,
      });
      updateSession(id, {
        messages: [...conversation, { role: "agent", text: answer ?? NOT_FOUND_TEXT, citations }],
        pending: false,
        updatedAt: Date.now(),
      });
    } catch {
      // Put the text back so the user can resend it without retyping.
      updateSession(id, { messages: previous, draft: trimmed, failed: true, pending: false });
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void send(draft);
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(draft);
    }
  }

  const suggestions = pageAsset ? assetSuggestions(pageAsset.ticker) : GENERAL_SUGGESTIONS;
  const heading = view === "list" ? "Chats" : messages.length > 0 ? sessionTitle(active) : "New chat";

  return (
    <aside
      id="agent-chat"
      aria-label="Agent chat"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      className={`${open ? "flex" : "hidden"} fixed inset-0 z-50 flex-col bg-background lg:sticky lg:inset-auto lg:top-0 lg:z-auto lg:h-screen lg:w-[380px] lg:shrink-0 lg:self-start lg:bg-transparent lg:py-2 lg:pr-2`}
    >
      <div className="flex min-h-0 flex-1 flex-col bg-background lg:rounded-2xl">
        <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border pl-4 pr-2">
          {view === "chat" && (
            <button
              type="button"
              onClick={() => setView("list")}
              aria-label="All chats"
              className={`${ICON_BUTTON} -ml-2`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="m15 5-7 7 7 7" />
              </svg>
            </button>
          )}
          <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{heading}</h2>
          <button
            ref={newChatRef}
            type="button"
            onClick={startNewChat}
            className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-canvas-hover hover:text-foreground"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New
          </button>
          <button type="button" onClick={onClose} aria-label="Close agent chat" className={ICON_BUTTON}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        {view === "list" ? (
          <ChatList sessions={sessions.filter(isStarted)} onOpen={openSession} />
        ) : (
          <>
            <div role="log" aria-label="Conversation" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              {messages.length === 0 && !pending ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-muted-foreground">
                    {pageAsset
                      ? `Ask about ${pageAsset.name}, or create a report.`
                      : "Ask about the assets we track, or create a report."}
                  </p>
                  <div className="flex flex-col items-start gap-1.5">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void send(s)}
                        className="cursor-pointer rounded-lg border border-border px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-canvas-hover hover:text-foreground"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m, i) => <Message key={i} message={m} />)
              )}
              {pending && <p className="text-sm text-muted-foreground">Thinking…</p>}
              {failed && (
                <p role="alert" className="text-sm text-warning">
                  Couldn't reach the agent. Try sending again.
                </p>
              )}
              <div ref={endRef} />
            </div>

            <form onSubmit={handleSubmit} className="shrink-0 p-3">
              <div className="flex flex-col gap-1 rounded-xl border border-border p-2 focus-within:border-muted-foreground">
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => updateSession(active.id, { draft: e.target.value })}
                  onKeyDown={handleInputKeyDown}
                  rows={2}
                  placeholder="Ask the agent…"
                  aria-label="Message the agent"
                  className="w-full resize-none bg-transparent px-1 text-sm leading-5 outline-none! placeholder:text-muted-foreground"
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate px-1 text-xs text-muted-foreground">
                    {active.asset
                      ? `About ${active.asset.ticker}`
                      : pageAsset
                        ? `Viewing ${pageAsset.ticker}`
                        : "All assets"}
                  </p>
                  <button
                    type="submit"
                    disabled={pending || !draft.trim()}
                    aria-label="Send message"
                    className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-foreground text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M12 19V5M6 11l6-6 6 6" />
                    </svg>
                  </button>
                </div>
              </div>
            </form>
          </>
        )}
      </div>
    </aside>
  );
}

function ChatList({ sessions, onOpen }: { sessions: ChatSession[]; onOpen: (id: number) => void }) {
  if (sessions.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No chats yet.</p>;
  }
  const newestFirst = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  const groups = [
    { label: "Today", items: newestFirst.filter((s) => isToday(s.updatedAt)) },
    { label: "Earlier", items: newestFirst.filter((s) => !isToday(s.updatedAt)) },
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-2">
      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <section key={group.label} aria-label={group.label}>
            <h3 className="px-2 py-1.5 text-xs font-medium uppercase text-muted-foreground">{group.label}</h3>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((session) => (
                <li key={session.id}>
                  <ChatListItem session={session} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

function ChatListItem({ session, onOpen }: { session: ChatSession; onOpen: (id: number) => void }) {
  const tag = session.messages.length === 0 ? "Draft" : (session.asset?.ticker ?? "All assets");
  const preview = session.pending ? "Thinking…" : sessionPreview(session);
  return (
    <button
      type="button"
      onClick={() => onOpen(session.id)}
      className="flex w-full cursor-pointer flex-col gap-1 rounded-lg px-2 py-2 text-left transition-colors hover:bg-canvas-hover"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="rounded bg-canvas px-1.5 py-0.5 text-xs font-medium text-secondary">{tag}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(session.updatedAt)}</span>
      </span>
      <span className="truncate text-sm font-medium">{sessionTitle(session)}</span>
      {preview && <span className="truncate text-xs text-muted-foreground">{preview}</span>}
    </button>
  );
}

/**
 * Replies draw on stored documents, so their markdown is untrusted. Images become
 * their alt text because loading one would send a request to any URL a document
 * got into the reply, without a click.
 */
const MARKDOWN_COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  img: ({ alt }) => <>{alt}</>,
};

function Message({ message }: { message: ChatMessage }) {
  const look =
    message.role === "user"
      ? "max-w-[85%] self-end rounded-xl bg-canvas px-3 py-2"
      : "w-full";
  return (
    <div className={look}>
      {message.role === "agent" ? (
        <div className="agent-markdown">
          <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
            {message.text}
          </Markdown>
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm leading-[22px]">{message.text}</p>
      )}
      {message.citations && message.citations.length > 0 && (
        <ol aria-label="Sources" className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
          {message.citations.map((citation) => (
            <CitationItem key={citation.number} citation={citation} />
          ))}
        </ol>
      )}
    </div>
  );
}

function CitationItem({ citation }: { citation: Citation }) {
  const label = `[${citation.number}] ${citation.title}${citation.page ? `, p. ${citation.page}` : ""}`;
  return (
    <li className="break-words text-xs leading-[18px] text-muted-foreground">
      {citation.documentId === null ? (
        label
      ) : (
        <a
          href={documentDownloadUrl(citation.documentId)}
          title={citation.url ? `Download our saved copy of ${citation.url}` : "Download our saved copy"}
          className="underline underline-offset-2 hover:text-foreground"
        >
          {label}
        </a>
      )}
      {citation.isOfficial === false && <span className="ml-1 text-warning">Not official</span>}
    </li>
  );
}
