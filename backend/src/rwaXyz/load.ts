import { createHash } from "node:crypto";
import type pg from "pg";
import type { BucketStorage } from "../bucketStorage.ts";
import { inTransaction } from "../db/pool.ts";
import { matchAsset, type MatchResult } from "./assetMatch.ts";
import type { ApiRecord, RawResponse, RwaXyzClient } from "./client.ts";
import {
  ASSET_MAPPINGS,
  ISSUER_MAPPINGS,
  issuanceType,
  NETWORK_MAPPINGS,
  normalizeValue,
  slugify,
  TOKEN_MAPPINGS,
  type FieldMapping,
} from "./mapping.ts";

type SubjectColumn = "asset_id" | "token_id" | "organization_id" | "network_id";
interface Subject {
  column: SubjectColumn;
  id: number;
}

export interface LoadSummary {
  runId: string;
  matched: { ticker: string; method: string; rwaId: unknown; tokens: number }[];
  notFound: { ticker: string; reason: string }[];
  mismatched: { ticker: string; reason: string }[];
  failed: { ticker: string; error: string }[];
  claimsAdded: number;
  claimsUnchanged: number;
  tokensSeen: number;
  tokensSkipped: { ticker: string; reason: string; name: unknown }[];
  rawResponsesKept: number;
}

const dateOf = (value: unknown): string | null => {
  const date = typeof value === "string" ? value.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
};

