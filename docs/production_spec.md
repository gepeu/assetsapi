# Production data service: final spec

**Status:** reviewed on 2026-11-05, with the review's fixes applied. Nothing here is built yet.

The service is a private, read-only API over a Postgres database that scheduled jobs keep current from RWA.xyz and Kamino. It runs on Railway, in the existing project, which it replaces. This spec covers the backend. The frontend is a separate service owned by the frontend team.

| Topic | Decision |
|---|---|
| **Who uses it** | The frontend team, with API keys. It isn't public, and there are no outside clients for now |
| **Access** | A normal Railway URL, with an API key required on every data request |
| **Data** | The token universe, reference fields, current financial values and daily history |
| **Updates** | Scheduled jobs. Each update overwrites current values |
| **Providers** | RWA.xyz for data and Kamino for the verified token list |
| **Scale** | Two API replicas. Add more if traffic requires it |

**Out of scope for now:** the chat agent, document storage and search, document links, AI-sourced values, public access, the frontend itself, market-wide totals and bulk export. `main` and the local `rwa` database still hold the old system and data.

## 1. Architecture

The code has five parts. Two entry points, the jobs and the API, meet only at the database, so a failed job can't take the API down.

```
Write path:  Jobs → Providers → RWA.xyz, Kamino
             Jobs → Database → Postgres

Read path:   API → Read logic → Database → Postgres
```

| Part | Folder | Does | Never does |
|---|---|---|---|
| **Providers** | `providers/` | Fetch external data and convert it to our types | Touch the database |
| **Jobs** | `jobs/` | Maintain the universe and update data | Serve requests, contain SQL or know provider field names |
| **Database** | `db/` | Connections, migrations and all SQL | Call providers or build API responses |
| **Read logic** | `services/` | Turn rows into API responses | Handle HTTP or contain SQL |
| **API** | `api/` | HTTP, authentication and errors | Call providers or run SQL directly |

**Import rules:** `api` and `jobs` never import each other, `api` never imports `providers`, and only `db/queries/` contains SQL.

**Processes:** one Docker image runs four commands.

| Command | Runs as | Behaviour |
|---|---|---|
| `api` | Long-running service, 2 replicas | Serves requests |
| `update-universe` | Cron service | One run, then exits |
| `update-data` | Cron service | One run, then exits |
| `migrate` | Railway pre-deploy step | Applies migrations, then exits |

### Railway services

The frontend and backend are two apps, deployed separately. The API and both jobs come from the same backend code and Docker image.

| Service | What it is | Owner |
|---|---|---|
| **Frontend** | The website and its small server | Frontend team |
| **API** | Always running, with 2 replicas | Backend |
| **Universe job** | Runs on a schedule and exits | Backend |
| **Update job** | Runs on a schedule and exits | Backend |
| **Postgres** | The database, on the private network | Backend |

### Directory structure

```
.
├── .github/
│   ├── dependabot.yml                  # update PRs with a 7-day cooldown
│   └── workflows/ci.yml
├── .gitignore
├── README.md                           # how to run it locally
├── docker-compose.yml                  # local Postgres
├── docs/
│   ├── operations.md                   # key rotation, restore, manual corrections
│   ├── production_spec.html
│   └── production_spec.md
└── backend/
    ├── .dockerignore
    ├── .env.example
    ├── .npmrc                          # ignore-scripts=true, save-exact=true
    ├── Dockerfile
    ├── openapi.json                    # generated and committed
    ├── package.json
    ├── package-lock.json
    ├── tsconfig.json
    ├── db/migrations/
    │   ├── 001_baseline.sql            # the final schema
    │   └── 002_catalog_seed.sql        # fields, sources and measures
    ├── scripts/
    │   ├── createApiKey.ts
    │   ├── generateOpenApi.ts
    │   └── setupRoles.ts               # database roles and grants, safe to re-run
    ├── src/
    │   ├── config.ts                   # environment variables, checked at startup
    │   ├── logger.ts                   # JSON logs with secrets redacted
    │   ├── providers/
    │   │   ├── types.ts                # interfaces and shared data types
    │   │   ├── errors.ts               # NotFound, Transient, ContractBroken, AuthOrQuota
    │   │   ├── http.ts                 # pacing, timeouts, retries, rate-limit headers
    │   │   ├── kamino/
    │   │   │   └── provider.ts
    │   │   └── rwaXyz/
    │   │       ├── client.ts           # HTTP calls and the API key
    │   │       ├── mapping.ts          # RWA.xyz fields → our catalog fields
    │   │       ├── measures.ts         # unit fixes and measure conversion
    │   │       └── provider.ts         # puts these behind the interfaces
    │   ├── jobs/
    │   │   ├── updateUniverse.ts       # entry point
    │   │   ├── universeRules.ts        # the exact-mint rule, no I/O
    │   │   ├── updateData.ts           # entry point
    │   │   ├── updateAsset.ts          # one asset: fetch, validate, write
    │   │   ├── validate.ts             # checks converted data, no I/O
    │   │   └── runTracking.ts          # stale runs, run record, summary, monitor ping
    │   ├── db/
    │   │   ├── pool.ts
    │   │   ├── lock.ts                 # the shared advisory lock
    │   │   ├── migrate.ts              # entry point
    │   │   └── queries/
    │   │       ├── apiKeys.ts
    │   │       ├── assets.ts
    │   │       ├── fieldValues.ts
    │   │       ├── financials.ts
    │   │       ├── history.ts
    │   │       ├── organizations.ts
    │   │       ├── runs.ts
    │   │       └── tokens.ts
    │   ├── services/
    │   │   ├── assets.ts
    │   │   ├── fields.ts
    │   │   ├── financials.ts
    │   │   ├── history.ts
    │   │   └── tokens.ts
    │   └── api/
    │       ├── server.ts               # entry point: listens and shuts down cleanly
    │       ├── app.ts                  # builds the Fastify app
    │       ├── auth.ts
    │       ├── errors.ts               # the standard error response
    │       ├── routes/
    │       │   ├── assets.ts
    │       │   └── health.ts
    │       └── schemas/
    │           ├── shared.ts
    │           ├── assets.ts
    │           ├── fields.ts
    │           ├── financials.ts
    │           ├── history.ts
    │           └── tokens.ts
    └── test/
        ├── helpers/
        │   ├── fakeProvider.ts
        │   └── testDb.ts
        ├── fixtures/                   # recorded real responses
        │   ├── kamino/
        │   │   └── tokens.json
        │   └── rwaXyz/
        │       ├── asset.json
        │       ├── assetTimeseries.json
        │       ├── tokenSearch.json
        │       ├── tokenTimeseries.json
        │       └── tokens.json
        ├── providers/
        │   ├── http.test.ts
        │   ├── kamino.test.ts
        │   └── rwaXyz.test.ts
        ├── jobs/
        │   ├── runTracking.test.ts
        │   ├── universeRules.test.ts
        │   ├── updateAsset.test.ts
        │   ├── updateData.test.ts
        │   ├── updateUniverse.test.ts
        │   └── validate.test.ts
        ├── db/
        │   ├── migrations.test.ts
        │   └── roles.test.ts
        ├── services/
        │   ├── assets.test.ts
        │   ├── fields.test.ts
        │   ├── financials.test.ts
        │   ├── history.test.ts
        │   └── tokens.test.ts
        └── api/
            ├── assets.test.ts
            ├── auth.test.ts
            ├── fields.test.ts
            ├── financials.test.ts
            ├── health.test.ts
            ├── history.test.ts
            ├── openapi.test.ts
            └── tokens.test.ts
```

