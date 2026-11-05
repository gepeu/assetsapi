/** The data routes. HTTP only: services build the responses and a null from one means a 404. */
import type { FastifyInstance } from "fastify";
import type { Queryable } from "../../db/pool.ts";
import { getAsset, listAssets } from "../../services/assets.ts";
import { getAssetFields } from "../../services/fields.ts";
import { getAssetFinancials } from "../../services/financials.ts";
import { getAssetHistory } from "../../services/history.ts";
import { listAssetTokens } from "../../services/tokens.ts";
import { ApiError } from "../errors.ts";
import { type AssetListQuery, assetDetailRoute, assetListRoute } from "../schemas/assets.ts";
import { fieldsRoute } from "../schemas/fields.ts";
import { financialsRoute } from "../schemas/financials.ts";
import { type HistoryQuery, historyRoute } from "../schemas/history.ts";
import type { SlugParams } from "../schemas/shared.ts";
import { type TokensQuery, tokensRoute } from "../schemas/tokens.ts";

function requireFound<T>(value: T | null, message = "No active asset has this slug"): T {
  if (value === null) throw new ApiError("not_found", message);
  return value;
}

export function registerAssetRoutes(app: FastifyInstance, db: Queryable): void {
  app.get<{ Querystring: AssetListQuery }>("/assets", { schema: assetListRoute }, (request) =>
    listAssets(db, request.query),
  );

  app.get<{ Params: SlugParams }>("/assets/:slug", { schema: assetDetailRoute }, async (request) =>
    requireFound(await getAsset(db, request.params.slug)),
  );

  app.get<{ Params: SlugParams }>("/assets/:slug/fields", { schema: fieldsRoute }, async (request) =>
    requireFound(await getAssetFields(db, request.params.slug)),
  );

  app.get<{ Params: SlugParams; Querystring: TokensQuery }>(
    "/assets/:slug/tokens",
    { schema: tokensRoute },
    async (request) => requireFound(await listAssetTokens(db, request.params.slug, request.query.network ?? null)),
  );

  app.get<{ Params: SlugParams }>("/assets/:slug/financials", { schema: financialsRoute }, async (request) =>
    requireFound(await getAssetFinancials(db, request.params.slug)),
  );

  app.get<{ Params: SlugParams; Querystring: HistoryQuery }>(
    "/assets/:slug/history",
    { schema: historyRoute },
    async (request) => {
      const { slug } = request.params;
      const { measure, range } = request.query;
      return requireFound(await getAssetHistory(db, slug, measure, range ?? "all"), "Unknown asset or measure");
    },
  );
}
