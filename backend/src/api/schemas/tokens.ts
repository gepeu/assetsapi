/** The `tokens` section of `GET /tokenized_assets/{slug}`. */
import type { FromSchema } from "json-schema-to-ts";
import { dayOrNull, fieldValueSchema, metricsSchema, networkRefSchema } from "./shared.ts";

export const tokensSection = {
  type: "array",
  description: "One row per token. A network can have several",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["network", "address", "issuanceType", "fields", "metrics", "asOf"],
    properties: {
      network: networkRefSchema,
      address: { type: "string" },
      issuanceType: { type: "string", enum: ["native", "bridged", "wrapper", "unknown"] },
      fields: { type: "array", items: fieldValueSchema },
      metrics: {
        ...metricsSchema,
        description:
          "`total_asset_value_dollar`, `market_value_dollar`, `total_supply_token` and `holding_addresses_count` for this token",
      },
      asOf: dayOrNull,
    },
  },
} as const;
export type TokensSection = FromSchema<typeof tokensSection>;