`assets.ts` appears in `queries/`, `services/`, `routes/` and `schemas/`, one for each layer of the same resource. The folder tells you the layer.

**Taken from `main`:**
- **Copied and adapted:** the RWA.xyz client and mapping, the pool, the migration runner, and the tests that still apply.
- **Reworked:** `load.ts` and `financials.ts` split across `providers/`, `jobs/` and `db/queries/`. The views become `services/` and `db/queries/`.
- **Left behind:** the chat agent, document code, bucket storage code, sessions, the login limiter, `db/catalog/`, `seed.ts`, migrations `001` to `006`, and the other files in `docs/`.

## 2. Token universe

**Rule:** a token qualifies if its exact Solana mint is in both Kamino's verified list and RWA.xyz. Tickers are never used for matching, because they collide.

- The `asset` table is the only list. There's no hard-coded catalog.
- New qualifying tokens join automatically.
- An asset is active while one of its Solana mints is in both lists. Otherwise it gets `deactivated_at`, and its history stays. If it qualifies again, that date is cleared.
- Today's universe is 107 assets, each with exactly one Solana token, and 1,513 token rows across 27 networks.

**`asset_type` for new assets** comes from a mapping of RWA.xyz's class. Existing assets keep their type, because "Active Strategies" currently covers both `defi_yield` and `tokenized_fund`. An asset with an unmapped class is held back and reported until the mapping is added.

**Slugs:** new assets use RWA.xyz's slug, with a number added if it's taken. Existing slugs don't change.

## 3. Providers

Each adapter implements only the interfaces it supplies, and works with the provider's IDs.

| Interface | Function | Returns | Kamino | RWA.xyz |
|---|---|---|---|---|
| `UniverseProvider` | `listTokens()` | Each verified token's network and address | Yes | No |
| `AddressResolver` | `resolve(network, address)` | The provider's ID, or nothing | No | Yes |
| `ReferenceProvider` | `getReference(ref)` | Field values for the asset and its tokens | No | Yes |
| `FinancialProvider` | `getCurrent(ref)` | Current values, marked asset or token level | No | Yes |
| | `getHistory(ref)` | Full daily series for each measure | No | Yes |

| Error | Example | What the job does |
|---|---|---|
| `NotFound` | Asset delisted | Fails that asset and keeps its last good data. The next universe run deactivates it if RWA.xyz no longer lists its mint |
| `Transient` | Timeout, 429 or 5xx | Retries with backoff, honouring `X-RateLimit-*` headers |
| `ContractBroken` | Response format changed | Fails that asset. The run stops only at its failure limit (section 5) |
| `AuthOrQuota` | Key rejected or quota used up | Stops that provider's run and alerts |

**Ownership:** each data type and asset has one provider. Providers never compete for a value, so no winner rules are needed. With one data provider, the job uses the RWA.xyz adapter directly. A `data_owner` table can be added when a real second provider appears.

**Kamino:** the list URL needs `limit=1000`, because it otherwise returns only 20 tokens. No key is needed.

## 4. Database schema

There are 15 tables, down from 27, and 2 views, down from 9.

| Group | Tables |
|---|---|
| **Universe** | `asset`, `token`, `network`, `asset_alias`, `organization`, `asset_organization` |
| **Reference data** | `field`, `field_value`, `source` |
| **Financials** | `financial_current`, `financial_timeseries`, `financial_measure` |
| **Operations** | `ingestion_run`, `api_key`, `schema_migration` |

**Removed tables:** `claim`, `claim_citation`, `fact_override`, `source_priority`, `subjective_term`, `document`, `asset_document`, `stored_file`, `document_text`, `document_chunk`, `contract`, `token_contract`, `raw_response`, `agent_response` and `financial_snapshot`.

