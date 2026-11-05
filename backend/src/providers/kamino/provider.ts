/**
 * Kamino's verified token list, which is one half of the universe rule. Every token on it is a
 * Solana mint, because that's the only chain Kamino's list covers. No key is needed.
 */
import { ContractBrokenError } from "../errors.ts";
import { HttpClient, type HttpClientOptions } from "../http.ts";
import { SOLANA_NETWORK, type UniverseProvider, type VerifiedToken } from "../types.ts";

const KAMINO_BASE_URL = "https://api.kamino.finance";
// Without a limit the list returns only 20 tokens.
const TOKEN_LIMIT = 1000;
const TOKENS_PATH = `/tokens-api/tokens/?verified=true&limit=${TOKEN_LIMIT}`;

type KaminoOptions = Partial<Omit<HttpClientOptions, "provider">>;

export function createKaminoProvider(options: KaminoOptions = {}): UniverseProvider {
  const http = new HttpClient({ baseUrl: KAMINO_BASE_URL, ...options, provider: "Kamino" });

  return {
    async listTokens(): Promise<VerifiedToken[]> {
      const body = await http.getJson(TOKENS_PATH);
      if (!Array.isArray(body)) throw new ContractBrokenError("Kamino's token list isn't an array");
      // A full page may be cut off, and treating a cut list as complete could deactivate assets.
      if (body.length >= TOKEN_LIMIT) {
        throw new ContractBrokenError(`Kamino's token list reached its limit of ${TOKEN_LIMIT}, so raise the limit`);
      }

      const tokens: VerifiedToken[] = [];
      for (const entry of body as unknown[]) {
        const token = entry as { mint?: unknown; verified?: unknown } | null;
        if (typeof token?.mint !== "string" || token.mint === "") {
          throw new ContractBrokenError("Kamino's token list has an entry without a mint");
        }
        if (token.verified === true) tokens.push({ network: SOLANA_NETWORK, address: token.mint });
      }
      return tokens;
    },
  };
}
