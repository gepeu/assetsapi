# Project description

An internal demo/MVP that collects data on a defined set of assets, shows it in a UI, and lets users generate and save standard reports through an AI agent chat.

Nothing is implemented yet. The high-level structure is in `architecture.md`, and the detailed design of each layer hasn't been done.

## Stack

TypeScript, Node and Postgres, with both backend and frontend in TypeScript.

## Input

`token_universe.md` defines the assets we track. It hasn't been written yet.

## Layers

1. **DataEngine:** gets data for the assets from the web on demand, through APIs, scrapers or the AI researcher. Each source's details stay contained within its own provider, so sources can be added or changed without affecting the rest of the app.
2. **Data Model:** records what each source said, in our own source-independent format, in Postgres.
3. **AssetModel:** decides what we believe about each asset, based on the Data Model.
4. **AssetModelViews:** named sets of asset data, such as a list of assets or one asset's details, defined separately from how they're displayed. The backend serves them to the frontend through an API, and the frontend only talks to that API.
5. **UI views:** display those views on screen.
6. **Report model:** templates and saved reports, built from the same AssetModelViews.
7. **Chat agent:** in the chat, a user can create a report template or select an existing one. The agent then generates the report from our internal data and saves it to the database. Users can also ask questions about the data.

## What gets saved

- Collected data
- Report templates
- Generated reports

Chat conversations aren't saved in this first pass.

## Out of scope for now

- Scheduled data updates
- Individual user accounts
- Alerts
- Scheduled reports
- PDF export

## Still to define

- The token universe
- Data sources, fields and collection methods
- The report templates

## Definitions

These are agreed for now and may change.

- **View:** a named, structured definition of what data to show, which the UI renders. The agent can also use views for chat answers and reports, so both show the same data in the same way.
- **Template:** a saved, reusable definition of a report's structure.
- **Report:** one generated instance of a template, which records the template it came from.
- **Creating templates in chat:** any internal user can create a template by describing it to the agent. It's immediately available to everyone, with no approval step.
