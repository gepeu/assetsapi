/**
 * Entry point for the `api` command: checks the config, connects, listens, and shuts down cleanly.
 * A crash logs the exception and exits, so Railway restarts the replica.
 */
import { loadApiConfig, settings } from '../config.ts';
import { checkConnection, createPool } from '../db/pool.ts';
import { createLogger } from '../logger.ts';
import { buildApp } from './app.ts';

const logger = createLogger();

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled rejection');
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

logger.info({ settings: settings.api }, 'API settings');

const app = await buildApp({ db: pool, logger });

let shuttingDown = false;
async function shutDown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  const forced = setTimeout(() => {
    logger.warn('in-flight requests outlasted the shutdown timeout');
    process.exit(1);
  }, settings.api.shutdownTimeoutMs);
  forced.unref();
  await app.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', (signal) => void shutDown(signal));
process.on('SIGINT', (signal) => void shutDown(signal));

await app.listen({ port: config.port, host: config.host });
