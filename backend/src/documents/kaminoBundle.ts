import { fetchDocument } from "./fetchDocument.ts";

const CATALOG_PAGE = "https://kamino-app.vercel.app/assets/aaplx";
const MAX_BUNDLE_BYTES = 40 * 1024 * 1024;

export interface KaminoDocument {
  title: string;
  url: string;
  category: string;
  source: string;
}

export interface KaminoAssetRecord {
  /** Kamino's slug, which matches our catalog slug. */
  id: string;
  kind: string;
  website: string | null;
  transparencyUrl: string | null;
  documents: KaminoDocument[];
}

const RECORD_START = /kind\$\w+ = "([\w-]+)", id\$\w+ = "([\w\-.]+)", fetchedAt/g;
const WEBSITE = /website: \{\s*value: "([^"]+)"/;
const TRANSPARENCY = /transparencyUrl: \{\s*value: "([^"]+)"/;
const DOCUMENT = /\{\s*title: "([^"]*)",\s*url: "([^"]+)",\s*category: "([^"]+)",\s*source: "(\w+)"/g;

/** Reads the records out of the bundle as plain text. The bundle is never executed. */
export function parseKaminoBundle(bundle: string): KaminoAssetRecord[] {
  const starts = [...bundle.matchAll(RECORD_START)];
  return starts.map((match, index) => {
    const end = starts[index + 1]?.index ?? match.index + 400_000;
    const section = bundle.slice(match.index, end);
    return {
      id: match[2],
      kind: match[1],
      website: WEBSITE.exec(section)?.[1] ?? null,
      transparencyUrl: TRANSPARENCY.exec(section)?.[1] ?? null,
      documents: [...section.matchAll(DOCUMENT)].map(([, title, url, category, source]) => ({
        title,
        url,
        category,
        source,
      })),
    };
  });
}

/** Finds the bundle's path in the page's HTML, downloads it as text and parses it. */
export async function loadKaminoRecords(): Promise<KaminoAssetRecord[]> {
  const page = await fetchDocument(CATALOG_PAGE);
  if (!page.ok || !page.body) throw new Error(`Couldn't load the Kamino page: ${page.error}`);

  const scriptPath = /\/assets\/index-[\w-]+\.js/.exec(Buffer.from(page.body).toString("utf8"))?.[0];
  if (!scriptPath) throw new Error("Couldn't find the bundle's path in the Kamino page");

  const bundle = await fetchDocument(new URL(scriptPath, CATALOG_PAGE).toString(), {
    maxBytes: MAX_BUNDLE_BYTES,
    timeoutMs: 180_000,
  });
  if (!bundle.ok || !bundle.body) throw new Error(`Couldn't load the Kamino bundle: ${bundle.error}`);

  const records = parseKaminoBundle(Buffer.from(bundle.body).toString("utf8"));
  if (records.length === 0) throw new Error("The Kamino bundle's format has changed: no records found");
  return records;
}
