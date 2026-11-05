/**
 * Creates an API key and shows it once. Only its hash is stored, so a lost key can't be recovered:
 * create another and revoke the old one.
 *
 * Usage: npm run create-api-key -- --client "frontend staging" [--expires-days 90]
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { hashApiKey } from "../src/api/auth.ts";
import { loadMigrationDatabaseUrl, settings } from "../src/config.ts";
import { createPool } from "../src/db/pool.ts";
import { insertKey } from "../src/db/queries/apiKeys.ts";

const { values } = parseArgs({
  options: { client: { type: "string" }, "expires-days": { type: "string" } },
});

if (!values.client) {
  process.stderr.write('Usage: create-api-key --client "name" [--expires-days 90]\n');
  process.exit(1);
}

const days = values["expires-days"] === undefined ? null : Number(values["expires-days"]);
if (days !== null && (!Number.isInteger(days) || days < 1)) {
  process.stderr.write("--expires-days must be a positive whole number\n");
  process.exit(1);
}

const key = `rwa_${randomBytes(32).toString("base64url")}`;
const pool = createPool({ connectionString: loadMigrationDatabaseUrl(), max: 1 });
try {
  await insertKey(pool, {
    clientName: values.client,
    keyHash: hashApiKey(key),
    keyPrefix: key.slice(0, settings.api.keyPrefixLength),
    expiresAt: days === null ? null : new Date(Date.now() + days * 24 * 60 * 60 * 1000),
  });
  process.stdout.write(`${key}\n`);
  process.stderr.write(`Created for ${values.client}. Save it now: this is the only time it's shown.\n`);
} finally {
  await pool.end();
}
