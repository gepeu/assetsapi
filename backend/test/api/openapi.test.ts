/** Tests for OpenAPI contract. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { renderOpenApi } from "../../scripts/generateOpenApi.ts";

interface Spec {
  openapi: string;
  paths: Record<
    string,
    Record<string, { parameters?: { name: string }[]; responses: Record<string, unknown>; security?: unknown[] }>
  >;
  security: unknown[];
}

describe("OpenAPI contract", () => {
  test("the committed file matches the schemas", async () => {
    const committed = readFileSync(join(import.meta.dirname, "../../openapi.json"), "utf8");
    assert.equal(committed, await renderOpenApi(), "Run: npm run openapi");
  });

  test("it describes every endpoint, and only GET", async () => {
    const spec = JSON.parse(await renderOpenApi()) as Spec;
    assert.equal(spec.openapi, "3.1.0");
    assert.deepEqual(Object.keys(spec.paths).sort(), [
      "/assets",
      "/assets/{slug}",
      "/assets/{slug}/fields",
      "/assets/{slug}/financials",
      "/assets/{slug}/history",
      "/assets/{slug}/tokens",
      "/readyz",
    ]);
    for (const methods of Object.values(spec.paths)) assert.deepEqual(Object.keys(methods), ["get"]);
  });

  test("data routes require a key and /readyz doesn't", async () => {
    const spec = JSON.parse(await renderOpenApi()) as Spec;
    assert.deepEqual(spec.security, [{ bearerAuth: [] }]);
    assert.deepEqual(spec.paths["/readyz"]?.get?.security, []);
  });

  test("errors are documented, and strict schemas reach the contract", async () => {
    const spec = JSON.parse(await renderOpenApi()) as Spec;
    const route = spec.paths["/assets/{slug}/history"]?.get;
    assert.ok(route);
    assert.deepEqual(Object.keys(route.responses).sort(), ["200", "304", "400", "401", "404", "429", "500", "503"]);
    assert.deepEqual(route.parameters?.map((parameter) => parameter.name).sort(), ["measure", "range", "slug"]);
    assert.match(JSON.stringify(spec), /"additionalProperties":false/);
  });
});
