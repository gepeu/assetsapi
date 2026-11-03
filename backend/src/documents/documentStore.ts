import { createHash } from "node:crypto";
import type pg from "pg";
import type { BucketStorage } from "../bucketStorage.ts";
import { isEmptyShell } from "./extractText.ts";
import { fetchDocument, type FetchOptions } from "./fetchDocument.ts";

const EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
  "text/html": ".html",
  "application/xhtml+xml": ".html",
  "text/plain": ".txt",
  "text/markdown": ".md",
  "application/json": ".json",
  "application/xml": ".xml",
  "text/xml": ".xml",
};

function baseContentType(contentType: string | null): string {
  return (contentType ?? "application/octet-stream").split(";")[0].trim().toLowerCase();
}

export function storageKeyFor(sha256: string, contentType: string | null): string {
  return `${sha256}${EXTENSIONS[baseContentType(contentType)] ?? ".bin"}`;
}

export interface StoredFileSummary {
  id: string;
  ok: boolean;
  isEmptyShell: boolean;
  error: string | null;
}

/** Fetches a document, stores its bytes by content hash, and records the attempt either way. */
export async function fetchAndStoreDocument(
  pool: pg.Pool,
  storage: BucketStorage,
  document: { id: number; url: string },
  options: FetchOptions = {},
): Promise<StoredFileSummary> {
  const result = await fetchDocument(document.url, options);

  let storageKey: string | null = null;
  let sha256: string | null = null;
  let shell = false;
  if (result.ok && result.body) {
    sha256 = createHash("sha256").update(result.body).digest("hex");
    storageKey = storageKeyFor(sha256, result.contentType);
    if (!(await storage.stat(storageKey))) {
      await storage.put(storageKey, result.body, baseContentType(result.contentType));
    }
    if (baseContentType(result.contentType).includes("html")) {
      shell = isEmptyShell(Buffer.from(result.body).toString("utf8"));
    }
  }

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO stored_file (document_id, storage_key, sha256, size_bytes, content_type, http_status,
                              fetch_error, final_url, redirect_chain, is_empty_shell)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      document.id,
      storageKey,
      sha256,
      result.body?.byteLength ?? null,
      result.contentType,
      result.httpStatus,
      result.error,
      result.finalUrl,
      JSON.stringify(result.redirectChain),
      shell,
    ],
  );
  await pool.query(`UPDATE document SET last_checked_at = now() WHERE id = $1`, [document.id]);

  return { id: rows[0].id, ok: result.ok, isEmptyShell: shell, error: result.error };
}

/** A document's newest saved file. Only documents linked to an asset can be reached this way. */
export async function latestStoredFile(
  pool: pg.Pool,
  documentId: number,
): Promise<{ storageKey: string; filename: string } | null> {
  const { rows } = await pool.query<{ storage_key: string; title: string | null }>(
    `SELECT f.storage_key, d.title
     FROM document d
     JOIN searchable_file f ON f.document_id = d.id
     WHERE d.id = $1 AND EXISTS (SELECT 1 FROM asset_document ad WHERE ad.document_id = d.id)`,
    [documentId],
  );
  if (rows.length === 0) return null;

  const extension = /\.\w+$/.exec(rows[0].storage_key)?.[0] ?? "";
  const base = (rows[0].title ?? `document-${documentId}`).replace(/[^\w .-]+/g, " ").trim().slice(0, 100);
  return { storageKey: rows[0].storage_key, filename: `${base}${extension}` };
}
