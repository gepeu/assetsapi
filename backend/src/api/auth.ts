/**
 * API key checks. Replicas cache a good key for up to a minute, so a revoked key stops within one.
 * Failed attempts are limited per IP, and a valid key is never blocked by IP, so a neighbour behind
 * the same address can't lock anyone out.
 */
import { createHash } from "node:crypto";
import type { FastifyRequest, onRequestAsyncHookHandler } from "fastify";
import type { Queryable } from "../db/pool.ts";
import { type ActiveKey, findActiveKey, touchKey } from "../db/queries/apiKeys.ts";
import { ApiError } from "./errors.ts";

const CACHE_TTL_MS = 60_000;
const FAILURE_WINDOW_MS = 60_000;
/** Enough for a misconfigured client to be seen as one, not enough to guess a key. */
const DEFAULT_MAX_FAILURES = 20;
const MAX_TRACKED_IPS = 10_000;
const KEY_PATTERN = /^rwa_[A-Za-z0-9_-]{43}$/;

export const hashApiKey = (key: string): string => createHash("sha256").update(key).digest("hex");

export interface ApiClient {
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

export interface AuthOptions {
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
  maxFailures = DEFAULT_MAX_FAILURES,
  now = Date.now,
}: AuthOptions): onRequestAsyncHookHandler {
  const cache = new Map<string, CachedKey>();
  const failures = new Map<string, { count: number; resetAt: number }>();

  const recordFailure = (request: FastifyRequest): void => {
    const ip = getClientIp(request);
    const time = now();
    if (failures.size >= MAX_TRACKED_IPS) {
      for (const [tracked, entry] of failures) {
        if (entry.resetAt <= time) failures.delete(tracked);
      }
      if (failures.size >= MAX_TRACKED_IPS) failures.clear();
    }
    const current = failures.get(ip);
    const entry = current && current.resetAt > time ? current : { count: 0, resetAt: time + FAILURE_WINDOW_MS };
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
    cache.set(hash, { key, cachedUntil: now() + CACHE_TTL_MS });
    // Once per cache refresh is enough, and a failed touch mustn't fail the request.
    void touchKey(db, key.id).catch((error: unknown) => {
      request.log.warn({ err: error }, "couldn't record key use");
    });
    return key;
  };

  return async (request) => {
    const header = request.headers.authorization;
    const presented = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

    const key = presented !== null && KEY_PATTERN.test(presented) ? await lookUp(hashApiKey(presented), request) : null;
    if (key) {
      request.apiClient = { id: key.id, name: key.clientName };
      return;
    }
    recordFailure(request);
    throw new ApiError("unauthorized", "A valid API key is required");
  };
}
