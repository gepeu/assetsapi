import type pg from "pg";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { BucketStorage } from "../bucketStorage.ts";
import { inTransaction } from "../db/pool.ts";
import { htmlToText } from "./extractText.ts";

const CHUNK_CHARS = 1500;
const OVERLAP_CHARS = 200;
/** Less text than this means a scanned PDF or similar, so there's nothing to search. */
const MIN_USEFUL_CHARS = 100;

export interface PageText {
  page: number | null;
  text: string;
}

/** Reads a PDF's text only. This never renders the file or runs anything in it. */
export async function pdfToPages(body: Uint8Array): Promise<PageText[]> {
  const loadingTask = getDocument({
    data: new Uint8Array(body),
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  try {
    const pdf = await loadingTask.promise;
    const pages: PageText[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
        .join("")
        .replace(/[ \t]+/g, " ")
        .trim();
      if (text) pages.push({ page: number, text });
      page.cleanup();
    }
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}

/** Splits text into overlapping pieces, preferring to break at paragraphs and sentences. */
export function chunkText(text: string, size = CHUNK_CHARS, overlap = OVERLAP_CHARS): string[] {
  const clean = text.replaceAll("\0", "").trim();
  if (clean.length <= size) return clean ? [clean] : [];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const window = clean.slice(start + Math.floor(size / 2), end);
      const breakAt = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "), window.lastIndexOf("\n"));
      if (breakAt > 0) end = start + Math.floor(size / 2) + breakAt + 1;
    }
    const chunk = clean.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

async function extractPages(body: Uint8Array, contentType: string): Promise<PageText[] | null> {
  if (contentType.includes("pdf")) return pdfToPages(body);
  const text = Buffer.from(body).toString("utf8");
  if (contentType.includes("html")) return [{ page: null, text: htmlToText(text) }];
  if (contentType.startsWith("text/")) return [{ page: null, text }];
  return null;
}

export interface IndexSummary {
  indexed: number;
  noText: number;
  unsupported: number;
  failed: { url: string; error: string }[];
  chunks: number;
}

/** Extracts and stores searchable text for every current file not yet processed. */
export async function indexDocuments(pool: pg.Pool, storage: BucketStorage): Promise<IndexSummary> {
  const { rows } = await pool.query<{ id: string; storage_key: string; content_type: string | null; url: string }>(
    `SELECT f.id, f.storage_key, f.content_type, d.url
     FROM searchable_file f
     JOIN document d ON d.id = f.document_id
     WHERE NOT f.is_empty_shell
       AND NOT EXISTS (SELECT 1 FROM document_text t WHERE t.stored_file_id = f.id AND t.status <> 'failed')
     ORDER BY f.id`,
  );

  const summary: IndexSummary = { indexed: 0, noText: 0, unsupported: 0, failed: [], chunks: 0 };

  for (const file of rows) {
    const record = (status: string, charCount: number, error: string | null = null) =>
      pool.query(
        `INSERT INTO document_text (stored_file_id, status, error, char_count) VALUES ($1, $2, $3, $4)
         ON CONFLICT (stored_file_id) DO UPDATE SET
           status = EXCLUDED.status, error = EXCLUDED.error, char_count = EXCLUDED.char_count, indexed_at = now()`,
        [file.id, status, error, charCount],
      );

    try {
      const object = await storage.get(file.storage_key);
      if (!object) throw new Error("Stored object is missing");

      const pages = await extractPages(object.body, (file.content_type ?? "").toLowerCase());
      if (!pages) {
        await record("unsupported", 0);
        summary.unsupported++;
        continue;
      }

      const charCount = pages.reduce((total, page) => total + page.text.length, 0);
      if (charCount < MIN_USEFUL_CHARS) {
        await record("no_text", charCount);
        summary.noText++;
        continue;
      }

      await inTransaction(pool, async (db) => {
        let index = 0;
        for (const page of pages) {
          for (const content of chunkText(page.text)) {
            await db.query(
              `INSERT INTO document_chunk (stored_file_id, chunk_index, page, content) VALUES ($1, $2, $3, $4)`,
              [file.id, index++, page.page, content],
            );
          }
        }
        summary.chunks += index;
        await db.query(
          `INSERT INTO document_text (stored_file_id, status, char_count) VALUES ($1, 'indexed', $2)
           ON CONFLICT (stored_file_id) DO UPDATE SET
             status = 'indexed', error = NULL, char_count = EXCLUDED.char_count, indexed_at = now()`,
          [file.id, charCount],
        );
      });
      summary.indexed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await record("failed", 0, message);
      summary.failed.push({ url: file.url, error: message });
    }
  }
  return summary;
}
