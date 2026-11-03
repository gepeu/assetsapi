import type pg from "pg";

export type FieldStatus = "disclosed" | "not_disclosed" | "not_applicable" | "attributed_only" | "never_checked";

/** Organizations are resolved to their names, so consumers never see internal IDs. */
export type DataValue = string | number | boolean | string[];

export interface CoverageCounts {
  disclosed: number;
  /** Everything except not applicable: the denominator of "25/60". */
  applicable: number;
  notDisclosed: number;
  attributedOnly: number;
  neverChecked: number;
  notApplicable: number;
  conflicts: number;
}

export interface ClaimCitation {
  documentId: number;
  title: string;
  quote: string;
  locator: string | null;
  verified: boolean;
}

/** What one source said. */
export interface SourceClaim {
  source: string;
  status: "disclosed" | "not_disclosed" | "not_applicable";
  value: DataValue | null;
  asOf: string | null;
  observedAt: string;
  method: string;
  /** This is the claim the Fact uses. */
  isFact: boolean;
  /** Holds subjective wording, so it stays attributed to its source and never becomes a Fact. */
  isAttributedOnly: boolean;
  overrideReason: string | null;
  citations: ClaimCitation[];
}

/** What we believe for one field of one subject, with every source's claim behind it. */
export interface FactValue {
  status: FieldStatus;
  value: DataValue | null;
  source: string | null;
  asOf: string | null;
  hasConflict: boolean;
  claims: SourceClaim[];
}

export interface FieldDescriptor {
  key: string;
  label: string;
  valueType: string;
  requiresAsOf: boolean;
  conflictPolicy: "chain_first" | "documents_first";
  /** Across the whole asset, as counted in coverage. A field can differ between tokens. */
  status: FieldStatus;
  hasConflict: boolean;
}

export interface FieldsBlock {
  kind: "fields";
  fields: (FieldDescriptor & FactValue)[];
}

export interface RecordsBlock {
  kind: "records";
  key: string;
  title: string;
  /** Names the row label's column; null when the columns identify the row themselves. */
  rowLabelHeader: string | null;
  columns: FieldDescriptor[];
  rows: { key: string; label: string | null; cells: FactValue[] }[];
  /** Every source behind this block's values. */
  sources: string[];
}

export interface CategoryView {
  name: string;
  coverage: CoverageCounts;
  blocks: (FieldsBlock | RecordsBlock)[];
}

export interface AssetDocument {
  id: number;
  title: string;
  url: string;
  category: string;
  isOfficial: boolean;
  lastCheckedAt: string | null;
  /** We hold a usable copy, so it can be downloaded from us. */
  hasSavedCopy: boolean;
}

export interface AssetDetailView {
  asset: {
    slug: string;
    ticker: string;
    name: string;
    assetClass: string;
    assetType: string;
    issuer: string | null;
    description: string | null;
    reviewNote: string | null;
  };
  /** Size of the whole catalog, including fields that don't apply to this asset type. */
  catalogFieldCount: number;
  coverage: CoverageCounts;
  conflictOrders: Record<FieldDescriptor["conflictPolicy"], string[]>;
  categories: CategoryView[];
  /** Official documents first. */
  documents: AssetDocument[];
}

export const ASSET_CLASS_LABELS: Record<string, string> = {
  equity: "Equity",
  treasuries: "Treasuries",
  private_credit: "Private credit",
  reinsurance: "Reinsurance",
  commodities: "Commodities",
  cryptocurrency: "Cryptocurrency",
  onchain_yield: "Onchain yield",
};

/** How each repeating group is titled. A new group falls back to its key until it's added here. */
const RECORD_TITLES: Record<string, string> = {
  token: "Tokens, one row per chain",
  network: "Networks",
  control: "Authorities, one row per contract and role",
  audit: "Smart contract audits",
  bug_bounty: "Bug bounty",
  incident: "Incidents",
  oracle: "Oracles",
};

/** Field whose value is already the row's label, so it doesn't need its own column. */
const ROW_LABEL_FIELDS = new Set(["token.network"]);

const ROW_LABEL_HEADERS: Record<string, string> = { token: "Network", network: "Network" };

interface FieldRow {
  id: number;
  key: string;
  category: string;
  label: string;
  value_type: string;
  level: string;
  conflict_policy: FieldDescriptor["conflictPolicy"];
  requires_as_of: boolean;
  record_group: string | null;
  applies: boolean;
  status: FieldStatus | null;
  has_conflict: boolean | null;
}

interface FactRow {
  field_id: number;
  subject_ref: string;
  record_key: string;
  claim_id: string;
  status: "disclosed" | "not_disclosed" | "not_applicable";
  normalized_value: unknown;
  as_of: string | null;
  has_conflict: boolean;
  source: string;
}

