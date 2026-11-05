/** Tests for RWA.xyz resolve; RWA.xyz getReference; RWA.xyz getCurrent; RWA.xyz getHistory; measure conversion; value cleaning. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { AuthOrQuotaError, ContractBrokenError, NotFoundError } from "../../src/providers/errors.ts";
import { cleanValue, slugify, toAssetType, toIssuanceType } from "../../src/providers/rwaXyz/mapping.ts";
import { toDailyPoints, toMetrics, toStandardUnit } from "../../src/providers/rwaXyz/measures.ts";
import { createRwaXyzProvider } from "../../src/providers/rwaXyz/provider.ts";

const FIXTURES = join(import.meta.dirname, "../fixtures/rwaXyz");
const load = (name: string): string => readFileSync(join(FIXTURES, `${name}.json`), "utf8");
const networks = JSON.parse(load("networks")) as Record<string, unknown>;

const MINT = "A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6";
const TODAY = "2026-11-05";

type Route = { status?: number; body: string };

/** Serves the recorded responses. `overrides` replaces a route by the start of its path. */
function makeProvider(overrides: Record<string, Route> = {}) {
  const paths: string[] = [];
  const fetchImpl = (async (url: string) => {
    const path = url.replace("https://api.rwa.xyz/v4", "");
    paths.push(path);
    for (const [prefix, route] of Object.entries(overrides)) {
      if (path.startsWith(prefix)) return new Response(route.body, { status: route.status ?? 200 });
    }
    const respond = (body: string) => new Response(body);
    if (path.startsWith("/assets/aggregates/timeseries")) return respond(load("assetTimeseries"));
    if (path.startsWith("/tokens/aggregates/timeseries")) return respond(load("tokenTimeseries"));
    if (path.startsWith("/assets/")) return respond(load("asset"));
    if (path.startsWith("/tokens?address=")) return respond(load("tokenSearch"));
    if (path.startsWith("/tokens?asset_id=")) return respond(load("tokens"));
    const network = /^\/networks\/(\d+)/.exec(path)?.[1];
    if (network && networks[network]) return respond(JSON.stringify(networks[network]));
    return new Response('{"message":"not found"}', { status: 404 });
  }) as typeof fetch;
  const provider = createRwaXyzProvider({
    apiKey: "test-key",
    fetchImpl,
    requestIntervalMs: 0,
    maxRetries: 0,
    today: () => TODAY,
  });
  return { provider, paths };
}

describe("RWA.xyz resolve", () => {
  test("finds an asset by its exact mint", async () => {
    const { provider } = makeProvider();
    assert.equal(await provider.resolve("solana", MINT), "60");
  });

  test("nothing listed means null", async () => {
    const { provider } = makeProvider({
      "/tokens?address=": { body: JSON.stringify({ results: [], pagination: { pageCount: 0 } }) },
    });
    assert.equal(await provider.resolve("solana", MINT), null);
  });

  test("a Solana address that differs only by case isn't a match", async () => {
    const { provider } = makeProvider();
    assert.equal(await provider.resolve("solana", MINT.toLowerCase()), null);
  });

  test("the same address on another network isn't a match", async () => {
    const { provider } = makeProvider();
    assert.equal(await provider.resolve("ethereum", MINT), null);
  });

  test("a hidden token doesn't count", async () => {
    const results = (JSON.parse(load("tokenSearch")) as { results: object[] }).results.map((token) => ({
      ...token,
      hidden: true,
    }));
    const { provider } = makeProvider({ "/tokens?address=": { body: JSON.stringify({ results }) } });
    assert.equal(await provider.resolve("solana", MINT), null);
  });

  test("a results field that isn't a list is ContractBroken", async () => {
    const { provider } = makeProvider({ "/tokens?address=": { body: '{"results":{}}' } });
    await assert.rejects(provider.resolve("solana", MINT), ContractBrokenError);
  });

  test("a rejected key is AuthOrQuota", async () => {
    const { provider } = makeProvider({ "/tokens?address=": { status: 401, body: "{}" } });
    await assert.rejects(provider.resolve("solana", MINT), AuthOrQuotaError);
  });
});