/** Upserts by RWA.xyz's slug. Only identity fields are read, so nothing financial can come along. */
async function ensureOrganization(client: pg.PoolClient, object: ApiRecord): Promise<number | null> {
  const name = typeof object.name === "string" ? object.name.trim() : "";
  if (!name) return null;
  const slug = typeof object.slug === "string" && object.slug ? object.slug : slugify(name);
  const legalName = typeof object.legal_name === "string" ? object.legal_name : null;
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO organization (slug, brand_name, legal_name) VALUES ($1, $2, $3)
     ON CONFLICT (slug) DO UPDATE SET legal_name = coalesce(organization.legal_name, EXCLUDED.legal_name)
     RETURNING id`,
    [slug, name, legalName],
  );
  return rows[0].id;
}

class Loader {
  private readonly pool: pg.Pool;
  private readonly summary: LoadSummary;
  private readonly runId: string;
  private readonly sourceId: number;
  private readonly today: string;
  private readonly fields: Map<string, { id: number; valueType: string }>;
  private readonly networks = new Map<number, number>();
  private readonly networkRecords: RwaXyzClient;

  constructor(
    pool: pg.Pool,
    client: RwaXyzClient,
    summary: LoadSummary,
    runId: string,
    sourceId: number,
    today: string,
    fields: Map<string, { id: number; valueType: string }>,
  ) {
    this.pool = pool;
    this.networkRecords = client;
    this.summary = summary;
    this.runId = runId;
    this.sourceId = sourceId;
    this.today = today;
    this.fields = fields;
  }

  /** Adds a claim unless the same source's current claim already says the same thing. */
  private async addClaim(
    db: pg.PoolClient,
    fieldId: number,
    subject: Subject,
    raw: unknown,
    normalized: unknown,
    asOf: string,
  ): Promise<void> {
    const value = JSON.stringify(normalized);
    const { rows } = await db.query<{ same: boolean }>(
      `SELECT normalized_value = $1::jsonb AS same
       FROM claim
       WHERE field_id = $2 AND ${subject.column} = $3 AND source_id = $4 AND withdrawn_at IS NULL
       ORDER BY observed_at DESC, id DESC LIMIT 1`,
      [value, fieldId, subject.id, this.sourceId],
    );
    if (rows[0]?.same) {
      this.summary.claimsUnchanged++;
      return;
    }
    await db.query(
      `INSERT INTO claim (field_id, ${subject.column}, source_id, ingestion_run_id, status, raw_value,
                          normalized_value, as_of, extraction_method)
       VALUES ($1, $2, $3, $4, 'disclosed', $5, $6, $7, 'api')`,
      [fieldId, subject.id, this.sourceId, this.runId, JSON.stringify(raw), value, asOf],
    );
    this.summary.claimsAdded++;
  }

  /** Applies one mapping list to one API record. A null from the API adds nothing. */
  private async applyMappings(
    db: pg.PoolClient,
    mappings: readonly FieldMapping[],
    record: ApiRecord,
    subject: Subject,
    asOf: string,
    onOrganization?: (mapping: FieldMapping, organizationId: number) => Promise<void>,
  ): Promise<void> {
    for (const mapping of mappings) {
      const field = this.fields.get(mapping.field);
      if (!field) throw new Error(`Mapping names an unknown catalog field: ${mapping.field}`);
      const raw = mapping.get(record);
      if (raw === null || raw === undefined) continue;

      if (field.valueType === "organization") {
        const object = raw as ApiRecord;
        const organizationId = await ensureOrganization(db, object);
        if (organizationId === null) continue;
        await onOrganization?.(mapping, organizationId);
        await this.addClaim(
          db,
          field.id,
          subject,
          { name: object.name, slug: object.slug, legal_name: object.legal_name ?? null },
          { organization_id: organizationId },
          asOf,
        );
        continue;
      }

      const normalized = normalizeValue(field.valueType, raw);
      if (normalized.kind === "value") await this.addClaim(db, field.id, subject, raw, normalized.value, asOf);
    }
  }

  private async loadNetwork(db: pg.PoolClient, rwaNetworkId: number): Promise<number | null> {
    const known = this.networks.get(rwaNetworkId);
    if (known) return known;

    const record = await this.networkRecords.getNetwork(rwaNetworkId);
    if (!record || typeof record.slug !== "string") return null;

    // Addresses compare case-insensitively on EVM chains only.
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO network (key, name, address_case_sensitive) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, address_case_sensitive = EXCLUDED.address_case_sensitive
       RETURNING id`,
      [record.slug, record.name, record.evm_chain_id == null],
    );
    const networkId = rows[0].id;
    this.networks.set(rwaNetworkId, networkId);

    const parentId = typeof record.parent_network_id === "number" ? record.parent_network_id : null;
    const parent = parentId === null ? null : await this.networkRecords.getNetwork(parentId);
    await this.applyMappings(
      db,
      NETWORK_MAPPINGS,
      { ...record, parent_network_name: parent?.name ?? null },
      { column: "network_id", id: networkId },
      dateOf(record._updated_at) ?? this.today,
    );
    return networkId;
  }

  async loadAsset(ourAsset: { id: number; ticker: string }, record: ApiRecord): Promise<number> {
    const tokens = await this.networkRecords.listTokensForAsset(record.id as number);
    const asOf = dateOf(record._updated_at) ?? this.today;

    return inTransaction(this.pool, async (db) => {
      const aliases: [string, unknown][] = [
        ["rwa_xyz_id", String(record.id)],
        ["rwa_xyz_slug", record.slug],
      ];
      for (const [namespace, value] of aliases) {
        await db.query(
          `INSERT INTO asset_alias (asset_id, namespace, value, verified) VALUES ($1, $2, $3, true)
           ON CONFLICT (namespace, value) DO UPDATE SET asset_id = EXCLUDED.asset_id, verified = true`,
          [ourAsset.id, namespace, value],
        );
      }

      const issuer = record.issuer as ApiRecord | null | undefined;
      await this.applyMappings(
        db,
        ASSET_MAPPINGS,
        record,
        { column: "asset_id", id: ourAsset.id },
        asOf,
        async (mapping, organizationId) => {
          await db.query(
            `INSERT INTO asset_organization (asset_id, organization_id, role) VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [ourAsset.id, organizationId, mapping.role],
          );
        },
      );

      if (issuer) {
        const issuerId = await ensureOrganization(db, issuer);
        if (issuerId !== null) {
          await this.applyMappings(db, ISSUER_MAPPINGS, issuer, { column: "organization_id", id: issuerId }, asOf);
        }
      }

      const platforms = new Set<string>();
      let loaded = 0;
      for (const token of tokens) {
        this.summary.tokensSeen++;
        if (token.hidden === true) {
          this.summary.tokensSkipped.push({ ticker: ourAsset.ticker, reason: "Hidden by RWA.xyz", name: token.name });
          continue;
        }
        if (typeof token.address !== "string" || !token.address || typeof token.network_id !== "number") {
          this.summary.tokensSkipped.push({ ticker: ourAsset.ticker, reason: "No address or network", name: token.name });
          continue;
        }

        const networkId = await this.loadNetwork(db, token.network_id);
        if (networkId === null) {
          this.summary.tokensSkipped.push({ ticker: ourAsset.ticker, reason: "Network not found", name: token.name });
          continue;
        }

        const { rows } = await db.query<{ id: number; asset_id: number }>(
          `INSERT INTO token (asset_id, network_id, address, issuance_type) VALUES ($1, $2, $3, $4)
           ON CONFLICT (network_id, address) DO UPDATE SET issuance_type = EXCLUDED.issuance_type
           RETURNING id, asset_id`,
          [ourAsset.id, networkId, token.address, issuanceType(token.issuance_type)],
        );
        if (rows[0].asset_id !== ourAsset.id) {
          this.summary.tokensSkipped.push({ ticker: ourAsset.ticker, reason: "Address belongs to another of our assets", name: token.name });
          continue;
        }

        const platform = token.platform as ApiRecord | null | undefined;
        if (typeof platform?.name === "string") platforms.add(platform.name);

        await this.applyMappings(
          db,
          TOKEN_MAPPINGS,
          token,
          { column: "token_id", id: rows[0].id },
          dateOf(token._updated_at) ?? asOf,
        );
        loaded++;
      }

      // The asset-level platform only makes sense when all its tokens share one.
      if (platforms.size === 1) {
        const platform = tokens.find((token) => token.platform)?.platform as ApiRecord;
        const organizationId = await ensureOrganization(db, platform);
        const field = this.fields.get("provider.platform");
        if (organizationId !== null && field) {
          await db.query(
            `INSERT INTO asset_organization (asset_id, organization_id, role) VALUES ($1, $2, 'platform')
             ON CONFLICT DO NOTHING`,
            [ourAsset.id, organizationId],
          );
          await this.addClaim(
            db,
            field.id,
            { column: "asset_id", id: ourAsset.id },
            { name: platform.name, slug: platform.slug },
            { organization_id: organizationId },
            asOf,
          );
        }
      }
      return loaded;
    });
  }
}

/** Saves raw responses for audit. They hold financial data, so they're never mapped or exposed. */
export function rawResponseKeeper(pool: pg.Pool, storage: BucketStorage, getRunId: () => string | null) {
  const pending: RawResponse[] = [];
  let kept = 0;

  const save = async (runId: string, response: RawResponse) => {
    const body = new TextEncoder().encode(response.body);
    const sha256 = createHash("sha256").update(body).digest("hex");
    const key = `raw/rwa-xyz/${sha256}.json`;
    await storage.put(key, body, "application/json");
    await pool.query(
      `INSERT INTO raw_response (ingestion_run_id, request_path, storage_key, sha256, http_status)
       VALUES ($1, $2, $3, $4, $5)`,
      [runId, response.path, key, sha256, response.status],
    );
    kept++;
  };

  return {
    onResponse: async (response: RawResponse) => {
      const runId = getRunId();
      if (runId) await save(runId, response);
      else pending.push(response);
    },
    kept: () => kept,
  };
}

export interface LoadOptions {
  rawResponsesKept?: () => number;
  /** Limits the load, by our slug. */
  onlySlugs?: readonly string[];
}

export async function loadRwaXyz(
  pool: pg.Pool,
  client: RwaXyzClient,
  runId: string,
  options: LoadOptions = {},
): Promise<LoadSummary> {
  const today = new Date().toISOString().slice(0, 10);
  const { rows: sources } = await pool.query<{ id: number }>(`SELECT id FROM source WHERE key = 'rwa_xyz'`);
  const { rows: fieldRows } = await pool.query<{ id: number; key: string; value_type: string }>(
    `SELECT id, key, value_type FROM field`,
  );
  const fields = new Map(fieldRows.map((f) => [f.key, { id: f.id, valueType: f.value_type }]));
  const { rows: assets } = await pool.query<{ id: number; slug: string; ticker: string; name: string }>(
    `SELECT id, slug, ticker, name FROM asset ORDER BY ticker`,
  );

  const summary: LoadSummary = {
    runId,
    matched: [],
    notFound: [],
    mismatched: [],
    failed: [],
    claimsAdded: 0,
    claimsUnchanged: 0,
    tokensSeen: 0,
    tokensSkipped: [],
    rawResponsesKept: 0,
  };
  const loader = new Loader(pool, client, summary, runId, sources[0].id, today, fields);

  for (const asset of assets) {
    if (options.onlySlugs && !options.onlySlugs.includes(asset.slug)) continue;
    try {
      const match: MatchResult = await matchAsset(client, asset);
      if (match.status === "not_found") summary.notFound.push({ ticker: asset.ticker, reason: match.reason });
      else if (match.status === "mismatch") summary.mismatched.push({ ticker: asset.ticker, reason: match.reason });
      else {
        const tokens = await loader.loadAsset(asset, match.record);
        summary.matched.push({ ticker: asset.ticker, method: match.method, rwaId: match.record.id, tokens });
      }
    } catch (error) {
      summary.failed.push({ ticker: asset.ticker, error: error instanceof Error ? error.message : String(error) });
    }
  }

  summary.rawResponsesKept = options.rawResponsesKept?.() ?? 0;
  const status = summary.failed.length > 0 ? "partial" : "succeeded";
  await pool.query(
    `UPDATE ingestion_run SET finished_at = now(), status = $1, summary = $2 WHERE id = $3`,
    [status, JSON.stringify(summary), runId],
  );
  return summary;
}
