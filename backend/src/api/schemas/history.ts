/** `GET /assets/{slug}/history`. */
import type { FromSchema } from "json-schema-to-ts";
import { errorResponses, nullableString, scopeSchema, slugParams } from "./shared.ts";

const HISTORY_RANGES = ["7d", "30d", "3m", "1y", "all"] as const;

const historyQuery = {
  type: "object",
  additionalProperties: false,
  required: ["measure"],
  properties: {
    measure: { type: "string", pattern: "^[a-z0-9_]{1,64}$" },
    range: { type: "string", enum: HISTORY_RANGES, default: "all" },
  },
} as const;
export type HistoryQuery = FromSchema<typeof historyQuery>;

const historyResponse = {
  type: "object",
  additionalProperties: false,
  required: ["data"],
  properties: {
    data: {
      type: "object",
      additionalProperties: false,
      required: ["measure", "label", "unit", "scope", "points"],
      properties: {
        measure: { type: "string" },
        label: { type: "string" },
        unit: nullableString,
        scope: scopeSchema,
        points: {
          type: "array",
          description: "[day, value] pairs, oldest first. Empty for a valid measure with no data",
          items: {
            type: "array",
            minItems: 2,
            maxItems: 2,
            items: { type: ["string", "number"] },
          },
        },
      },
    },
  },
} as const;
export type HistoryResponse = FromSchema<typeof historyResponse>;

export const historyRoute = {
  summary: "Daily points for one measure",
  params: slugParams,
  querystring: historyQuery,
  response: { 200: historyResponse, ...errorResponses },
} as const;
