/**
 * Kamino's verified token list, which is one half of the universe rule. Every token on it is a
 * Solana mint, because that's the only chain Kamino's list covers. No key is needed.
 */
import { ContractBrokenError } from "../errors.ts";
import { HttpClient, type HttpClientOptions } from "../http.ts";
import type { UniverseProvider, VerifiedToken } from "../types.ts";

export const KAMINO_BASE_URL = "https://api.kamino.finance";
// Without a limit the list returns only 20 tokens.
const TOKENS_PATH = "/tokens-api/tokens/?verified=true&limit=1000";

export type KaminoOptions = Partial<Omit<HttpClientOptions, "provider">>;

export function createKaminoProvider(options: KaminoOptions = {}): UniverseProvider {
  const http = new HttpClient({ baseUrl: KAMINO_BASE_URL, ...options, provider: "Kamino" });

  return {
    async listTokens(): Promise<VerifiedToken[]> {
      const body = await http.getJson(TOKENS_PATH);
      if (!Array.isArray(body)) throw new ContractBrokenError("Kamino's token list isn't an array");

      const tokens: VerifiedToken[] = [];
      for (const entry of body as unknown[]) {
        const token = entry as { mint?: unknown; verified?: unknown } | null;
        if (typeof token?.mint !== "string" || token.mint === "") {
          throw new ContractBrokenError("Kamino's token list has an entry without a mint");
        }
        if (token.verified === true) tokens.push({ network: "solana", address: token.mint });
      }
      return tokens;
    },
  };
}
