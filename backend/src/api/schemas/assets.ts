/** `GET /assets` and `GET /assets/{slug}`. */
import type { FromSchema } from "json-schema-to-ts";
import { settings } from "../../config.ts";
import {
  ASSET_TYPES,
  dayOrNull,
  errorResponses,
  figuresSchema,
  networkRefSchema,
  nullableString,
  SLUG_PATTERN,
  slugParams,
} from "./shared.ts";

// Postgres rejects a NUL byte in text, which would otherwise read as a 500.
const NO_NUL_PATTERN = "^[^\\u0000]*$";
const { defaultPageSize, maxPageSize, maxPageOffset, maxFilterLength } = settings.api;

const SORT_VALUES = [
  "ticker",
  "price_dollar",
  "net_asset_value_dollar",
  "total_asset_value_dollar",
  "apy_30_day",
  "holding_addresses_count",
  "-ticker",
  "-price_dollar",
  "-net_asset_value_dollar",
  "-total_asset_value_dollar",
  "-apy_30_day",
  "-holding_addresses_count",
] as const;

const assetListQuery = {
  type: "object",
  additionalProperties: false,
  properties: {
    assetClass: { type: "string", minLength: 1, maxLength: maxFilterLength, pattern: NO_NUL_PATTERN },
    assetType: { type: "string", enum: ASSET_TYPES },
    network: { type: "string", pattern: SLUG_PATTERN },
    q: { type: "string", minLength: 1, maxLength: maxFilterLength, pattern: NO_NUL_PATTERN },
    sort: { type: "string", enum: SORT_VALUES, default: "ticker" },
    limit: { type: "integer", minimum: 1, maximum: maxPageSize, default: defaultPageSize },
    offset: { type: "integer", minimum: 0, maximum: maxPageOffset, default: 0 },
  },
} as const;
export type AssetListQuery = FromSchema<typeof assetListQuery>;

const assetListResponse = {
  type: "object",
  additionalProperties: false,
  required: ["data", "meta"],
  properties: {
    data: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slug", "ticker", "name", "assetClass", "assetType", "issuer", "asOf", "figures"],
        properties: {
          slug: { type: "string" },
          ticker: { type: "string" },
          name: { type: "string" },
          assetClass: { type: "string" },
          assetType: { type: "string" },
          issuer: nullableString,
          asOf: dayOrNull,
          figures: figuresSchema,
        },
      },
    },
    meta: {
      type: "object",
      additionalProperties: false,
      required: ["total", "limit", "offset", "filters"],
      properties: {
        total: { type: "integer" },
        limit: { type: "integer" },
        offset: { type: "integer" },
        filters: {
          type: "object",
          additionalProperties: false,
          required: ["assetClasses", "assetTypes", "networks"],
          properties: {
            assetClasses: { type: "array", items: { type: "string" } },
            assetTypes: { type: "array", items: { type: "string" } },
            networks: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  },
} as const;
export type AssetListResponse = FromSchema<typeof assetListResponse>;

const assetDetailResponse = {
  type: "object",
  additionalProperties: false,
  required: ["data"],
  properties: {
    data: {
      type: "object",
      additionalProperties: false,
      required: [
        "slug",
        "ticker",
        "name",
        "assetClass",
        "assetType",
        "description",
        "issuer",
        "organizations",
        "networks",
        "asOf",
        "figures",
      ],
      properties: {
        slug: { type: "string" },
        ticker: { type: "string" },
        name: { type: "string" },
        assetClass: { type: "string" },
        assetType: { type: "string" },
        description: nullableString,
        issuer: nullableString,
        organizations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["slug", "name", "role", "legalName"],
            properties: {
              slug: { type: "string" },
              name: { type: "string" },
              role: { type: "string" },
              legalName: nullableString,
            },
          },
        },
        networks: { type: "array", items: networkRefSchema },
        asOf: dayOrNull,
        figures: figuresSchema,
      },
    },
  },
} as const;
export type AssetDetailResponse = FromSchema<typeof assetDetailResponse>;

export const assetListRoute = {
  summary: "Active assets with key figures, plus filter options",
  querystring: assetListQuery,
  response: { 200: assetListResponse, ...errorResponses },
} as const;

const assetDetailQuery = { type: "object", additionalProperties: false, properties: {} } as const;

export const assetDetailRoute = {
  summary: "Identity, issuer, organizations, networks and key figures",
  params: slugParams,
  querystring: assetDetailQuery,
  response: { 200: assetDetailResponse, ...errorResponses },
} as const;
