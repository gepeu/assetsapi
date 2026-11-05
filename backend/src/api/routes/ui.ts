/**
 * Serves the built frontend under `/ui`, because `/assets` belongs to the API. Page URLs get
 * index.html, so reloading a deep link works. A path with an extension never does, so a missing
 * script is a 404 rather than HTML. Asset slugs contain no dots, so pages have no extension.
 */
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import type { FastifyInstance } from "fastify";
import { ApiError } from "../errors.ts";

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/** Vite puts a content hash in these filenames, so a changed file always gets a new URL. */
const HASHED_FILES_PREFIX = "static/";

/** Null for anything that would land outside the root, such as an encoded "../". */
function resolveInsideRoot(root: string, relativePath: string): string | null {
  if (relativePath.includes("\0")) return null;
  const path = join(root, relativePath);
  return path.startsWith(root + sep) ? path : null;
}

async function readFileIfPresent(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    if (code === "ENOENT" || code === "EISDIR" || code === "ENOTDIR") return null;
    throw error;
  }
}

export function registerUiRoutes(app: FastifyInstance, uiDir: string): void {
  const root = resolve(uiDir);
  const hidden = { schema: { hide: true } };

  app.get("/", hidden, (_request, reply) => reply.redirect("/ui/assets"));

  app.get("/ui", hidden, (_request, reply) => reply.redirect("/ui/assets"));

  app.get<{ Params: { "*": string } }>("/ui/*", hidden, async (request, reply) => {
    const relativePath = request.params["*"];
    const path = resolveInsideRoot(root, relativePath);
    const file = path && (await readFileIfPresent(path));
    if (path && file) {
      const isHashed = relativePath.startsWith(HASHED_FILES_PREFIX);
      return reply
        .header("cache-control", isHashed ? "public, max-age=31536000, immutable" : "no-cache")
        .type(CONTENT_TYPES[extname(path)] ?? "application/octet-stream")
        .send(file);
    }

    const index = extname(relativePath) === "" ? await readFileIfPresent(join(root, "index.html")) : null;
    if (!index) throw new ApiError("not_found", "No such page or file");
    return reply.header("cache-control", "no-cache").type("text/html; charset=utf-8").send(index);
  });
}
