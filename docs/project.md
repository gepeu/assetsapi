# Project description

An internal demo/MVP that collects data on a defined set of tokens, shows it in a UI, and lets users generate and save standard reports through an AI agent chat.

Nothing is implemented yet, and the architecture hasn't been designed.

## Stack

TypeScript, Node and Postgres, with both backend and frontend in TypeScript.

## Input

`token_universe.md` defines the tokens we track. It hasn't been written yet.

## Components

1. **Data collection:** a daily job gets data for the token universe from the web by scraping, API or any other method. Each source's details stay contained within its own collector, so sources can be added or changed without affecting the rest of the app.
2. **Internal data representation:** collected data is converted into our own source-independent format and stored in Postgres. Everything after this step uses only this format.
3. **Internal view representation:** views over that data, such as a token table or a token detail view, are defined separately from how they're displayed.
4. **API to frontend:** the backend serves those views to the frontend. The frontend only talks to the API.
5. **Reports in chat:** in the agent chat, a user can create a report template or select an existing one. The agent then generates the report from our internal data and saves it to the database.

## What gets saved

- Collected data
- Report templates
- Generated reports

Chat conversations aren't saved in this first pass.

## Out of scope for now

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
