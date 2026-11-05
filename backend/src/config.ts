/**
 * Environment variables, checked at startup. This is the only file that reads process.env, so each
 * process states exactly what it needs and a missing value stops it before it does anything.
 *
 * Every tunable value is in `loadSettings` below, with the default used when its variable is unset.
 * `.env.example` lists the same variables, and no other file holds a timeout, limit or address.
 */

interface ApiConfig {
  databaseUrl: string;
  port: number;
  host: string;
  authDisabled: boolean;
}

/** Above this, a handful of replicas would use up a Postgres server's connections. */
const MAX_POOL_SIZE = 50;

export interface JobConfig {
  databaseUrl: string;
  rwaXyzApiKey: string;
  /** Empty means no monitor, as in local runs. */
  monitorUrl: string | null;
}

export interface RolePasswords {
  owner: string;
  job: string;
  api: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a port number");
  return port;
}

/** An unset or empty variable takes the fallback. Anything else must be a whole number in range. */
function readWholeNumber(name: string, fallback: number, range: { min?: number; max?: number } = {}): number {
  const value = process.env[name];
  if (!value) return fallback;
  const { min = 1, max = Number.MAX_SAFE_INTEGER } = range;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    const allowed = max === Number.MAX_SAFE_INTEGER ? `${min} or more` : `from ${min} to ${max}`;
    throw new Error(`${name} must be a whole number, ${allowed}`);
  }
  return number;
}

/** A fraction, such as 0.1 for 10%. Only a swing can pass 1, because a value can more than double. */
function readShare(name: string, fallback: number, max = 1): number {
  const value = process.env[name];
  if (!value) return fallback;
  const share = Number(value);
  if (!Number.isFinite(share) || share <= 0 || share > max) {
    throw new Error(`${name} must be a number above 0, up to ${max}`);
  }
  return share;
}

/** Without a trailing slash, because paths are appended to it. */
function readUrl(name: string, fallback: string): string {
  const value = process.env[name] || fallback;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`${name} must be an http or https URL`);
  return value.replace(/\/+$/, "");
}

