/** Tests for validateAssetData; findLargeSwings. */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { type AssetData, type Catalog, findLargeSwings, validateAssetData } from "../../src/jobs/validate.ts";
import { ContractBrokenError } from "../../src/providers/errors.ts";
import { makeAsset, TODAY } from "../helpers/fakeProvider.ts";

const CATALOG: Catalog = new Map(
  Object.entries({
    "identity.name": { valueType: "text", level: "asset", recordGroup: null },
    "identity.ticker": { valueType: "text", level: "asset", recordGroup: null },
    "identity.description": { valueType: "long_text", level: "asset", recordGroup: null },
    "identity.rwa_xyz_slug": { valueType: "identifier", level: "asset", recordGroup: null },
    "classification.sector": { valueType: "list", level: "asset", recordGroup: null },
    "issuer.name": { valueType: "organization", level: "asset", recordGroup: null },
    "provider.manager": { valueType: "organization", level: "asset", recordGroup: null },
    "issuer.website": { valueType: "url", level: "organization", recordGroup: null },
    "technology.network_layer": { valueType: "enum", level: "network", recordGroup: null },
    "technology.chain_id": { valueType: "identifier", level: "network", recordGroup: null },
    "token.decimals": { valueType: "integer", level: "token", recordGroup: null },
    "token.standard": { valueType: "list", level: "token", recordGroup: null },
    "security.audit_date": { valueType: "date", level: "asset", recordGroup: "audit" },
    "legal.bankruptcy_remote": { valueType: "boolean", level: "asset", recordGroup: null },
  }),
);

function validData(): AssetData {
  const { reference, current, history } = makeAsset({ ref: "1" });
  return { reference, current, history };
}

function assertRejected(mutate: (data: AssetData) => void, pattern: RegExp): void {
  const data = validData();
  mutate(data);
  assert.throws(
    () => validateAssetData(data, CATALOG, TODAY),
    (error: Error) => error instanceof ContractBrokenError && pattern.test(error.message),
  );
}

describe("validateAssetData", () => {
  test("accepts good data", () => {
    validateAssetData(validData(), CATALOG, TODAY);
  });

  test("rejects a field the catalog doesn't know", () => {
    assertRejected(
      (data) => data.reference.fields.push({ field: "nope.nope", value: "x", raw: "x", asOf: TODAY }),
      /catalog/,
    );
  });

  test("rejects a field on the wrong kind of subject", () => {
    assertRejected(
      (data) => data.reference.fields.push({ field: "token.decimals", value: 6, raw: 6, asOf: TODAY }),
      /belongs on a token/,
    );
  });

  test("rejects a repeating field with no record key", () => {
    assertRejected(
      (data) => data.reference.fields.push({ field: "security.audit_date", value: TODAY, raw: TODAY, asOf: TODAY }),
      /repeats/,
    );
  });

  test("rejects the same field twice", () => {
    assertRejected(
      (data) => data.reference.fields.push({ field: "identity.name", value: "Again", raw: "Again", asOf: TODAY }),
      /twice/,
    );
  });

  test("rejects a value of the wrong type", () => {
    assertRejected(
      (data) => data.reference.fields.push({ field: "legal.bankruptcy_remote", value: "yes", raw: "yes", asOf: TODAY }),
      /valid boolean/,
    );
    assertRejected((data) => {
      const [token] = data.reference.tokens;
      if (token) token.fields = [{ field: "token.decimals", value: 1.5, raw: 1.5, asOf: TODAY }];
    }, /valid integer/);
  });

  test("rejects an organization field pointing at nothing", () => {
    assertRejected((data) => {
      data.reference.organizations = data.reference.organizations.filter((item) => item.slug !== "shared-issuer");
    }, /unlisted organization/);
  });

  test("rejects a token on a network that wasn't supplied", () => {
    assertRejected((data) => {
      data.reference.networks = data.reference.networks.filter((network) => network.key !== "ethereum");
    }, /unlisted network/);
  });

  test("rejects a number that isn't finite", () => {
    assertRejected((data) => {
      const [row] = data.current.values;
      if (row) row.value = Number.POSITIVE_INFINITY;
    }, /finite/);
    assertRejected((data) => {
      const [series] = data.history.series;
      if (series) series.points = [["2026-11-01", Number.NaN]];
    }, /finite/);
  });

  test("rejects an as-of date in the future", () => {
    assertRejected((data) => {
      const [row] = data.current.values;
      if (row) row.asOf = "2026-11-06";
    }, /future/);
    assertRejected((data) => {
      const [field] = data.reference.fields;
      if (field) field.asOf = "2030-01-01";
    }, /future/);
    assertRejected((data) => {
      const [series] = data.history.series;
      if (series) series.points = [["2026-11-06", 1]];
    }, /future/);
  });

  test("accepts today as an as-of date", () => {
    const data = validData();
    const [row] = data.current.values;
    if (row) row.asOf = TODAY;
    validateAssetData(data, CATALOG, TODAY);
  });

  test("rejects an empty token list, which would otherwise deactivate every token", () => {
    assertRejected((data) => {
      data.reference.tokens = [];
    }, /no tokens/);
  });

  test("rejects a slug that doesn't fit our rule", () => {
    assertRejected((data) => {
      data.reference.slug = "Not A Slug";
    }, /slug/);
  });

  test("rejects a measure name that doesn't fit our rule", () => {
    assertRejected((data) => {
      const [row] = data.current.values;
      if (row) row.metric = "Bad Name";
    }, /measure name/);
  });
});

describe("findLargeSwings", () => {
  const current = (
    metric: string,
    value: number | null,
    token: { network: string; address: string } | null = null,
  ) => ({
    values: [{ metric, token, value, value7d: null, value30d: null, value90d: null, raw: value, asOf: TODAY }],
  });

  test("notes a jump of half or more on a watched measure", () => {
    assert.deepEqual(findLargeSwings(new Map([["price_dollar", 100]]), current("price_dollar", 150)), [
      { metric: "price_dollar", from: 100, to: 150 },
    ]);
    assert.equal(findLargeSwings(new Map([["price_dollar", 100]]), current("price_dollar", 149)).length, 0);
  });

  test("ignores unwatched measures, token values, new values and a zero base", () => {
    assert.equal(findLargeSwings(new Map([["apy_7_day", 1]]), current("apy_7_day", 9)).length, 0);
    assert.equal(
      findLargeSwings(new Map([["price_dollar", 1]]), current("price_dollar", 9, { network: "a", address: "b" }))
        .length,
      0,
    );
    assert.equal(findLargeSwings(new Map(), current("price_dollar", 9)).length, 0);
    assert.equal(findLargeSwings(new Map([["price_dollar", 0]]), current("price_dollar", 9)).length, 0);
  });
});
