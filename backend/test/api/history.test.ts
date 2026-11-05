/** Tests for GET /assets/{slug}/history. */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { type ApiHarness, createApiHarness, makeAsset } from "../helpers/fakeProvider.ts";

describe("GET /assets/{slug}/history", () => {
  let harness: ApiHarness;

  before(async () => {
    harness = await createApiHarness([makeAsset({ ref: "1" })]);
  });
  after(() => harness.close());

  const get = (url: string) => harness.get(url);

  test("points serialise as [day, number] pairs", async () => {
    const response = await get("/assets/asset-1/history?measure=price_dollar");
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().data, {
      measure: "price_dollar",
      label: "Price",
      unit: "dollar",
      scope: "asset",
      points: [
        ["2026-11-01", 2],
        ["2026-11-02", 3],
        ["2026-11-03", 4],
        ["2026-11-04", 5],
      ],
    });
  });

  test("the measure is required, and the range must be a known one", async () => {
    assert.equal((await get("/assets/asset-1/history")).statusCode, 400);
    assert.equal((await get("/assets/asset-1/history?measure=Bad-Name")).statusCode, 400);
    assert.equal((await get("/assets/asset-1/history?measure=price_dollar&range=2w")).statusCode, 400);
    for (const range of ["7d", "30d", "3m", "1y", "all"]) {
      assert.equal((await get(`/assets/asset-1/history?measure=price_dollar&range=${range}`)).statusCode, 200, range);
    }
  });

  test("an unknown or unserved measure is a 404", async () => {
    assert.equal((await get("/assets/asset-1/history?measure=made_up")).statusCode, 404);
    assert.equal((await get("/assets/asset-1/history?measure=raw_supply")).statusCode, 404);
  });

  test("a valid measure with no data has empty points", async () => {
    const response = await get("/assets/asset-1/history?measure=apy_30_day");
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().data.points, []);
  });
});
