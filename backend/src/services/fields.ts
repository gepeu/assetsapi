/**
 * Turns catalog rows and stored values into `/assets/{slug}/fields`. Organizations are resolved to
 * their names, so consumers never see internal IDs.
 */

import type { FieldsResponse } from "../api/schemas/fields.ts";
import type { Coverage, FieldValue } from "../api/schemas/shared.ts";
import type { Queryable } from "../db/pool.ts";
import { findActiveAssetBySlug } from "../db/queries/assets.ts";
import type { FieldStatusRow, StoredValue } from "../db/queries/fieldValues.ts";
import { listAssetFieldStatuses, listAssetSubjectValues } from "../db/queries/fieldValues.ts";
import { findOrganizationNames } from "../db/queries/organizations.ts";
import { type AssetNetworkRow, listAssetNetworks } from "../db/queries/tokens.ts";

/** Fields that only describe the provider's own records, so they stay out of what users see. */
const INTERNAL_FIELD_KEYS: ReadonlySet<string> = new Set(["identity.rwa_xyz_slug", "identity.logo", "issuer.logo"]);

type ServedValue = FieldValue["value"];

function readOrganizationId(value: unknown): number | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const id = (value as { organization_id?: unknown }).organization_id;
  return typeof id === "number" ? id : null;
}

/** The names behind any organization references in these values. */
export async function loadOrganizationLookup(
  db: Queryable,
  values: readonly StoredValue[],
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
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return null;
}

export function toFieldValue(
  field: { key: string; label: string; valueType: string },
  stored: StoredValue | undefined,
  organizations: ReadonlyMap<number, string>,
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
  withData: statuses.filter((row) => row.status === "with_data").length,
  applicable: statuses.filter((row) => row.status !== "not_applicable").length,
});

type Category = FieldsResponse["data"]["categories"][number];

interface CategorySources {
  valuesByField: ReadonlyMap<number, StoredValue[]>;
  networks: readonly AssetNetworkRow[];
  organizations: ReadonlyMap<number, string>;
}

function toRecords(applicable: readonly FieldStatusRow[], sources: CategorySources): Category["records"] {
  const { valuesByField, networks, organizations } = sources;
  const findValue = (row: FieldStatusRow, matches: (value: StoredValue) => boolean) =>
    toFieldValue(row, valuesByField.get(row.id)?.find(matches), organizations);

  const networkFields = applicable.filter((row) => row.level === "network");
  const networkRecords =
    networkFields.length === 0
      ? []
      : networks.map((network) => ({
          group: "network",
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
  const applicable = inCategory.filter((row) => row.status !== "not_applicable");
  if (applicable.length === 0) return null;

  const fields = applicable
    .filter((row) => row.recordGroup === null && row.level !== "network")
    .map((row) => toFieldValue(row, sources.valuesByField.get(row.id)?.[0], sources.organizations));

  return { name, coverage: countCoverage(inCategory), fields, records: toRecords(applicable, sources) };
}

/** Null when the asset is unknown or deactivated. */
export async function getAssetFields(db: Queryable, slug: string): Promise<FieldsResponse | null> {
  const asset = await findActiveAssetBySlug(db, slug);
  if (!asset) return null;

  const [allStatuses, values, networks] = await Promise.all([
    listAssetFieldStatuses(db, asset.id),
    listAssetSubjectValues(db, asset.id),
    listAssetNetworks(db, asset.id),
  ]);
  const organizations = await loadOrganizationLookup(db, values);

  // Token fields live on /tokens. Coverage counts exactly the fields this response can show.
  const statuses = allStatuses.filter((row) => row.level !== "token" && !INTERNAL_FIELD_KEYS.has(row.key));

  const valuesByField = new Map<number, StoredValue[]>();
  for (const row of values) valuesByField.set(row.field_id, [...(valuesByField.get(row.field_id) ?? []), row]);

  const sources = { valuesByField, networks, organizations };
  const categories = [...new Set(statuses.map((row) => row.category))].flatMap((name) => {
    const category = toCategory(name, statuses, sources);
    return category ? [category] : [];
  });

  return { data: { coverage: countCoverage(statuses), categories } };
}
