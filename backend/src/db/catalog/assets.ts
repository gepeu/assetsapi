import type { AssetType } from "./fields.ts";

export type AssetClass =
  | "equity"
  | "treasuries"
  | "private_credit"
  | "reinsurance"
  | "commodities"
  | "cryptocurrency"
  | "onchain_yield";

export interface AssetDefinition {
  slug: string;
  ticker: string;
  name: string;
  /** As listed in docs/token_universe.md. Unverified. */
  listedIssuer: string;
  assetClass: AssetClass;
  assetType: AssetType;
  reviewNote?: string;
}

/** The token universe. Slugs match frontend/src/api/fixtures.json. */
export const ASSETS: readonly AssetDefinition[] = [
  { slug: "aaplx", ticker: "AAPLx", name: "Apple xStock", listedIssuer: "Backed Assets", assetClass: "equity", assetType: "tokenized_equity" },
  { slug: "aave", ticker: "AAVE", name: "Aave", listedIssuer: "Aave Labs", assetClass: "cryptocurrency", assetType: "native_crypto" },
  { slug: "acred", ticker: "ACRED", name: "Apollo Diversified Credit Securitize Fund", listedIssuer: "Securitize Tokenized Apollo Diversified Credit Fund", assetClass: "private_credit", assetType: "tokenized_fund" },
  { slug: "auto", ticker: "AUTO", name: "AUTO", listedIssuer: "Hastra", assetClass: "private_credit", assetType: "tokenized_fund" },
  { slug: "buidl", ticker: "BUIDL", name: "BlackRock USD Institutional Digital Liquidity Fund", listedIssuer: "BlackRock USD Institutional Digital Liquidity Fund", assetClass: "treasuries", assetType: "tokenized_fund" },
  { slug: "cbbtc", ticker: "cbBTC", name: "Coinbase Wrapped BTC", listedIssuer: "Coinbase", assetClass: "cryptocurrency", assetType: "wrapped_crypto" },
  { slug: "coinx", ticker: "COINx", name: "Coinbase xStock", listedIssuer: "Backed Assets", assetClass: "equity", assetType: "tokenized_equity" },
  { slug: "hype", ticker: "HYPE", name: "Hyperliquid", listedIssuer: "Hyperliquid", assetClass: "cryptocurrency", assetType: "native_crypto" },
  { slug: "jitosol", ticker: "jitoSOL", name: "Jito Staked SOL", listedIssuer: "Jito Foundation", assetClass: "onchain_yield", assetType: "defi_yield" },
  { slug: "jlp", ticker: "JLP", name: "Jupiter Perps Liquidity Provider", listedIssuer: "Jupiter", assetClass: "onchain_yield", assetType: "defi_yield" },
  {
    slug: "jtbil",
    ticker: "jtBIL",
    name: "Jito Short-Term T-Bill",
    listedIssuer: "Jito Foundation",
    assetClass: "treasuries",
    assetType: "tokenized_fund",
    reviewNote: "No official source found; the catalog entry appears to use generated data. May not be a real product.",
  },
  { slug: "jup", ticker: "JUP", name: "Jupiter", listedIssuer: "Jupiter", assetClass: "cryptocurrency", assetType: "native_crypto" },
  { slug: "ki-usdc", ticker: "kiUSDC", name: "Kamino Institutional USDC", listedIssuer: "Kamino Foundation", assetClass: "private_credit", assetType: "defi_yield" },
  { slug: "kmno", ticker: "KMNO", name: "Kamino", listedIssuer: "Kamino", assetClass: "cryptocurrency", assetType: "native_crypto" },
  { slug: "mon", ticker: "MON", name: "Monad", listedIssuer: "Monad Labs", assetClass: "cryptocurrency", assetType: "native_crypto" },
  { slug: "msol", ticker: "mSOL", name: "Marinade Staked SOL", listedIssuer: "Marinade", assetClass: "onchain_yield", assetType: "defi_yield" },
  { slug: "near", ticker: "NEAR", name: "Near Protocol", listedIssuer: "NEAR Foundation", assetClass: "cryptocurrency", assetType: "native_crypto" },
  { slug: "nvdax", ticker: "NVDAx", name: "NVIDIA xStock", listedIssuer: "Backed Assets", assetClass: "equity", assetType: "tokenized_equity" },
  { slug: "onyc", ticker: "ONyc", name: "OnRe Tokenized Reinsurance", listedIssuer: "OnRe", assetClass: "reinsurance", assetType: "tokenized_fund" },
  { slug: "ousg", ticker: "OUSG", name: "Ondo Short-Term US Government Bond Fund", listedIssuer: "Ondo I", assetClass: "treasuries", assetType: "tokenized_fund" },
  { slug: "prime", ticker: "PRIME", name: "PRIME", listedIssuer: "Hastra", assetClass: "private_credit", assetType: "tokenized_fund" },
  { slug: "spyx", ticker: "SPYx", name: "SP500 xStock", listedIssuer: "Backed Assets", assetClass: "equity", assetType: "tokenized_equity" },
  { slug: "susds", ticker: "sUSDS", name: "Savings USDS", listedIssuer: "Sky Protocol", assetClass: "onchain_yield", assetType: "defi_yield" },
  { slug: "maple-usdc", ticker: "syrupUSDC", name: "Syrup USDC", listedIssuer: "Maple Protocol Pool Operations", assetClass: "private_credit", assetType: "tokenized_fund" },
  { slug: "usdy", ticker: "USDY", name: "Ondo U.S. Dollar Yield", listedIssuer: "Ondo Stocks", assetClass: "treasuries", assetType: "tokenized_fund" },
  { slug: "usyc", ticker: "USYC", name: "Circle USYC", listedIssuer: "Circle International", assetClass: "treasuries", assetType: "tokenized_fund" },
  { slug: "xaum", ticker: "XAUm", name: "Matrixdock Gold", listedIssuer: "Matrixdock", assetClass: "commodities", assetType: "tokenized_commodity" },
  { slug: "tether-gold", ticker: "XAUT", name: "Tether Gold", listedIssuer: "TG Commodities, S.A. de C.V.", assetClass: "commodities", assetType: "tokenized_commodity" },
  { slug: "xbtc", ticker: "xBTC", name: "OKX Wrapped BTC (X Layer)", listedIssuer: "Okx", assetClass: "cryptocurrency", assetType: "wrapped_crypto" },
  { slug: "zec", ticker: "ZEC", name: "Zcash", listedIssuer: "Electric Coin Company", assetClass: "cryptocurrency", assetType: "native_crypto" },
];
