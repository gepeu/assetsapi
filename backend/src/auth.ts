// The app's single shared login. Credentials come from the environment; sessions
// live in memory, so restarting the backend signs everyone out.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { requireEnv } from "./env.ts";

const COOKIE_NAME = "session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;

const USERNAME = requireEnv("AUTH_USERNAME");
const PASSWORD = requireEnv("AUTH_PASSWORD");

// Browsers drop Secure cookies over plain http, so it's only set in production.
const COOKIE_ATTRIBUTES = `HttpOnly; SameSite=Strict; Path=/${
  process.env.NODE_ENV === "production" ? "; Secure" : ""
}`;

/** Session token to expiry time, in milliseconds since the epoch. */
const sessions = new Map<string, number>();

/** Hashing gives equal-length inputs, which timingSafeEqual requires. */
function safeEqual(a: string, b: string): boolean {
  const hash = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(hash(a), hash(b));
}

function sessionToken(req: IncomingMessage): string | undefined {
  for (const pair of req.headers.cookie?.split(";") ?? []) {
    const [name, value] = pair.trim().split("=");
    if (name === COOKIE_NAME) return value;
  }
  return undefined;
}

export function checkCredentials(username: string, password: string): boolean {
  // Both are always compared, so timing doesn't reveal which one was wrong.
  const usernameMatches = safeEqual(username, USERNAME);
  const passwordMatches = safeEqual(password, PASSWORD);
  return usernameMatches && passwordMatches;
}

export function hasSession(req: IncomingMessage): boolean {
  const token = sessionToken(req);
  if (!token) return false;
  const expiresAt = sessions.get(token);
  if (expiresAt === undefined) return false;
  if (expiresAt <= Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

/** Starts a session and returns the Set-Cookie header value for it. */
export function createSession(): string {
  const now = Date.now();
  for (const [token, expiresAt] of sessions) {
    if (expiresAt <= now) sessions.delete(token);
  }
  const token = randomBytes(32).toString("base64url");
  sessions.set(token, now + SESSION_TTL_SECONDS * 1000);
  return `${COOKIE_NAME}=${token}; Max-Age=${SESSION_TTL_SECONDS}; ${COOKIE_ATTRIBUTES}`;
}

/** Ends the request's session and returns the Set-Cookie header value that clears it. */
export function destroySession(req: IncomingMessage): string {
  const token = sessionToken(req);
  if (token) sessions.delete(token);
  return `${COOKIE_NAME}=; Max-Age=0; ${COOKIE_ATTRIBUTES}`;
}
