/** Writes docs/rwa_xyz_mapping.md, comparing the mapping with a real asset and token response. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FIELDS } from "../src/db/catalog/fields.ts";
import { requireEnv } from "../src/env.ts";
import { RwaXyzClient } from "../src/rwaXyz/client.ts";
import { ASSET_MAPPINGS, ISSUER_MAPPINGS, NETWORK_MAPPINGS, TOKEN_MAPPINGS } from "../src/rwaXyz/mapping.ts";

const OUTPUT = join(import.meta.dirname, "../../docs/rwa_xyz_mapping.md");
const SAMPLE_ASSET_ID = 15123;

/** For sorting this document only. The loader doesn't use it: unmapped fields are simply ignored. */
const FINANCIAL =
  /price|net_asset|^nav|apy|yield|return|_fee|fee_|fees|supply|market_|_dollar|volume|concentration|holding_addresses|active_addresses|transactions|transfer_count|bridge|mints|burns|capacity|idle|cash_drag|principal|loan|interest|repo|collateral|issued|asset_value|minimum|m2_|sofr|overnight|performance|inflow|outflow|funded|drawndown|recovered|written_off|maturity|rebase|accounting|fair_value|hypothetical|rating|distribut|income|investable|outstanding|total_contracts|_token$|denomination/i;

const client = new RwaXyzClient({ apiKey: requireEnv("RWA_XYZ_API_KEY") });
const asset = await client.getAsset(SAMPLE_ASSET_ID);
const [token] = await client.listTokensForAsset(SAMPLE_ASSET_ID);
if (!asset || !token) throw new Error("Sample asset not found");

const table = (mappings: typeof ASSET_MAPPINGS) => [
  "| Catalog field | RWA.xyz field |",
  "| --- | --- |",
  ...mappings.map((m) => `| \`${m.field}\` | \`${m.from}\` |`),
];

const used = (mappings: typeof ASSET_MAPPINGS) =>
  new Set(mappings.flatMap((m) => m.from.split(", ").map((name) => name.split(/[.[]/)[0])));

function unmapped(record: Record<string, unknown>, mappings: typeof ASSET_MAPPINGS) {
  const mapped = used(mappings);
  const rest = Object.keys(record).filter((key) => !mapped.has(key)).sort();
  return {
    financial: rest.filter((key) => FINANCIAL.test(key)),
    other: rest.filter((key) => !FINANCIAL.test(key)),
  };
}

const allMapped = new Set(
  [...ASSET_MAPPINGS, ...ISSUER_MAPPINGS, ...TOKEN_MAPPINGS, ...NETWORK_MAPPINGS].map((m) => m.field),
);
const catalogGaps = FIELDS.filter((f) => !allMapped.has(f.key) && f.key !== "provider.platform");
const assetRest = unmapped(asset, ASSET_MAPPINGS);
const tokenRest = unmapped(token, TOKEN_MAPPINGS);
const code = (names: string[]) => names.map((n) => `\`${n}\``).join(", ") || "None";

const lines = [
  "# RWA.xyz field mapping",
  "",
  "The loader only reads the fields listed here (`backend/src/rwaXyz/mapping.ts`); every other API field is ignored. Names were checked against a real response on 2026-11-03.",
  "",
  "API: `https://api.rwa.xyz/v4`, with a bearer token. Used: `GET /assets/{id}`, `GET /assets?ticker=`, `GET /tokens?asset_id=`, `GET /tokens?address=`, `GET /networks/{id}`.",
  "",
  "**Rules.** A null from the API adds no claim, so the field stays never checked. Organization values are read from `name`, `slug` and `legal_name` only.",
  "",
  "## Differences from the published schema",
  "",
  "- Assets return `tokenization_types` and `transferability_types` (lists), not the singular fields the schema shows; tokens return the singular ones.",
  "- Primary market data is read from the `primary_markets` array, using `kyc_is_required`, `is_subscription_allowed`, `is_redemption_allowed`, `allowed_investor_types` and `base_asset_ticker`, not the schema's flattened `primary_market__*` names.",
  "- Assets also return undocumented `status`, `asset_status` and `investment_status`.",
  "",
  "## Asset fields",
  "",
  ...table(ASSET_MAPPINGS),
  "",
  "`provider.platform` is set from the tokens' `platform`, and only when all of an asset's tokens share one.",
  "",
  "## Issuer fields (claims about the organization)",
  "",
  ...table(ISSUER_MAPPINGS),
  "",
  "## Token fields (one set per chain)",
  "",
  ...table(TOKEN_MAPPINGS),
  "",
  "## Network fields",
  "",
  ...table(NETWORK_MAPPINGS),
  "",
  `## Catalog fields with no RWA.xyz source (${catalogGaps.length})`,
  "",
  "Official documents, the chain and the AI researcher must cover these.",
  "",
  ...[...new Set(catalogGaps.map((f) => f.category))].map(
    (category) => `- **${category}:** ${code(catalogGaps.filter((f) => f.category === category).map((f) => f.key))}`,
  ),
  "",
  "## RWA.xyz fields that stay unmapped",
  "",
  `The sample asset has ${Object.keys(asset).length} fields and the sample token ${Object.keys(token).length}.`,
  "",
  `**Asset, outside the scope rule (${assetRest.financial.length}):** ${code(assetRest.financial)}`,
  "",
  `**Asset, other (${assetRest.other.length}):** ${code(assetRest.other)}`,
  "",
  `**Token, outside the scope rule (${tokenRest.financial.length}):** ${code(tokenRest.financial)}`,
  "",
  `**Token, other (${tokenRest.other.length}):** ${code(tokenRest.other)}`,
  "",
];
await writeFile(OUTPUT, lines.join("\n"));
console.log(`Wrote ${OUTPUT}: ${catalogGaps.length} catalog fields with no source`);