**Removed views:** `eligible_claim`, `current_claim`, `fact`, `asset_coverage`, `financial_latest`, `searchable_file` and `searchable_chunk`.

### Universe

**`asset`**

| Column | Type | Notes |
|---|---|---|
| `id` | `integer` | Primary key |
| `slug` | `text`, unique | Public ID in the API |
| `ticker` | `text` | **No longer unique.** Indexed for lookup |
| `name`, `asset_class`, `asset_type` | `text` | `asset_class` is RWA.xyz's name word for word |
| `deactivated_at` | `timestamptz` | **New.** Empty means active |
| `created_at` | `timestamptz` | |

Removed: `listed_issuer` (all 107 have an issuer organization) and `review_note` (empty).

**`token`**

| Column | Type | Notes |
|---|---|---|
| `id` | `integer` | Primary key |
| `asset_id`, `network_id` | `integer` | Foreign keys |
| `address` | `text` | Unique with `network_id`. The address-normalising trigger stays |
| `issuance_type` | `text` | `native`, `bridged`, `wrapper` or `unknown` |
| `deactivated_at` | `timestamptz` | **New.** Set when RWA.xyz stops listing the token |
| `created_at` | `timestamptz` | |

Removed: `symbol` (empty on all 1,513 tokens).

**`asset_alias`:** `asset_id`, `namespace`, `value`. Only the `rwa_xyz_id` namespace remains. Removed: `verified`, and the `catalog_slug` and `rwa_xyz_slug` rows.

**`network`:** unchanged. **`organization`:** unchanged.

**`asset_organization`:** the columns are unchanged. The update job replaces an asset's rows on each update, so a role RWA.xyz removes doesn't stay forever.

### Reference data

**`field`:** the catalog goes from 144 to 135 fields, because the 9 `control.*` fields are removed. Removed: `conflict_policy`. `level` loses the `contract` option. 78 fields have data today, and the other 57 stay in the catalog without a value.

**`source`:** `id`, `key`, `name`. Removed: `kind`. It has three rows: `rwa_xyz`, `kamino` and `manual`.

**`field_value`** (new, replaces `claim`)

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | Primary key |
| `field_id` | `integer`, required | Catalog field |
| `asset_id`, `token_id`, `organization_id`, `network_id` | `integer` | The subject. Exactly one is set |
| `subject_ref` | generated `text` | Such as `token:123` |
| `record_key` | `text`, default empty | Identifies one repeating record, such as an audit |
| `value` | `jsonb`, required | The cleaned value. Can't be JSON `null` |
| `raw_value` | `jsonb` | The value as received, for audit |
| `as_of` | `date` | When the source says it's true |
| `source_id` | `smallint`, required | Provider, or `manual` |
| `ingestion_run_id` | `bigint` | Empty for manual edits |
| `missing_since` | `timestamptz` | Set when the provider first stops reporting the value, and cleared when it returns |
| `updated_at` | `timestamptz`, required | Last time the value changed |
| `locked_reason` | `text` | If set, the job won't overwrite the row |

Unique on `field_id`, `subject_ref` and `record_key`. Value type checks move from the old database trigger to `validate.ts`.

**Removing values:** asset and token rows are deleted once they've been missing for 7 days, unless locked. A value only counts as missing when its asset loads successfully without it, so an outage never starts the clock, and an unchanged run writes nothing. Organization and network rows are only overwritten, because 27 of the 85 organizations are shared across assets, one of them by 64.

**Correcting a value:** edit the row and set `locked_reason`.

### Financials

**`financial_measure`**

| Column | Type | Notes |
|---|---|---|
| `slug` | `text` | Primary key, such as `price_dollar` |
| `label` | `text`, required | Renamed from `name` |
| `unit` | `text` | Standardised |
| `measure_group` | `text` | Such as Value, Yield, Supply and holders, or Activity |
| `kind` | `text` | `figure` or `term` |
| `served` | `boolean`, required | Whether the API may return it |
| `definition` | `text` | What the measure means |
| `sort_order` | `integer` | |

It now also covers snapshot-only names. A new name from a provider is added automatically with `served = false` and reported, so the data is kept but not exposed until someone approves it.

**`financial_current`** (new, replaces `financial_snapshot`)

| Column | Type | Notes |
|---|---|---|
| `asset_id` | `integer`, required | |
| `token_id` | `integer` | Empty means the whole asset |
| `metric` | `text`, required | Foreign key to `financial_measure` |
| `value`, `value_7d`, `value_30d`, `value_90d` | `double precision` | Empty for text, yes/no and list values |
| `raw` | `jsonb`, required | The value as received |
| `as_of` | `date`, required | |
| `ingestion_run_id` | `bigint`, required | |
| `missing_since` | `timestamptz` | Same meaning as in `field_value` |
| `updated_at` | `timestamptz`, required | Last time the value changed |

Unique on asset, token and metric, with empty tokens treated as equal. There's one row per value and no snapshot history. Rows are deleted once they've been missing for 7 days.

**`financial_timeseries`:** the columns are unchanged. Writes change: only new or changed days are written, which stops each run rewriting 1.79M rows.

### Served measures

Local data has 90 distinct names, and 77 are served.