interface ClaimRow {
  id: string;
  field_id: number;
  subject_ref: string;
  record_key: string;
  status: SourceClaim["status"];
  normalized_value: unknown;
  as_of: string | null;
  observed_at: string;
  extraction_method: string;
  override_reason: string | null;
  is_subjective: boolean;
  source: string;
}

const cellKey = (fieldId: number, subjectRef: string, recordKey: string) => `${fieldId}|${subjectRef}|${recordKey}`;

function emptyCoverage(): CoverageCounts {
  return {
    disclosed: 0,
    applicable: 0,
    notDisclosed: 0,
    attributedOnly: 0,
    neverChecked: 0,
    notApplicable: 0,
    conflicts: 0,
  };
}

function addToCoverage(coverage: CoverageCounts, status: FieldStatus, hasConflict: boolean) {
  if (status !== "not_applicable") coverage.applicable++;
  if (status === "disclosed") coverage.disclosed++;
  if (status === "not_disclosed") coverage.notDisclosed++;
  if (status === "attributed_only") coverage.attributedOnly++;
  if (status === "never_checked") coverage.neverChecked++;
  if (status === "not_applicable") coverage.notApplicable++;
  if (hasConflict) coverage.conflicts++;
}

/** Null when no asset has this slug. */
export async function loadAssetDetail(pool: pg.Pool, slug: string): Promise<AssetDetailView | null> {
  const { rows: assets } = await pool.query<{
    id: number;
    slug: string;
    ticker: string;
    name: string;
    asset_class: string;
    asset_type: string;
    listed_issuer: string | null;
    review_note: string | null;
  }>(`SELECT id, slug, ticker, name, asset_class, asset_type, listed_issuer, review_note FROM asset WHERE slug = $1`, [
    slug,
  ]);
  const asset = assets[0];
  if (!asset) return null;

  const [fieldRows, factRows, claimRows, tokens, networks, priorities, documents] = await Promise.all([
    pool.query<FieldRow>(
      `SELECT f.id, f.key, f.category, f.label, f.value_type, f.level, f.conflict_policy, f.requires_as_of,
              f.record_group, a.asset_type = ANY (f.applicable_asset_types) AS applies, s.status, s.has_conflict
       FROM field f
       JOIN asset a ON a.id = $1
       LEFT JOIN asset_field_status s ON s.asset_id = a.id AND s.field_id = f.id
       ORDER BY f.sort_order`,
      [asset.id],
    ),
    pool.query<FactRow>(
      `SELECT x.field_id, x.subject_ref, x.record_key, x.claim_id, x.status, x.normalized_value,
              x.as_of::text, x.has_conflict, src.name AS source
       FROM fact x
       JOIN asset_subject sub ON sub.subject_ref = x.subject_ref AND sub.asset_id = $1
       JOIN source src ON src.id = x.source_id`,
      [asset.id],
    ),
    // One current claim per source, as in current_claim, but keeping the attributed-only ones.
    pool.query<ClaimRow>(
      `SELECT DISTINCT ON (c.field_id, c.subject_ref, c.record_key, c.source_id, c.is_subjective)
              c.id, c.field_id, c.subject_ref, c.record_key, c.status, c.normalized_value, c.as_of::text,
              c.observed_at::text, c.extraction_method, c.override_reason, c.is_subjective, src.name AS source
       FROM eligible_claim c
       JOIN asset_subject sub ON sub.subject_ref = c.subject_ref AND sub.asset_id = $1
       JOIN source src ON src.id = c.source_id
       ORDER BY c.field_id, c.subject_ref, c.record_key, c.source_id, c.is_subjective,
                (c.override_id IS NOT NULL) DESC, c.observed_at DESC, c.id DESC`,
      [asset.id],
    ),
    pool.query<{ id: number; network: string }>(
      `SELECT t.id, n.name AS network FROM token t JOIN network n ON n.id = t.network_id
       WHERE t.asset_id = $1 ORDER BY n.name, t.address`,
      [asset.id],
    ),
    pool.query<{ id: number; name: string }>(
      `SELECT DISTINCT n.id, n.name FROM token t JOIN network n ON n.id = t.network_id
       WHERE t.asset_id = $1 ORDER BY n.name`,
      [asset.id],
    ),
    pool.query<{ policy: FieldDescriptor["conflictPolicy"]; name: string }>(
      `SELECT p.policy, s.name FROM source_priority p JOIN source s ON s.id = p.source_id ORDER BY p.policy, p.rank`,
    ),
    pool.query<AssetDocument>(
      `SELECT d.id, coalesce(d.title, d.url) AS title, d.url, d.category, ad.is_official AS "isOfficial",
              d.last_checked_at::date::text AS "lastCheckedAt",
              EXISTS (SELECT 1 FROM searchable_file f WHERE f.document_id = d.id) AS "hasSavedCopy"
       FROM asset_document ad
       JOIN document d ON d.id = ad.document_id
       WHERE ad.asset_id = $1
       ORDER BY ad.is_official DESC, d.category, title, d.id`,
      [asset.id],
    ),
  ]);

  const citationsByClaim = await loadCitations(
    pool,
    claimRows.rows.map((claim) => claim.id),
  );
  const organizations = await loadOrganizationNames(pool, [...factRows.rows, ...claimRows.rows]);

  const toValue = (value: unknown): DataValue | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === "object" && !Array.isArray(value)) {
      const id = (value as { organization_id?: number }).organization_id;
      return id === undefined ? JSON.stringify(value) : (organizations.get(id) ?? null);
    }
    return value as DataValue;
  };

  const factByCell = new Map(factRows.rows.map((fact) => [cellKey(fact.field_id, fact.subject_ref, fact.record_key), fact]));
  const claimsByCell = new Map<string, ClaimRow[]>();
  for (const claim of claimRows.rows) {
    const key = cellKey(claim.field_id, claim.subject_ref, claim.record_key);
    claimsByCell.set(key, [...(claimsByCell.get(key) ?? []), claim]);
  }

  const buildValue = (fieldId: number, subjectRef: string, recordKey: string): FactValue => {
    const key = cellKey(fieldId, subjectRef, recordKey);
    const fact = factByCell.get(key);
    const claims = claimsByCell.get(key) ?? [];
    const attributedOnly = !fact && claims.some((claim) => claim.is_subjective);
    return {
      status: fact?.status ?? (attributedOnly ? "attributed_only" : "never_checked"),
      value: fact?.status === "disclosed" ? toValue(fact.normalized_value) : null,
      source: fact?.source ?? null,
      asOf: fact?.as_of ?? null,
      hasConflict: fact?.has_conflict ?? false,
      claims: claims
        .map((claim) => ({
          source: claim.source,
          status: claim.status,
          value: toValue(claim.normalized_value),
          asOf: claim.as_of,
          observedAt: claim.observed_at,
          method: claim.extraction_method,
          isFact: claim.id === fact?.claim_id,
          isAttributedOnly: claim.is_subjective,
          overrideReason: claim.override_reason,
          citations: citationsByClaim.get(claim.id) ?? [],
        }))
        .sort((a, b) => Number(b.isFact) - Number(a.isFact)),
    };
  };

  const subjectsByLevel = await loadSubjects(pool, asset.id);
  const tokenRows = tokens.rows.map((token) => ({ subjectRef: `token:${token.id}`, recordKey: "", label: token.network }));
  const networkRows = networks.rows.map((network) => ({
    subjectRef: `network:${network.id}`,
    recordKey: "",
    label: network.name,
  }));

  const categories = new Map<string, CategoryView>();
  const recordGroups = new Map<string, FieldRow[]>();
  const coverage = emptyCoverage();
  const descriptor = (field: FieldRow): FieldDescriptor => ({
    key: field.key,
    label: field.label,
    valueType: field.value_type,
    requiresAsOf: field.requires_as_of,
    conflictPolicy: field.conflict_policy,
    status: field.status ?? "never_checked",
    hasConflict: field.has_conflict ?? false,
  });

  for (const field of fieldRows.rows) {
    let category = categories.get(field.category);
    if (!category) {
      category = { name: field.category, coverage: emptyCoverage(), blocks: [] };
      categories.set(field.category, category);
    }
    if (!field.applies) continue;

    addToCoverage(category.coverage, field.status ?? "never_checked", field.has_conflict ?? false);
    addToCoverage(coverage, field.status ?? "never_checked", field.has_conflict ?? false);

    const group = field.record_group ?? (field.level === "token" || field.level === "network" ? field.level : null);
    if (group) {
      const key = `${field.category}|${group}`;
      recordGroups.set(key, [...(recordGroups.get(key) ?? []), field]);
      continue;
    }

    let block = category.blocks.find((b): b is FieldsBlock => b.kind === "fields");
    if (!block) {
      block = { kind: "fields", fields: [] };
      category.blocks.push(block);
    }
    // Asset fields have one subject; organization fields have the asset's issuer. Should an asset
    // ever have two issuers, this shows the first one's value and lists every claim.
    const subjects = subjectsByLevel.get(field.level) ?? [];
    const values = subjects.map((subjectRef) => buildValue(field.id, subjectRef, ""));
    const value = values.find((v) => v.status === field.status) ?? buildValue(field.id, "", "");
    block.fields.push({
      ...descriptor(field),
      ...value,
      claims: values.flatMap((v) => v.claims),
    });
  }

  for (const [key, fields] of recordGroups) {
    const [categoryName, group] = key.split("|");
    const fieldIds = new Set(fields.map((field) => field.id));

    let baseRows: { subjectRef: string; recordKey: string; label: string | null }[];
    if (group === "token") baseRows = tokenRows;
    else if (group === "network") baseRows = networkRows;
    else {
      // Repeating records exist only through their claims.
      const seen = new Map<string, { subjectRef: string; recordKey: string; label: null }>();
      for (const claim of claimRows.rows) {
        if (!fieldIds.has(claim.field_id)) continue;
        seen.set(`${claim.subject_ref}|${claim.record_key}`, {
          subjectRef: claim.subject_ref,
          recordKey: claim.record_key,
          label: null,
        });
      }
      baseRows = [...seen.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, row]) => row);
    }

    const shownFields = fields.filter((field) => !ROW_LABEL_FIELDS.has(field.key));
    const rows = baseRows.map((row) => ({
      key: `${row.subjectRef}|${row.recordKey}`,
      label: row.label,
      cells: shownFields.map((field) => buildValue(field.id, row.subjectRef, row.recordKey)),
    }));

    categories.get(categoryName)!.blocks.push({
      kind: "records",
      key: group,
      title: RECORD_TITLES[group] ?? group,
      rowLabelHeader: ROW_LABEL_HEADERS[group] ?? null,
      columns: shownFields.map(descriptor),
      rows,
      sources: [...new Set(rows.flatMap((row) => row.cells.flatMap((cell) => (cell.source ? [cell.source] : []))))].sort(),
    });
  }

  const conflictOrders: AssetDetailView["conflictOrders"] = { chain_first: [], documents_first: [] };
  for (const { policy, name } of priorities.rows) conflictOrders[policy].push(name);

  const identityFact = (fieldKey: string): DataValue | null => {
    for (const category of categories.values()) {
      for (const block of category.blocks) {
        if (block.kind !== "fields") continue;
        const field = block.fields.find((candidate) => candidate.key === fieldKey);
        if (field) return field.value;
      }
    }
    return null;
  };
  const description = identityFact("identity.description");
  const issuer = identityFact("issuer.name");

  return {
    asset: {
      slug: asset.slug,
      ticker: asset.ticker,
      name: asset.name,
      assetClass: ASSET_CLASS_LABELS[asset.asset_class] ?? asset.asset_class,
      assetType: asset.asset_type,
      issuer: typeof issuer === "string" ? issuer : asset.listed_issuer,
      description: typeof description === "string" ? description : null,
      reviewNote: asset.review_note,
    },
    catalogFieldCount: fieldRows.rows.length,
    coverage,
    conflictOrders,
    categories: [...categories.values()],
    documents: documents.rows,
  };
}

