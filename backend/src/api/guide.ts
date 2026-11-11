/** The introduction at the top of the OpenAPI contract, in Markdown. */
export const API_GUIDE = `
Public, read-only API over tokenized asset data, updated daily. No key is needed. Requests are rate limited per IP address.

## Three endpoints

| Endpoint | Returns |
|---|---|
| \`/assets\` | All active assets, one row each |
| \`/assets/catalog\` | Everything you can request: metrics, groups, categories, fields and filter values |
| \`/assets/{slug}\` | One asset, plus any sections you ask for |

## Ask only for what you need

With no parameters, \`/assets/{slug}\` returns the core: identity, issuer, organizations, networks and five key metrics. Add sections with \`include\`, and only those are queried.

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
| Stablecoins by size | \`/assets?assetType=stablecoin&sort=-total_asset_value_dollar\` |
| Every asset compared on one metric | \`/assets?metrics=market_value_dollar&sort=-market_value_dollar&limit=200\` |
| The basics for one asset | \`/assets/usdt\` |
| Everything on an asset page | \`/assets/usdt?include=fields,tokens\` |
| Only issuer and legal facts that have a value | \`/assets/usdt?include=fields&categories=issuer,legal&empty=false\` |
| The financials tab | \`/assets/usdt?include=financials,series,valueByNetwork,terms\` |
| Value and yield numbers only | \`/assets/usdt?include=financials&groups=value,yield\` |
| One metric with its past values | \`/assets/usdt?include=financials&financialMetrics=price_dollar\` |
| Price history only | \`/assets/usdt?history=price_dollar&range=1y\` |
| Two series on one chart | \`/assets/usdt?history=price_dollar,net_asset_value_dollar\` |

## Rules

- **Lists** are comma-separated, with no spaces.
- **Names:** \`metrics\` is always a plain name-to-number map, and \`financials\` is always the full array with labels and past values.
- **Errors:** an unknown parameter or name is a 400, and so is a filter for a section you didn't ask for. An unknown asset is a 404. A valid metric with no data comes back as \`null\` or with empty points.
- **Holder shares:** \`top_*_holder_concentration\` always reads the Solana token, because the asset-level value adds up each token's percentage. A share above 100% can't be true, so it's \`null\`.
- **Caching:** responses carry an \`ETag\`. Send it back in \`If-None-Match\` to get a 304 when nothing has changed.
`.trim();