describe("RWA.xyz getReference", () => {
  test("converts a recorded asset to our types", async () => {
    const { provider } = makeProvider();
    const data = await provider.getReference("60");
    assert.equal(data.slug, "ondo-u-s-dollar-yield");
    assert.equal(data.ticker, "USDY");
    assert.equal(data.assetClass, "US Treasury Debt");
    assert.equal(data.assetType, "tokenized_fund");

    const fields = new Map(data.fields.map((field) => [field.field, field]));
    assert.equal(fields.get("identity.name")?.value, "Ondo U.S. Dollar Yield");
    assert.equal(fields.get("identity.name")?.asOf, "2026-11-05");
    assert.equal(typeof fields.get("identity.description")?.value, "string");
    assert.ok(typeof fields.get("issuer.name")?.value === "object");

    assert.ok(data.organizations.length > 0);
    assert.ok(data.roles.some((role) => role.role === "issuer"));
  });

  test("the issuer's own details land on the organization", async () => {
    const { provider } = makeProvider();
    const data = await provider.getReference("60");
    const issuerSlug = data.roles.find((role) => role.role === "issuer")?.organization;
    const issuer = data.organizations.find((organization) => organization.slug === issuerSlug);
    assert.ok(issuer);
    assert.ok(issuer.fields.every((field) => field.field.startsWith("issuer.")));
  });

  test("tokens carry our network key, with EVM addresses in lower case and Solana's untouched", async () => {
    const { provider } = makeProvider();
    const data = await provider.getReference("60");
    const solana = data.tokens.find((token) => token.network === "solana");
    assert.equal(solana?.address, MINT);
    assert.equal(solana?.issuanceType, "native");
    const ethereum = data.tokens.find((token) => token.network === "ethereum");
    assert.ok(ethereum);
    assert.equal(ethereum.address, ethereum.address.toLowerCase());
    assert.ok(data.networks.find((network) => network.key === "solana")?.addressCaseSensitive);
    assert.equal(data.networks.find((network) => network.key === "ethereum")?.addressCaseSensitive, false);
  });

  test("a hidden token is skipped and noted", async () => {
    const body = JSON.parse(load("tokens")) as { results: Record<string, unknown>[] };
    const [first] = body.results;
    if (first) first.hidden = true;
    const { provider } = makeProvider({ "/tokens?asset_id=": { body: JSON.stringify(body) } });
    const data = await provider.getReference("60");
    assert.equal(data.tokens.length, body.results.length - 1);
    assert.equal(data.notes.length, 1);
  });

  test("a delisted asset is NotFound", async () => {
    const { provider } = makeProvider({ "/assets/": { status: 404, body: '{"message":"404"}' } });
    await assert.rejects(provider.getReference("60"), NotFoundError);
  });

  test("an asset with no class is ContractBroken", async () => {
    const asset = JSON.parse(load("asset")) as Record<string, unknown>;
    delete asset.asset_class_name;
    const { provider } = makeProvider({ "/assets/": { body: JSON.stringify(asset) } });
    await assert.rejects(provider.getReference("60"), ContractBrokenError);
  });

  test("an unmapped class comes back with no asset type", async () => {
    const asset = JSON.parse(load("asset")) as Record<string, unknown>;
    asset.asset_class_name = "Space Rocks";
    const { provider } = makeProvider({ "/assets/": { body: JSON.stringify(asset) } });
    const data = await provider.getReference("60");
    assert.equal(data.assetClass, "Space Rocks");
    assert.equal(data.assetType, null);
  });

  test("a failed network fetch fails that asset only, and the next one tries again", async () => {
    let failures = 1;
    const fetchImpl = (async (url: string) => {
      const path = url.replace("https://api.rwa.xyz/v4", "");
      if (path.startsWith("/networks/") && failures > 0) {
        failures--;
        return new Response("{}", { status: 500 });
      }
      const network = /^\/networks\/(\d+)/.exec(path)?.[1];
      if (network) return new Response(JSON.stringify(networks[network]));
      if (path.startsWith("/tokens?asset_id=")) return new Response(load("tokens"));
      return new Response(load("asset"));
    }) as typeof fetch;
    const provider = createRwaXyzProvider({
      apiKey: "test-key",
      fetchImpl,
      requestIntervalMs: 0,
      maxRetries: 0,
      today: () => TODAY,
    });
    await assert.rejects(provider.getReference("60"));
    const data = await provider.getReference("61");
    assert.ok(data.tokens.length > 0);
  });

  test("asset and token records are fetched once for one asset's reference and current values", async () => {
    const { provider, paths } = makeProvider();
    await provider.getReference("60");
    await provider.getCurrent("60");
    assert.equal(paths.filter((path) => path === "/assets/60").length, 1);
    assert.equal(paths.filter((path) => path.startsWith("/tokens?asset_id=")).length, 1);
  });
});

