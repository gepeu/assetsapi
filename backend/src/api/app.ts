/** Builds the Fastify app. Listening and shutdown live in server.ts, so tests can use this directly. */
import { randomUUID } from 'node:crypto';
import compress from '@fastify/compress';
import etag from '@fastify/etag';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyRequest, LogController } from 'fastify';
import { settings } from '../config.ts';
import type { Queryable } from '../db/pool.ts';
import { registerResponseCache } from './cache.ts';
import { registerErrorHandling } from './errors.ts';
import { API_GUIDE } from './guide.ts';
import { registerAssetRoutes } from './routes/assets.ts';
import { registerHealthRoutes } from './routes/health.ts';
import { API_TAG } from './schemas/shared.ts';

interface AppOptions {
  db: Queryable;
  logger: FastifyBaseLogger;
  rateLimitMax?: number;
  now?: () => number;
  /** Bytes of responses kept in memory, and how often the data version is read. Settings by default. */
  cacheMaxBytes?: number;
  cacheVersionCheckMs?: number;
}

/** The proxy in front sets this header. Without it, the socket address is used. */
function getClientIp(request: FastifyRequest): string {
  const header = request.headers['x-real-ip'];
  return typeof header === 'string' && header !== '' ? header : request.ip;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { db, logger } = options;
  const app = Fastify({
    loggerInstance: logger,
    // One line per request, written in the onResponse hook below, instead of Fastify's two.
    logController: new LogController({ disableRequestLogging: true, requestIdLogLabel: 'requestId' }),
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

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });
  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        route: request.routeOptions.url ?? null,
        method: request.method,
        status: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
      },
      'request'
    );
  });

  registerErrorHandling(app);

  await app.register(helmet);
  // Before ETag and compression, whose hooks must see the kept body as they see a fresh one.
  registerResponseCache(app, {
    db,
    maxBytes: options.cacheMaxBytes ?? settings.api.cacheMaxBytes,
    versionCheckMs: options.cacheVersionCheckMs ?? settings.api.cacheVersionCheckMs,
    now: options.now ?? Date.now,
  });
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Tokenized assets API',
        version: '2.0.0',
        description: API_GUIDE,
      },
      tags: [
        { name: API_TAG, description: 'Asset data' },
        { name: 'Service', description: 'Operational routes' },
      ],
    },
  });
  // Registered before compression, because its hook only hashes uncompressed strings and buffers.
  await app.register(etag, { algorithm: 'sha256', weak: true });
  await app.register(compress);
  await app.register(rateLimit, {
    max: options.rateLimitMax ?? settings.api.rateLimitMax,
    timeWindow: settings.api.rateLimitWindowMs,
    // Per client IP. Each replica counts separately.
    keyGenerator: getClientIp,
  });

  registerHealthRoutes(app, db);

  await app.register(async (scope) => {
    // Clients revalidate with the ETag, so a changed answer is never served stale.
    scope.addHook('onRequest', async (_request, reply) => {
      reply.header('cache-control', 'no-cache');
    });
    registerAssetRoutes(scope, db);
  });

  return app;
}
