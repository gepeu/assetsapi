// Stands in for the chat agent so the app can run without calling the backend.
import type { AgentContext, AgentReply, ChatMessage } from "./agent";

const REPLY_DELAY_MS = 600;

export async function mockSendMessage(messages: ChatMessage[], context: AgentContext): Promise<AgentReply> {
  await new Promise((resolve) => setTimeout(resolve, REPLY_DELAY_MS));

  const scope = context.assetSlug ? `the asset \`${context.assetSlug}\`` : "all assets";
  return {
    question: messages[messages.length - 1].text,
    answer: `**This is a mock reply**, not a real answer. The agent is switched off for now [1].\n\nThis chat is about ${scope}.`,
    citations: [
      {
        number: 1,
        kind: "data",
        title: "Mock source",
        documentId: null,
        url: null,
        isOfficial: null,
        page: null,
      },
    ],
  };
}
