/**
 * Responses kept in each replica's memory until the served data changes. A route opts in with
 * `config: { cache: true }`, and only its 200s are kept, by URL as sent. Triggers move `data_version`
 * on any write to a data table, and a replica reads it at most once per check interval, so a kept
 * response is at most that much out of date, whatever the update schedule.
 *
 * A hit still passes the key check, the rate limit and validation, which all run before the lookup.
 * `ETag` and compression run on the kept body as they do on a fresh one.
 */
import type { FastifyInstance } from "fastify";
import type { Queryable } from "../db/pool.ts";
import { readDataVersion } from "../db/queries/dataVersion.ts";

declare module "fastify" {
  interface FastifyContextConfig {
    /** Keep this route's 200 responses until the data changes. */
    cache?: boolean;
  }
  interface FastifyRequest {
    /** Set on a miss: the data version the response will be kept under. */
    cacheVersion: string | null;
  }
}

interface Entry {
  body: string;
  bytes: number;
  version: string;
}

/** Kept bodies within a byte budget. When it's full, the least recently used go first. */
export class ResponseStore {
  private readonly entries = new Map<string, Entry>();
  private readonly maxBytes: number;
  private usedBytes = 0;

  constructor(maxBytes: number) {
    this.maxBytes = maxBytes;
  }

  get bytes(): number {
    return this.usedBytes;
  }

  get size(): number {
    return this.entries.size;
  }

  /** The body kept under this version, or null. One kept under another version is dropped. */
  get(key: string, version: string): string | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key);
    if (entry.version !== version) {
      this.usedBytes -= entry.bytes;
      return null;
    }
    // Back in at the end, which marks it as the most recently used.
    this.entries.set(key, entry);
    return entry.body;
  }

  set(key: string, body: string, version: string): void {
    const bytes = Buffer.byteLength(key) + Buffer.byteLength(body);
    if (bytes > this.maxBytes) return;
    this.remove(key);
    for (const oldest of this.entries.keys()) {
      if (this.usedBytes + bytes <= this.maxBytes) break;
      this.remove(oldest);
    }
    this.entries.set(key, { body, bytes, version });
    this.usedBytes += bytes;
  }

  clear(): void {
    this.entries.clear();
    this.usedBytes = 0;
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.usedBytes -= entry.bytes;
  }
}

/** The data version, read from the database at most once per interval. Requests at once share one read. */
class VersionCheck {
  private readonly db: Queryable;
  private readonly intervalMs: number;
  private readonly now: () => number;
  private known: string | null = null;
  private checkedAt = 0;
  private pending: Promise<string> | null = null;

  constructor(db: Queryable, intervalMs: number, now: () => number) {
    this.db = db;
    this.intervalMs = intervalMs;
    this.now = now;
  }

  current(): Promise<string> {
    if (this.known !== null && this.now() - this.checkedAt < this.intervalMs) return Promise.resolve(this.known);
    this.pending ??= readDataVersion(this.db)
      .then((version) => {
        this.known = version;
        this.checkedAt = this.now();
        return version;
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }
}

interface CacheOptions {
  db: Queryable;
  maxBytes: number;
  versionCheckMs: number;
  now: () => number;
}

/**
 * Adds the lookup and the store as root hooks. Call it before `ETag` and compression are registered,
 * so the store sees the plain JSON body rather than a compressed stream. A budget of 0 adds nothing.
 */
export function registerResponseCache(app: FastifyInstance, options: CacheOptions): void {
  if (options.maxBytes === 0) return;
  const store = new ResponseStore(options.maxBytes);
  const versions = new VersionCheck(options.db, options.versionCheckMs, options.now);
  let lastVersion: string | null = null;

  app.decorateRequest("cacheVersion", null);

  app.addHook("preHandler", async (request, reply) => {
    if (!request.routeOptions.config.cache) return;
    let version: string;
    try {
      version = await versions.current();
    } catch (error) {
      // The handler runs as if there were no cache, and reports the database problem itself.
      request.log.warn({ err: error }, "couldn't read the data version, skipping the cache");
      return;
    }
    if (version !== lastVersion) {
      // Everything kept is out of date, so free the memory now rather than entry by entry.
      store.clear();
      lastVersion = version;
    }
    const body = store.get(request.url, version);
    if (body === null) {
      request.cacheVersion = version;
      reply.header("x-cache", "miss");
      return;
    }
    reply.header("x-cache", "hit").type("application/json; charset=utf-8");
    return reply.send(body);
  });

  app.addHook("onSend", async (request, reply, payload) => {
    const version = request.cacheVersion;
    if (version !== null && reply.statusCode === 200 && typeof payload === "string") {
      store.set(request.url, payload, version);
    }
    return payload;
  });
}