async function loadSubjects(pool: pg.Pool, assetId: number): Promise<Map<string, string[]>> {
  const { rows } = await pool.query<{ level: string; subject_ref: string }>(
    `SELECT level, subject_ref FROM asset_subject WHERE asset_id = $1`,
    [assetId],
  );
  const subjects = new Map<string, string[]>();
  for (const { level, subject_ref } of rows) {
    subjects.set(level, [...(subjects.get(level) ?? []), subject_ref]);
  }
  return subjects;
}

async function loadCitations(pool: pg.Pool, claimIds: string[]): Promise<Map<string, ClaimCitation[]>> {
  const { rows } = await pool.query<{
    claim_id: string;
    document_id: number;
    title: string | null;
    url: string;
    quote: string;
    locator: string | null;
    verified: boolean;
  }>(
    `SELECT cc.claim_id, cc.document_id, d.title, d.url, cc.quote, cc.locator, cc.verified_at IS NOT NULL AS verified
     FROM claim_citation cc
     JOIN document d ON d.id = cc.document_id
     WHERE cc.claim_id = ANY ($1::bigint[])
     ORDER BY cc.id`,
    [claimIds],
  );
  const citations = new Map<string, ClaimCitation[]>();
  for (const row of rows) {
    citations.set(row.claim_id, [
      ...(citations.get(row.claim_id) ?? []),
      {
        documentId: row.document_id,
        title: row.title ?? row.url,
        quote: row.quote,
        locator: row.locator,
        verified: row.verified,
      },
    ]);
  }
  return citations;
}

async function loadOrganizationNames(
  pool: pg.Pool,
  rows: { normalized_value: unknown }[],
): Promise<Map<number, string>> {
  const ids = new Set<number>();
  for (const { normalized_value: value } of rows) {
    const id = (value as { organization_id?: number } | null)?.organization_id;
    if (typeof id === "number") ids.add(id);
  }
  const { rows: organizations } = await pool.query<{ id: number; brand_name: string }>(
    `SELECT id, brand_name FROM organization WHERE id = ANY ($1::int[])`,
    [[...ids]],
  );
  return new Map(organizations.map((organization) => [organization.id, organization.brand_name]));
}
