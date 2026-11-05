/** Tests for GET /assets/{slug}/fields. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { type ApiHarness, createApiHarness, makeAsset } from "../helpers/fakeProvider.ts";

describe("GET /assets/{slug}/fields", () => {
  let harness: ApiHarness;

  before(async () => {
    harness = await createApiHarness([makeAsset({ ref: "1" })]);
  });
  after(() => harness.close());

  const get = (url: string) => harness.get(url);

  test("every value type survives serialisation", async () => {
    const response = await get("/assets/asset-1/fields");
    assert.equal(response.statusCode, 200);
    const { data } = response.json();
    const fields = data.categories.flatMap((category: { fields: object[] }) => category.fields) as {
      key: string;
      value: unknown;
    }[];
    assert.equal(fields.find((field) => field.key === "identity.name")?.value, "Asset 1");
    assert.deepEqual(fields.find((field) => field.key === "classification.sector")?.value, ["Cash"]);
    assert.equal(fields.find((field) => field.key === "identity.website")?.value, null);
    assert.deepEqual(Object.keys(data).sort(), ["categories", "coverage"]);
  });

  test("an unknown parameter is a 400 and an unknown asset a 404", async () => {
    assert.equal((await get("/assets/asset-1/fields?unknown=1")).statusCode, 400);
    assert.equal((await get("/assets/nope/fields")).statusCode, 404);
  });
});
