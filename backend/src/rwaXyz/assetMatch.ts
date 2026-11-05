import type { ApiRecord, RwaXyzClient } from "./client.ts";

/** IDs from the Kamino data or an exact Solana mint lookup. Each is still checked against what RWA.xyz returns. */
export const KNOWN_ASSET_IDS: Readonly<Record<string, { id: number; slug: string }>> = {
  aaplx: { id: 14758, slug: "apple-xstock" },
  acred: { id: 7797, slug: "apollo-diversified-credit-securitize-fund" },
  auto: { id: 39086, slug: "auto" },
  buidl: { id: 2331, slug: "blackrock-usd-institutional-digital-liquidity-fund" },
  coinx: { id: 14569, slug: "coinbase-xstock" },
  "maple-usdc": { id: 3896, slug: "syrup-usdc" },
  nvdax: { id: 14702, slug: "nvidia-xstock" },
  onyc: { id: 15123, slug: "onre-tokenized-reinsurance" },
  ousg: { id: 57, slug: "ondo-short-term-us-government-bond-fund" },
  prime: { id: 16743, slug: "prime" },
  spyx: { id: 14527, slug: "sp500-xstock" },
  usdy: { id: 60, slug: "ondo-u-s-dollar-yield" },
  usyc: { id: 51, slug: "circle-usyc" },
  xaum: { id: 15200, slug: "matrixdock-gold" },
  ausd: { id: 5734, slug: "ausd" },
  cash: { id: 16086, slug: "cash" },
  crclx: { id: 14765, slug: "crclx-xstock" },
  eurc: { id: 809, slug: "eurc" },
  europ: { id: 15303, slug: "eur-p" },
  fdusd: { id: 1590, slug: "first-digital-usd" },
  fwdi: { id: 15843, slug: "forward-industries-inc" },
  glxy: { id: 15384, slug: "galaxy-digital-inc" },
  googlx: { id: 14793, slug: "alphabet-xstock" },
  hoodx: { id: 14541, slug: "robinhood-xstock" },
  metax: { id: 14814, slug: "meta-xstock" },
  mstrx: { id: 14842, slug: "microstrategy-xstock" },
  nbasis: { id: 8511, slug: "nest-basis-vault" },
  nopal: { id: 16069, slug: "nest-blackopal-liquidstone-ii-vault" },
  otfy: { id: 39088, slug: "obligate-trade-finance-yield" },
  pst: { id: 35670, slug: "payfi-strategy-token" },
  pyusd: { id: 10, slug: "paypal-usd" },
  qqqx: { id: 14779, slug: "nasdaq-xstock" },
  reusd: { id: 15849, slug: "reusd" },
  "solmf-one": { id: 74211, slug: "midas-solmf-one" },
  strcx: { id: 16055, slug: "strategy-pp-variable-xstock" },
  susde: { id: 35503, slug: "staked-usde" },
  tgbp: { id: 15995, slug: "tokenised-gbp" },
  tslax: { id: 14744, slug: "tesla-xstock" },
  uscc: { id: 6746, slug: "bitwise-crypto-carry-fund" },
  usd1: { id: 15138, slug: "usd1" },
  usdc: { id: 4, slug: "usdc" },
  usde: { id: 1599, slug: "ethena-usde" },
  usdg: { id: 7541, slug: "global-dollar" },
  usds: { id: 1635, slug: "usds" },
  usdt: { id: 1, slug: "tether-usdt" },
  ustb: { id: 1385, slug: "invesco-short-duration-us-government-securities-fund" },
  usx: { id: 15893, slug: "usx" },
};

/** Lookup hints only: a hit still has to agree on the ticker before it counts as a match. */
const KNOWN_TOKEN_ADDRESSES: Readonly<Record<string, readonly string[]>> = {
  aave: ["0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9"],
  cbbtc: ["0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij"],
  jitosol: ["J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn"],
  jlp: ["27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4"],
  jup: ["JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"],
  kmno: ["KMNO3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS"],
  msol: ["mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So"],
  susds: ["0xa3931d71877c0e7a3148cb7eb4463524fec27fbd"],
  xbtc: ["0xb7c00000bcdeef966b20b3d884b98e64d2b06b4f"],
};

export interface OurAsset {
  slug: string;
  ticker: string;
  name: string;
}

export type MatchResult =
  | { status: "matched"; record: ApiRecord; method: string }
  | { status: "not_found"; reason: string }
  | { status: "mismatch"; reason: string };

const sameText = (a: unknown, b: unknown) =>
  typeof a === "string" && typeof b === "string" && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Ticker alone isn't enough: "NEAR" is also an iShares ETF. */
export function agreesWithAsset(record: ApiRecord, asset: OurAsset): boolean {
  return record.ticker === asset.ticker && (record.slug === asset.slug || sameText(record.name, asset.name));
}

/** Finds an asset's RWA.xyz record, by known ID, then ticker, then token address. Never guesses. */
export async function matchAsset(client: RwaXyzClient, asset: OurAsset): Promise<MatchResult> {
  const known = KNOWN_ASSET_IDS[asset.slug];
  if (known) {
    const record = await client.getAsset(known.id);
    if (!record) return { status: "mismatch", reason: `Known ID ${known.id} no longer exists` };
    if (record.ticker !== asset.ticker || record.slug !== known.slug) {
      return {
        status: "mismatch",
        reason: `Known ID ${known.id} is now ${String(record.ticker)} (${String(record.slug)})`,
      };
    }
    return { status: "matched", record, method: "known_id" };
  }

  const byTicker = (await client.findAssetsByTicker(asset.ticker)).filter((record) => agreesWithAsset(record, asset));
  if (byTicker.length === 1) {
    const record = await client.getAsset(byTicker[0].id as number);
    if (record) return { status: "matched", record, method: "ticker_and_name" };
  }
  if (byTicker.length > 1) return { status: "mismatch", reason: "Several records agree with this asset" };

  for (const address of KNOWN_TOKEN_ADDRESSES[asset.slug] ?? []) {
    for (const token of await client.findTokensByAddress(address)) {
      const parent = token.asset as ApiRecord | undefined;
      if (parent?.ticker === asset.ticker && typeof parent.id === "number") {
        const record = await client.getAsset(parent.id);
        if (record) return { status: "matched", record, method: "token_address" };
      }
    }
  }
  return { status: "not_found", reason: "No record by ticker and name, or by token address" };
}
