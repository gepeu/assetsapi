# Operations

How to run the service on Railway. The design and the reasons are in
[production_spec.md](production_spec.md).

## Railway services

One image, built by the `Dockerfile` at the repository root, runs as three services. Each holds only the variables it needs. Leave each service's root directory as the repository root, where the `Dockerfile` is.

**The jobs are off for now.** Deploy only the API. It serves the data restored from the baseline dump, which stays as it is until the jobs run. `/readyz` checks only the database and the migrations, so the API runs fine without them. To turn the jobs on, create the two job services below with their schedules. Until then, the RWA.xyz key and the job monitor aren't needed.

| Service | Start command | Schedule | Variables |
|---|---|---|---|
| **API** | `node src/api/server.ts` | Always on, 2 replicas | `DATABASE_URL` as `rwa_api`, `MIGRATION_DATABASE_URL` as `rwa_owner` |
| **Universe job** (off) | `node src/jobs/updateUniverse.ts` | `30 6 * * *` | `DATABASE_URL` as `rwa_job`, `RWA_XYZ_API_KEY`, `JOB_MONITOR_URL` |
| **Update job** (off) | `node src/jobs/updateData.ts` | `0 7 * * *` | `DATABASE_URL` as `rwa_job`, `RWA_XYZ_API_KEY`, `JOB_MONITOR_URL` |

- **API settings:** pre-deploy command `node src/db/migrate.ts`, and health check path `/readyz`.
- **Stopping cleanly:** set `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` to `30` on the API and `60` on both jobs. It defaults to 0, and without it Railway kills the process straight after the stop signal, so the API's 20-second drain and the jobs' "finish the current asset" never get the time. A job killed anyway is safe: its asset rolls back, and the next run marks the stale record.
- **The owner password on the API service:** the pre-deploy step runs in the API service's environment, so it has to hold `MIGRATION_DATABASE_URL`. The running API uses only `DATABASE_URL`.
- **Staging:** run the jobs less often, to save RWA.xyz quota.

## Settings

Every timeout, limit, threshold, size, label, path and provider address is an optional variable. `backend/.env.example` lists them all with their defaults, and `backend/src/config.ts` is the only file that reads them. Set a variable only on the service that uses it, and only to change its default. A value that isn't a sensible number or address stops the process when it starts, so a typo shows up as a failed deploy.

The ones most likely to change:

| Variable | Service | Default | When to change it |
|---|---|---|---|
| `RATE_LIMIT_MAX` | API | `600` | Requests per IP address in each window, a minute by default. Raise it if one caller, such as a server, sends many requests from one address: `6000` covers about 200 requests a second across two replicas |
| `DB_POOL_SIZE` | API | `5` | More replicas or a lower connection limit. Replicas times this, plus 4, has to stay under the Postgres limit |
| `PROVIDER_REQUEST_INTERVAL_MS` | Jobs | `250` | RWA.xyz starts answering `429` |
| `JOB_MAX_FAILED_SHARE` | Update job | `0.1` | Runs stop too early or too late when assets fail |
| `CACHE_VERSION_CHECK_MS` | API | `10000` | How stale a response may be after the data changes. Lower it for fresher responses, at one tiny query per replica per interval |
| `CACHE_MAX_BYTES` | API | `67108864` | 64 MB. A full set of asset pages is about 7 MB. `0` turns the response cache off, for example to rule it out while debugging |

- **Each replica counts separately:** the rate limit is kept in memory, so two replicas allow about twice the number.
- **Two that go together:** `API_STATEMENT_TIMEOUT_MS` is applied to the `rwa_api` role by `npm run setup-roles`, so set it in the shell that runs that script. `DB_QUERY_TIMEOUT_MS` on the API must stay above it, and the API won't start otherwise.
- **One that must match everywhere:** `JOB_LOCK_ID` is the lock that keeps the jobs and the migrate step from running at once. Leave it unset. If it ever has to change, set it as one shared variable on the API service and both jobs, because a service with a different number would run unprotected without any error.
- **Part of the API contract:** `DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE`, `MAX_PAGE_OFFSET`, `MAX_FILTER_LENGTH`, `MAX_HISTORY_METRICS`, `MAX_NAMES_PER_PARAMETER`, `MAX_SLUG_LENGTH` and `MAX_MEASURE_NAME_LENGTH` change what requests the API accepts. `openapi.json` is generated with the defaults, so after changing one, run `npm run openapi` with the same value and tell the callers.

**Why these times:** RWA.xyz refreshes more than once a day. On the day this was checked, records were stamped 05:35 and then 15:54 UTC, and its API caches responses for up to an hour. The 07:00 run picks up the morning refresh, and a later refresh waits for the next day's run. Check the times again after a week, using `_updated_at`. More runs give fresher current values, but not finer charts, because history is stored per day.

## Check on staging

These depend on Railway's behaviour, which the tests can't reach.

**Clean shutdown:** redeploy the API while requesting it. The logs should show `shutting down`, then the last requests, with no failed responses. Redeploy a job mid-run, and its run record should end as `interrupted`.

**The client IP can't be faked:** the API is public, so the per-IP rate limit is its only guard against one client using it all. It reads `X-Real-IP`, and Railway's docs don't say whether a value sent by the client gets overwritten. Set `RATE_LIMIT_MAX=20` on staging, then send 25 requests with a different `X-Real-IP` each time. The last ones must be `429`. If they all stay `200`, any client can get past the limit, and the client IP has to come from somewhere else. Remove the variable afterwards.

```sh
for i in $(seq 1 25); do
  curl -s -o /dev/null -w '%{http_code}\n' -H "X-Real-IP: 198.51.100.$i" "$API_URL/tokenized_assets"
done
```

## Set up an environment

Needs `DATABASE_ADMIN_URL`, `RWA_OWNER_PASSWORD`, `RWA_JOB_PASSWORD` and `RWA_API_PASSWORD` in the shell you run this from, with the new Postgres service reachable.

```sh
npm run setup-roles
pg_restore -d "$DATABASE_ADMIN_URL" --no-owner --no-privileges --role=rwa_owner rwa_baseline.dump
npm run setup-roles
```

The second `setup-roles` matters. A restore creates every table again, so default privileges let `rwa_job` change the catalog tables until that's taken back. The next deploy's migrate step then drops the `api_key` table the baseline dump still holds.

Then on the database, as an admin:

```sql
ALTER SYSTEM SET log_min_duration_statement = '500ms';
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';  -- needs a restart
```

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

## The RWA.xyz key

The API is public and needs no key. The jobs call RWA.xyz with `RWA_XYZ_API_KEY`: add it once as a shared variable in the project settings, attach it to both job services, and seal it. A sealed value still reaches the running service, but the dashboard and the CLI never show it again, so keep a copy in the password manager.

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

The API serves the corrected value within `CACHE_VERSION_CHECK_MS`, 10 seconds by default. Any write to a data table moves `data_version`, which empties every replica's response cache, so there's nothing else to do.

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
