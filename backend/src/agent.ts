export interface ChatMessage {
  role: "user" | "agent";
  text: string;
}

export interface AgentContext {
  /** The asset the user is viewing; null when they aren't on an asset's page. */
  assetSlug: string | null;
}

export interface AgentService {
  reply(messages: ChatMessage[], context: AgentContext): Promise<string>;
}

/** Stands in for the real agent; replace this and the HTTP API stays the same. */
export const mockAgent: AgentService = {
  async reply() {
    return "hello";
  },
};
