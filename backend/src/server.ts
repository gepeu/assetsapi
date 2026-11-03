import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mockAgent, type AgentContext, type AgentService, type ChatMessage } from "./agent.ts";

const PORT = Number(process.env.PORT ?? 3001);
const MAX_BODY_BYTES = 1_000_000;

const agent: AgentService = mockAgent;

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "Request body too large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const { role, text } = value as Record<string, unknown>;
  return (role === "user" || role === "agent") && typeof text === "string";
}

function parseChatRequest(body: unknown): { messages: ChatMessage[]; context: AgentContext } {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Request body must be an object");
  }
  const { messages, context } = body as Record<string, unknown>;
  if (!Array.isArray(messages) || messages.length === 0 || !messages.every(isChatMessage)) {
    throw new HttpError(400, "messages must be a non-empty array of { role, text }");
  }
  const assetSlug = (context as Record<string, unknown> | null | undefined)?.assetSlug;
  if (assetSlug !== null && typeof assetSlug !== "string") {
    throw new HttpError(400, "context.assetSlug must be a string or null");
  }
  return { messages, context: { assetSlug } };
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (pathname !== "/api/agent/messages") throw new HttpError(404, "Not found");
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");

    const { messages, context } = parseChatRequest(await readJson(req));
    sendJson(res, 200, { reply: await agent.reply(messages, context) });
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
    } else {
      console.error(error);
      sendJson(res, 500, { error: "Internal server error" });
    }
  }
});

// Loopback only: there's no authentication yet.
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Backend listening on http://127.0.0.1:${PORT}`);
});
