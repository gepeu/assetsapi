/**
 * API key checks. Replicas cache a good key, for a minute by default, so a revoked key stops within one.
 * Failed attempts are limited per IP, and a valid key is never blocked by IP, so a neighbour behind
 * the same address can't lock anyone out.
 */
import { createHash } from "node:crypto";
import type { FastifyRequest, onRequestAsyncHookHandler } from "fastify";
import { settings } from "../config.ts";
import type { Queryable } from "../db/pool.ts";
import { type ActiveKey, findActiveKey, touchKey } from "../db/queries/apiKeys.ts";
import { ApiError } from "./errors.ts";

/** The auth scheme's name is case-insensitive under HTTP's rules, and the key isn't. */
const BEARER_KEY_PATTERN = /^bearer (rwa_[A-Za-z0-9_-]{43})$/i;

export const hashApiKey = (key: string): string => createHash("sha256").update(key).digest("hex");

interface ApiClient {
  id: number;
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
  maxFailures?: number;
  now?: () => number;
}

interface CachedKey {
  key: ActiveKey;
  cachedUntil: number;
}

export function createAuthHook({
  db,
  maxFailures = settings.api.failedAuthMax,
  now = Date.now,
}: AuthOptions): onRequestAsyncHookHandler {
  const { keyCacheMs, failedAuthTrackedIps, failedAuthWindowMs } = settings.api;
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

  return async (request) => {
    const presented = BEARER_KEY_PATTERN.exec(request.headers.authorization ?? "")?.[1];
    const key = presented ? await lookUp(hashApiKey(presented), request) : null;
    if (key) {
      request.apiClient = { id: key.id, name: key.clientName };
      return;
    }
    recordFailure(request);
    throw new ApiError("unauthorized", "A valid API key is required");
  };
}
