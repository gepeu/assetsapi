export interface ChatMessage {
  role: "user" | "agent";
  text: string;
}

export interface AgentContext {
  /** The asset the user is viewing; null when they aren't on an asset's page. */
  assetSlug: string | null;
}

export interface Citation {
  /** Matches the [n] marker in the reply's text. */
  number: number;
  kind: "document" | "data";
  title: string;
  documentId: number | null;
  url: string | null;
  isOfficial: boolean | null;
  page: number | null;
}

export interface AgentReply {
  text: string;
  citations: Citation[];
}

export interface AgentService {
  reply(messages: ChatMessage[], context: AgentContext): Promise<AgentReply>;
}

/** Stands in for the real agent; replace this and the HTTP API stays the same. */
export const mockAgent: AgentService = {
  async reply() {
    return { text: "hello", citations: [] };
  },
};