| Treatment | Count | Names |
|---|---|---|
| **Served** | 77 | Everything not listed below. `yield_to_maturity` waits until its units are confirmed, so 76 at first |
| **Not served: provider IDs and objects** | 6 | `accounting_frequency_type_id`, `denomination_asset_id`, `primary_market__kyc_provider_id`, `primary_market_non_pegged_asset`, `primary_market_pegged_asset`, `primary_markets` |
| **Not served: technical or covered elsewhere** | 3 | `raw_supply`, `rebase_transfer_unit`, `ratings` |
| **Not served: exact duplicates** | 3 | `bridged_token_value_dollar`, `bridged_token_market_cap_dollar`, `bridged_token_supply_token` |
| **Merged** | 1 | `yield_to_maturity_percent` into `yield_to_maturity` |

The adapter also cleans up units, such as `Dollars` becoming `dollar`, and the wrong `address` unit on `number_of_daily_transactions_count`.

Rules carried over from `main`: holder shares are read from the Solana token, and a share above 100% is stored but not served.

### Operations

**`ingestion_run`**

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | Primary key |
| `source_id` | `smallint`, required | `kamino` or `rwa_xyz` |
| `job` | `text`, required | **New.** `universe` or `update`. Replaces `parameters` |
| `started_at`, `finished_at` | `timestamptz` | |
| `status` | `text` | `running`, `succeeded`, `partial`, `failed` or **`interrupted`** (new) |
| `summary` | `jsonb` | Counts, failed assets, and held-back and new items |

**`api_key`** (new)

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` | Primary key |
| `client_name` | `text`, required | Who holds the key |
| `key_hash` | `text`, unique, required | SHA-256. The key itself is never stored |
| `key_prefix` | `text`, required | Visible start of the key, for identifying it |
| `expires_at`, `revoked_at`, `last_used_at` | `timestamptz` | |
| `created_at` | `timestamptz`, required | |

**`schema_migration`:** unchanged.

### Views

- **`asset_subject`:** every subject that counts towards an asset, without contracts.
- **`asset_field_status`:** one row per asset and field: `with_data`, `no_data` or `not_applicable`. `/fields` counts coverage from it.

### Migrations and starting data

The schema starts fresh from where we are now, and the old migrations stay on `main` as history.

- **`001_baseline.sql`:** the final 15 tables, 2 views, indexes and triggers.
- **`002_catalog_seed.sql`:** the 135 fields, 3 sources and the measure list.
- **Later changes:** start at `003`.

**Starting data:** the new database is filled from main's `rwa` database, not rebuilt by the jobs. A one-off conversion runs once, outside the migration system:

1. Restore a copy of `rwa` into a scratch database, and move its tables into a separate schema.
2. Build the new schema beside it by running `001` and `002`, so it matches a fresh database by construction.
3. Run a one-off script that copies the data across:
    - the universe tables, keeping their IDs
    - the 16,703 current facts into `field_value`, matched to fields by key
    - the latest snapshot rows into `financial_current`
    - the daily history and run records
4. Reset the ID sequences and drop the old schema.
5. Check the row counts against `rwa`.
6. Save it as `.local/backups/rwa_baseline.dump` and in a private bucket.

The script and dump stay out of git, and each environment restores this dump. CI still tests `001` and `002` on an empty database, which the jobs can fill by themselves.

A database at `006`, like `rwa`, can't be upgraded by the new migrations. Nothing needs that after cutover.

**Safe copy of main's data:** a full dump of `rwa`, including documents, and the original files in `.local/documents/` are kept in `.local/backups/` and the private bucket. The new service never reads them. The private bucket can be the existing Railway bucket, once we've checked what it already holds.

## 5. Jobs

Both jobs run on cron, do one run and exit.

- **Lock:** they share one Postgres advisory lock, held on a dedicated connection. If it's taken, a job exits straight away, so the two are scheduled apart. If that connection drops, the lock is gone, so the job stops.
- **Schema check:** each job first checks that the schema is at the version its code needs, and exits if it isn't. Cron services deploy separately from the migration step, so new job code could otherwise run on the old schema.

**Schedule (default):** both once a day, universe first and update 30 minutes later. RWA.xyz refreshes more than once a day (05:35 and 15:54 UTC on the day checked), so a later refresh waits for the next run. Frequency is a cron setting, not code. More runs don't give finer charts, because history is stored per day.

### Universe job

1. Take the lock and mark stale `running` runs as `failed`.
2. Fetch Kamino's verified list (531 tokens at last check).
3. Call `resolve` on RWA.xyz for every mint in the list, by exact address, so both halves of the rule are checked on each run. At 4 requests per second, 531 mints take a little over 2 minutes.
4. **Check the result.** If either provider's calls fail, or fewer than 80% of active assets would remain, change nothing and alert.
5. For a new match, create the asset, alias and Solana token and load its data **in one transaction**. If the load fails, nothing is created, and the next run retries. An asset therefore never appears without data.
6. Deactivate assets whose mint is no longer in both lists, and reactivate any that qualify again.
7. Record the summary and ping the job monitor.

If RWA.xyz moves a mint to a new asset ID, that asset is skipped and reported for a manual fix.

### Update job

1. Take the lock and mark stale `running` runs as `failed`.
2. Read the active assets.
3. Run `updateAsset` for each one:
    - **Fetch** reference data, current values and history, outside any transaction.
    - **Validate:** format, known fields, finite numbers and `as_of` dates that aren't in the future.
    - **Write in one transaction:** asset class, tokens, organizations, field values, current values and changed history days. Skip locked rows, set or clear `missing_since`, and delete rows that have been missing for 7 days.
4. Record the summary and ping the job monitor.

| Failure | Result |
|---|---|
| One asset fails, including a format error in its data | It rolls back and keeps its last good data. The run ends as `partial` |
| 5 assets fail in a row, or more than 10% of active assets fail | The run stops and sends an urgent alert |
| Rejected key or used-up quota | The run stops straight away and sends an urgent alert. Assets already written were valid |
| Stop signal | Finishes the current asset, marks the run `interrupted` and exits |
| Crash | Finished assets stay updated. The next run marks the stale record and does the rest |
| Large value swing | Written and noted in the run summary, since real values can jump |

Assets update one by one, so for a few minutes some have new data while others still have old. Each carries its own `as_of`.

## 6. API

### Endpoints

All are `GET`, and all require a key.

| Endpoint | Returns |
|---|---|
| `/assets` | Active assets with key figures, plus filter options |
| `/assets/{slug}` | Identity, issuer, organizations, networks and key figures |
| `/assets/{slug}/fields` | Catalog values by category, with coverage. Excludes token-level fields |
| `/assets/{slug}/tokens` | One row per chain: address, issuance type, token fields and figures |
| `/assets/{slug}/financials` | Figures, fund terms, value by network and available history |
| `/assets/{slug}/history` | Daily points for one measure |

One operational route needs no key: `/readyz` reports whether the database is reachable and the schema is new enough. Railway's deploy check and the uptime monitor call it.

### Input

Every input schema uses `additionalProperties: false`, in the style of Kamino's API. An unknown parameter returns a `400`. Fastify strips unknown properties by default, so that setting is turned off.

| Endpoint | Parameter | Rule |
|---|---|---|
| All `{slug}` routes | `slug` | `^[a-z0-9-]{1,64}$` |
| `/assets` | `assetClass` | String, 1 to 64 characters |
| | `assetType` | Enum of our asset types |
| | `network` | `^[a-z0-9-]{1,64}$` |
| | `q` | String, 1 to 64 characters. Searches ticker, name and issuer |
| | `sort` | Default `ticker`. Also `price_dollar`, `net_asset_value_dollar`, `total_asset_value_dollar`, `apy_30_day` and `holding_addresses_count`. A leading `-` sorts descending. Ties break by `slug`, so paging stays stable |
| | `limit` | Integer, 1 to 200, default 50 |
| | `offset` | Integer, at least 0, default 0 |
| `/assets/{slug}/tokens` | `network` | Optional, same rule |
| `/assets/{slug}/history` | `measure` | Required, `^[a-z0-9_]{1,64}$`. An unknown or unserved measure returns a `404` |
| | `range` | `7d`, `30d`, `3m`, `1y` or `all`, default `all` |

### Responses

These are the shapes. The strict JSON Schemas live in `backend/src/api/schemas/`. Every declared property is always present, with `null` when there's no value.

```ts
Figures {
  price_dollar, net_asset_value_dollar, total_asset_value_dollar,
  apy_30_day, holding_addresses_count: number | null
}
FieldValue {
  key, label, valueType: string
  value: string | number | boolean | string[] | null
  asOf: date | null
}
Coverage { withData, applicable: integer }

