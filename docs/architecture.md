# Architecture

The high-level structure of the project. `project.md` describes what we're building; this document describes how it's layered. Detailed design for each layer hasn't been done yet.

## Layers

1. **DataEngine:** gets the data, through APIs, scrapers or the AI researcher.
2. **Data Model:** records what each source said.
3. **AssetModel:** decides what we believe about each asset.
4. **AssetModelViews:** named sets of asset data, such as a list of assets or one asset's details, with no display logic.
5. **UI views:** display those views on screen.
6. **Report model:** templates and saved reports, built from the same AssetModelViews.
7. **Chat agent:** the chat where users create templates, generate reports and ask questions, using the same views and reports.

Layers 5, 6 and 7 all build on layer 4, so the UI, reports and chat show the same data in the same way. The API that connects the backend to the frontend is a thin layer between 4 and 5: `GET /api/views/<name>` serves any view registered in `backend/src/views/index.ts`.

The first two views are `asset_list` and `asset_detail`. `asset_detail` is built from the field catalog rather than per category: single-value fields become a `fields` block and token, network or repeating fields become a `records` block. A catalog change therefore reaches the UI with no view or frontend change.

## Decisions so far

- **AI researcher:** it's one type of provider inside the DataEngine, alongside direct APIs and scrapers. All providers produce the same kind of output.
- **AI-found values:** no person approves them at first. They must pass a check that the cited text really appears in the source, and they're labelled as AI-extracted. A wrong value can be withdrawn.
- **Updates:** the first version acquires data on demand. Scheduled updates come later.
- **LLM account:** local development uses the developer's current Claude account, with file and shell tools turned off. Deployment will use a separate account.
- **Facts:** `fact` is a database view over claims, so a Fact can't disagree with them, and withdrawing a claim takes effect immediately.
- **Chat answers:** they use stored documents and Facts only, with a citation for each statement.

## Running locally

From the repo root, run `docker compose up -d`. Then, from `backend/`:

1. `npm run db:setup`: applies migrations and seeds the field catalog and assets.
2. `npm run documents:load`: fetches official documents. `--refresh` fetches them again.
3. `npm run rwa:load`: loads RWA.xyz claims, using `RWA_XYZ_API_KEY` from the repo-root `.env`.
4. `npm run documents:index`: extracts searchable text.

Reports go to `.local/reports/`, and `npm run coverage` writes the coverage table. `npm test` runs the tests against throwaway databases. `npm run agent:check` runs the chat checks against the real model, which uses your model usage.

Set `AGENT_BACKEND=claude` in `backend/.env` to answer chat from documents. That uses your own Claude Code login, for your own use only. Set `ANTHROPIC_API_KEY` before anyone else uses the chat or it's deployed.

## Boundaries

- **Data Model and AssetModel:** the Data Model answers "who said what?", and sources can disagree there. The AssetModel answers "what do we believe about this asset?" and gives one answer that can be traced back to its source.
- **AssetModelViews and UI views:** AssetModelViews define what data to show, and UI views define how it looks.

## Still open

- Detailed design of each layer
- Whether an asset is one product with a separate token for each chain deployment
- The token universe, data sources and fields, and report templates, as listed in `project.md`
