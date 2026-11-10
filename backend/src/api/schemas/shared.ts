/**
 * Pieces shared across the endpoint schemas. These JSON Schemas are the source of truth for the API
 * contract: Fastify validates and serialises with them, and TypeScript types are derived from them.
 */
import type { FromSchema } from 'json-schema-to-ts';
import { settings } from '../../config.ts';

export const SLUG_PATTERN = `^[a-z0-9-]{1,${settings.limits.maxSlugLength}}$`;
const METRIC_NAME = `[a-z0-9_]{1,${settings.limits.maxMeasureNameLength}}`;
const SHORT_NAME = '[a-z0-9]{1,64}';
const DAY_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';

/** A comma-separated list of names, with no spaces or empty items. */
export const toListPattern = (name: string, max: number): string => `^${name}(,${name}){0,${max - 1}}$`;

export const METRIC_PATTERN = `^-?${METRIC_NAME}$`;
export const METRIC_LIST_PATTERN = toListPattern(METRIC_NAME, settings.api.maxNamesPerParameter);
export const HISTORY_LIST_PATTERN = toListPattern(METRIC_NAME, settings.api.maxHistoryMetrics);
export const SHORT_NAME_LIST_PATTERN = toListPattern(SHORT_NAME, settings.api.maxNamesPerParameter);

export const ASSET_TYPES = [
  'tokenized_equity',
  'tokenized_fund',
  'tokenized_commodity',
  'wrapped_crypto',
  'native_crypto',
  'defi_yield',
  'stablecoin',
] as const;

export const nullableNumber = { type: ['number', 'null'] } as const;
export const nullableString = { type: ['string', 'null'] } as const;
export const dayOrNull = { type: ['string', 'null'], pattern: DAY_PATTERN } as const;

export const scopeSchema = {
  type: 'string',
  enum: ['asset', 'solana'],
  description: '`asset` is the whole asset across networks. `solana` is its Solana token only',
} as const;

export const slugParams = {
  type: 'object',
  additionalProperties: false,
  required: ['slug'],
  properties: {
    slug: { type: 'string', pattern: SLUG_PATTERN, description: "The asset's slug, such as `usdt`" },
  },
} as const;
export type SlugParams = FromSchema<typeof slugParams>;

/** Plain numbers by metric name, wherever `metrics` appears. A metric with no value is null. */
export const metricsSchema = {
  type: 'object',
  description: 'Numbers by metric name. A metric with no value is `null`',
  additionalProperties: nullableNumber,
} as const;
export type Metrics = FromSchema<typeof metricsSchema>;

export const fieldValueSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['key', 'label', 'valueType', 'value', 'asOf'],
  properties: {
    key: { type: 'string' },
    label: { type: 'string' },
    valueType: { type: 'string' },
    value: {
      anyOf: [
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' },
        { type: 'array', items: { type: 'string' } },
        { type: 'null' },
      ],
    },
    asOf: dayOrNull,
  },
} as const;
export type FieldValue = FromSchema<typeof fieldValueSchema>;

export const coverageSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['withData', 'applicable'],
  description: 'How many of the fields that apply to this asset have a value',
  properties: {
    withData: { type: 'integer' },
    applicable: { type: 'integer' },
  },
} as const;
export type Coverage = FromSchema<typeof coverageSchema>;

export const networkRefSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['key', 'name'],
  properties: {
    key: { type: 'string' },
    name: { type: 'string' },
  },
} as const;

export const errorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'message', 'requestId'],
      properties: {
        code: {
          type: 'string',
          enum: ['bad_request', 'not_found', 'rate_limited', 'unavailable', 'internal'],
        },
        message: { type: 'string' },
        requestId: { type: 'string' },
      },
    },
  },
} as const;
export type ErrorBody = FromSchema<typeof errorSchema>;

const notModified = { description: "The ETag matches, so there's no body", type: 'null' } as const;

/** The non-success responses every data route can give. */
export const errorResponses = {
  304: notModified,
  400: { description: 'Invalid or unknown parameter or name', ...errorSchema },
  404: { description: 'Unknown or deactivated asset', ...errorSchema },
  429: { description: 'Rate limited', ...errorSchema },
  500: { description: 'Internal error', ...errorSchema },
  503: { description: 'Database unavailable', ...errorSchema },
} as const;

export const API_TAG = 'Tokenized assets';
