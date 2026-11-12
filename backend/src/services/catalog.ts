/** Turns rows into `/assets/catalog`: every name the other endpoints accept. */
import type { CatalogResponse } from '../api/schemas/catalog.ts';
import { CLASSIFICATIONS } from '../api/schemas/classification.ts';
import type { Queryable } from '../db/pool.ts';
import { listFilterOptions } from '../db/queries/assets.ts';
import { listCatalog } from '../db/queries/fieldValues.ts';
import { listCatalogMetrics } from '../db/queries/financials.ts';
import { INTERNAL_FIELD_KEYS } from './fields.ts';
import { toGroupKey, toGroupLabel, toShortName } from './names.ts';

const toOptions = (labels: readonly string[]) =>
  [...new Set(labels)].map((label) => ({ key: toShortName(label), label }));

export async function getCatalog(db: Queryable): Promise<CatalogResponse> {
  const [metrics, fields, filters] = await Promise.all([
    listCatalogMetrics(db),
    listCatalog(db),
    listFilterOptions(db),
  ]);
  const visibleFields = fields.filter((field) => !INTERNAL_FIELD_KEYS.has(field.key));

  return {
    data: {
      metrics: metrics.map((metric) => ({
        metric: metric.slug,
        label: metric.label,
        group: toGroupKey(metric.group),
        unit: metric.unit,
        hasCurrentValue: metric.hasCurrentValue,
        hasHistory: metric.hasHistory,
      })),
      groups: toOptions(metrics.map((metric) => toGroupLabel(metric.group))),
      // Token fields come with each row of `tokens`, so `categories` can't ask for them.
      categories: toOptions(visibleFields.filter((field) => field.level !== 'token').map((field) => field.category)),
      fields: visibleFields.map((field) => ({
        key: field.key,
        label: field.label,
        category: toShortName(field.category),
        valueType: field.valueType,
        level: field.level,
      })),
      filters: {
        ...filters,
        classifications: CLASSIFICATIONS.map((group) => ({
          key: group.key,
          label: group.label,
          subclasses: group.subclasses.map((subclass) => ({ key: subclass.key, label: subclass.label })),
        })),
      },
    },
  };
}
