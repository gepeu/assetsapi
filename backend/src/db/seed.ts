import type pg from "pg";
import { ASSETS } from "./catalog/assets.ts";
import { FIELDS } from "./catalog/fields.ts";
import { CONFLICT_ORDER, SOURCES, SUBJECTIVE_TERMS } from "./catalog/sources.ts";
import { inTransaction } from "./pool.ts";

/** Safe to re-run: existing rows are updated in place, so their IDs stay stable. */
export async function seed(pool: pg.Pool): Promise<void> {
  await inTransaction(pool, async (client) => {
    for (const source of SOURCES) {
      await client.query(
        `INSERT INTO source (key, name, kind) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind`,
        [source.key, source.name, source.kind],
      );
    }

    await client.query("DELETE FROM source_priority");
    for (const [policy, order] of Object.entries(CONFLICT_ORDER)) {
      for (const [rank, sourceKey] of order.entries()) {
        await client.query(
          `INSERT INTO source_priority (policy, source_id, rank)
           SELECT $1::text, id, $2::smallint FROM source WHERE key = $3`,
          [policy, rank + 1, sourceKey],
        );
      }
    }

    for (const term of SUBJECTIVE_TERMS) {
      await client.query(
        `INSERT INTO subjective_term (pattern, note) VALUES ($1, $2)
         ON CONFLICT (pattern) DO UPDATE SET note = EXCLUDED.note`,
        [term.pattern, term.note],
      );
    }

    for (const [index, field] of FIELDS.entries()) {
      await client.query(
        `INSERT INTO field (key, category, label, value_type, level, applicable_asset_types,
                            conflict_policy, requires_as_of, record_group, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (key) DO UPDATE SET
           category = EXCLUDED.category,
           label = EXCLUDED.label,
           value_type = EXCLUDED.value_type,
           level = EXCLUDED.level,
           applicable_asset_types = EXCLUDED.applicable_asset_types,
           conflict_policy = EXCLUDED.conflict_policy,
           requires_as_of = EXCLUDED.requires_as_of,
           record_group = EXCLUDED.record_group,
           sort_order = EXCLUDED.sort_order`,
        [
          field.key,
          field.category,
          field.label,
          field.valueType,
          field.level,
          field.applicableAssetTypes,
          field.conflictPolicy,
          field.requiresAsOf,
          field.recordGroup,
          index + 1,
        ],
      );
    }

    for (const asset of ASSETS) {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO asset (slug, ticker, name, asset_class, asset_type, listed_issuer, review_note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (slug) DO UPDATE SET
           ticker = EXCLUDED.ticker,
           name = EXCLUDED.name,
           asset_class = EXCLUDED.asset_class,
           asset_type = EXCLUDED.asset_type,
           listed_issuer = EXCLUDED.listed_issuer,
           review_note = EXCLUDED.review_note
         RETURNING id`,
        [
          asset.slug,
          asset.ticker,
          asset.name,
          asset.assetClass,
          asset.assetType,
          asset.listedIssuer,
          asset.reviewNote ?? null,
        ],
      );
      await client.query(
        `INSERT INTO asset_alias (asset_id, namespace, value, verified)
         VALUES ($1, 'catalog_slug', $2, true)
         ON CONFLICT (namespace, value) DO NOTHING`,
        [rows[0].id, asset.slug],
      );
    }
  });
}
