/** Turns rows into `/tokenized_assets/catalog`: every name the other endpoints accept. */
import type { CatalogResponse } from '../api/schemas/catalog.ts';
import { settings } from '../config.ts';
import type { Queryable } from '../db/pool.ts';
import { listFilterOptions } from '../db/queries/assets.ts';
import { listCatalog } from '../db/queries/fieldValues.ts';
import { listCatalogMetrics } from '../db/queries/financials.ts';
import { INTERNAL_FIELD_KEYS } from './fields.ts';
import { toShortName } from './names.ts';

const toOptions = (labels: readonly string[]) =>
  [...new Set(labels)].map((label) => ({ key: toShortName(label), label }));

export async function getCatalog(db: Queryable): Promise<CatalogResponse> {
  const [metrics, fields, filters] = await Promise.all([
    listCatalogMetrics(db),
    listCatalog(db),
    listFilterOptions(db),
  ]);
  const visibleFields = fields.filter((field) => !INTERNAL_FIELD_KEYS.has(field.key));
  const groupOf = (group: string | null) => group ?? settings.api.otherGroupLabel;

  return {
    data: {
      metrics: metrics.map((metric) => ({
        metric: metric.slug,
        label: metric.label,
        group: groupOf(metric.group),
        unit: metric.unit,
        hasCurrentValue: metric.hasCurrentValue,
        hasHistory: metric.hasHistory,
      })),
      groups: toOptions(metrics.map((metric) => groupOf(metric.group))),
      // Token fields come with each row of `tokens`, so `categories` can't ask for them.
      categories: toOptions(visibleFields.filter((field) => field.level !== 'token').map((field) => field.category)),
      fields: visibleFields.map((field) => ({
        key: field.key,
        label: field.label,
        category: field.category,
        valueType: field.valueType,
        level: field.level,
      })),
      filters,
    },
  };
}
