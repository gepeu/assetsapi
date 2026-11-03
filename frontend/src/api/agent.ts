// The frontend's only connection to the chat agent.
import { notifySignedOut } from "./auth";

export interface ChatMessage {
  role: "user" | "agent";
  text: string;
}

export interface AgentContext {
  /** The asset the user is viewing; null when they aren't on an asset's page. */
  assetSlug: string | null;
}

export async function sendMessage(
  messages: ChatMessage[],
  context: AgentContext,
): Promise<string> {
  const response = await fetch("/api/agent/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, context }),
  });
  if (response.status === 401) notifySignedOut();
  if (!response.ok) throw new Error(`Agent request failed: ${response.status}`);

  const { reply } = (await response.json()) as { reply: string };
  return reply;
}
