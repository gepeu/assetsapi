import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mockAgent, type AgentContext, type AgentService, type ChatMessage } from "./agent.ts";
import { checkCredentials, createSession, destroySession, hasSession } from "./auth.ts";

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

function parseLoginRequest(body: unknown): { username: string; password: string } {
  const { username, password } = (body ?? {}) as Record<string, unknown>;
  if (typeof username !== "string" || typeof password !== "string") {
    throw new HttpError(400, "username and password must be strings");
  }
  return { username, password };
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function requireMethod(req: IncomingMessage, method: string) {
  if (req.method !== method) throw new HttpError(405, "Method not allowed");
}

const server = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");

    if (pathname === "/api/auth/session") {
      requireMethod(req, "GET");
      sendJson(res, 200, { authenticated: hasSession(req) });
      return;
    }
    if (pathname === "/api/auth/login") {
      requireMethod(req, "POST");
      const { username, password } = parseLoginRequest(await readJson(req));
      if (!checkCredentials(username, password)) {
        throw new HttpError(401, "Invalid username or password");
      }
      res.setHeader("Set-Cookie", createSession());
      sendJson(res, 200, { authenticated: true });
      return;
    }
    if (pathname === "/api/auth/logout") {
      requireMethod(req, "POST");
      res.setHeader("Set-Cookie", destroySession(req));
      sendJson(res, 200, { authenticated: false });
      return;
    }

    // Everything below this line requires a signed-in session.
    if (!hasSession(req)) throw new HttpError(401, "Not signed in");

    if (pathname !== "/api/agent/messages") throw new HttpError(404, "Not found");
    requireMethod(req, "POST");

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

// Loopback only: there's no TLS or login rate limiting yet.
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Backend listening on http://127.0.0.1:${PORT}`);
});
