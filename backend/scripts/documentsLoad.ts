import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchAndStoreDocument } from "../src/documents/documentStore.ts";
import { HostRateLimiter } from "../src/documents/fetchDocument.ts";
import { loadKaminoRecords } from "../src/documents/kaminoBundle.ts";
import {
  CANDIDATE_DOCUMENTS,
  categoryFromKamino,
  classifyLink,
  isHostOfficialForAny,
  NO_DOCUMENTS,
  type DocumentCategory,
} from "../src/documents/officialSources.ts";
import { createPool } from "../src/db/pool.ts";
import { createBucketStorage } from "../src/storage.ts";

const REPORT_PATH = join(import.meta.dirname, "../../.local/reports/documents.md");
const refresh = process.argv.includes("--refresh");
const RATE_LIMIT_MS = 1500;

const pool = createPool();
const storage = createBucketStorage();

interface Excluded {
  asset: string;
  url: string;
  title: string;
  reason: string;
}

async function upsertLink(
  assetId: number,
  link: { url: string; title: string | null; category: DocumentCategory },
  isOfficial: boolean,
  provenance: string,
  source: string | null,
): Promise<void> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO document (url, title, category) VALUES ($1, $2, $3)
     ON CONFLICT (url) DO UPDATE SET title = coalesce(document.title, EXCLUDED.title)
     RETURNING id`,
    [link.url, link.title, link.category],
  );
  await pool.query(
    `INSERT INTO asset_document (asset_id, document_id, is_official, provenance, source)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (asset_id, document_id) DO UPDATE SET is_official = EXCLUDED.is_official`,
    [assetId, rows[0].id, isOfficial, provenance, source],
  );
}

async function loadLinks(): Promise<Excluded[]> {
  const { rows: assets } = await pool.query<{ id: number; slug: string; ticker: string }>(
    `SELECT id, slug, ticker FROM asset`,
  );
  const bySlug = new Map(assets.map((asset) => [asset.slug, asset]));
  const excluded: Excluded[] = [];

  for (const record of await loadKaminoRecords()) {
    const asset = bySlug.get(record.id);
    if (!asset) continue;

    const links = [
      ...record.documents.map((doc) => ({
        url: doc.url,
        title: doc.title,
        category: categoryFromKamino(doc.category),
        source: `kamino:${doc.source}`,
      })),
      ...(record.website
        ? [{ url: record.website, title: null, category: "website" as const, source: "kamino:website" }]
        : []),
      ...(record.transparencyUrl
        ? [{ url: record.transparencyUrl, title: null, category: "transparency" as const, source: "kamino:transparencyUrl" }]
        : []),
    ];

    for (const link of links) {
      const classification = classifyLink(asset.slug, link.url);
      if (classification.kind === "excluded") {
        excluded.push({ asset: asset.ticker, url: link.url, title: link.title ?? "", reason: classification.reason });
        continue;
      }
      await upsertLink(asset.id, link, classification.kind === "official", "kamino_bundle", link.source);
    }
  }

  for (const candidate of CANDIDATE_DOCUMENTS) {
    const asset = bySlug.get(candidate.assetSlug);
    if (!asset) throw new Error(`Unknown asset in candidates: ${candidate.assetSlug}`);
    const classification = classifyLink(asset.slug, candidate.url);
    if (classification.kind !== "official") {
      throw new Error(`Candidate isn't on its asset's allowlist: ${candidate.url}`);
    }
    await upsertLink(asset.id, candidate, true, "manual_candidate", null);
  }
  return excluded;
}

async function fetchOfficialDocuments(): Promise<void> {
  const { rows } = await pool.query<{ id: number; url: string; slugs: string[] }>(
    `SELECT d.id, d.url, array_agg(a.slug) AS slugs
     FROM document d
     JOIN asset_document ad ON ad.document_id = d.id AND ad.is_official
     JOIN asset a ON a.id = ad.asset_id
     WHERE $1 OR NOT EXISTS (
       SELECT 1 FROM stored_file f WHERE f.document_id = d.id AND f.storage_key IS NOT NULL
     )
     GROUP BY d.id, d.url
     ORDER BY d.url`,
    [refresh],
  );

  console.log(`Fetching ${rows.length} official documents...`);
  const limiter = new HostRateLimiter(RATE_LIMIT_MS);
  for (const [index, document] of rows.entries()) {
    await limiter.wait(document.url);
    const result = await fetchAndStoreDocument(pool, storage, document, {
      isHostAllowed: (host) => isHostOfficialForAny(document.slugs, host),
    });
    const outcome = result.ok ? (result.isEmptyShell ? "SHELL" : "ok") : `FAILED ${result.error}`;
    console.log(`[${index + 1}/${rows.length}] ${outcome} ${document.url}`);
  }
}

/** Reads every stored object back and compares its hash with the database's. */
async function verifyStoredFiles(): Promise<{ checked: number; mismatched: string[] }> {
  const { rows } = await pool.query<{ storage_key: string; sha256: string }>(
    `SELECT DISTINCT storage_key, sha256 FROM stored_file WHERE storage_key IS NOT NULL`,
  );
  const mismatched: string[] = [];
  for (const row of rows) {
    const object = await storage.get(row.storage_key);
    const hash = object && createHash("sha256").update(object.body).digest("hex");
    if (hash !== row.sha256) mismatched.push(row.storage_key);
  }
  return { checked: rows.length, mismatched };
}

const cell = (text: unknown) => String(text ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ");

async function writeReport(excluded: Excluded[], verification: { checked: number; mismatched: string[] }) {
  const { rows: perAsset } = await pool.query(`
    SELECT a.ticker,
      count(ad.document_id)::int AS found,
      count(*) FILTER (WHERE ad.is_official)::int AS official,
      count(*) FILTER (WHERE ad.is_official AND latest.storage_key IS NOT NULL AND NOT latest.is_empty_shell)::int AS downloaded,
      count(*) FILTER (WHERE ad.is_official AND latest.is_empty_shell)::int AS shells,
      count(*) FILTER (WHERE ad.is_official AND latest.id IS NOT NULL AND latest.storage_key IS NULL)::int AS failed
    FROM asset a
    LEFT JOIN asset_document ad ON ad.asset_id = a.id
    LEFT JOIN LATERAL (
      SELECT * FROM stored_file f WHERE f.document_id = ad.document_id ORDER BY f.id DESC LIMIT 1
    ) latest ON true
    GROUP BY a.ticker ORDER BY a.ticker
  `);
  const { rows: failures } = await pool.query(`
    SELECT d.url, f.http_status, f.fetch_error, string_agg(DISTINCT a.ticker, ', ') AS assets
    FROM document d
    JOIN LATERAL (SELECT * FROM stored_file s WHERE s.document_id = d.id ORDER BY s.id DESC LIMIT 1) f ON true
    JOIN asset_document ad ON ad.document_id = d.id
    JOIN asset a ON a.id = ad.asset_id
    WHERE f.storage_key IS NULL
    GROUP BY d.url, f.http_status, f.fetch_error ORDER BY 1
  `);
  const { rows: shells } = await pool.query(`
    SELECT d.url, string_agg(DISTINCT a.ticker, ', ') AS assets
    FROM document d
    JOIN LATERAL (SELECT * FROM stored_file s WHERE s.document_id = d.id ORDER BY s.id DESC LIMIT 1) f ON true
    JOIN asset_document ad ON ad.document_id = d.id
    JOIN asset a ON a.id = ad.asset_id
    WHERE f.is_empty_shell
    GROUP BY d.url ORDER BY 1
  `);
  const { rows: references } = await pool.query(`
    SELECT d.url, string_agg(a.ticker, ', ') AS assets
    FROM asset_document ad JOIN document d ON d.id = ad.document_id JOIN asset a ON a.id = ad.asset_id
    WHERE NOT ad.is_official GROUP BY d.url ORDER BY 1
  `);
  const { rows: totals } = await pool.query(`
    SELECT
      (SELECT count(*) FROM asset_document)::int AS links,
      (SELECT count(*) FROM document)::int AS documents,
      (SELECT count(DISTINCT document_id) FROM asset_document WHERE is_official)::int AS official,
      (SELECT count(*) FROM stored_file)::int AS attempts,
      (SELECT count(DISTINCT storage_key) FROM stored_file WHERE storage_key IS NOT NULL)::int AS objects,
      (SELECT coalesce(sum(size), 0)::bigint FROM (SELECT DISTINCT storage_key, size_bytes AS size FROM stored_file WHERE storage_key IS NOT NULL) x) AS bytes
  `);

  const lines = [
    "# Document load report",
    "",
    `Generated ${new Date().toISOString()}.`,
    "",
    "## Totals",
    "",
    "```json",
    JSON.stringify({ ...totals[0], excludedLinks: excluded.length, verification }, null, 2),
    "```",
    "",
    "## Per asset",
    "",
    "| Asset | Links | Official | Downloaded | Empty shell | Failed |",
    "| --- | --- | --- | --- | --- | --- |",
    ...perAsset.map((r) => `| ${r.ticker} | ${r.found} | ${r.official} | ${r.downloaded} | ${r.shells} | ${r.failed} |`),
    "",
    "## Assets deliberately left without documents",
    "",
    ...Object.entries(NO_DOCUMENTS).map(([slug, reason]) => `- **${slug}:** ${reason}`),
    "",
    `## Failed fetches (${failures.length})`,
    "",
    "| Asset | URL | Status | Error |",
    "| --- | --- | --- | --- |",
    ...failures.map((r) => `| ${cell(r.assets)} | ${r.url} | ${r.http_status ?? ""} | ${cell(r.fetch_error)} |`),
    "",
    `## Empty shells (${shells.length})`,
    "",
    "Saved, but with almost no readable text, so they're excluded from search.",
    "",
    "| Asset | URL |",
    "| --- | --- |",
    ...shells.map((r) => `| ${cell(r.assets)} | ${r.url} |`),
    "",
    `## Non-official reference links (${references.length})`,
    "",
    "| Asset | URL |",
    "| --- | --- |",
    ...references.map((r) => `| ${cell(r.assets)} | ${r.url} |`),
    "",
    `## Excluded links (${excluded.length})`,
    "",
    "| Asset | URL | Reason | Title |",
    "| --- | --- | --- | --- |",
    ...excluded
      .toSorted((a, b) => a.asset.localeCompare(b.asset) || a.url.localeCompare(b.url))
      .map((r) => `| ${r.asset} | ${r.url} | ${cell(r.reason)} | ${cell(r.title)} |`),
    "",
  ];
  await mkdir(join(REPORT_PATH, ".."), { recursive: true });
  await writeFile(REPORT_PATH, lines.join("\n"));
  console.log(`Report: ${REPORT_PATH}`);
  console.log(totals[0], { excludedLinks: excluded.length }, verification.mismatched.length ? verification : `hashes ok: ${verification.checked}`);
}

try {
  const excluded = await loadLinks();
  await fetchOfficialDocuments();
  await writeReport(excluded, await verifyStoredFiles());
} finally {
  await pool.end();
}
