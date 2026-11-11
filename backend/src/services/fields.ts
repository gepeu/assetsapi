/**
 * Turns catalog rows and stored values into an asset's `fields`. Organizations are resolved to their
 * names, so consumers never see internal IDs.
 */

import { ApiError } from '../api/errors.ts';
import type { FieldsSection } from '../api/schemas/fields.ts';
import type { Coverage, FieldValue } from '../api/schemas/shared.ts';
import type { Queryable } from '../db/pool.ts';
import type { FieldStatusRow, StoredValue } from '../db/queries/fieldValues.ts';
import { listAssetFieldStatuses, listAssetSubjectValues } from '../db/queries/fieldValues.ts';
import { findOrganizationNames } from '../db/queries/organizations.ts';
import type { AssetNetworkRow } from '../db/queries/tokens.ts';
import { toShortName } from './names.ts';

/** Fields that only describe the provider's own records, so they stay out of what users see. */
export const INTERNAL_FIELD_KEYS: ReadonlySet<string> = new Set([
  'identity.rwa_xyz_slug',
  'identity.logo',
  'issuer.logo',
]);

type ServedValue = FieldValue['value'];

function readOrganizationId(value: unknown): number | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const id = (value as { organization_id?: unknown }).organization_id;
  return typeof id === 'number' ? id : null;
}

/** The names behind any organization references in these values. */
export async function loadOrganizationLookup(
  db: Queryable,
  values: readonly StoredValue[]
): Promise<ReadonlyMap<number, string>> {
  const ids = values.flatMap((row) => {
    const id = readOrganizationId(row.value);
    return id === null ? [] : [id];
  });
  return findOrganizationNames(db, [...new Set(ids)]);
}

function toServedValue(value: unknown, organizations: ReadonlyMap<number, string>): ServedValue {
  if (value === null || value === undefined) return null;
  const organizationId = readOrganizationId(value);
  if (organizationId !== null) return organizations.get(organizationId) ?? null;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return null;
}

export function toFieldValue(
  field: { key: string; label: string; valueType: string },
  stored: StoredValue | undefined,
  organizations: ReadonlyMap<number, string>
): FieldValue {
  return {
    key: field.key,
    label: field.label,
    valueType: field.valueType,
    value: stored ? toServedValue(stored.value, organizations) : null,
    asOf: stored?.as_of ?? null,
  };
}

const countCoverage = (statuses: readonly FieldStatusRow[]): Coverage => ({
  withData: statuses.filter((row) => row.status === 'with_data').length,
  applicable: statuses.filter((row) => row.status !== 'not_applicable').length,
});

type Category = FieldsSection['categories'][number];

interface CategorySources {
  valuesByField: ReadonlyMap<number, StoredValue[]>;
  networks: readonly AssetNetworkRow[];
  organizations: ReadonlyMap<number, string>;
}

function toRecords(applicable: readonly FieldStatusRow[], sources: CategorySources): Category['records'] {
  const { valuesByField, networks, organizations } = sources;
  const findValue = (row: FieldStatusRow, matches: (value: StoredValue) => boolean) =>
    toFieldValue(row, valuesByField.get(row.id)?.find(matches), organizations);

  const networkFields = applicable.filter((row) => row.level === 'network');
  const networkRecords =
    networkFields.length === 0
      ? []
      : networks.map((network) => ({
          group: 'network',
          key: network.key,
          fields: networkFields.map((row) => findValue(row, (value) => value.subject_ref === `network:${network.id}`)),
        }));

  // Repeating records exist only through their values.
  const groups = [...new Set(applicable.flatMap((row) => (row.recordGroup ? [row.recordGroup] : [])))];
  const repeatingRecords = groups.flatMap((group) => {
    const groupFields = applicable.filter((row) => row.recordGroup === group);
    const keys = groupFields.flatMap((row) => (valuesByField.get(row.id) ?? []).map((value) => value.record_key));
    return [...new Set(keys)].sort().map((key) => ({
      group,
      key,
      fields: groupFields.map((row) => findValue(row, (value) => value.record_key === key)),
    }));
  });

  return [...networkRecords, ...repeatingRecords];
}

/** Null for a category with nothing that applies to this asset. */
function toCategory(name: string, statuses: readonly FieldStatusRow[], sources: CategorySources): Category | null {
  const inCategory = statuses.filter((row) => row.category === name);
  const applicable = inCategory.filter((row) => row.status !== 'not_applicable');
  if (applicable.length === 0) return null;

  const fields = applicable
    .filter((row) => row.recordGroup === null && row.level !== 'network')
    .map((row) => toFieldValue(row, sources.valuesByField.get(row.id)?.[0], sources.organizations));

  return {
    key: toShortName(name),
    name,
    coverage: countCoverage(inCategory),
    fields,
    records: toRecords(applicable, sources),
  };
}

const hasValue = (field: FieldValue): boolean => field.value !== null;

/** Coverage stays as it was, because it counts what applies to the asset rather than what's listed. */
function withoutEmptyValues(category: Category): Category {
  return {
    ...category,
    fields: category.fields.filter(hasValue),
    records: category.records
      .map((record) => ({ ...record, fields: record.fields.filter(hasValue) }))
      .filter((record) => record.fields.length > 0),
  };
}

interface FieldOptions {
  /** Short category names. Undefined means every category. */
  categories: readonly string[] | undefined;
  /** False drops listed fields that have no value. */
  empty: boolean;
}

export async function loadFields(
  db: Queryable,
  assetId: number,
  networks: readonly AssetNetworkRow[],
  options: FieldOptions
): Promise<FieldsSection> {
  const [allStatuses, values] = await Promise.all([
    listAssetFieldStatuses(db, assetId),
    listAssetSubjectValues(db, assetId),
  ]);
  const organizations = await loadOrganizationLookup(db, values);

  // Token fields live on `tokens`. Coverage counts exactly the fields this section can show.
  const statuses = allStatuses.filter((row) => row.level !== 'token' && !INTERNAL_FIELD_KEYS.has(row.key));
  const names = [...new Set(statuses.map((row) => row.category))];

  const known = new Set(names.map(toShortName));
  const unknown = options.categories?.find((category) => !known.has(category));
  if (unknown !== undefined) {
    throw new ApiError('bad_request', `Unknown category: ${unknown}. /assets/catalog lists them`);
  }

  const valuesByField = new Map<number, StoredValue[]>();
  for (const row of values) valuesByField.set(row.field_id, [...(valuesByField.get(row.field_id) ?? []), row]);

  const sources = { valuesByField, networks, organizations };
  const categories = names
    .filter((name) => options.categories === undefined || options.categories.includes(toShortName(name)))
    .flatMap((name) => {
      const category = toCategory(name, statuses, sources);
      if (!category) return [];
      return [options.empty ? category : withoutEmptyValues(category)];
    });

  return { coverage: countCoverage(statuses), categories };
}