// GET /assets
{
  data: [{
    slug, ticker, name, assetClass, assetType: string
    issuer: string | null
    asOf: date | null
    figures: Figures
  }],
  meta: {
    total, limit, offset: integer
    filters: { assetClasses, assetTypes, networks: string[] }
  }
}

// GET /assets/{slug}
{
  data: {
    slug, ticker, name, assetClass, assetType: string
    description, issuer: string | null
    organizations: [{ slug, name, role: string, legalName: string | null }]
    networks: [{ key, name: string }]
    asOf: date | null
    figures: Figures
  }
}

// GET /assets/{slug}/fields
{
  data: {
    coverage: Coverage
    categories: [{
      name: string
      coverage: Coverage
      fields: FieldValue[]
      records: [{ group, key: string, fields: FieldValue[] }]
    }]
  }
}

// GET /assets/{slug}/tokens
{
  data: [{
    network: { key, name: string }
    address: string
    issuanceType: "native" | "bridged" | "wrapper" | "unknown"
    fields: FieldValue[]
    figures: {
      total_asset_value_dollar, market_value_dollar,
      total_supply_token, holding_addresses_count: number | null
    }
    asOf: date | null
  }]
}

// GET /assets/{slug}/financials
{
  data: {
    asOf: date | null
    figures: [{
      measure, label, group: string
      unit: string | null
      scope: "asset" | "solana"
      value: number
      value7d, value30d, value90d: number | null
      asOf: date | null
    }]
    terms: FieldValue[]
    networks: [{ key, name: string, value, share: number }]
    history: [{ measure, label, group: string, unit: string | null, scope: "asset" | "solana" }]
  }
}

// GET /assets/{slug}/history
{
  data: {
    measure, label: string
    unit: string | null
    scope: "asset" | "solana"
    points: [day, value][]   // oldest first; empty for a valid measure with no data
  }
}

