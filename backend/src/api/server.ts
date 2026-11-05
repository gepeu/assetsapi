/**
 * Entry point for the `api` command: checks the config, connects, listens, and shuts down cleanly.
 * A crash logs the exception and exits, so Railway restarts the replica.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadApiConfig } from "../config.ts";
import { checkConnection, createPool } from "../db/pool.ts";
import { createLogger } from "../logger.ts";
import { buildApp } from "./app.ts";

const POOL_SIZE = 5;
const POOL_WAIT_MS = 2000;
const SHUTDOWN_TIMEOUT_MS = 20_000;

const logger = createLogger();

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "uncaught exception");
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "unhandled rejection");
  process.exit(1);
});

const config = loadApiConfig();
const pool = createPool({
  connectionString: config.databaseUrl,
  max: POOL_SIZE,
  connectionTimeoutMs: POOL_WAIT_MS,
  logger,
});
await checkConnection(pool);

// The Docker image has no frontend, so there it's the API alone.
const builtUi = fileURLToPath(new URL("../../../frontend/dist", import.meta.url));
const uiDir = existsSync(join(builtUi, "index.html")) ? builtUi : undefined;

if (config.authDisabled) logger.warn("API_AUTH_DISABLED is set: the data routes need no key");
if (uiDir) logger.info({ uiDir }, "serving the frontend at /ui");

const app = await buildApp({ db: pool, logger, authDisabled: config.authDisabled, uiDir });

let shuttingDown = false;
async function shutDown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down");
  const forced = setTimeout(() => {
    logger.warn("in-flight requests outlasted the shutdown timeout");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forced.unref();
  await app.close();
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", (signal) => void shutDown(signal));
process.on("SIGINT", (signal) => void shutDown(signal));

await app.listen({ port: config.port, host: config.host });
