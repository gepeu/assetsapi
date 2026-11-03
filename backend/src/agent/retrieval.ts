import type pg from "pg";

const MAX_PASSAGES = 8;
const MAX_PER_DOCUMENT = 3;
const MAX_TOKENS_LISTED = 40;
/** A non-official document only outranks an official one if it's a much better match. */
const NON_OFFICIAL_WEIGHT = 0.5;

export interface ScopedAsset {
  id: number;
  slug: string;
  ticker: string;
  name: string;
}

export interface Passage {
  documentId: number;
  title: string;
  url: string;
  isOfficial: boolean;
  page: number | null;
  content: string;
}

export async function listAssets(pool: pg.Pool): Promise<ScopedAsset[]> {
  const { rows } = await pool.query<ScopedAsset>(`SELECT id, slug, ticker, name FROM asset`);
  return rows;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Finds assets named in the text. Short tickers must match case exactly, because AUTO, PRIME,
 * NEAR and MON are also ordinary words. Longer tickers and full names match in any case.
 */
export function findMentionedAssets(text: string, assets: readonly ScopedAsset[]): ScopedAsset[] {
  return assets.filter((asset) => {
    const flags = asset.ticker.length >= 6 ? "i" : "";
    const ticker = new RegExp(`(^|[^\\w])${escapeRegExp(asset.ticker)}($|[^\\w])`, flags);
    const name = new RegExp(`\\b${escapeRegExp(asset.name)}\\b`, "i");
    return ticker.test(text) || (asset.name.length >= 6 && name.test(text));
  });
}

/**
 * The assets a question is about: the page being viewed, anything the question names, and
 * otherwise whatever earlier questions named, so follow-ups stay on the same asset.
 */
export function resolveScope(
  questions: readonly string[],
  assetSlug: string | null,
  assets: readonly ScopedAsset[],
): ScopedAsset[] {
  const scope = new Map<number, ScopedAsset>();
  const viewed = assets.find((asset) => asset.slug === assetSlug);
  if (viewed) scope.set(viewed.id, viewed);

  for (let index = questions.length - 1; index >= 0; index--) {
    const mentioned = findMentionedAssets(questions[index], assets);
    for (const asset of mentioned) scope.set(asset.id, asset);
    if (mentioned.length > 0 || scope.size > 0) break;
  }
  return [...scope.values()];
}

/**
 * Full-text search over documents that have text. Failed fetches and empty shells have no chunks
 * in searchable_chunk, and raw API responses are never documents, so none of them can appear.
 */
export async function searchPassages(
  pool: pg.Pool,
  question: string,
  assetIds: readonly number[] | null,
): Promise<Passage[]> {
  const { rows } = await pool.query<{
    document_id: number;
    title: string | null;
    url: string;
    is_official: boolean;
    page: number | null;
    content: string;
  }>(
    `WITH q AS (
       -- Any of the question's words can match; ranking rewards passages with more of them.
       SELECT nullif(replace(plainto_tsquery('english', $1)::text, ' & ', ' | '), '')::tsquery AS query
     ),
     matches AS (
       SELECT DISTINCT ON (c.sha256, c.chunk_index)
         c.document_id, d.title, d.url, c.page, c.content, l.is_official,
         ts_rank_cd(c.search, q.query, 32) * CASE WHEN l.is_official THEN 1 ELSE $3::real END AS rank
       FROM q
       JOIN searchable_chunk c ON c.search @@ q.query
       JOIN document d ON d.id = c.document_id
       JOIN LATERAL (
         SELECT bool_or(ad.is_official) AS is_official
         FROM asset_document ad
         WHERE ad.document_id = c.document_id AND ($2::int[] IS NULL OR ad.asset_id = ANY ($2::int[]))
         HAVING count(*) > 0
       ) l ON true
       ORDER BY c.sha256, c.chunk_index, l.is_official DESC, c.document_id
     ),
     limited AS (
       SELECT *, row_number() OVER (PARTITION BY document_id ORDER BY rank DESC) AS per_document
       FROM matches
     )
     SELECT document_id, title, url, is_official, page, content
     FROM limited
     WHERE per_document <= $4
     ORDER BY rank DESC
     LIMIT $5`,
    [question, assetIds, NON_OFFICIAL_WEIGHT, MAX_PER_DOCUMENT, MAX_PASSAGES],
  );

  return rows.map((row) => ({
    documentId: row.document_id,
    title: row.title ?? new URL(row.url).hostname,
    url: row.url,
    isOfficial: row.is_official,
    page: row.page,
    content: row.content,
  }));
}

const displayValue = (value: unknown, organization: string | null): string => {
  if (organization) return organization;
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
};

/** One asset's disclosed Facts as plain text, or null if it has none. */
export async function factsForAsset(pool: pg.Pool, asset: ScopedAsset): Promise<string | null> {
  const { rows: facts } = await pool.query<{
    label: string;
    level: string;
    normalized_value: unknown;
    organization: string | null;
    as_of: string | null;
    has_conflict: boolean;
    source: string;
    record_key: string;
  }>(
    `SELECT f.label, f.level, x.normalized_value, o.brand_name AS organization, x.as_of::text AS as_of,
            x.has_conflict, s.name AS source, x.record_key
     FROM asset_subject sub
     JOIN fact x ON x.subject_ref = sub.subject_ref
     JOIN field f ON f.id = x.field_id
     JOIN source s ON s.id = x.source_id
     LEFT JOIN organization o
       ON f.value_type = 'organization' AND o.id = (x.normalized_value ->> 'organization_id')::int
     WHERE sub.asset_id = $1 AND sub.level IN ('asset', 'organization') AND x.status = 'disclosed'
     ORDER BY f.sort_order, x.record_key`,
    [asset.id],
  );
  const { rows: tokens } = await pool.query<{ network: string; address: string; issuance_type: string }>(
    `SELECT n.name AS network, t.address, t.issuance_type
     FROM token t JOIN network n ON n.id = t.network_id
     WHERE t.asset_id = $1 ORDER BY n.name, t.issuance_type, t.address LIMIT $2`,
    [asset.id, MAX_TOKENS_LISTED],
  );
  if (facts.length === 0 && tokens.length === 0) return null;

  const lines = [`Facts about ${asset.ticker} (${asset.name}):`];
  for (const fact of facts) {
    const recordLabel = fact.record_key ? ` (${fact.record_key})` : "";
    const asOf = fact.as_of ? `, as of ${fact.as_of}` : "";
    const conflict = fact.has_conflict ? " [sources disagree on this]" : "";
    const value = displayValue(fact.normalized_value, fact.organization);
    lines.push(`- ${fact.label}${recordLabel}: ${value} (from ${fact.source}${asOf})${conflict}`);
  }
  if (tokens.length > 0) {
    lines.push(`Tokens of ${asset.ticker}:`);
    for (const token of tokens) lines.push(`- ${token.network}: ${token.address} (${token.issuance_type})`);
  }
  return lines.join("\n");
}

/** Which assets exist, with our classes and any issuer Fact, for questions across all assets. */
export async function assetCatalogText(pool: pg.Pool): Promise<string> {
  const { rows } = await pool.query<{ ticker: string; name: string; asset_class: string; issuer: string | null }>(
    `SELECT a.ticker, a.name, a.asset_class, o.brand_name AS issuer
     FROM asset a
     LEFT JOIN field f ON f.key = 'issuer.name'
     LEFT JOIN fact x ON x.field_id = f.id AND x.asset_id = a.id AND x.status = 'disclosed'
     LEFT JOIN organization o ON o.id = (x.normalized_value ->> 'organization_id')::int
     ORDER BY a.asset_class, a.ticker`,
  );
  const lines = ["The assets we track (ticker | name | our asset class | issuer, where known):"];
  for (const row of rows) {
    lines.push(`- ${row.ticker} | ${row.name} | ${row.asset_class} | ${row.issuer ?? "unknown"}`);
  }
  return lines.join("\n");
}
