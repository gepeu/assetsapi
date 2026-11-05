/** `/readyz`: the one route that needs no key. Railway's deploy check and the uptime monitor call it. */
import type { FastifyInstance } from "fastify";
import { findPendingMigrations } from "../../db/migrate.ts";
import type { Queryable } from "../../db/pool.ts";
import { ApiError } from "../errors.ts";
import { errorSchema } from "../schemas/shared.ts";

const readySchema = {
  summary: "Whether the database is reachable and the schema is new enough",
  security: [],
  response: {
    200: {
      type: "object",
      additionalProperties: false,
      required: ["status"],
      properties: { status: { type: "string", enum: ["ready"] } },
    },
    503: { description: "Not ready", ...errorSchema },
  },
} as const;

export function registerHealthRoutes(app: FastifyInstance, db: Queryable): void {
  app.get("/readyz", { schema: readySchema, config: { rateLimit: false } }, async (request) => {
    let pending: string[];
    try {
      pending = await findPendingMigrations(db);
    } catch (error) {
      request.log.error({ err: error }, "readiness check failed");
      throw new ApiError("unavailable", "The service can't check its database");
    }
    if (pending.length > 0) throw new ApiError("unavailable", "The database schema is behind");
    return { status: "ready" };
  });
}
