/**
 * API key checks, and the optional shared login for the frontend. Replicas cache a good key, for a
 * minute by default, so a revoked key stops within one. Failed attempts are limited per IP, and valid
 * credentials are never blocked by IP, so a neighbour behind the same address can't lock anyone out.
 *
 * The login is HTTP Basic auth, so the browser asks for it and sends it with the page's API calls.
 * There are no sessions or cookies.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyRequest, onRequestAsyncHookHandler } from "fastify";
import { settings, type UiLogin } from "../config.ts";
import type { Queryable } from "../db/pool.ts";
import { type ActiveKey, findActiveKey, touchKey } from "../db/queries/apiKeys.ts";
import { ApiError } from "./errors.ts";

const randomKeyPart = (): string => randomBytes(settings.api.keyRandomBytes).toString("base64url");

/** The auth scheme's name is case-insensitive under HTTP's rules, and the key isn't. */
const BEARER_KEY_PATTERN = new RegExp(
  `^bearer (${settings.api.keyLead}[A-Za-z0-9_-]{${randomKeyPart().length}})$`,
  "i",
);

const BASIC_PATTERN = /^basic ([A-Za-z0-9+/]+={0,2})$/i;

export const newApiKey = (): string => `${settings.api.keyLead}${randomKeyPart()}`;

export const hashApiKey = (key: string): string => createHash("sha256").update(key).digest("hex");

interface ApiClient {
  /** The key's ID. Null for the login, which is rate limited per IP instead. */
  id: number | null;
  name: string;
}

declare module "fastify" {
  interface FastifyRequest {
    apiClient: ApiClient | null;
  }
}

/** Railway's proxy sets this header. Outside Railway it falls back to the socket address. */
export function getClientIp(request: FastifyRequest): string {
  const header = request.headers["x-real-ip"];
  return typeof header === "string" && header !== "" ? header : request.ip;
}

interface AuthOptions {
  db: Queryable;
  /** Accepted alongside keys when set. */
  login?: UiLogin | null;
  maxFailures?: number;
  now?: () => number;
}

interface CachedKey {
  key: ActiveKey;
  cachedUntil: number;
}

/** Hashed first, so the comparison takes the same time whatever the lengths. */
const digest = (text: string): Buffer => createHash("sha256").update(text).digest();

function matchesLogin(header: string, username: Buffer, password: Buffer): boolean {
  const encoded = BASIC_PATTERN.exec(header)?.[1];
  if (!encoded) return false;
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  if (colon === -1) return false;
  // Both compared every time, so the timing doesn't show whether the username was right.
  const usernameMatches = timingSafeEqual(digest(decoded.slice(0, colon)), username);
  const passwordMatches = timingSafeEqual(digest(decoded.slice(colon + 1)), password);
  return usernameMatches && passwordMatches;
}

export function createAuthHook({
  db,
  login = null,
  maxFailures = settings.api.failedAuthMax,
  now = Date.now,
}: AuthOptions): onRequestAsyncHookHandler {
  const { keyCacheMs, failedAuthTrackedIps, failedAuthWindowMs, uiLoginRealm } = settings.api;
  const loginDigests = login && { username: digest(login.username), password: digest(login.password) };
  // Tells the browser to ask for the login, and to send it again on the page's later API calls.
  const challenge = `Basic realm="${uiLoginRealm}", charset="UTF-8"`;
  const cache = new Map<string, CachedKey>();
  const failures = new Map<string, { count: number; resetAt: number }>();

  const recordFailure = (request: FastifyRequest): void => {
    const ip = getClientIp(request);
    const time = now();
    if (failures.size >= failedAuthTrackedIps) {
      for (const [tracked, entry] of failures) {
        if (entry.resetAt <= time) failures.delete(tracked);
      }
      if (failures.size >= failedAuthTrackedIps) failures.clear();
    }
    const current = failures.get(ip);
    const entry = current && current.resetAt > time ? current : { count: 0, resetAt: time + failedAuthWindowMs };
    entry.count++;
    failures.set(ip, entry);
    if (entry.count > maxFailures) throw new ApiError("rate_limited", "Too many failed attempts");
  };

  const lookUp = async (hash: string, request: FastifyRequest): Promise<ActiveKey | null> => {
    const cached = cache.get(hash);
    if (cached && cached.cachedUntil > now()) {
      const { expiresAt } = cached.key;
      return expiresAt === null || expiresAt.getTime() > now() ? cached.key : null;
    }
    cache.delete(hash);

    const key = await findActiveKey(db, hash);
    if (!key) return null;
    cache.set(hash, { key, cachedUntil: now() + keyCacheMs });
    // Once per cache refresh is enough, and a failed touch mustn't fail the request.
    void touchKey(db, key.id).catch((error: unknown) => {
      request.log.warn({ err: error }, "couldn't record key use");
    });
    return key;
  };

  return async (request, reply) => {
    const header = request.headers.authorization ?? "";
    const presented = BEARER_KEY_PATTERN.exec(header)?.[1];
    const key = presented ? await lookUp(hashApiKey(presented), request) : null;
    if (key) {
      request.apiClient = { id: key.id, name: key.clientName };
      return;
    }
    if (login && loginDigests && matchesLogin(header, loginDigests.username, loginDigests.password)) {
      request.apiClient = { id: null, name: login.username };
      return;
    }
    // A request with no credentials guesses nothing. Browsers send one before every login, and
    // counting those would block a team behind one address.
    if (header !== "") recordFailure(request);
    if (login) reply.header("www-authenticate", challenge);
    throw new ApiError("unauthorized", "A valid API key is required");
  };
}
