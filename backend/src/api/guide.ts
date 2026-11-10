/** The introduction at the top of the OpenAPI contract, in Markdown. */
export const API_GUIDE = `
Private, read-only API over tokenized asset data, updated daily. Data routes require an API key, sent as \`Authorization: Bearer <key>\`.

## Three endpoints

| Endpoint | Returns |
|---|---|
| \`/tokenized_assets\` | All active assets, one row each |
| \`/tokenized_assets/catalog\` | Everything you can request: metrics, groups, categories, fields and filter values |
| \`/tokenized_assets/{slug}\` | One asset, plus any sections you ask for |

## Ask only for what you need

With no parameters, \`/tokenized_assets/{slug}\` returns the core: identity, issuer, organizations, networks and five key metrics. Add sections with \`include\`, and only those are queried.

| Section | Contents | Narrow with |
|---|---|---|
| \`financials\` | Each metric's value, label, group, unit, scope, date and past values | \`groups\`, \`financialMetrics\` |
| \`series\` | Which history series this asset has | |
| \`valueByNetwork\` | Value and share per network | |
| \`terms\` | Fund terms and fees | |
| \`fields\` | Descriptive values by category, with coverage | \`categories\`, \`empty\` |
| \`tokens\` | One row per token | \`network\` |

Daily points are requested by name: \`history\` takes metric names, and \`range\` sets how far back they go, 3 months by default.

## Examples

| You want | Call |
|---|---|
| Stablecoins by size | \`/tokenized_assets?assetType=stablecoin&sort=-total_asset_value_dollar\` |
| Every asset compared on one metric | \`/tokenized_assets?metrics=market_value_dollar&sort=-market_value_dollar&limit=200\` |
| The basics for one asset | \`/tokenized_assets/usdt\` |
| Everything on an asset page | \`/tokenized_assets/usdt?include=fields,tokens\` |
| Only issuer and legal facts that have a value | \`/tokenized_assets/usdt?include=fields&categories=issuer,legal&empty=false\` |
| The financials tab | \`/tokenized_assets/usdt?include=financials,series,valueByNetwork,terms\` |
| Value and yield numbers only | \`/tokenized_assets/usdt?include=financials&groups=value,yield\` |
| One metric with its past values | \`/tokenized_assets/usdt?include=financials&financialMetrics=price_dollar\` |
| Price history only | \`/tokenized_assets/usdt?history=price_dollar&range=1y\` |
| Two series on one chart | \`/tokenized_assets/usdt?history=price_dollar,net_asset_value_dollar\` |

## Rules

- **Lists** are comma-separated, with no spaces.
- **Names:** \`metrics\` is always a plain name-to-number map, and \`financials\` is always the full array with labels and past values.
- **Errors:** an unknown parameter or name is a 400, and so is a filter for a section you didn't ask for. An unknown asset is a 404. A valid metric with no data comes back as \`null\` or with empty points.
- **Holder shares:** \`top_*_holder_concentration\` always reads the Solana token, because the asset-level value adds up each token's percentage. A share above 100% can't be true, so it's \`null\`.
- **Caching:** responses carry an \`ETag\`. Send it back in \`If-None-Match\` to get a 304 when nothing has changed.
`.trim();
