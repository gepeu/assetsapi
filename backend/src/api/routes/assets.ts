/** The data routes. HTTP only: services build the responses and a null from one means a 404. */
import type { FastifyInstance } from 'fastify';
import type { Queryable } from '../../db/pool.ts';
import { getAsset, listAssets } from '../../services/assets.ts';
import { getCatalog } from '../../services/catalog.ts';
import { ApiError } from '../errors.ts';
import { type AssetDetailQuery, type AssetListQuery, assetDetailRoute, assetListRoute } from '../schemas/assets.ts';
import { catalogRoute } from '../schemas/catalog.ts';
import type { SlugParams } from '../schemas/shared.ts';

export function registerAssetRoutes(app: FastifyInstance, db: Queryable): void {
  app.get<{ Querystring: AssetListQuery }>(
    '/tokenized_assets',
    { schema: assetListRoute, config: { cache: true } },
    (request) => listAssets(db, request.query)
  );

  // A fixed path wins over `:slug`, which is why no asset can be given the slug "catalog".
  app.get('/tokenized_assets/catalog', { schema: catalogRoute, config: { cache: true } }, () => getCatalog(db));

  app.get<{ Params: SlugParams; Querystring: AssetDetailQuery }>(
    '/tokenized_assets/:slug',
    { schema: assetDetailRoute, config: { cache: true } },
    async (request) => {
      const asset = await getAsset(db, request.params.slug, request.query);
      if (asset === null) throw new ApiError('not_found', 'No active asset has this slug');
      return asset;
    }
  );
}
