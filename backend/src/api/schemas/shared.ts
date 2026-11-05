/**
 * Pieces shared across the endpoint schemas. These JSON Schemas are the source of truth for the API
 * contract: Fastify validates and serialises with them, and TypeScript types are derived from them.
 */
import type { FromSchema } from "json-schema-to-ts";

export const SLUG_PATTERN = "^[a-z0-9-]{1,64}$";
const DAY_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";

export const ASSET_TYPES = [
  "tokenized_equity",
  "tokenized_fund",
  "tokenized_commodity",
  "wrapped_crypto",
  "native_crypto",
  "defi_yield",
  "stablecoin",
] as const;

export const nullableNumber = { type: ["number", "null"] } as const;
export const nullableString = { type: ["string", "null"] } as const;
export const dayOrNull = { type: ["string", "null"], pattern: DAY_PATTERN } as const;
export const day = { type: "string", pattern: DAY_PATTERN } as const;

export const scopeSchema = { type: "string", enum: ["asset", "solana"] } as const;

export const slugParams = {
  type: "object",
  additionalProperties: false,
  required: ["slug"],
  properties: { slug: { type: "string", pattern: SLUG_PATTERN } },
} as const;
export type SlugParams = FromSchema<typeof slugParams>;

export const figuresSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "price_dollar",
    "net_asset_value_dollar",
    "total_asset_value_dollar",
    "apy_30_day",
    "holding_addresses_count",
  ],
  properties: {
    price_dollar: nullableNumber,
    net_asset_value_dollar: nullableNumber,
    total_asset_value_dollar: nullableNumber,
    apy_30_day: nullableNumber,
    holding_addresses_count: nullableNumber,
  },
} as const;
export type Figures = FromSchema<typeof figuresSchema>;

export const fieldValueSchema = {
  type: "object",
  additionalProperties: false,
  required: ["key", "label", "valueType", "value", "asOf"],
  properties: {
    key: { type: "string" },
    label: { type: "string" },
    valueType: { type: "string" },
    value: {
      anyOf: [
        { type: "string" },
        { type: "number" },
        { type: "boolean" },
        { type: "array", items: { type: "string" } },
        { type: "null" },
      ],
    },
    asOf: dayOrNull,
  },
} as const;
export type FieldValue = FromSchema<typeof fieldValueSchema>;

export const coverageSchema = {
  type: "object",
  additionalProperties: false,
  required: ["withData", "applicable"],
  properties: {
    withData: { type: "integer" },
    applicable: { type: "integer" },
  },
} as const;
export type Coverage = FromSchema<typeof coverageSchema>;

export const networkRefSchema = {
  type: "object",
  additionalProperties: false,
  required: ["key", "name"],
  properties: {
    key: { type: "string" },
    name: { type: "string" },
  },
} as const;

export const errorSchema = {
  type: "object",
  additionalProperties: false,
  required: ["error"],
  properties: {
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message", "requestId"],
      properties: {
        code: {
          type: "string",
          enum: ["bad_request", "unauthorized", "not_found", "rate_limited", "unavailable", "internal"],
        },
        message: { type: "string" },
        requestId: { type: "string" },
      },
    },
  },
} as const;
export type ErrorBody = FromSchema<typeof errorSchema>;

const notModified = { description: "The ETag matches, so there's no body", type: "null" } as const;

/** The non-success responses every data route can give. */
export const errorResponses = {
  304: notModified,
  400: { description: "Invalid or unknown parameter", ...errorSchema },
  401: { description: "Missing, revoked or expired key", ...errorSchema },
  404: { description: "Unknown or deactivated asset, or an unknown measure", ...errorSchema },
  429: { description: "Rate limited", ...errorSchema },
  500: { description: "Internal error", ...errorSchema },
  503: { description: "Database unavailable", ...errorSchema },
} as const;