describe("RWA.xyz getCurrent", () => {
  test("reads tracked and plain financial values at asset and token level", async () => {
    const { provider } = makeProvider();
    const { values } = await provider.getCurrent("60");

    const price = values.find((row) => row.metric === "price_dollar" && row.token === null);
    assert.equal(typeof price?.value, "number");
    assert.equal(typeof price?.value7d, "number");
    assert.equal(price?.asOf, "2026-11-05");

    const onSolana = values.filter((row) => row.token?.network === "solana");
    assert.ok(onSolana.length > 0);
    assert.ok(onSolana.every((row) => row.token?.address === MINT));
  });

  test("text values have no number and keep their raw form", async () => {
    const { provider } = makeProvider();
    const { values } = await provider.getCurrent("60");
    const text = values.find((row) => typeof row.raw === "string");
    assert.ok(text);
    assert.equal(text.value, null);
  });

  test("the two spellings of yield to maturity merge", async () => {
    const { provider } = makeProvider();
    const { values } = await provider.getCurrent("60");
    assert.ok(values.some((row) => row.metric === "yield_to_maturity" && row.token === null));
    assert.ok(!values.some((row) => row.metric === "yield_to_maturity_percent"));
  });
});

describe("RWA.xyz getHistory", () => {
  test("reads asset and Solana token series", async () => {
    const { provider } = makeProvider();
    const { series } = await provider.getHistory("60");
    assert.ok(series.some((row) => row.token === null && row.measure === "price_dollar"));
    assert.ok(series.some((row) => row.token?.address === MINT));
  });

  test("asks for the whole series, because old days get restated", async () => {
    const { provider, paths } = makeProvider();
    await provider.getHistory("60");
    const queries = paths.filter((path) => path.includes("aggregates/timeseries")).map(decodeURIComponent);
    assert.equal(queries.length, 2);
    for (const query of queries) assert.ok(!query.includes('"field":"date"'));
  });

  test("a series for another asset is noted and not returned", async () => {
    const body = JSON.parse(load("assetTimeseries")) as { results: { group: { id: number } }[] };
    for (const result of body.results) result.group.id = 999;
    const { provider } = makeProvider({ "/assets/aggregates/timeseries": { body: JSON.stringify(body) } });
    const { series, notes } = await provider.getHistory("60");
    assert.ok(series.every((row) => row.token !== null));
    assert.ok(notes.length > 0);
  });

  test("a malformed point is ContractBroken", async () => {
    const body = JSON.parse(load("assetTimeseries")) as { results: { points: unknown[] }[] };
    const [first] = body.results;
    if (first) first.points = ["not a point"];
    const { provider } = makeProvider({ "/assets/aggregates/timeseries": { body: JSON.stringify(body) } });
    await assert.rejects(provider.getHistory("60"), ContractBrokenError);
  });
});

