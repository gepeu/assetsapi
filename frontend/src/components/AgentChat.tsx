import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useMatch } from "react-router-dom";
import { documentDownloadUrl, sendMessage, type ChatMessage, type Citation } from "../api/agent";
import { getAsset, type AssetDetail } from "../api/assets";
import { useAsync } from "./useAsync";

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

/**
 * Stays mounted while closed so the conversation survives closing the panel and
 * moving between pages. Conversations aren't saved beyond that (see project.md).
 */
export function AgentChat({ open, onClose }: { open: boolean; onClose: () => void }) {
  const slug = useMatch("/assets/:slug")?.params.slug ?? null;
  const assetState = useAsync(
    (): Promise<AssetDetail | null> => (slug ? getAsset(slug) : Promise.resolve(null)),
    slug,
  );
  const asset = assetState.status === "ready" ? assetState.data : null;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending, failed, open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;

    const conversation: ChatMessage[] = [...messages, { role: "user", text: trimmed }];
    setMessages(conversation);
    setDraft("");
    setFailed(false);
    setPending(true);
    try {
      const { text: reply, citations } = await sendMessage(conversation, {
        assetSlug: asset?.slug ?? null,
      });
      setMessages([...conversation, { role: "agent", text: reply, citations }]);
    } catch {
      // Put the text back so the user can resend it without retyping.
      setMessages(messages);
      setDraft(trimmed);
      setFailed(true);
    } finally {
      setPending(false);
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

  const suggestions = asset ? assetSuggestions(asset.ticker) : GENERAL_SUGGESTIONS;

  return (
    <aside
      id="agent-chat"
      aria-label="Agent chat"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      className={`${open ? "flex" : "hidden"} fixed inset-0 z-50 flex-col bg-background lg:sticky lg:inset-auto lg:top-0 lg:z-auto lg:h-screen lg:w-[380px] lg:shrink-0 lg:self-start lg:bg-transparent lg:py-2 lg:pr-2`}
    >
      <div className="flex min-h-0 flex-1 flex-col bg-background lg:rounded-2xl">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border pl-4 pr-2">
          <h2 className="text-sm font-medium">Agent</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close agent chat"
            className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-canvas-hover hover:text-foreground"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div role="log" aria-label="Conversation" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {messages.length === 0 && !pending ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {asset
                  ? `Ask about ${asset.name}, or create a report.`
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
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleInputKeyDown}
              rows={2}
              placeholder="Ask the agent…"
              aria-label="Message the agent"
              className="w-full resize-none bg-transparent px-1 text-sm leading-5 outline-none! placeholder:text-muted-foreground"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate px-1 text-xs text-muted-foreground">
                {asset ? `Viewing ${asset.ticker}` : "All assets"}
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
      </div>
    </aside>
  );
}

function Message({ message }: { message: ChatMessage }) {
  const look =
    message.role === "user"
      ? "max-w-[85%] self-end rounded-xl bg-canvas px-3 py-2"
      : "self-start";
  return (
    <div className={look}>
      <p className="whitespace-pre-wrap break-words text-sm leading-[22px]">{message.text}</p>
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
