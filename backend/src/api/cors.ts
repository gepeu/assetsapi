/**
 * Lets a page on any website read the API from the browser. Every origin is allowed because the API
 * is public and read-only, and takes no cookies or keys, so there's nothing for an origin to borrow.
 */
import type { FastifyInstance } from 'fastify';
import { settings } from '../config.ts';

// A page's script can otherwise read only a few basic response headers.
const EXPOSED_HEADERS = [
  'etag',
  'retry-after',
  'x-cache',
  'x-request-id',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
].join(', ');

/** Call before any route is registered, so errors, the docs page and unknown paths are covered too. */
export function registerCors(app: FastifyInstance): void {
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('access-control-allow-origin', '*');
    reply.header('access-control-expose-headers', EXPOSED_HEADERS);
  });

  // A browser asks first when a script adds a header of its own, such as If-None-Match.
  app.options('*', { schema: { hide: true } }, async (request, reply) => {
    const wanted = request.headers['access-control-request-headers'];
    if (wanted) reply.header('access-control-allow-headers', wanted);
    return reply
      .header('access-control-allow-methods', 'GET, HEAD')
      .header('access-control-max-age', settings.api.corsMaxAgeSeconds)
      .header('vary', 'access-control-request-headers')
      .code(204)
      .send();
  });
}
