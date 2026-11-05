/** `GET /assets/{slug}/financials`. */
import type { FromSchema } from "json-schema-to-ts";
import {
  day,
  dayOrNull,
  errorResponses,
  fieldValueSchema,
  nullableNumber,
  nullableString,
  scopeSchema,
  slugParams,
} from "./shared.ts";

export const financialsQuery = { type: "object", additionalProperties: false, properties: {} } as const;

export const financialsResponse = {
  type: "object",
  additionalProperties: false,
  required: ["data"],
  properties: {
    data: {
      type: "object",
      additionalProperties: false,
      required: ["asOf", "figures", "terms", "networks", "history"],
      properties: {
        asOf: dayOrNull,
        figures: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "measure",
              "label",
              "group",
              "unit",
              "scope",
              "value",
              "value7d",
              "value30d",
              "value90d",
              "asOf",
            ],
            properties: {
              measure: { type: "string" },
              label: { type: "string" },
              group: { type: "string" },
              unit: nullableString,
              scope: scopeSchema,
              value: { type: "number" },
              value7d: nullableNumber,
              value30d: nullableNumber,
              value90d: nullableNumber,
              asOf: day,
            },
          },
        },
        terms: { type: "array", items: fieldValueSchema },
        networks: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["key", "name", "value", "share"],
            properties: {
              key: { type: "string" },
              name: { type: "string" },
              value: { type: "number" },
              share: { type: "number" },
            },
          },
        },
        history: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["measure", "label", "group", "unit", "scope"],
            properties: {
              measure: { type: "string" },
              label: { type: "string" },
              group: { type: "string" },
              unit: nullableString,
              scope: scopeSchema,
            },
          },
        },
      },
    },
  },
} as const;
export type FinancialsResponse = FromSchema<typeof financialsResponse>;

export const financialsRoute = {
  summary: "Figures, fund terms, value by network and available history",
  params: slugParams,
  querystring: financialsQuery,
  response: { 200: financialsResponse, ...errorResponses },
} as const;
