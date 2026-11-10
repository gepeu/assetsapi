/** The `history` part of `GET /tokenized_assets/{slug}`. */
import type { FromSchema } from 'json-schema-to-ts';
import { nullableString, scopeSchema } from './shared.ts';

export const HISTORY_RANGES = ['7d', '30d', '3m', '1y', 'all'] as const;
export const DEFAULT_HISTORY_RANGE = '3m';

export const historySection = {
  type: 'array',
  description: 'One series per metric named in `history`, in that order',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['metric', 'label', 'unit', 'scope', 'points'],
    properties: {
      metric: { type: 'string' },
      label: { type: 'string' },
      unit: nullableString,
      scope: scopeSchema,
      points: {
        type: 'array',
        description: '[day, value] pairs, oldest first. Empty for a valid metric with no data',
        items: {
          type: 'array',
          minItems: 2,
          maxItems: 2,
          items: { type: ['string', 'number'] },
        },
      },
    },
  },
} as const;
export type HistorySection = FromSchema<typeof historySection>;
