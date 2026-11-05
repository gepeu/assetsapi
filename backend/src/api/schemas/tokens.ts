/** `GET /assets/{slug}/tokens`. */
import type { FromSchema } from "json-schema-to-ts";
import {
  dayOrNull,
  errorResponses,
  fieldValueSchema,
  networkRefSchema,
  nullableNumber,
  SLUG_PATTERN,
  slugParams,
} from "./shared.ts";

const tokensQuery = {
  type: "object",
  additionalProperties: false,
  properties: { network: { type: "string", pattern: SLUG_PATTERN } },
} as const;
export type TokensQuery = FromSchema<typeof tokensQuery>;

const tokensResponse = {
  type: "object",
  additionalProperties: false,
  required: ["data"],
  properties: {
    data: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["network", "address", "issuanceType", "fields", "figures", "asOf"],
        properties: {
          network: networkRefSchema,
          address: { type: "string" },
          issuanceType: { type: "string", enum: ["native", "bridged", "wrapper", "unknown"] },
          fields: { type: "array", items: fieldValueSchema },
          figures: {
            type: "object",
            additionalProperties: false,
            required: [
              "total_asset_value_dollar",
              "market_value_dollar",
              "total_supply_token",
              "holding_addresses_count",
            ],
            properties: {
              total_asset_value_dollar: nullableNumber,
              market_value_dollar: nullableNumber,
              total_supply_token: nullableNumber,
              holding_addresses_count: nullableNumber,
            },
          },
          asOf: dayOrNull,
        },
      },
    },
  },
} as const;
export type TokensResponse = FromSchema<typeof tokensResponse>;

export const tokensRoute = {
  summary: "One row per chain: address, issuance type, token fields and figures",
  params: slugParams,
  querystring: tokensQuery,
  response: { 200: tokensResponse, ...errorResponses },
} as const;
