/** The field catalog and `field_value`. Writes skip locked rows and leave unchanged rows untouched. */
import type { Queryable } from "../pool.ts";

/** How long a value stays after the provider stops reporting it. */
const MISSING_GRACE = "7 days";

export interface CatalogField {
  id: number;
  key: string;
  category: string;
  label: string;
  valueType: string;
  level: string;
  recordGroup: string | null;
}

export async function listCatalog(db: Queryable): Promise<CatalogField[]> {
  const { rows } = await db.query<CatalogField>(
    `SELECT id, key, category, label, value_type AS "valueType", level, record_group AS "recordGroup"
     FROM field ORDER BY sort_order`,
  );
  return rows;
}

export interface FieldValueWrite {
  fieldId: number;
  assetId: number | null;
  tokenId: number | null;
  organizationId: number | null;
  networkId: number | null;
  value: unknown;
  raw: unknown;
  asOf: string;
}

/**
 * Upserts values and clears `missing_since` on those that came back. `as_of` only moves forward,
 * because an organization or network is shared and each asset's load carries its own date.
 * Returns the rows written.
 */
export async function upsertFieldValues(
  db: Queryable,
  rows: readonly FieldValueWrite[],
  sourceId: number,
  runId: number,
): Promise<number> {
  if (rows.length === 0) return 0;
  const { rowCount } = await db.query(
    `INSERT INTO field_value (field_id, asset_id, token_id, organization_id, network_id, value, raw_value, as_of, source_id, ingestion_run_id)
     SELECT u.field_id, u.asset_id, u.token_id, u.organization_id, u.network_id, u.value, u.raw_value, u.as_of, $9, $10
     FROM unnest($1::int[], $2::int[], $3::int[], $4::int[], $5::int[], $6::jsonb[], $7::jsonb[], $8::date[])
       AS u(field_id, asset_id, token_id, organization_id, network_id, value, raw_value, as_of)
     ON CONFLICT (field_id, subject_ref, record_key) DO UPDATE SET
       value = EXCLUDED.value,
       raw_value = EXCLUDED.raw_value,
       as_of = GREATEST(field_value.as_of, EXCLUDED.as_of),
       source_id = EXCLUDED.source_id,
       ingestion_run_id = EXCLUDED.ingestion_run_id,
       missing_since = NULL,
       updated_at = CASE WHEN field_value.value IS DISTINCT FROM EXCLUDED.value THEN now() ELSE field_value.updated_at END
     WHERE field_value.locked_reason IS NULL AND (
       field_value.value IS DISTINCT FROM EXCLUDED.value
       OR field_value.raw_value IS DISTINCT FROM EXCLUDED.raw_value
       OR field_value.missing_since IS NOT NULL
       OR field_value.as_of IS NULL
       OR EXCLUDED.as_of > field_value.as_of
     )`,
    [
      rows.map((row) => row.fieldId),
      rows.map((row) => row.assetId),
      rows.map((row) => row.tokenId),
      rows.map((row) => row.organizationId),
      rows.map((row) => row.networkId),
      rows.map((row) => JSON.stringify(row.value)),
      rows.map((row) => JSON.stringify(row.raw ?? null)),
      rows.map((row) => row.asOf),
      sourceId,
      runId,
    ],
  );
  return rowCount ?? 0;
}

export interface SeenValue {
  fieldId: number;
  subjectRef: string;
}

/** Starts the clock on values this successful load didn't report. Called only after a load succeeds. */
export async function markMissingFieldValues(
  db: Queryable,
  subjects: readonly string[],
  seen: readonly SeenValue[],
): Promise<number> {
  const { rowCount } = await db.query(
    `UPDATE field_value v SET missing_since = now()
     WHERE v.subject_ref = ANY($1::text[])
       AND v.locked_reason IS NULL
       AND v.missing_since IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM unnest($2::int[], $3::text[]) AS s(field_id, subject_ref)
         WHERE s.field_id = v.field_id AND s.subject_ref = v.subject_ref
       )`,
    [subjects, seen.map((row) => row.fieldId), seen.map((row) => row.subjectRef)],
  );
  return rowCount ?? 0;
}

export async function deleteExpiredFieldValues(db: Queryable, subjects: readonly string[]): Promise<number> {
  const { rowCount } = await db.query(
    `DELETE FROM field_value
     WHERE subject_ref = ANY($1::text[])
       AND locked_reason IS NULL
       AND missing_since < now() - $2::interval`,
    [subjects, MISSING_GRACE],
  );
  return rowCount ?? 0;
}

export interface FieldStatusRow extends CatalogField {
  status: "with_data" | "no_data" | "not_applicable";
}

export async function listAssetFieldStatuses(db: Queryable, assetId: number): Promise<FieldStatusRow[]> {
  const { rows } = await db.query<FieldStatusRow>(
    `SELECT f.id, f.key, f.category, f.label, f.value_type AS "valueType", f.level,
            f.record_group AS "recordGroup", s.status
     FROM asset_field_status s
     JOIN field f ON f.id = s.field_id
     WHERE s.asset_id = $1
     ORDER BY f.sort_order`,
    [assetId],
  );
  return rows;
}

export interface StoredValue {
  field_id: number;
  subject_ref: string;
  record_key: string;
  value: unknown;
  as_of: string | null;
}

/** Values on the asset and its issuer and networks, without its tokens'. */
export async function listAssetSubjectValues(db: Queryable, assetId: number): Promise<StoredValue[]> {
  const { rows } = await db.query<StoredValue>(
    `SELECT v.field_id, v.subject_ref, v.record_key, v.value, v.as_of::text AS as_of
     FROM field_value v
     JOIN asset_subject s ON s.subject_ref = v.subject_ref AND s.asset_id = $1
     WHERE s.level <> 'token'`,
    [assetId],
  );
  return rows;
}

export async function listTokenValues(db: Queryable, tokenIds: readonly number[]): Promise<StoredValue[]> {
  const { rows } = await db.query<StoredValue>(
    `SELECT v.field_id, v.subject_ref, v.record_key, v.value, v.as_of::text AS as_of
     FROM field_value v
     WHERE v.token_id = ANY($1::int[])`,
    [tokenIds],
  );
  return rows;
}

/** One asset field's value, such as its description. */
export async function findAssetFieldValue(db: Queryable, assetId: number, fieldKey: string): Promise<unknown> {
  const { rows } = await db.query<{ value: unknown }>(
    `SELECT v.value FROM field_value v JOIN field f ON f.id = v.field_id
     WHERE v.asset_id = $1 AND f.key = $2 AND v.record_key = ''`,
    [assetId, fieldKey],
  );
  return rows[0]?.value ?? null;
}
