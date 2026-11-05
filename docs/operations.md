# Operations

How to run the service on Railway. The design and the reasons are in
[production_spec.md](production_spec.md).

## Railway services

One image, built from `backend/`, runs as three services. Each holds only the variables it needs.

| Service | Start command | Schedule | Variables |
|---|---|---|---|
| **API** | `node src/api/server.ts` | Always on, 2 replicas | `DATABASE_URL` as `rwa_api`, `MIGRATION_DATABASE_URL` as `rwa_owner` |
| **Universe job** | `node src/jobs/updateUniverse.ts` | `30 6 * * *` | `DATABASE_URL` as `rwa_job`, `RWA_XYZ_API_KEY`, `JOB_MONITOR_URL` |
| **Update job** | `node src/jobs/updateData.ts` | `0 7 * * *` | `DATABASE_URL` as `rwa_job`, `RWA_XYZ_API_KEY`, `JOB_MONITOR_URL` |

- **API settings:** pre-deploy command `node src/db/migrate.ts`, and health check path `/readyz`.
- **The owner password on the API service:** the pre-deploy step runs in the API service's environment, so it has to hold `MIGRATION_DATABASE_URL`. The running API uses only `DATABASE_URL`.
- **Staging:** run the jobs less often, to save RWA.xyz quota.

**Why these times:** RWA.xyz stamped every record 05:35 UTC on the day this was checked, and its API caches responses for up to an hour, so the jobs start after 06:35. Only one day was checked, so look at `_updated_at` again after a week. More runs don't give finer charts, because history is stored per day.

## Set up an environment

Needs `DATABASE_ADMIN_URL`, `RWA_OWNER_PASSWORD`, `RWA_JOB_PASSWORD` and `RWA_API_PASSWORD` in the shell you run this from, with the new Postgres service reachable.

```sh
npm run setup-roles
pg_restore -d "$DATABASE_ADMIN_URL" --no-owner --no-privileges --role=rwa_owner rwa_baseline.dump
npm run setup-roles
```

The second `setup-roles` matters. A restore creates every table again, so default privileges give `rwa_job` the `api_key` table until it's taken back.

Then on the database, as an admin:

```sql
ALTER SYSTEM SET log_min_duration_statement = '500ms';
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';  -- needs a restart
```

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

## API keys

Keys are created with the script, as `rwa_owner`, and shown once.

```sh
npm run create-api-key -- --client "frontend staging" --expires-days 90
```

**Rotate:** create a new key, switch the client over, then revoke the old one. A client can hold two active keys while it switches.

**Revoke:** a revoked key stops within a minute, because replicas cache key checks for up to 60 seconds.

```sql
SELECT id, client_name, key_prefix, last_used_at FROM api_key WHERE revoked_at IS NULL;
UPDATE api_key SET revoked_at = now() WHERE id = <id>;
```

## Rotate other secrets

**RWA.xyz key:** change `RWA_XYZ_API_KEY` on both job services. The next run uses it.

**Database passwords:** set the new passwords in the environment, run `npm run setup-roles`, then update the connection URLs on each service and redeploy. Existing connections keep working until they close, so nothing fails while they switch.

## Correct a value

Edit the row and set `locked_reason`. The update job then won't overwrite or delete it.

```sql
UPDATE field_value v
SET value = '"The correct value"', source_id = (SELECT id FROM source WHERE key = 'manual'),
    ingestion_run_id = NULL, missing_since = NULL, updated_at = now(),
    locked_reason = 'Who corrected it and why'
FROM field f
WHERE f.id = v.field_id AND f.key = 'identity.name' AND v.asset_id = <asset id>;
```

Organization values hold `{"organization_id": <id>}`, not a name. To hand a value back to the job, clear `locked_reason`.

## Approve a new measure

A new name from a provider is stored with `served = false` and reported in the run summary. To expose it:

```sql
UPDATE financial_measure
SET label = '...', unit = '...', measure_group = '...', kind = 'figure', definition = '...', served = true
WHERE slug = '...';
```

Do the same in a migration, so every environment gets it. The same applies to `yield_to_maturity`, which isn't served until its units are confirmed. On current data it looks like a fraction labelled as a percent: 0.037 where the asset's APY is about 3.6. Its series also stopped updating in January 2026.

## Asset type mapping

A new asset whose RWA.xyz class has no mapping is held back and reported, and nothing is written for it. Add the class to `ASSET_TYPE_BY_CLASS` in `src/providers/rwaXyz/mapping.ts`. The next universe run picks it up.

## Reload history

The update job asks for the last 35 days, which picks up restated days. An asset or Solana token with no history gets its full series automatically. To reload everything, such as after a restatement older than that or when a measure is added to existing assets, set `UPDATE_FULL_HISTORY=true` on the update job for one run. Only changed days are written.

## Move a mint by hand

If RWA.xyz moves a mint to a new asset ID, the universe job skips that asset and reports it under `moved`. Check that it's the same product, then point the alias at the new ID:

```sql
UPDATE asset_alias SET value = '<new id>' WHERE namespace = 'rwa_xyz_id' AND asset_id = <asset id>;
```

## Read a run

```sql
SELECT id, job, status, started_at, finished_at, summary FROM ingestion_run ORDER BY id DESC LIMIT 10;
```

| Status | Meaning |
|---|---|
| `succeeded` | Everything finished. `summary` may still list held-back items |
| `partial` | Some assets failed and kept their last good data. `summary.failed` lists them |
| `failed` | The run stopped. `summary.stoppedBy` or `summary.error` says why |
| `interrupted` | A stop signal arrived. Finished assets stay updated |

The job monitor gets a failure ping, with this summary, for anything but a clean run. `summary.severity` isn't stored, but the ping's body has it: `urgent` for a run that stopped, `normal` for the rest.

## Backups and restore

**Railway backups:** daily (kept 6 days) and weekly (kept 27 days). They restore only into the same project and environment, and wiping a volume deletes them.

**Before a risky migration:** take a dump off Railway first.

```sh
pg_dump -Fc --no-owner --no-privileges "$DATABASE_ADMIN_URL" > before-migration.dump
```

**To restore a dump:** follow "Set up an environment" against an empty database. Do a test restore at setup, then occasionally. Targets are at most 24 hours of data loss and about 2 hours to recover.

## Roll back

Redeploy the previous image. Migrations move forward only, and each must work with both old and new code. An older image passes `/readyz` and the jobs' schema check, because both only require the migrations it ships with.
