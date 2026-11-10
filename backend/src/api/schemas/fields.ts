/** The `fields` section of `GET /tokenized_assets/{slug}`. */
import type { FromSchema } from 'json-schema-to-ts';
import { coverageSchema, fieldValueSchema } from './shared.ts';

export const fieldsSection = {
  type: 'object',
  additionalProperties: false,
  required: ['coverage', 'categories'],
  description: 'Descriptive values by category, without token-level fields',
  properties: {
    coverage: { ...coverageSchema, description: 'The whole asset, whichever categories were asked for' },
    categories: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'coverage', 'fields', 'records'],
        properties: {
          name: { type: 'string' },
          coverage: coverageSchema,
          fields: { type: 'array', items: fieldValueSchema },
          records: {
            type: 'array',
            description: 'Values that repeat, such as one record per network',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['group', 'key', 'fields'],
              properties: {
                group: { type: 'string' },
                key: { type: 'string' },
                fields: { type: 'array', items: fieldValueSchema },
              },
            },
          },
        },
      },
    },
  },
} as const;
export type FieldsSection = FromSchema<typeof fieldsSection>;
