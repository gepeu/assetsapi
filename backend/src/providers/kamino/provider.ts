/**
 * Kamino's verified token list, which is one half of the universe rule. Every token on it is a
 * Solana mint, because that's the only chain Kamino's list covers. No key is needed.
 */
import { settings } from "../../config.ts";
import { ContractBrokenError } from "../errors.ts";
import { HttpClient, type HttpClientOptions } from "../http.ts";
import { SOLANA_NETWORK, type UniverseProvider, type VerifiedToken } from "../types.ts";

type KaminoOptions = Partial<Omit<HttpClientOptions, "provider">>;

export function createKaminoProvider(options: KaminoOptions = {}): UniverseProvider {
  const { kaminoBaseUrl, kaminoTokenLimit } = settings.providers;
  const http = new HttpClient({ baseUrl: kaminoBaseUrl, ...options, provider: "Kamino" });
  // Without a limit the list returns only 20 tokens.
  const tokensPath = `/tokens-api/tokens/?verified=true&limit=${kaminoTokenLimit}`;

  return {
    async listTokens(): Promise<VerifiedToken[]> {
      const body = await http.getJson(tokensPath);
      if (!Array.isArray(body)) throw new ContractBrokenError("Kamino's token list isn't an array");
      // A full page may be cut off, and treating a cut list as complete could deactivate assets.
      if (body.length >= kaminoTokenLimit) {
        throw new ContractBrokenError(
          `Kamino's token list reached its limit of ${kaminoTokenLimit}, so raise KAMINO_TOKEN_LIMIT`,
        );
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
