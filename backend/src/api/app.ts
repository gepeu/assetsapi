/** Builds the Fastify app. Listening and shutdown live in server.ts, so tests can use this directly. */
import { randomUUID } from "node:crypto";
import compress from "@fastify/compress";
import etag from "@fastify/etag";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import Fastify, { type FastifyBaseLogger, type FastifyInstance, LogController } from "fastify";
import { settings, type UiLogin } from "../config.ts";
import type { Queryable } from "../db/pool.ts";
import { createAuthHook, getClientIp } from "./auth.ts";
import { registerErrorHandling } from "./errors.ts";
import { API_GUIDE } from "./guide.ts";
import { registerAssetRoutes } from "./routes/assets.ts";
import { registerHealthRoutes } from "./routes/health.ts";
import { registerUiRoutes } from "./routes/ui.ts";
import { API_TAG } from "./schemas/shared.ts";

interface AppOptions {
  db: Queryable;
  logger: FastifyBaseLogger;
  rateLimitMax?: number;
  failedAuthMax?: number;
  now?: () => number;
  /** Serves the data routes with no API key, for the local frontend. Keys are required unless this is set. */
  authDisabled?: boolean;
  /** A shared login for the frontend. It guards the frontend too, and the data routes accept it as well as keys. */
  login?: UiLogin | null;
  /** The built frontend. Without it, the service is the API alone. */
  uiDir?: string;
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
    requestTimeout: settings.api.requestTimeoutMs,
    handlerTimeout: settings.api.requestTimeoutMs,
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
        title: "Tokenized assets API",
        version: "2.0.0",
        description: API_GUIDE,
      },
      tags: [
        { name: API_TAG, description: "Asset data. Requires an API key" },
        { name: "Service", description: "Operational routes" },
      ],
      components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } },
      security: [{ bearerAuth: [] }],
    },
  });
  // Registered before compression, because its hook only hashes uncompressed strings and buffers.
  await app.register(etag, { algorithm: "sha256", weak: true });
  await app.register(compress);
  await app.register(rateLimit, {
    max: options.rateLimitMax ?? settings.api.rateLimitMax,
    timeWindow: settings.api.rateLimitWindowMs,
    // After authentication, so the limit is per key. Each replica counts separately.
    hook: "preValidation",
    keyGenerator: (request) => {
      const id = request.apiClient?.id ?? null;
      return id === null ? `ip:${getClientIp(request)}` : `key:${id}`;
    },
  });

  // One hook for every scope, so they share the failure counts and the key cache.
  const auth = createAuthHook({ db, login: options.login, maxFailures: options.failedAuthMax, now: options.now });

  registerHealthRoutes(app, db);
  const { uiDir } = options;
  if (uiDir) {
    await app.register(async (scope) => {
      // The pages hold no data, but asking here gets the browser's sign-in box up before the first API call.
      if (options.login) scope.addHook("onRequest", auth);
      registerUiRoutes(scope, uiDir);
    });
  }

  await app.register(async (scope) => {
    if (!options.authDisabled) scope.addHook("onRequest", auth);
    scope.addHook("onRequest", async (_request, reply) => {
      reply.header("cache-control", "private, no-cache");
    });
    registerAssetRoutes(scope, db);
  });

  return app;
}
