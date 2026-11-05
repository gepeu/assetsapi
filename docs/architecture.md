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

The views are `asset_list`, `asset_detail`, `asset_financials` and `asset_financial_history`. `asset_detail` is built from the field catalog rather than per category: single-value fields become a `fields` block and token, network or repeating fields become a `records` block. A catalog change therefore reaches the UI with no view or frontend change.

## Decisions so far

- **AI researcher:** it's one type of provider inside the DataEngine, alongside direct APIs and scrapers. All providers produce the same kind of output.
- **AI-found values:** no person approves them at first. They must pass a check that the cited text really appears in the source, and they're labelled as AI-extracted. A wrong value can be withdrawn.
- **Updates:** the first version acquires data on demand. Scheduled updates come later.
- **LLM account:** local development uses the developer's current Claude account, with file and shell tools turned off. Deployment will use a separate account.
- **Facts:** `fact` is a database view over claims, so a Fact can't disagree with them, and withdrawing a claim takes effect immediately.
- **Financial data:** prices, NAV, yields, supply, volumes, holders and fund terms sit beside claims, not in them, so they don't affect the field catalog or coverage. `financial_snapshot` holds every financial field on each asset and token record per load, and `financial_latest` shows each asset's most recent load. `financial_timeseries` holds daily history for each asset and its Solana tokens; other chains' token history isn't loaded. The `asset_financials` and `asset_financial_history` views serve these tables to the asset page; chat answers don't read them yet. Most of a view's figures cover all networks and most of its history covers only the Solana token, so each chart says which it is. The source adds up each token's holder share into the asset's, so holder shares are read from the Solana token, and any share above 100% is stored but not served.
- **Chat answers:** they use stored documents and Facts only, with a citation for each statement. `POST /api/agent/messages` takes `{ messages, context }` and returns `{ question, answer, citations }`. `answer` is markdown with `[n]` markers, or `null` when our sources don't answer the question. The model only writes the answer's text; the backend builds the JSON around it. Each response from the document agent is saved in `agent_response`; the mock agent saves nothing, so it still runs without a database.

## Running locally

From the repo root, run `docker compose up -d`. Then, from `backend/`:

1. `npm run db:setup`: applies migrations and seeds the field catalog and assets.
2. `npm run documents:load`: fetches official documents. `--refresh` fetches them again.
3. `npm run rwa:load`: loads RWA.xyz claims, using `RWA_XYZ_API_KEY` from the repo-root `.env`.
4. `npm run documents:index`: extracts searchable text.
5. `npm run rwa:financials`: loads financial data for assets that `rwa:load` has matched.

Reports go to `.local/reports/`, and `npm run coverage` writes the coverage table. `npm test` runs the tests against throwaway databases. `npm run agent:check` runs the chat checks against the real model, which uses your model usage.

The app's chat is currently mocked in `frontend/src/api/agent.ts`, so it doesn't call the backend. To use the real agent, point `sendMessage` there at `requestReply`.

Set `AGENT_BACKEND=claude` in `backend/.env` to answer chat from documents. That uses your own Claude Code login, for your own use only. Set `ANTHROPIC_API_KEY` before anyone else uses the chat or it's deployed.

## Deployment

The root `Dockerfile` builds one service: the backend serves both the API and the built frontend, so the session cookie stays same-origin. `NODE_ENV=production` makes it listen on all interfaces, mark the cookie `Secure`, and take the client address from the proxy's `X-Real-IP` header.

Run a single replica. Sessions and failed sign-in counts are held in memory, so a restart signs everyone out and clears the counts. After 100 failed sign-ins in 15 minutes, new sign-ins are blocked for everyone until the window ends, whichever addresses they came from.

## Boundaries

- **Data Model and AssetModel:** the Data Model answers "who said what?", and sources can disagree there. The AssetModel answers "what do we believe about this asset?" and gives one answer that can be traced back to its source.
- **AssetModelViews and UI views:** AssetModelViews define what data to show, and UI views define how it looks.

## Still open

- Detailed design of each layer
- Whether an asset is one product with a separate token for each chain deployment
- The token universe, data sources and fields, and report templates, as listed in `project.md`
