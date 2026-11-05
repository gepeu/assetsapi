// The frontend's only connection to the chat agent.
import { mockSendMessage } from "./agentMock";
import { notifySignedOut } from "./auth";

export interface Citation {
  /** Matches the [n] marker in the answer. */
  number: number;
  kind: "document" | "data";
  title: string;
  documentId: number | null;
  url: string | null;
  isOfficial: boolean | null;
  page: number | null;
}

export interface ChatMessage {
  role: "user" | "agent";
  text: string;
  citations?: Citation[];
}

export interface AgentContext {
  /** The asset the user is viewing; null when they aren't on an asset's page. */
  assetSlug: string | null;
}

export interface AgentReply {
  question: string;
  /** Markdown with [n] markers. Null when our sources don't answer the question. */
  answer: string | null;
  citations: Citation[];
}

/** Mocked for now. Set this to requestReply to use the real agent again. */
export const sendMessage = mockSendMessage;

export async function requestReply(messages: ChatMessage[], context: AgentContext): Promise<AgentReply> {
  const response = await fetch("/api/agent/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: messages.map(({ role, text }) => ({ role, text })),
      context,
    }),
  });
  if (response.status === 401) notifySignedOut();
  if (!response.ok) throw new Error(`Agent request failed: ${response.status}`);

  return (await response.json()) as AgentReply;
}

/** Requires a session. The backend then redirects to a link that always downloads. */
export function documentDownloadUrl(documentId: number): string {
  return `/api/documents/${documentId}/download`;
}
