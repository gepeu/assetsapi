/**
 * Entry point for the `api` command: checks the config, connects, listens, and shuts down cleanly.
 * A crash logs the exception and exits, so Railway restarts the replica.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadApiConfig, settings } from "../config.ts";
import { checkConnection, createPool } from "../db/pool.ts";
import { createLogger } from "../logger.ts";
import { buildApp } from "./app.ts";

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
  max: settings.api.poolSize,
  connectionTimeoutMs: settings.api.poolWaitMs,
  queryTimeoutMs: settings.api.queryTimeoutMs,
  logger,
});
await checkConnection(pool);

// Without a built frontend, the service is the API alone.
const uiDir = existsSync(join(settings.api.uiDir, "index.html")) ? settings.api.uiDir : undefined;

if (config.authDisabled) logger.warn("API_AUTH_DISABLED is set: the data routes need no key");
if (uiDir) logger.info({ uiDir }, "serving the frontend at /ui");
if (config.uiLogin) logger.info("UI_USERNAME is set: the frontend asks for the login, and the data routes accept it");

logger.info({ settings: settings.api }, "API settings");

const app = await buildApp({ db: pool, logger, authDisabled: config.authDisabled, login: config.uiLogin, uiDir });

let shuttingDown = false;
async function shutDown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down");
  const forced = setTimeout(() => {
    logger.warn("in-flight requests outlasted the shutdown timeout");
    process.exit(1);
  }, settings.api.shutdownTimeoutMs);
  forced.unref();
  await app.close();
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", (signal) => void shutDown(signal));
process.on("SIGINT", (signal) => void shutDown(signal));

await app.listen({ port: config.port, host: config.host });
