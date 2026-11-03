import { readFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/** Vite puts a content hash in these filenames, so a changed file always gets a new URL. */
const HASHED_FILES_PREFIX = "/assets/";

/** Returns null for anything that would land outside the root, such as an encoded "../". */
function resolveInsideRoot(rootDir: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const root = resolve(rootDir);
  const path = join(root, decoded);
  return path.startsWith(root + sep) ? path : null;
}

/** Folders count as missing: "/assets" is both a page and the folder of built files. */
async function readFileIfPresent(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    if (code === "ENOENT" || code === "EISDIR" || code === "ENOTDIR") return null;
    throw error;
  }
}

function send(res: ServerResponse, path: string, body: Buffer, cacheControl: string) {
  res.writeHead(200, {
    "Content-Type": CONTENT_TYPES[extname(path)] ?? "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  res.end(body);
}

/**
 * Sends a built frontend file, or index.html for page routes so reloading a deep link works.
 * Returns false if there's nothing to send. Paths with an extension never get index.html, so a
 * missing script is a 404 rather than HTML. Asset slugs contain no dots, so pages have no extension.
 */
export async function sendFrontendFile(
  res: ServerResponse,
  rootDir: string,
  pathname: string,
): Promise<boolean> {
  const path = resolveInsideRoot(rootDir, pathname);
  const file = path && (await readFileIfPresent(path));
  if (path && file) {
    const isHashed = pathname.startsWith(HASHED_FILES_PREFIX);
    send(res, path, file, isHashed ? "public, max-age=31536000, immutable" : "no-cache");
    return true;
  }
  if (extname(pathname) !== "") return false;

  const indexPath = join(rootDir, "index.html");
  const index = await readFileIfPresent(indexPath);
  if (!index) return false;
  send(res, indexPath, index, "no-cache");
  return true;
}
