# RWA data service

A public, read-only API over a Postgres database that scheduled jobs keep current from RWA.xyz and
Kamino. [docs/production_spec.md](docs/production_spec.md) is the design, and
[docs/operations.md](docs/operations.md) covers running it.

Needs Node 22.18 or newer and Docker.

## Run it locally

```sh
docker compose up -d                 # local Postgres on 127.0.0.1:54331

cd backend
npm ci --ignore-scripts              # never plain `npm install`; see "Changing dependencies"
cp .env.example .env                 # add RWA_XYZ_API_KEY to run the jobs

docker compose exec postgres createdb -U rwa rwa_service
npm run setup-roles                  # database roles and grants
npm run migrate                      # creates the schema and catalog
npm run setup-roles                  # takes back what default privileges granted on new tables
```

The database now has the schema and no assets. Either fill it from the provider APIs, or restore the
baseline dump as described in [docs/operations.md](docs/operations.md).

```sh
DATABASE_URL=postgres://rwa_job:local_job@127.0.0.1:54331/rwa_service npm run update-universe
DATABASE_URL=postgres://rwa_job:local_job@127.0.0.1:54331/rwa_service npm run update-data
```

Then start the API and try it. It's public, so no key is needed:

```sh
npm run api

curl http://127.0.0.1:3000/assets
```

The API documents itself at `/docs` (for example http://127.0.0.1:3000/docs), a Swagger page where you can read every parameter and try calls. The same contract is committed as [backend/openapi.json](backend/openapi.json).

## Settings

Every timeout, limit, threshold, size, label, path and provider address is an optional environment variable. They're
listed with their defaults in `backend/.env.example`, and `backend/src/config.ts` is the only file
that reads them. A value that doesn't parse stops the process when it starts.

## Commands

| Command | Does |
|---|---|
| `npm run api` | Serves the API |
| `npm run update-universe` | One universe run, then exits |
| `npm run update-data` | One data run, then exits |
| `npm run migrate` | Applies migrations, then exits |
| `npm run setup-roles` | Creates database roles and grants. Safe to re-run |
| `npm run openapi` | Regenerates `openapi.json` from the schemas |
| `npm test` | Runs the tests, against real Postgres |
| `npm run format:check` / `npm run format` | Checks, or fixes, formatting with Prettier |
| `npm run lint:migrations` | Checks migrations for statements unsafe on a live database (squawk) |
| `npm run typecheck` | Type checks |

Tests create and drop their own `rwa_test_*` databases and set up the `rwa_owner`, `rwa_job` and
`rwa_api` roles with the passwords in `.env.example`, using `TEST_DATABASE_URL`.

## Changing dependencies

Install scripts never run, and new releases wait 7 days. npm 10 has no minimum-age setting, so a
lockfile change uses `--before`:

```sh
npm install --before="$(date -u -d '7 days ago' +%F)" <package>
```

Critical security fixes can skip the wait after review. Lockfile diffs get reviewed.
