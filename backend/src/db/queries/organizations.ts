/** Organizations and their roles on assets. */
import type { Queryable } from "../pool.ts";

export interface OrganizationIdentity {
  slug: string;
  name: string;
  legalName: string | null;
}

/** Reads before writing, so an unchanged organization writes nothing. */
export async function ensureOrganization(db: Queryable, organization: OrganizationIdentity): Promise<number> {
  const { rows } = await db.query<{ id: number; brand_name: string; legal_name: string | null }>(
    "SELECT id, brand_name, legal_name FROM organization WHERE slug = $1",
    [organization.slug],
  );
  const existing = rows[0];
  if (existing) {
    // Some records name an organization without its legal name, which says nothing about whether it changed.
    const legalName = organization.legalName ?? existing.legal_name;
    if (existing.brand_name !== organization.name || existing.legal_name !== legalName) {
      await db.query("UPDATE organization SET brand_name = $2, legal_name = $3 WHERE id = $1", [
        existing.id,
        organization.name,
        legalName,
      ]);
    }
    return existing.id;
  }
  const inserted = await db.query<{ id: number }>(
    "INSERT INTO organization (slug, brand_name, legal_name) VALUES ($1, $2, $3) RETURNING id",
    [organization.slug, organization.name, organization.legalName],
  );
  const id = inserted.rows[0]?.id;
  if (id === undefined) throw new Error("Couldn't create an organization");
  return id;
}

interface AssetRole {
  organizationId: number;
  role: string;
}

/** Makes an asset's rows match the provider, so a role it removes doesn't stay forever. */
export async function syncAssetOrganizations(
  db: Queryable,
  assetId: number,
  roles: readonly AssetRole[],
): Promise<void> {
  const organizationIds = roles.map((role) => role.organizationId);
  const roleNames = roles.map((role) => role.role);
  await db.query(
    `DELETE FROM asset_organization ao
     WHERE ao.asset_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM unnest($2::int[], $3::text[]) AS keep(organization_id, role)
         WHERE keep.organization_id = ao.organization_id AND keep.role = ao.role
       )`,
    [assetId, organizationIds, roleNames],
  );
  await db.query(
    `INSERT INTO asset_organization (asset_id, organization_id, role)
     SELECT $1, organization_id, role FROM unnest($2::int[], $3::text[]) AS keep(organization_id, role)
     ON CONFLICT DO NOTHING`,
    [assetId, organizationIds, roleNames],
  );
}

interface AssetOrganizationRow {
  slug: string;
  name: string;
  role: string;
  legal_name: string | null;
}

export async function listAssetOrganizations(db: Queryable, assetId: number): Promise<AssetOrganizationRow[]> {
  const { rows } = await db.query<AssetOrganizationRow>(
    `SELECT o.slug, o.brand_name AS name, ao.role, o.legal_name
     FROM asset_organization ao
     JOIN organization o ON o.id = ao.organization_id
     WHERE ao.asset_id = $1
     ORDER BY ao.role, o.brand_name, o.id`,
    [assetId],
  );
  return rows;
}

export async function findOrganizationNames(db: Queryable, ids: readonly number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const { rows } = await db.query<{ id: number; brand_name: string }>(
    "SELECT id, brand_name FROM organization WHERE id = ANY($1::int[])",
    [ids],
  );
  return new Map(rows.map((row) => [row.id, row.brand_name]));
}