// Any error
{
  error: {
    code: "bad_request" | "unauthorized" | "not_found" | "rate_limited" | "unavailable" | "internal"
    message, requestId: string
  }
}
```

| Status | When |
|---|---|
| `200` | Success |
| `304` | The `ETag` matches, so there's no body |
| `400` | Invalid or unknown parameter |
| `401` | Missing, revoked or expired key |
| `404` | Unknown or deactivated asset, or an unknown measure |
| `429` | Rate limited |
| `503` | Database unavailable |

**Not returned:** section layouts, chart types, per-value sources, conflicts and documents. The frontend team needs to keep the "Data obtained from RWA.xyz" banner.

**Missing data:** missing figures are `null` and sort last. `apy_30_day` exists for only 11 assets and price for 101.

**Changing the contract:** with no version prefix, we add to responses, and a real break gets a new path. That's manageable while there's one client.

### Access

- **Exposure:** the API has a normal Railway URL. Anyone can find it, but every data route returns a `401` without a key, and Postgres stays private.
- **Format:** `Authorization: Bearer <key>`, with one key per person or app.
- **Creating keys:** `scripts/createApiKey.ts` shows a key once. There's no dashboard.
- **Rotating:** a client can hold two active keys while it switches.
- **Revoking:** replicas cache key checks for up to 60 seconds, so a revoked key stops within a minute.

### For the frontend team

The frontend team receives `backend/openapi.json` and an API key. There's no hosted docs page, because a browser can't send the key when it opens one.

- **Store the key as a Railway variable** on the frontend service, and use it only in server code. A static build variable, such as `VITE_`, ends up in the browser's JavaScript.
- **Add a small server route** that adds the key to each API call. Browsers then only talk to the frontend's own domain, so the API needs no CORS.
- **Protect private viewing.** The key only protects the API, so anyone with the frontend's URL could see the data through that server. The simplest fix is HTTP Basic Auth on the frontend server, with the shared password stored in Railway.
- **Keep the banner:** "Data obtained from RWA.xyz".

### Caching

- **`ETag`:** a hash of the response body, with `Cache-Control: private, no-cache`. A client gets a `304` when nothing has changed.
- **Compression:** enabled for long history responses.
- **In-memory cache, CDN and Redis:** left out until the load check shows a need.

### Where the contract lives

- **Source of truth:** `backend/src/api/schemas/`, as JSON Schema in `.ts` files. Fastify validates against them, and TypeScript types are derived from them.
- **`backend/openapi.json`:** generated and committed, so contract changes show up as a diff. CI fails if it's out of date.
- **Frontend types:** the team generates them with `openapi-typescript`.

## 7. Production operations

### Security

| Area | Design |
|---|---|
| **Database access** | Railway private network only, with no public address on the new Postgres service |
| **API exposure** | Railway's public URL. Every data route requires a key |
| **Secrets** | Railway variables, with each service holding only what it needs. Only the jobs have the RWA.xyz key |
| **Rotation** | A short written procedure for the RWA.xyz key, database passwords and API keys |
| **SQL** | Parameterised queries only |
| **Logs** | `Authorization` headers and keys are redacted. Errors never contain the RWA.xyz key |
| **Errors** | Clients get a generic message and request ID, with no stack traces or SQL |
| **Rate limits** | Starting at 600 requests per minute per key on each replica, and 20 failed authentications per minute per IP. Both are settings, `RATE_LIMIT_MAX` and `FAILED_AUTH_MAX`, each with its own window. The client IP comes from Railway's proxy header, and a valid key is never blocked by IP |
| **Transport** | HTTPS through Railway's proxy, plus Fastify's security headers plugin |

**Left out:** per-request audit logs, a WAF, and encryption beyond Railway's defaults.

### Dependencies

Several npm supply-chain compromises were reported in 2026, some running code at install time and some spreading through stolen maintainer credentials. These rules apply to `backend/`, and the frontend team should follow them too:

| Rule | Why |
|---|---|
| **Smaller tree** | Remove `@anthropic-ai/claude-agent-sdk`, `@aws-sdk/*` and `pdfjs-dist`. Fewer packages means less exposure |
| **Exact versions and a committed lockfile** | Every install gets exactly what was reviewed |
| **`npm ci --ignore-scripts` everywhere** | Install scripts don't run, which blocks the install-time attacks. Never use `npm install` in CI or Docker |
| **7-day minimum package age** | Most malicious versions are found and pulled quickly, so new releases wait. The lockfile is created and changed with `npm install --before=<7 days ago>`, because npm 10 has no minimum-age setting. Critical security fixes can skip this after review |
| **`npm audit` and `npm audit signatures` in CI** | Catch known vulnerabilities and bad registry signatures |
| **Automated update PRs with a 7-day cooldown** | Updates stay regular and reviewable, with no auto-merge |
| **Lockfile diffs get reviewed** | New or changed packages must be visible in the pull request |
| **No secrets during install** | A malicious package has nothing to steal in that CI step |
| **Production image holds production packages only** | Built with `--omit=dev`, on a Node 22 base image pinned by digest |

**Production packages:** `fastify`, `@fastify/swagger`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/compress`, `@fastify/etag`, `pg` and `pino`. With their own dependencies, that's 78 packages, none with install scripts. Sentry and a hosted docs page would have added 54 more.

**Dev packages:** `typescript`, `@biomejs/biome`, `@types/node`, `@types/pg` and `json-schema-to-ts`.

**Checked 2026-11-05:** `npm audit` on `main`'s backend lockfile reports 0 known vulnerabilities, and the lockfile lists no packages with install scripts. The new lockfile gets the same checks when it's created. On that date, 4 of the 13 planned packages had a latest version under 7 days old, including `fastify`, so the `--before` rule matters from the first install.

### Observability

| Piece | Tool | Does |
|---|---|---|
| **Logs** | Fastify's logger, viewed in Railway | One JSON line per request, with request ID, route, status, duration and key name. Errors are logged in full |
| **Job monitor** | Healthchecks.io or similar | Alerts when a job reports a failure, or when its success ping doesn't arrive, even if the cron never started |
| **Uptime check** | Any uptime monitor | Calls `/readyz` every minute |

Alerts go by email to start with. A job that stops, ends `partial` or holds something back reports a failure to the job monitor, with its run summary. API errors don't alert by themselves: they're in the logs with a request ID, and the uptime monitor catches an API that's down.

| Event | Severity |
|---|---|
| API down | Urgent |
| No successful update for about two intervals | Urgent |
| A run stopped by a rejected key, used-up quota or its failure limit | Urgent |
| Disk use above 80% | Urgent |
| A run ended `partial`, or held back a new asset or measure | Normal |
| Large swings and universe changes | Info, in the run summary |

**Left out:** error tracking such as Sentry, Prometheus, Grafana, distributed tracing and on-call rotations.

### Service lifecycle

- **Startup:** check the config, connect to the database, and take traffic once `/readyz` passes.
- **Health:** Railway checks `/readyz` only while a deploy starts, not afterwards. After that, the uptime monitor is what notices an unhealthy API.
- **Shutdown:** on a stop signal, stop accepting connections, finish in-flight requests for up to 20 seconds, close the pool and exit.
- **Crashes:** log the exception, then exit so Railway restarts the replica.

| Timeout | Starting value |
|---|---|
| Database statement, for the API role | 5 seconds |
| Request | 30 seconds |
| Waiting for a pool connection | 2 seconds, then a `503` |
| Migration waiting for the job lock | 10 minutes, then it fails cleanly |

### Database operations

| Role | Used by | Can do |
|---|---|---|
| `rwa_owner` | Migrations and the key script | Change the schema and manage keys |
| `rwa_job` | Jobs | Read and write data tables, with no access to `api_key` |
| `rwa_api` | API | Read data tables and `api_key`, and update only `last_used_at` |

- **Creating roles:** `scripts/setupRoles.ts` creates the three roles and their grants, with passwords from environment variables. It's safe to re-run, and it runs once per environment and in CI. Default privileges cover tables that later migrations add, and dumps are restored as `rwa_owner`.
- **Statement timeout:** set on `rwa_api` only, because jobs and migrations run longer statements.
- **Query timeout:** set in each process's pool, for a connection that died silently, which a server-side timeout can't see. It's 7 seconds on the API, above the 5-second statement timeout, and 5 minutes on the jobs. The connection is then thrown away, so it can't hold a pool slot. Railway checks health only at deploy, so nothing would restart a stuck replica.
- **Connections:** the API uses 5 per replica and the jobs use 3. Local Postgres allows 100, and we'd confirm Railway's limit at setup.
- **Settings:** every timeout, limit, threshold, size, label, path and provider address is an optional variable with a default. `backend/.env.example` lists them, and `src/config.ts` is the only file that reads them.
- **Backups:** Railway's daily (kept 6 days) and weekly (kept 27 days). Our own nightly dump is optional.
- **Test restore:** done at setup, then occasionally. Railway backups restore only into the same project and environment, and wiping a volume deletes them, so risky migrations get a manual off-Railway dump first.
- **Recovery targets:** at most 24 hours of data loss, and about 2 hours to recover.
- **Upkeep:** log queries over 500 ms, turn on `pg_stat_statements`, and stay on Postgres 18 until a deliberate upgrade.
- **Growth:** history adds at most about 10,000 rows a day, very roughly 500 MB a year.

**Left out:** read replicas, PgBouncer, automatic failover and point-in-time recovery.

### Delivery

```
Pull request → CI → merge to production → staging → manual promotion → production
```

- **CI (GitHub Actions):** Biome format and lint, type check, tests with real Postgres, migrations on an empty database, OpenAPI freshness, `npm audit` and signatures, and a Docker build.
- **Environments:** staging and production in the existing Railway project, each with its own database, secrets and API keys. Staging runs jobs less often, to save RWA.xyz quota.
- **Deploy order:** migrations as a pre-deploy step, then the API once `/readyz` passes. Jobs use the new image on their next run, and exit early if the schema is older than they need. A failed migration stops the deploy.
- **Rollback:** redeploy the previous image. Migrations move forward only, and each must work with both old and new code.
- **Branches:** `production` is this service's main branch, with short-lived branches merged by pull request and branch protection once code exists.

**Left out:** canary releases, blue-green deployments and infrastructure as code.

### Tests

| Kind | Covers | How |
|---|---|---|
| **Logic** | `validate.ts`, `universeRules.ts` and measure conversion | Plain inputs and outputs |
| **Providers** | RWA.xyz and Kamino adapters, and each error type | Recorded real responses |
| **Jobs** | Full universe and update runs | Fake provider and real Postgres |
| **Queries and responses** | `db/queries` and `services` | Real Postgres |
| **API** | Auth, validation, `ETag`s and error shapes | Fastify's test client and real Postgres |
| **Database roles** | Each role's permissions | Connecting as each role |

**Job cases that must pass:**
- A failed asset keeps its last good data and rolls back.
- A format error fails only that asset, and the run continues.
- Five failures in a row stop the run.
- A second run with the same data writes nothing.
- A value missing from one load is kept, and it's deleted once it's been missing for 7 days.
- A locked value isn't overwritten.
- A held lock makes a second job exit straight away.
- A job exits if the schema is older than it needs.
- A stale `running` record gets marked as failed.
- A failed or suspiciously short Kamino list changes nothing.
- An asset whose mint leaves either list becomes inactive and keeps its history.
- A new asset's failed first load creates nothing.

**Before production:** the baseline dump restored in staging, live provider calls from staging's jobs, and a short load check that includes the longest history responses.

**Left out:** coverage percentage targets, browser tests and mocked databases.

## 8. Coding standards

The code keeps the style already on `main` and adds tooling to enforce it, because `main` has no lint or format config.

### Tools

| Tool | Setup | Why |
|---|---|---|
| **TypeScript** | `main`'s strict config, plus `noUncheckedIndexedAccess` and `verbatimModuleSyntax` | Catches missing array and map values, and keeps imports explicit |
| **Biome** | One package for formatting and linting, failing in CI | Replaces ESLint and Prettier and their many dependencies |
| **Line width** | 120 | Keeps lines readable |

### Code rules

- **Modules:** ES modules with `.ts` in import paths, and named exports only.
- **TypeScript syntax:** erasable syntax only, so no `enum`, because Node runs the `.ts` files directly.
- **Types:** no `any` and no `as unknown as`. External data starts as `unknown` and gets validated.
- **Style:** `interface` for object shapes, and `const` unless a value must change.
- **Functions over classes:** use classes only for real state, like the RWA.xyz client's pacing.
- **Async:** always `async`/`await`, and never leave a promise unhandled.
- **Size:** keep functions small, and split a file once it does more than one job.

### Naming

| Thing | Style | Example |
|---|---|---|
| Files | camelCase | `updateAsset.ts` |
| Functions and variables | camelCase, starting with a verb for functions | `loadAssetList` |
| Types | PascalCase, no `I` prefix | `FieldValue` |
| Constants | UPPER_SNAKE | `MAX_RETRIES` |
| Database | snake_case | `field_value` |
| API properties | camelCase | `assetClass` |

### Comments

Every source file starts with a short header saying what it's for and any boundary it must respect. Beyond that, comments explain why, never what the code already says.

```ts
/**
 * Writes one asset's data in a single transaction.
 * A failure rolls back that asset only, so it keeps its last good data.
 */
