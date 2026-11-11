/** The `financials`, `series`, `valueByNetwork` and `terms` sections of `GET /assets/{slug}`. */
import type { FromSchema } from 'json-schema-to-ts';
import { dayOrNull, fieldValueSchema, groupKeySchema, nullableNumber, nullableString, scopeSchema } from './shared.ts';

export const financialsSection = {
  type: 'array',
  description: "Each metric's current value with its label, group, unit and past values",
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['metric', 'label', 'group', 'unit', 'scope', 'value', 'value7d', 'value30d', 'value90d', 'asOf'],
    properties: {
      metric: { type: 'string' },
      label: { type: 'string' },
      group: groupKeySchema,
      unit: nullableString,
      scope: scopeSchema,
      value: { type: 'number' },
      value7d: { ...nullableNumber, description: 'The value 7 days ago' },
      value30d: { ...nullableNumber, description: 'The value 30 days ago' },
      value90d: { ...nullableNumber, description: 'The value 90 days ago' },
      asOf: dayOrNull,
    },
  },
} as const;
export type FinancialsSection = FromSchema<typeof financialsSection>;

export const seriesSection = {
  type: 'array',
  description: 'The history series this asset has, without their points',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['metric', 'label', 'group', 'unit', 'scope'],
    properties: {
      metric: { type: 'string' },
      label: { type: 'string' },
      group: groupKeySchema,
      unit: nullableString,
      scope: scopeSchema,
    },
  },
} as const;
export type SeriesSection = FromSchema<typeof seriesSection>;

export const valueByNetworkSection = {
  type: 'array',
  description: 'Total asset value on each network, largest first',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['key', 'name', 'value', 'share'],
    properties: {
      key: { type: 'string' },
      name: { type: 'string' },
      value: { type: 'number', description: 'In dollars' },
      share: { type: 'number', description: "Percent of the asset's value across networks" },
    },
  },
} as const;
export type ValueByNetworkSection = FromSchema<typeof valueByNetworkSection>;

export const termsSection = {
  type: 'array',
  description: 'Fund terms and fees',
  items: fieldValueSchema,
} as const;
export type TermsSection = FromSchema<typeof termsSection>;
