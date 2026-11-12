/** `GET /assets/catalog`. */
import type { FromSchema } from 'json-schema-to-ts';
import { classificationTreeSchema } from './classification.ts';
import { API_TAG, errorResponses, groupKeySchema, nullableString } from './shared.ts';

const namedOption = {
  type: 'object',
  additionalProperties: false,
  required: ['key', 'label'],
  properties: {
    key: { type: 'string', description: 'The name to send in the parameter' },
    label: { type: 'string' },
  },
} as const;

const catalogResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['metrics', 'groups', 'categories', 'fields', 'filters'],
      properties: {
        metrics: {
          type: 'array',
          description: 'Every name accepted by `metrics`, `financialMetrics`, `history` and `sort`',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['metric', 'label', 'group', 'unit', 'hasCurrentValue', 'hasHistory'],
            properties: {
              metric: { type: 'string' },
              label: { type: 'string' },
              group: groupKeySchema,
              unit: nullableString,
              hasCurrentValue: { type: 'boolean', description: 'Whether any asset has a current value' },
              hasHistory: { type: 'boolean', description: 'Whether any asset has a history series' },
            },
          },
        },
        groups: { type: 'array', description: 'The values `groups` accepts', items: namedOption },
        categories: { type: 'array', description: 'The values `categories` accepts', items: namedOption },
        fields: {
          type: 'array',
          description: 'Every descriptive field, including token-level ones',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['key', 'label', 'category', 'valueType', 'level'],
            properties: {
              key: { type: 'string' },
              label: { type: 'string' },
              category: { type: 'string', description: 'The category key, as `categories` accepts' },
              valueType: { type: 'string' },
              level: { type: 'string' },
            },
          },
        },
        filters: {
          type: 'object',
          additionalProperties: false,
          required: ['assetClasses', 'assetTypes', 'networks', 'classifications'],
          description: 'The values in use across active assets, for filtering the list',
          properties: {
            assetClasses: { type: 'array', items: { type: 'string' } },
            assetTypes: { type: 'array', items: { type: 'string' } },
            networks: { type: 'array', items: { type: 'string' } },
            classifications: classificationTreeSchema,
          },
        },
      },
    },
  },
} as const;
export type CatalogResponse = FromSchema<typeof catalogResponse>;

const catalogQuery = { type: 'object', additionalProperties: false, properties: {} } as const;

export const catalogRoute = {
  summary: 'Everything you can request',
  description: 'The metrics, groups, categories, fields and filter values that the other endpoints accept.',
  tags: [API_TAG],
  querystring: catalogQuery,
  response: { 200: catalogResponse, ...errorResponses },
} as const;