describe("measure conversion", () => {
  test("the current UTC day is dropped, because it's incomplete", () => {
    const points = toDailyPoints(
      [
        ["2026-11-03", 1],
        ["2026-11-04", 2],
        ["2026-11-05", 3],
      ],
      TODAY,
    );
    assert.deepEqual(points, [
      ["2026-11-03", 1],
      ["2026-11-04", 2],
    ]);
  });

  test("a repeated day keeps the last value, and a null point is skipped", () => {
    const points = toDailyPoints(
      [
        ["2026-11-02", null],
        ["2026-11-03", 1],
        ["2026-11-03", 2],
      ],
      TODAY,
    );
    assert.deepEqual(points, [["2026-11-03", 2]]);
  });

  test("units are standardised", () => {
    assert.equal(toStandardUnit("monthly_transfer_volume", "Dollars"), "dollar");
    assert.equal(toStandardUnit("weekly_transfer_count", "Transfers"), "transfer");
    assert.equal(toStandardUnit("number_of_daily_transactions_count", "address"), "transaction");
    assert.equal(toStandardUnit("price_dollar", "dollar"), "dollar");
    assert.equal(toStandardUnit("anything", null), null);
  });

  test("a false or a zero is a value, and a null isn't", () => {
    const metrics = toMetrics({
      distributes_income: false,
      total_supply_token: { val: 0, val_7d: null },
      price_dollar: null,
      market_value_dollar: { val: null, val_7d: null },
      name: "ignored, not financial",
    });
    assert.deepEqual(metrics.map((metric) => metric.metric).sort(), ["distributes_income", "total_supply_token"]);
    assert.equal(metrics.find((metric) => metric.metric === "total_supply_token")?.value, 0);
  });

  test("the current name wins if a measure arrives under both", () => {
    const metrics = toMetrics({ yield_to_maturity: { val: 1 }, yield_to_maturity_percent: { val: 2 } });
    assert.deepEqual(
      metrics.map((metric) => [metric.metric, metric.value]),
      [["yield_to_maturity", 1]],
    );
  });
});

describe("value cleaning", () => {
  test("values fit their catalog type, and anything unusable is no value at all", () => {
    assert.equal(cleanValue("boolean", true), true);
    assert.equal(cleanValue("boolean", "yes"), null);
    assert.equal(cleanValue("decimal", 1.5), 1.5);
    assert.equal(cleanValue("decimal", "1.5"), null);
    assert.equal(cleanValue("date", "2024-01-02T03:04:05"), "2024-01-02");
    assert.equal(cleanValue("date", "soon"), null);
    assert.equal(cleanValue("url", " https://a.example "), null);
    assert.equal(cleanValue("url", "https://a.example"), "https://a.example");
    assert.equal(cleanValue("url", "a.example"), null);
    assert.deepEqual(cleanValue("list", ["b", "a", "a", " "]), ["a", "b"]);
    assert.equal(cleanValue("list", []), null);
    assert.equal(cleanValue("text", "  hi "), "hi");
    assert.equal(cleanValue("text", ""), null);
    assert.equal(cleanValue("text", null), null);
  });

  test("issuance types map, and unknown ones say so", () => {
    assert.equal(toIssuanceType("NATIVE"), "native");
    assert.equal(toIssuanceType("BRIDGE"), "bridged");
    assert.equal(toIssuanceType("WRAPPER"), "wrapper");
    assert.equal(toIssuanceType("OTHER"), "unknown");
  });

  test("classes map to our asset types, and an unknown class doesn't", () => {
    assert.equal(toAssetType("Stablecoins"), "stablecoin");
    assert.equal(toAssetType("Stocks"), "tokenized_equity");
    assert.equal(toAssetType("Commodities"), "tokenized_commodity");
    assert.equal(toAssetType("Space Rocks"), null);
  });

  test("slugs fit our rule", () => {
    assert.equal(slugify("Ondo U.S. Dollar_Yield!"), "ondo-u-s-dollar-yield");
  });
});
