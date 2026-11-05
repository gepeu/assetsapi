import type { AssetType } from "./fields.ts";

export type AssetClass =
  | "equity"
  | "treasuries"
  | "private_credit"
  | "reinsurance"
  | "commodities"
  | "cryptocurrency"
  | "onchain_yield"
  | "stablecoin";

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
  { slug: "acred", ticker: "ACRED", name: "Apollo Diversified Credit Securitize Fund", listedIssuer: "Securitize Tokenized Apollo Diversified Credit Fund", assetClass: "private_credit", assetType: "tokenized_fund" },
  { slug: "auto", ticker: "AUTO", name: "AUTO", listedIssuer: "Hastra", assetClass: "private_credit", assetType: "tokenized_fund" },
  { slug: "buidl", ticker: "BUIDL", name: "BlackRock USD Institutional Digital Liquidity Fund", listedIssuer: "BlackRock USD Institutional Digital Liquidity Fund", assetClass: "treasuries", assetType: "tokenized_fund" },
  { slug: "coinx", ticker: "COINx", name: "Coinbase xStock", listedIssuer: "Backed Assets", assetClass: "equity", assetType: "tokenized_equity" },
  { slug: "near", ticker: "NEAR", name: "Near Protocol", listedIssuer: "NEAR Foundation", assetClass: "cryptocurrency", assetType: "native_crypto" },
  { slug: "nvdax", ticker: "NVDAx", name: "NVIDIA xStock", listedIssuer: "Backed Assets", assetClass: "equity", assetType: "tokenized_equity" },
  { slug: "onyc", ticker: "ONyc", name: "OnRe Tokenized Reinsurance", listedIssuer: "OnRe", assetClass: "reinsurance", assetType: "tokenized_fund" },
  { slug: "ousg", ticker: "OUSG", name: "Ondo Short-Term US Government Bond Fund", listedIssuer: "Ondo I", assetClass: "treasuries", assetType: "tokenized_fund" },
  { slug: "prime", ticker: "PRIME", name: "PRIME", listedIssuer: "Hastra", assetClass: "private_credit", assetType: "tokenized_fund" },
  { slug: "spyx", ticker: "SPYx", name: "SP500 xStock", listedIssuer: "Backed Assets", assetClass: "equity", assetType: "tokenized_equity" },
  { slug: "maple-usdc", ticker: "syrupUSDC", name: "Syrup USDC", listedIssuer: "Maple Protocol Pool Operations", assetClass: "private_credit", assetType: "tokenized_fund" },
  { slug: "usdy", ticker: "USDY", name: "Ondo U.S. Dollar Yield", listedIssuer: "Ondo Stocks", assetClass: "treasuries", assetType: "tokenized_fund" },
  { slug: "usyc", ticker: "USYC", name: "Circle USYC", listedIssuer: "Circle International", assetClass: "treasuries", assetType: "tokenized_fund" },
  { slug: "xaum", ticker: "XAUm", name: "Matrixdock Gold", listedIssuer: "Matrixdock", assetClass: "commodities", assetType: "tokenized_commodity" },
  { slug: "tether-gold", ticker: "XAUT", name: "Tether Gold", listedIssuer: "TG Commodities, S.A. de C.V.", assetClass: "commodities", assetType: "tokenized_commodity" },
  { slug: "ausd", ticker: "AUSD", name: "AUSD", listedIssuer: "Agora", assetClass: "stablecoin", assetType: "stablecoin" },
  { slug: "cash", ticker: "CASH", name: "CASH", listedIssuer: "Bridge", assetClass: "stablecoin", assetType: "stablecoin" },
  { slug: "crclx", ticker: "CRCLx", name: "CRCLx xStock", listedIssuer: "Backed Assets", assetClass: "equity", assetType: "tokenized_equity" },
  { slug: "eurc", ticker: "EURC", name: "EURC", listedIssuer: "Circle", assetClass: "stablecoin", assetType: "stablecoin" },
  { slug: "europ", ticker: "EUROP", name: "EURØP", listedIssuer: "Schuman Financial", assetClass: "stablecoin", assetType: "stablecoin" },
  { slug: "fdusd", ticker: "FDUSD", name: "First Digital USD", listedIssuer: "FD121 (BVI) Limited", assetClass: "stablecoin", assetType: "stablecoin" },
  { slug: "fwdi", ticker: "FWDI", name: "Forward Industries Inc.", listedIssuer: "Forward Industries", assetClass: "equity", assetType: "tokenized_equity" },
  { slug: "glxy", ticker: "GLXY", name: "Galaxy Digital Inc.", listedIssuer: "Galaxy Digital", assetClass: "equity", assetType: "tokenized_equity" },
  { slug: "googlx", ticker: "GOOGLx", name: "Alphabet xStock", listedIssuer: "Backed Assets", assetClass: "equity", assetType: "tokenized_equity" },
  { slug: "hoodx", ticker: "HOODx", name: "Robinhood xStock", listedIssuer: "Backed Assets", assetClass: "equity", assetType: "tokenized_equity" },
  { slug: "metax", ticker: "METAx", name: "Meta xStock", listedIssuer: "Backed Assets", assetClass: "equity", assetType: "tokenized_equity" },
  { slug: "mstrx", ticker: "MSTRx", name: "MicroStrategy xStock", listedIssuer: "Backed Assets", assetClass: "equity", assetType: "tokenized_equity" },
  { slug: "nbasis", ticker: "nBASIS", name: "Nest Basis Vault", listedIssuer: "Plume Vaults", assetClass: "onchain_yield", assetType: "tokenized_fund" },
  { slug: "nopal", ticker: "nOPAL", name: "Nest BlackOpal LiquidStone II Vault", listedIssuer: "Plume Vaults", assetClass: "private_credit", assetType: "tokenized_fund" },
  { slug: "otfy", ticker: "oTFY", name: "Obligate Trade Finance Yield", listedIssuer: "Verified SV", assetClass: "private_credit", assetType: "tokenized_fund" },
  { slug: "pst", ticker: "PST", name: "PayFi Strategy Token", listedIssuer: "Huma", assetClass: "private_credit", assetType: "tokenized_fund" },
  { slug: "pyusd", ticker: "PYUSD", name: "Paypal USD", listedIssuer: "Paxos", assetClass: "stablecoin", assetType: "stablecoin" },
  { slug: "qqqx", ticker: "QQQx", name: "Nasdaq xStock", listedIssuer: "Backed Assets", assetClass: "equity", assetType: "tokenized_equity" },
  { slug: "reusd", ticker: "reUSD", name: "reUSD", listedIssuer: "Resilience BVI Ltd.", assetClass: "reinsurance", assetType: "tokenized_fund" },
  { slug: "solmf-one", ticker: "solmF-One", name: "Midas solmF-One", listedIssuer: "Midas", assetClass: "private_credit", assetType: "tokenized_fund" },
  { slug: "strcx", ticker: "STRCx", name: "Strategy PP Variable xStock", listedIssuer: "Backed Assets", assetClass: "equity", assetType: "tokenized_equity" },
  { slug: "susde", ticker: "sUSDe", name: "Staked USDe", listedIssuer: "Ethena", assetClass: "onchain_yield", assetType: "defi_yield" },
  { slug: "tgbp", ticker: "tGBP", name: "Tokenised GBP", listedIssuer: "BCP Technologies", assetClass: "stablecoin", assetType: "stablecoin" },
  { slug: "tslax", ticker: "TSLAx", name: "Tesla xStock", listedIssuer: "Backed Assets", assetClass: "equity", assetType: "tokenized_equity" },
  { slug: "uscc", ticker: "USCC", name: "Bitwise Crypto Carry Fund", listedIssuer: "Superstate Asset Trust", assetClass: "onchain_yield", assetType: "tokenized_fund" },
  { slug: "usd1", ticker: "USD1", name: "USD1", listedIssuer: "BitGo", assetClass: "stablecoin", assetType: "stablecoin" },
  { slug: "usdc", ticker: "USDC", name: "USDC", listedIssuer: "Circle International", assetClass: "stablecoin", assetType: "stablecoin" },
  { slug: "usde", ticker: "USDe", name: "Ethena USDe", listedIssuer: "Ethena", assetClass: "stablecoin", assetType: "stablecoin" },
  { slug: "usdg", ticker: "USDG", name: "Global Dollar", listedIssuer: "Paxos Digital Singapore", assetClass: "stablecoin", assetType: "stablecoin" },
  { slug: "usds", ticker: "USDS", name: "USDS", listedIssuer: "Sky", assetClass: "stablecoin", assetType: "stablecoin" },
  { slug: "usdt", ticker: "USDT", name: "Tether USDt", listedIssuer: "Tether Holdings", assetClass: "stablecoin", assetType: "stablecoin" },
  { slug: "ustb", ticker: "USTB", name: "Invesco Short Duration US Government Securities Fund", listedIssuer: "Superstate Asset Trust", assetClass: "treasuries", assetType: "tokenized_fund" },
  { slug: "usx", ticker: "USX", name: "USX", listedIssuer: "USX Limited", assetClass: "stablecoin", assetType: "stablecoin" },
];
