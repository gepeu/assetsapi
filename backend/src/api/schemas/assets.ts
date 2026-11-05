/** `GET /tokenized_assets` and `GET /tokenized_assets/{slug}`. */
import type { FromSchema } from "json-schema-to-ts";
import { settings } from "../../config.ts";
import { fieldsSection } from "./fields.ts";
import { financialsSection, seriesSection, termsSection, valueByNetworkSection } from "./financials.ts";
import { DEFAULT_HISTORY_RANGE, HISTORY_RANGES, historySection } from "./history.ts";
import {
  API_TAG,
  ASSET_TYPES,
  dayOrNull,
  errorResponses,
  HISTORY_LIST_PATTERN,
  METRIC_LIST_PATTERN,
  METRIC_PATTERN,
  metricsSchema,
  networkRefSchema,
  nullableString,
  SHORT_NAME_LIST_PATTERN,
  SLUG_PATTERN,
  slugParams,
  toListPattern,
} from "./shared.ts";
import { tokensSection } from "./tokens.ts";

// Postgres rejects a NUL byte in text, which would otherwise read as a 500.
const NO_NUL_PATTERN = "^[^\\u0000]*$";
const { defaultPageSize, maxPageSize, maxPageOffset, maxFilterLength, maxHistoryMetrics } = settings.api;

/** What `include` can ask for. History has its own parameter, because it names metrics. */
export const SECTIONS = ["financials", "series", "valueByNetwork", "terms", "fields", "tokens"] as const;
export type Section = (typeof SECTIONS)[number];

const SECTION_LIST_PATTERN = toListPattern(`(${SECTIONS.join("|")})`, SECTIONS.length);

const KEY_METRICS_NOTE =
  "Defaults to the five key metrics: `price_dollar`, `net_asset_value_dollar`, `total_asset_value_dollar`, `apy_30_day` and `holding_addresses_count`.";

const metricsParameter = {
  type: "string",
  pattern: METRIC_LIST_PATTERN,
  description: `Comma-separated metric names for \`metrics\`. ${KEY_METRICS_NOTE} The catalog lists every name.`,
} as const;

const assetListQuery = {
  type: "object",
  additionalProperties: false,
  properties: {
    assetClass: {
      type: "string",
      minLength: 1,
      maxLength: maxFilterLength,
      pattern: NO_NUL_PATTERN,
      description: "Only this asset class",
    },
    assetType: { type: "string", enum: ASSET_TYPES, description: "Only this asset type" },
    network: { type: "string", pattern: SLUG_PATTERN, description: "Only assets with an active token on this network" },
    q: {
      type: "string",
      minLength: 1,
      maxLength: maxFilterLength,
      pattern: NO_NUL_PATTERN,
      description: "Searches ticker, name and issuer",
    },
    metrics: metricsParameter,
    sort: {
      type: "string",
      pattern: METRIC_PATTERN,
      default: "ticker",
      description:
        "`ticker` or a metric name. A leading `-` sorts descending. Missing values sort last, and ties break by slug.",
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: maxPageSize,
      default: defaultPageSize,
      description: "Page size",
    },
    offset: { type: "integer", minimum: 0, maximum: maxPageOffset, default: 0, description: "Page start" },
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
        required: ["slug", "ticker", "name", "assetClass", "assetType", "issuer", "asOf", "metrics"],
        properties: {
          slug: { type: "string" },
          ticker: { type: "string" },
          name: { type: "string" },
          assetClass: { type: "string" },
          assetType: { type: "string" },
          issuer: nullableString,
          asOf: dayOrNull,
          metrics: metricsSchema,
        },
      },
    },
    meta: {
      type: "object",
      additionalProperties: false,
      required: ["total", "limit", "offset"],
      properties: {
        total: { type: "integer", description: "Matching assets, ignoring paging" },
        limit: { type: "integer" },
        offset: { type: "integer" },
      },
    },
  },
} as const;
export type AssetListResponse = FromSchema<typeof assetListResponse>;

// No parameter here has a schema `default`, because a filter must only count when it was sent: Swagger's
// form sends every default, and validation would fill them in. Each description states its default instead.
const assetDetailQuery = {
  type: "object",
  additionalProperties: false,
  properties: {
    include: {
      type: "string",
      pattern: SECTION_LIST_PATTERN,
      description: `Comma-separated sections to add to the core: ${SECTIONS.map((section) => `\`${section}\``).join(", ")}. Only these are queried.`,
    },
    metrics: metricsParameter,
    groups: {
      type: "string",
      pattern: SHORT_NAME_LIST_PATTERN,
      description:
        "Narrows `financials` to these groups: `value`, `yield`, `supply`, `activity`. Needs `include=financials`.",
    },
    financialMetrics: {
      type: "string",
      pattern: METRIC_LIST_PATTERN,
      description:
        "Narrows `financials` to these metric names. With `groups`, a metric must match both. Needs `include=financials`.",
    },
    categories: {
      type: "string",
      pattern: SHORT_NAME_LIST_PATTERN,
      description:
        "Narrows `fields` to these categories, such as `issuer,legal`. The catalog lists them. Needs `include=fields`.",
    },
    empty: {
      type: "boolean",
      description:
        "Defaults to `true`. Set to `false` to drop listed fields that have no value. Coverage counts don't change. Needs `include=fields`.",
    },
    network: {
      type: "string",
      pattern: SLUG_PATTERN,
      description: "Narrows `tokens` to this network. Needs `include=tokens`.",
    },
    history: {
      type: "string",
      pattern: HISTORY_LIST_PATTERN,
      description: `Comma-separated metric names to return daily points for, up to ${maxHistoryMetrics}.`,
    },
    range: {
      type: "string",
      enum: HISTORY_RANGES,
      description: `How far back \`history\` goes, counted from each series' own last point. Defaults to \`${DEFAULT_HISTORY_RANGE}\`. Needs \`history\`.`,
    },
  },
} as const;
export type AssetDetailQuery = FromSchema<typeof assetDetailQuery>;

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
        "metrics",
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
        metrics: metricsSchema,
        financials: financialsSection,
        series: seriesSection,
        valueByNetwork: valueByNetworkSection,
        terms: termsSection,
        fields: fieldsSection,
        tokens: tokensSection,
        history: historySection,
      },
    },
  },
} as const;
export type AssetDetailResponse = FromSchema<typeof assetDetailResponse>;

export const assetListRoute = {
  summary: "List assets",
  description:
    "Active assets, one row each, with the metrics you choose. To compare every asset on one metric, use `?metrics=market_value_dollar&sort=-market_value_dollar&limit=200`.",
  tags: [API_TAG],
  querystring: assetListQuery,
  response: { 200: assetListResponse, ...errorResponses },
} as const;

export const assetDetailRoute = {
  summary: "Get one asset",
  description:
    "With no parameters, returns the core: identity, issuer, organizations, networks and five key metrics. Add sections with `include`, and daily points with `history`. A section appears only if you asked for it, and a filter for a section you didn't ask for is a 400.",
  tags: [API_TAG],
  params: slugParams,
  querystring: assetDetailQuery,
  response: { 200: assetDetailResponse, ...errorResponses },
} as const;
