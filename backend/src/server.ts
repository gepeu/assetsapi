import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type pg from "pg";
import { mockAgent, type AgentContext, type AgentService, type ChatMessage } from "./agent.ts";
import { createDocumentAgent } from "./agent/documentAgent.ts";
import { createClaudeComplete } from "./agent/llm.ts";
import { checkCredentials, createSession, destroySession, hasSession } from "./auth.ts";
import { createPool } from "./db/pool.ts";
import { latestStoredFile } from "./documents/documentStore.ts";
import { LOCAL_DOWNLOAD_PATH, LocalBucketStorage } from "./localBucketStorage.ts";
import { createBucketStorage } from "./storage.ts";

const PORT = Number(process.env.PORT ?? 3001);
const MAX_BODY_BYTES = 1_000_000;

const storage = createBucketStorage();

let pool: pg.Pool | undefined;
/** Opened on first use, so the backend can start without a database when using the mock agent. */
const getPool = () => (pool ??= createPool());

/** AGENT_BACKEND=claude answers from stored documents. Anything else uses the mock. */
const agent: AgentService =
  process.env.AGENT_BACKEND === "claude" ? createDocumentAgent(getPool(), createClaudeComplete()) : mockAgent;

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

/** Sends a signed local link's file. Always an attachment, so saved HTML can't run here. */
async function sendLocalDownload(res: ServerResponse, params: URLSearchParams) {
  if (!(storage instanceof LocalBucketStorage)) throw new HttpError(404, "Not found");
  const download = storage.verifyDownload(params);
  const object = download && (await storage.get(download.key));
  if (!object) throw new HttpError(404, "This link is invalid or has expired");

  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Length": object.size,
    "Content-Disposition": download.filename
      ? `attachment; filename*=UTF-8''${encodeURIComponent(download.filename)}`
      : "attachment",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "Cache-Control": "no-store",
  });
  res.end(object.body);
}

/** Signed-in users only. Sends them to a short-lived link for a document's newest saved file. */
async function redirectToDocument(res: ServerResponse, documentId: number) {
  const file = await latestStoredFile(getPool(), documentId);
  if (!file) throw new HttpError(404, "No saved copy of this document");
  const url = await storage.createDownloadUrl(file.storageKey, { filename: file.filename });
  res.writeHead(302, { Location: url, "Cache-Control": "no-store" });
  res.end();
}

const server = createServer(async (req, res) => {
  try {
    const { pathname, searchParams } = new URL(req.url ?? "/", "http://localhost");

    // Signed links work without a session, like the bucket's. Access is checked before issuing them.
    if (pathname === LOCAL_DOWNLOAD_PATH) {
      requireMethod(req, "GET");
      await sendLocalDownload(res, searchParams);
      return;
    }
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

    const documentId = /^\/api\/documents\/(\d+)\/download$/.exec(pathname)?.[1];
    if (documentId) {
      requireMethod(req, "GET");
      await redirectToDocument(res, Number(documentId));
      return;
    }

    if (pathname !== "/api/agent/messages") throw new HttpError(404, "Not found");
    requireMethod(req, "POST");

    const { messages, context } = parseChatRequest(await readJson(req));
    const { text, citations } = await agent.reply(messages, context);
    sendJson(res, 200, { reply: text, citations });
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
