/** `GET /assets/{slug}/fields`. */
import type { FromSchema } from "json-schema-to-ts";
import { coverageSchema, errorResponses, fieldValueSchema, slugParams } from "./shared.ts";

const fieldsQuery = { type: "object", additionalProperties: false, properties: {} } as const;

const fieldsResponse = {
  type: "object",
  additionalProperties: false,
  required: ["data"],
  properties: {
    data: {
      type: "object",
      additionalProperties: false,
      required: ["coverage", "categories"],
      properties: {
        coverage: coverageSchema,
        categories: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "coverage", "fields", "records"],
            properties: {
              name: { type: "string" },
              coverage: coverageSchema,
              fields: { type: "array", items: fieldValueSchema },
              records: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["group", "key", "fields"],
                  properties: {
                    group: { type: "string" },
                    key: { type: "string" },
                    fields: { type: "array", items: fieldValueSchema },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
export type FieldsResponse = FromSchema<typeof fieldsResponse>;

export const fieldsRoute = {
  summary: "Catalog values by category, with coverage. Excludes token-level fields",
  params: slugParams,
  querystring: fieldsQuery,
  response: { 200: fieldsResponse, ...errorResponses },
} as const;