export function loadSettings() {
  const settings = {
    api: {
      /** Database connections held by each replica. */
      poolSize: readWholeNumber("DB_POOL_SIZE", 5, { max: MAX_POOL_SIZE }),
      /** How long a request waits for a free connection before it's a 503. */
      poolWaitMs: readWholeNumber("DB_POOL_WAIT_MS", 2000),
      /** How long to wait for a query's answer before giving up on its connection. */
      queryTimeoutMs: readWholeNumber("DB_QUERY_TIMEOUT_MS", 7000),
      /** Requests a key may make per minute, counted separately on each replica. */
      rateLimitPerMinute: readWholeNumber("RATE_LIMIT_PER_MINUTE", 600),
      /** Enough for a misconfigured client to be seen as one, not enough to guess a key. */
      failedAuthPerMinute: readWholeNumber("FAILED_AUTH_PER_MINUTE", 20),
      /** Addresses remembered for the failed-key limit, which bounds its memory. */
      failedAuthTrackedIps: readWholeNumber("FAILED_AUTH_TRACKED_IPS", 10_000),
      /** How long a replica trusts a key it has checked, so also how long a revoked key keeps working. */
      keyCacheMs: readWholeNumber("API_KEY_CACHE_MS", 60_000),
      requestTimeoutMs: readWholeNumber("REQUEST_TIMEOUT_MS", 30_000),
      /** How long in-flight requests get to finish after a stop signal. */
      shutdownTimeoutMs: readWholeNumber("SHUTDOWN_TIMEOUT_MS", 20_000),
    },
    db: {
      /** Without a delay, keepalive waits for the OS default before its first probe, often two hours. */
      keepaliveDelayMs: readWholeNumber("DB_KEEPALIVE_DELAY_MS", 30_000),
      /** The server's own keepalive on the job lock's connection, which sits idle for a whole run. */
      lockKeepaliveIdleSeconds: readWholeNumber("LOCK_KEEPALIVE_IDLE_SECONDS", 60),
      lockKeepaliveIntervalSeconds: readWholeNumber("LOCK_KEEPALIVE_INTERVAL_SECONDS", 10),
      lockKeepaliveCount: readWholeNumber("LOCK_KEEPALIVE_COUNT", 3),
      /** How long the migrate step waits for a running job to finish. */
      migrateLockWaitMs: readWholeNumber("MIGRATE_LOCK_WAIT_MS", 600_000),
      migrateLockPollMs: readWholeNumber("MIGRATE_LOCK_POLL_MS", 5000),
      /** Set on the rwa_api role by the roles script. Jobs and migrations run longer statements. */
      apiStatementTimeoutMs: readWholeNumber("API_STATEMENT_TIMEOUT_MS", 5000),
    },
    jobs: {
      /** One connection for each asset's transaction and one for run records. The lock has its own. */
      poolSize: readWholeNumber("JOB_DB_POOL_SIZE", 2, { max: MAX_POOL_SIZE }),
      connectTimeoutMs: readWholeNumber("JOB_DB_CONNECT_TIMEOUT_MS", 30_000),
      /** Far above any real statement. It only stops a run hanging on a connection that died silently. */
      queryTimeoutMs: readWholeNumber("JOB_DB_QUERY_TIMEOUT_MS", 300_000),
      /** An update run stops after this many assets fail in a row. */
      maxConsecutiveFailures: readWholeNumber("JOB_MAX_CONSECUTIVE_FAILURES", 5),
      /** An update run stops once more than this share of active assets has failed. */
      maxFailedShare: readShare("JOB_MAX_FAILED_SHARE", 0.1),
      /** Below this share of active assets remaining, a universe run changes nothing. */
      universeMinRemainingShare: readShare("UNIVERSE_MIN_REMAINING_SHARE", 0.8),
      /** A change this large in a key figure is noted in the run summary. */
      largeSwingShare: readShare("LARGE_SWING_SHARE", 0.5, 100),
      /** How long a value stays after the provider stops reporting it. */
      missingGraceDays: readWholeNumber("MISSING_GRACE_DAYS", 7),
      /** History days sent to the database in one statement. */
      historyBatchSize: readWholeNumber("HISTORY_BATCH_SIZE", 5000),
      monitorTimeoutMs: readWholeNumber("JOB_MONITOR_TIMEOUT_MS", 10_000),
      /** Healthchecks.io keeps the first 100 kB of a ping body. */
      monitorBodyLimit: readWholeNumber("JOB_MONITOR_BODY_LIMIT", 90_000),
    },
    providers: {
      rwaXyzBaseUrl: readUrl("RWA_XYZ_BASE_URL", "https://api.rwa.xyz/v4"),
      rwaXyzPageSize: readWholeNumber("RWA_XYZ_PAGE_SIZE", 100),
      kaminoBaseUrl: readUrl("KAMINO_BASE_URL", "https://api.kamino.finance"),
      /** Without a limit Kamino's list returns only 20 tokens. A full page fails the run as cut off. */
      kaminoTokenLimit: readWholeNumber("KAMINO_TOKEN_LIMIT", 1000),
      /** The pause between two requests to one provider. */
      requestIntervalMs: readWholeNumber("PROVIDER_REQUEST_INTERVAL_MS", 250, { min: 0 }),
      timeoutMs: readWholeNumber("PROVIDER_TIMEOUT_MS", 60_000),
      maxRetries: readWholeNumber("PROVIDER_MAX_RETRIES", 4, { min: 0 }),
      /** The first retry's wait, which doubles each time. */
      backoffMs: readWholeNumber("PROVIDER_BACKOFF_MS", 1000),
      /** A rate-limit wait longer than this isn't a burst to sit out: the quota is used up for now. */
      maxRateLimitWaitMs: readWholeNumber("PROVIDER_MAX_RATE_LIMIT_WAIT_MS", 120_000),
    },
  };
  if (settings.api.queryTimeoutMs <= settings.db.apiStatementTimeoutMs) {
    throw new Error(
      "DB_QUERY_TIMEOUT_MS must be above API_STATEMENT_TIMEOUT_MS, so a slow query gets the server's answer",
    );
  }
  return settings;
}

export type Settings = ReturnType<typeof loadSettings>;

/** Read once, when the process starts. A value that doesn't parse stops it there. */
export const settings: Settings = loadSettings();

/** A share as text, such as 0.1 as "10%". */
export const toPercent = (share: number): string => `${Math.round(share * 1000) / 10}%`;

export function loadApiConfig(): ApiConfig {
  const authDisabled = process.env.API_AUTH_DISABLED === "true";
  // The Docker image sets NODE_ENV. A stray flag there would open all the data on a public URL.
  if (authDisabled && process.env.NODE_ENV === "production") {
    throw new Error("API_AUTH_DISABLED is for local use and can't be set in production");
  }
  return {
    databaseUrl: requireEnv("DATABASE_URL"),
    port: parsePort(process.env.PORT),
    host: process.env.HOST || "::",
    authDisabled,
  };
}

export function loadJobConfig(): JobConfig {
  return {
    databaseUrl: requireEnv("DATABASE_URL"),
    rwaXyzApiKey: requireEnv("RWA_XYZ_API_KEY"),
    monitorUrl: process.env.JOB_MONITOR_URL || null,
  };
}

/** For the migrate step and the key script, which connect as rwa_owner. */
export function loadMigrationDatabaseUrl(): string {
  return requireEnv("MIGRATION_DATABASE_URL");
}

export function loadAdminDatabaseUrl(): string {
  return requireEnv("DATABASE_ADMIN_URL");
}

export function loadRolePasswords(): RolePasswords {
  return {
    owner: requireEnv("RWA_OWNER_PASSWORD"),
    job: requireEnv("RWA_JOB_PASSWORD"),
    api: requireEnv("RWA_API_PASSWORD"),
  };
}

export function loadLogLevel(): string {
  return process.env.LOG_LEVEL || "info";
}

/** Tests connect as a role that can create databases and roles. */
export function loadTestDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL || "postgres://rwa:rwa_local@127.0.0.1:54331/postgres";
}
