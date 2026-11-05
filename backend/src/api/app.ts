/** Builds the Fastify app. Listening and shutdown live in server.ts, so tests can use this directly. */
import { randomUUID } from "node:crypto";
import compress from "@fastify/compress";
import etag from "@fastify/etag";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import Fastify, { type FastifyBaseLogger, type FastifyInstance, LogController } from "fastify";
import type { Queryable } from "../db/pool.ts";
import { createAuthHook, getClientIp } from "./auth.ts";
import { registerErrorHandling } from "./errors.ts";
import { registerAssetRoutes } from "./routes/assets.ts";
import { registerHealthRoutes } from "./routes/health.ts";

const REQUEST_TIMEOUT_MS = 30_000;
const RATE_LIMIT_WINDOW = "1 minute";
const DEFAULT_RATE_LIMIT = 600;

export interface AppOptions {
  db: Queryable;
  logger: FastifyBaseLogger;
  rateLimitMax?: number;
  failedAuthMax?: number;
  now?: () => number;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { db, logger } = options;
  const app = Fastify({
    loggerInstance: logger,
    // One line per request, written in the onResponse hook below, instead of Fastify's two.
    logController: new LogController({ disableRequestLogging: true, requestIdLogLabel: "requestId" }),
    // Our own ID, so a client can't plant one in the logs.
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    // One covers receiving the request and the other handling it, so neither can run on unbounded.
    requestTimeout: REQUEST_TIMEOUT_MS,
    handlerTimeout: REQUEST_TIMEOUT_MS,
    exposeHeadRoutes: false,
    ajv: {
      customOptions: {
        // Fastify strips unknown properties by default. An unknown parameter must be a 400 instead.
        removeAdditional: false,
        // Query strings are text. Without "array" mode, a repeated parameter is an error too.
        coerceTypes: true,
      },
    },
  });

  app.decorateRequest("apiClient", null);

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });
  app.addHook("onResponse", async (request, reply) => {
    request.log.info(
      {
        route: request.routeOptions.url ?? null,
        method: request.method,
        status: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
        client: request.apiClient?.name ?? null,
      },
      "request",
    );
  });

  registerErrorHandling(app);

  await app.register(helmet);
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "RWA data service",
        version: "1.0.0",
        description: "Private, read-only API over tokenized asset data. Every data route requires an API key.",
      },
      components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } },
      security: [{ bearerAuth: [] }],
    },
  });
  // Registered before compression, because its hook only hashes uncompressed strings and buffers.
  await app.register(etag, { algorithm: "sha256", weak: true });
  await app.register(compress);
  await app.register(rateLimit, {
    max: options.rateLimitMax ?? DEFAULT_RATE_LIMIT,
    timeWindow: RATE_LIMIT_WINDOW,
    // After authentication, so the limit is per key. Each replica counts separately.
    hook: "preValidation",
    keyGenerator: (request) => (request.apiClient ? `key:${request.apiClient.id}` : `ip:${getClientIp(request)}`),
  });

  registerHealthRoutes(app, db);

  await app.register(async (scope) => {
    scope.addHook("onRequest", createAuthHook({ db, maxFailures: options.failedAuthMax, now: options.now }));
    scope.addHook("onRequest", async (_request, reply) => {
      reply.header("cache-control", "private, no-cache");
    });
    registerAssetRoutes(scope, db);
  });

  return app;
}
