/**
 * Environment variables, checked at startup. This is the only file that reads process.env, so each
 * process states exactly what it needs and a missing value stops it before it does anything.
 */

interface ApiConfig {
  databaseUrl: string;
  port: number;
  host: string;
}

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

export function loadApiConfig(): ApiConfig {
  return {
    databaseUrl: requireEnv("DATABASE_URL"),
    port: parsePort(process.env.PORT),
    host: process.env.HOST || "::",
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
