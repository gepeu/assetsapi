/**
 * Writes backend/openapi.json from the route schemas. With --check it compares instead, so CI fails
 * when the committed contract is out of date.
 */
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";
import { buildApp } from "../src/api/app.ts";
import { settings } from "../src/config.ts";
import { createLogger } from "../src/logger.ts";

const OPENAPI_PATH = settings.api.openApiPath;

/** The contract as JSON. The pool never connects, because no request is made. */
export async function renderOpenApi(): Promise<string> {
  const db = new pg.Pool({ max: 1 });
  const app = await buildApp({ db, logger: createLogger("silent") });
  try {
    await app.ready();
    return `${JSON.stringify(app.swagger(), null, 2)}\n`;
  } finally {
    await app.close();
    await db.end();
  }
}

if (import.meta.main) {
  const rendered = await renderOpenApi();
  if (process.argv.includes("--check")) {
    const committed = await readFile(OPENAPI_PATH, "utf8").catch(() => "");
    if (committed !== rendered) {
      process.stderr.write("openapi.json is out of date. Run: npm run openapi\n");
      process.exitCode = 1;
    }
  } else {
    await writeFile(OPENAPI_PATH, rendered);
  }
}
