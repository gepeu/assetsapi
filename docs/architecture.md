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

Layers 5, 6 and 7 all build on layer 4, so the UI, reports and chat show the same data in the same way. The API that connects the backend to the frontend is a thin layer between 4 and 5.

## Decisions so far

- **AI researcher:** it's one type of provider inside the DataEngine, alongside direct APIs and scrapers. All providers produce the same kind of output.
- **AI-found values:** no person approves them at first. They must pass a check that the cited text really appears in the source, and they're labelled as AI-extracted. A wrong value can be withdrawn.
- **Updates:** the first version acquires data on demand. Scheduled updates come later.
- **LLM account:** local development uses the developer's current Claude account, with file and shell tools turned off. Deployment will use a separate account.

## Boundaries

- **Data Model and AssetModel:** the Data Model answers "who said what?", and sources can disagree there. The AssetModel answers "what do we believe about this asset?" and gives one answer that can be traced back to its source.
- **AssetModelViews and UI views:** AssetModelViews define what data to show, and UI views define how it looks.

## Still open

- Detailed design of each layer
- Whether an asset is one product with a separate token for each chain deployment
- The token universe, data sources and fields, and report templates, as listed in `project.md`
