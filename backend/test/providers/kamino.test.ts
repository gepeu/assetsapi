/** Tests for Kamino provider. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ContractBrokenError } from "../../src/providers/errors.ts";
import { createKaminoProvider } from "../../src/providers/kamino/provider.ts";

const FIXTURE = readFileSync(join(import.meta.dirname, "../fixtures/kamino/tokens.json"), "utf8");

function providerReturning(body: string, status = 200) {
  const urls: string[] = [];
  const provider = createKaminoProvider({
    fetchImpl: (async (url: string) => {
      urls.push(url);
      return new Response(body, { status });
    }) as typeof fetch,
    requestIntervalMs: 0,
    maxRetries: 0,
  });
  return { provider, urls };
}

describe("Kamino provider", () => {
  test("reads a recorded list as Solana tokens", async () => {
    const { provider } = providerReturning(FIXTURE);
    const tokens = await provider.listTokens();
    assert.equal(tokens.length, (JSON.parse(FIXTURE) as unknown[]).length);
    assert.ok(tokens.every((token) => token.network === "solana"));
    assert.ok(tokens.some((token) => token.address === "A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6"));
  });

  test("asks for enough tokens, because the list defaults to 20", async () => {
    const { provider, urls } = providerReturning("[]");
    await provider.listTokens();
    assert.match(urls[0] ?? "", /verified=true/);
    assert.match(urls[0] ?? "", /limit=1000/);
  });

  test("leaves out anything not verified", async () => {
    const { provider } = providerReturning(
      JSON.stringify([
        { mint: "a", verified: true },
        { mint: "b", verified: false },
      ]),
    );
    assert.deepEqual(await provider.listTokens(), [{ network: "solana", address: "a" }]);
  });

  test("a list that reaches the limit may be cut off, so it's ContractBroken", async () => {
    const full = Array.from({ length: 1000 }, (_, index) => ({ mint: `m${index}`, verified: true }));
    await assert.rejects(providerReturning(JSON.stringify(full)).provider.listTokens(), /reached its limit/);
    const fits = full.slice(1);
    assert.equal((await providerReturning(JSON.stringify(fits)).provider.listTokens()).length, 999);
  });

  test("a response that isn't a list is ContractBroken", async () => {
    const { provider } = providerReturning('{"tokens":[]}');
    await assert.rejects(provider.listTokens(), ContractBrokenError);
  });

  test("an entry with no mint is ContractBroken", async () => {
    const { provider } = providerReturning(JSON.stringify([{ symbol: "X", verified: true }]));
    await assert.rejects(provider.listTokens(), ContractBrokenError);
  });
});
