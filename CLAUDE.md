# CLAUDE.md

Public, read-only Fastify API over Postgres, plus two scheduled jobs that fill it from RWA.xyz and Kamino. All code is in `backend/`. Node runs the `.ts` files directly; there's no build step. The design is in [docs/production_spec.md](docs/production_spec.md), and running it on Railway is in [docs/operations.md](docs/operations.md).

## Commands

Run from `backend/`. Tests need the local Postgres: `docker compose up -d` from the repository root.

```bash
npm ci --ignore-scripts      # never plain `npm install`
npm run typecheck
npm run format:check         # Prettier; `npm run format` fixes it. Run after every change
npm run lint:migrations      # squawk: unsafe SQL in db/migrations/
npm test                     # against real Postgres
node --env-file-if-exists=.env --import ./test/helpers/blockNetwork.ts --test test/api/assets.test.ts   # one file
npm run openapi              # regenerate backend/openapi.json after any schema change
npm run openapi:check
```

There's no CI. Run typecheck, `format:check`, `lint:migrations`, tests and `openapi:check` before pushing.

## Layers

`api → services → db` is the read path and `jobs → providers → db` is the write path. `test/layers.test.ts` enforces it: the API and services never import jobs or providers, jobs never import services or the API, providers only fetch and convert, and `db/` imports nothing above it. A new folder under `src/` needs a rule there before the test passes. Only `src/db/queries/` contains SQL.

## Adding or changing an endpoint

- Schema in `src/api/schemas/` as JSON Schema with `as const`. Use `additionalProperties: false` on every input, and derive types with `FromSchema`.
- Route in `src/api/routes/`, HTTP only: a service builds the response, and a `null` from it means a 404. Add `config: { cache: true }` for data routes.
- Errors are `ApiError` with a code from `src/api/schemas/shared.ts`. Never send internals to the client.
- Declare the route in its test file with `coversRoutes(["GET /path/{param}"])`. `test/api/routeCoverage.test.ts` fails for any route in the contract without one.
- Run `npm run openapi` and commit `openapi.json`.

Pagination on `/tokenized_assets` is `limit`/`offset`, bounded by `MAX_PAGE_SIZE` and `MAX_PAGE_OFFSET`.

## Migrations

- `backend/db/migrations/NNN_description.sql`, applied in filename order by the Railway pre-deploy step.
- **Never edit a migration that has run anywhere.** The runner records filenames only, so an edit is silently skipped. Add a new file instead.
- Forward only, and each migration must work with both the old and the new code.
- `npm run lint:migrations` must pass. When a flagged statement is intended, mark it in the file with `-- squawk-ignore <rule>` above it, as `005_drop_api_key.sql` does. Excluded rules and why are in `backend/.squawk.toml`.
- A new table the API serves needs the `bump_data_version` trigger, or the response cache serves stale data. `test/db/migrations.test.ts` fails until it has one or is listed as unserved.
- New tables are granted by default privileges. Exceptions belong in `scripts/setupRoles.ts`.

## Config

Only `src/config.ts` reads `process.env`. A new setting goes in `loadSettings()` with a default, and in `backend/.env.example` with the same value. `test/config.test.ts` checks that they match.

## Code style

The full rules are in section 8 of the spec. In short:
- ES modules with `.ts` import paths, and named exports only.
- Erasable TypeScript only, so no `enum`. No `any`.
- External data starts as `unknown` and gets validated.
- Every file starts with a short header comment saying what it's for. Other comments explain why, never what.
- Use the shared logger, never `console`.
- Tests use `node:test` and are named by behaviour, such as `"a failed asset keeps its last good data"`.

## Dependencies

Exact versions, and install scripts never run. New releases wait 7 days: `npm install --before="$(date -u -d '7 days ago' +%F)" <package>`.
