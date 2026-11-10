/**
 * Creates the three database roles and their grants, with passwords from environment variables.
 * Safe to re-run, and it must run again after restoring a dump, because a restore recreates the
 * tables and default privileges would give rwa_job the api_key table.
 */
import pg from "pg";
import { loadAdminDatabaseUrl, loadRolePasswords, type RolePasswords, settings } from "../src/config.ts";

async function ensureRole(client: pg.Client, role: string, password: string): Promise<void> {
  const { rows } = await client.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists",
    [role],
  );
  const verb = rows[0]?.exists ? "ALTER" : "CREATE";
  await client.query(`${verb} ROLE ${pg.escapeIdentifier(role)} LOGIN PASSWORD ${pg.escapeLiteral(password)}`);
}

export async function setupRoles(connectionString: string, passwords: RolePasswords): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await ensureRole(client, "rwa_owner", passwords.owner);
    await ensureRole(client, "rwa_job", passwords.job);
    await ensureRole(client, "rwa_api", passwords.api);

    // Only the API has a statement timeout, because jobs and migrations run longer statements.
    // A whole number checked in config.ts. ALTER ROLE takes no parameters.
    await client.query(`ALTER ROLE rwa_api SET statement_timeout = '${settings.db.apiStatementTimeoutMs}ms'`);

    const { rows } = await client.query<{ name: string }>("SELECT current_database() AS name");
    const database = pg.escapeIdentifier(rows[0]?.name ?? "");
    await client.query(`GRANT CONNECT, TEMPORARY ON DATABASE ${database} TO rwa_owner, rwa_job, rwa_api`);
    await client.query("GRANT USAGE, CREATE ON SCHEMA public TO rwa_owner");
    await client.query("GRANT USAGE ON SCHEMA public TO rwa_job, rwa_api");

    // Covers tables that later migrations add.
    await client.query(`
      ALTER DEFAULT PRIVILEGES FOR ROLE rwa_owner IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rwa_job;
      ALTER DEFAULT PRIVILEGES FOR ROLE rwa_owner IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO rwa_job;
      ALTER DEFAULT PRIVILEGES FOR ROLE rwa_owner IN SCHEMA public
        GRANT SELECT ON TABLES TO rwa_api;
    `);

    // Tables that already exist, such as after a restore.
    await client.query(`
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rwa_job;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rwa_job;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO rwa_api;
    `);

    const { rows: tables } = await client.query<{ exists: boolean }>(
      "SELECT to_regclass('api_key') IS NOT NULL AS exists",
    );
    if (tables[0]?.exists) {
      await client.query(`
        REVOKE ALL ON api_key FROM rwa_job;
        REVOKE INSERT, UPDATE, DELETE ON field, source FROM rwa_job;
        GRANT UPDATE (last_used_at) ON api_key TO rwa_api;
      `);
    }
    const { rows: migrations } = await client.query<{ exists: boolean }>(
      "SELECT to_regclass('schema_migration') IS NOT NULL AS exists",
    );
    if (migrations[0]?.exists) {
      await client.query("REVOKE INSERT, UPDATE, DELETE ON schema_migration FROM rwa_job");
    }
  } finally {
    await client.end();
  }
}

if (import.meta.main) {
  await setupRoles(loadAdminDatabaseUrl(), loadRolePasswords());
  process.stdout.write("Roles and grants are in place.\n");
}