```

```ts
// Good: explains a reason the code can't show
// The token endpoint otherwise groups by protocol, so the grouping is explicit.

// Bad: repeats the code
// Loop over the assets.
```

- **Exported functions:** a one-line doc comment only when the name and types don't already make it clear.
- **SQL:** migrations get a comment on anything non-obvious.
- **No leftovers:** no commented-out code, and no `TODO` without a linked issue.

### Errors, logs, SQL and config

- **Errors:** throw typed errors, handle them at the boundaries, and never swallow one silently.
- **Logs:** use the shared logger, never `console.log`, and never log secrets.
- **SQL:** plain parameterised SQL in `db/queries/`, with no ORM.
- **Config:** only `config.ts` reads `process.env`.

### Tests and commits

- **Tests:** Node's built-in test runner, named by behaviour, such as `"a failed asset keeps its last good data"`.
- **Commits:** short imperative subject, such as "Add update job retries", with a body only when the reason isn't obvious.

## 9. Cutover

The new service replaces the old one in the same Railway project, using a new Postgres service. The old database stays untouched until the new service is confirmed.

1. **Build and test** on the `production` branch. When the first code lands, copy `rwa.dump` to `.local/backups/` and remove it from the branch's git history before any push.
2. **Save main's data:** put the safe copy from section 4 in the private bucket.
3. **Run the one-off conversion** from section 4 to create the baseline dump.
4. **Create staging** in the existing project, with its own Postgres service restored from the baseline dump, and run the jobs there.
5. **Prove staging:** a load check, a test restore and the frontend team trying the API.
6. **Create the production Postgres service,** restored from the baseline dump.
7. **Deploy:** the new API and jobs replace the old service, and the first update job brings the data up to date. The old frontend and login stop working here, until the frontend team deploys theirs.
8. **Confirm, then clean up:** check data and alerts, and turn on backups for the new database. Take a final off-Railway dump of the old database, then remove it and its unused variables.

**Rollback:** until the old database is removed, restore the old service's variables, including its database URL, and redeploy the old image. The cutover doesn't change that database.

## 10. Build order

1. Set up the project, safe dependency rules, config, the pool and CI.
2. Write migrations `001` and `002`, then run and check the one-off conversion.
3. Build the providers, with recorded responses.
4. Build the jobs, with failure tests.
5. Build the read logic and queries.
6. Build the API: schemas, routes, auth, `ETag`s, health checks and OpenAPI.
7. Add observability and database roles.
8. Set up staging and run the load check.
9. Cut over.

## 11. Still to confirm

**Checks I'll do during the build:**
- What time RWA.xyz's daily refresh happens, which sets the job schedule.
- Whether same-day history points are incomplete. In the last load, 250 series ended on the run's own day and 3,115 on the day before. If confirmed, history stops at the last complete UTC day.
- The units of `yield_to_maturity`. Values of 0.037 to 0.0535 are labelled percent, and are probably fractions.
- ~~Whether RWA.xyz's history endpoint can filter by date.~~ It can, but the job still fetches the full series and writes only changes, because RWA.xyz restates old days: one refresh changed 76,000 rows on 50 assets, back to June 2025.
- Railway's connection limit, private networking and deploy settings.
- That Railway's Postgres version can restore a Postgres 18 dump.
- That the chosen job monitor includes the run summary in its failure emails.

**Needed from you at setup:**
- The alert email address.
- Job monitor and uptime monitor accounts.
- The RWA.xyz API key from your subscription, and its usage limits if you know them.

## Sources

- [Railway backups](https://docs.railway.com/reference/backups), for schedules, retention and limits.
- [Railway healthchecks](https://docs.railway.com/reference/healthchecks), for checks that only run while a deploy starts.
- [RWA.xyz API overview](https://docs.rwa.xyz/api/overview), for rate-limit headers.
- [Kamino documentation index](https://kamino.com/docs/llms.txt), for public access without a key.
- 2026 npm incidents, from search summaries only and not independently verified: [TechRadar](https://www.techradar.com/pro/security/mini-shai-halud-hackers-publish-over-600-compromised-npm-packages-developers-warned-to-be-on-their-guard), [Rescana](https://www.rescana.com/post/active-exploitation-alert-jscrambler-npm-packages-compromised-in-coordinated-supply-chain-attack-july-2026), [Gigazine](https://www.gigazine.net/gsc_news/en/20260805-npm-supply-chain-attack).
