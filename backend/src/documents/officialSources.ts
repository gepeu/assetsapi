/**
 * Curated by us: which links count as official for each asset. A source's list never decides
 * this. Official means published by the issuer or its named agents.
 */

export interface DomainRule {
  host: string;
  /** The URL's path must start with this. */
  pathPrefix?: string;
  /** The URL's path must not start with this. */
  excludePathPrefix?: string;
}

const XSTOCKS: readonly DomainRule[] = [
  { host: "assets.backed.fi" },
  { host: "docs.xstocks.fi" },
  { host: "documents.backed.fi" },
  { host: "xstocks.fi" },
  { host: "cdn.prod.website-files.com", pathPrefix: "/655f3efc4be468487052e35a" },
];
const SECURITIZE: readonly DomainRule[] = [{ host: "securitize.io", excludePathPrefix: "/learn" }];
const HASTRA: readonly DomainRule[] = [{ host: "hastra.io" }, { host: "help.hastra.io" }];
const ONDO: readonly DomainRule[] = [{ host: "ondo.finance" }, { host: "docs.ondo.finance" }];
const JUPITER: readonly DomainRule[] = [{ host: "jup.ag" }, { host: "developers.jup.ag" }];
const KAMINO: readonly DomainRule[] = [{ host: "kamino.com" }];

/** Keyed by our asset slug. */
export const OFFICIAL_DOMAINS: Readonly<Record<string, readonly DomainRule[]>> = {
  aaplx: XSTOCKS,
  coinx: XSTOCKS,
  nvdax: XSTOCKS,
  spyx: XSTOCKS,
  acred: SECURITIZE,
  buidl: SECURITIZE,
  auto: HASTRA,
  prime: HASTRA,
  "maple-usdc": [{ host: "docs.maple.finance" }, { host: "app.maple.finance" }],
  onyc: [{ host: "docs.onre.finance" }, { host: "onre.finance" }, { host: "app.onre.finance" }],
  ousg: ONDO,
  usdy: ONDO,
  susds: [{ host: "sky.money" }, { host: "developers.sky.money" }, { host: "docs.sky.money" }],
  "tether-gold": [{ host: "gold.tether.to" }],
  usyc: [{ host: "circle.com" }, { host: "help.circle.com" }],
  xaum: [{ host: "matrixdock.com" }],
  aave: [{ host: "aave.com" }],
  cbbtc: [{ host: "coinbase.com" }],
  hype: [{ host: "hyperliquid.xyz" }, { host: "hyperliquid.gitbook.io" }],
  jitosol: [{ host: "jito.network" }, { host: "go.jito.network" }],
  jlp: JUPITER,
  jup: JUPITER,
  "ki-usdc": KAMINO,
  kmno: KAMINO,
  mon: [{ host: "monad.xyz" }, { host: "docs.monad.xyz" }],
  msol: [{ host: "marinade.finance" }, { host: "docs.marinade.finance" }],
  near: [{ host: "near.org" }, { host: "docs.near.org" }],
  xbtc: [{ host: "okx.com" }],
  zec: [{ host: "z.cash" }, { host: "zcash.readthedocs.io" }],
  crclx: XSTOCKS,
  googlx: XSTOCKS,
  hoodx: XSTOCKS,
  metax: XSTOCKS,
  mstrx: XSTOCKS,
  qqqx: XSTOCKS,
  strcx: XSTOCKS,
  tslax: XSTOCKS,
  abbvx: XSTOCKS,
  abtx: XSTOCKS,
  acnx: XSTOCKS,
  ambrx: XSTOCKS,
  amznx: XSTOCKS,
  appx: XSTOCKS,
  avgox: XSTOCKS,
  aznx: XSTOCKS,
  bacx: XSTOCKS,
  "brk-bx": XSTOCKS,
  cmcsax: XSTOCKS,
  crmx: XSTOCKS,
  crwdx: XSTOCKS,
  cscox: XSTOCKS,
  cvxx: XSTOCKS,
  dfdvx: XSTOCKS,
  dhrx: XSTOCKS,
  gldx: XSTOCKS,
  gmex: XSTOCKS,
  gsx: XSTOCKS,
  hdx: XSTOCKS,
  honx: XSTOCKS,
  ibmx: XSTOCKS,
  intcx: XSTOCKS,
  jnjx: XSTOCKS,
  jpmx: XSTOCKS,
  kox: XSTOCKS,
  linx: XSTOCKS,
  llyx: XSTOCKS,
  max: XSTOCKS,
  mcdx: XSTOCKS,
  mdtx: XSTOCKS,
  mrkx: XSTOCKS,
  mrvlx: XSTOCKS,
  msftx: XSTOCKS,
  nflxx: XSTOCKS,
  nvox: XSTOCKS,
  orclx: XSTOCKS,
  pepx: XSTOCKS,
  pfex: XSTOCKS,
  pgx: XSTOCKS,
  pltrx: XSTOCKS,
  pmx: XSTOCKS,
  tmox: XSTOCKS,
  tonxx: XSTOCKS,
  tqqqx: XSTOCKS,
  unhx: XSTOCKS,
  vtix: XSTOCKS,
  vx: XSTOCKS,
  wmtx: XSTOCKS,
  xomx: XSTOCKS,
  // Found by web research on 2026-11-04. Shared hosts are limited to the issuer's own paths.
  ausd: [{ host: "agora.finance" }, { host: "static.agora.finance" }, { host: "docs.agora.finance" }, { host: "developer.agora.finance" }, { host: "files.buildwithfern.com", pathPrefix: "/agora.docs.buildwithfern.com" }],
  cash: [{ host: "usecash.xyz" }, { host: "reserves.bridge.xyz", pathPrefix: "/cash" }, { host: "bridge.xyz", pathPrefix: "/legal" }, { host: "apidocs.bridge.xyz", pathPrefix: "/platform/issuance" }],
  eurc: [{ host: "circle.com" }, { host: "developers.circle.com" }, { host: "6778953.fs1.hubspotusercontent-na1.net", pathPrefix: "/hubfs/6778953" }],
  europ: [{ host: "schuman.io", excludePathPrefix: "/blog" }],
  fdusd: [{ host: "firstdigitallabs.com", excludePathPrefix: "/news-and-insights" }],
  fwdi: [{ host: "forwardindustries.com" }, { host: "sec.gov", pathPrefix: "/Archives/edgar/data/38264" }, { host: "framerusercontent.com", pathPrefix: "/assets/TcbjmDJzSxCqdOwGP0Nbxz6hvY.pdf" }, { host: "superstate.com", pathPrefix: "/assets/fwdi" }, { host: "docs.superstate.com" }],
  glxy: [{ host: "sec.gov", pathPrefix: "/Archives/edgar/data/1859392" }, { host: "investor.galaxy.com" }, { host: "galaxy.com", excludePathPrefix: "/newsroom" }, { host: "superstate.com", pathPrefix: "/assets/glxy" }, { host: "docs.superstate.com" }],
  nbasis: [{ host: "app.nest.credit" }, { host: "docs.nest.credit" }, { host: "nest.credit" }, { host: "raw.githubusercontent.com", pathPrefix: "/plumenetwork/nest-protocol/" }],
  nopal: [{ host: "app.nest.credit" }, { host: "docs.nest.credit" }, { host: "nest.credit" }, { host: "raw.githubusercontent.com", pathPrefix: "/plumenetwork/nest-protocol/" }, { host: "blackopal.finance" }],
  otfy: [{ host: "obligate.com" }, { host: "docs.obligate.com" }, { host: "app.obligate.com", pathPrefix: "/etracker/3cef0789-88b8-4374-b818-73f9fed942af" }, { host: "dwbewdikbt7cmt5fhorm5u7bi5ejtdfd4upadxnxchkub2qynh2q.arweave.net" }],
  pst: [{ host: "huma.finance" }, { host: "docs.huma.finance" }, { host: "huma.accountable.capital" }],
  pyusd: [{ host: "paxos.com" }, { host: "docs.paxos.com" }, { host: "paypal.com", pathPrefix: "/us/digital-wallet/manage-money/crypto/pyusd" }, { host: "paypal.com", pathPrefix: "/us/legalhub/paypal/cryptocurrencies-tnc" }, { host: "framerusercontent.com", pathPrefix: "/assets/UZ8Eke3FvB5npXyceLEmiLRV6k.pdf" }],
  reusd: [{ host: "re.xyz" }, { host: "docs.re.xyz" }, { host: "app.re.xyz" }, { host: "storage.googleapis.com", pathPrefix: "/re-files-production/docs" }, { host: "storage.googleapis.com", pathPrefix: "/foundation-files/AUP-Report-2025.pdf" }],
  "solmf-one": [{ host: "midas.app" }, { host: "docs.midas.app" }, { host: "mfsa.mt", pathPrefix: "/wp-content/uploads/2026/07/Midas-Software-GmbH" }, { host: "mfsa.mt", pathPrefix: "/wp-content/uploads/2025/08/Midas-Software-GmbH" }],
  susde: [{ host: "ethena.fi", excludePathPrefix: "/blog" }, { host: "docs.ethena.fi" }, { host: "app.ethena.fi", pathPrefix: "/dashboards" }],
  tgbp: [{ host: "tokenisedgbp.com", excludePathPrefix: "/news" }],
  uscc: [{ host: "superstate.com" }, { host: "superstate.co" }, { host: "docs.superstate.com" }, { host: "docs.superstate.co" }, { host: "bitwiseinvestments.com", pathPrefix: "/crypto-funds/uscc" }, { host: "bitwise-materials.s3.us-east-1.amazonaws.com", pathPrefix: "/public/fact-sheets" }, { host: "sec.gov", pathPrefix: "/Archives/edgar/data/2030263" }],
  usd1: [{ host: "worldlibertyfinancial.com" }, { host: "docs.worldlibertyfinancial.com" }, { host: "por.worldlibertyfinancial.com" }, { host: "bitgo.com", pathPrefix: "/usd1" }, { host: "landing.bitgo.com", pathPrefix: "/rs/552-OGK-141/images/USD1" }],
  usdc: [{ host: "circle.com" }, { host: "developers.circle.com" }, { host: "investor.circle.com", pathPrefix: "/financials/sec-filings" }, { host: "6778953.fs1.hubspotusercontent-na1.net", pathPrefix: "/hubfs/6778953" }],
  usde: [{ host: "ethena.fi", excludePathPrefix: "/blog" }, { host: "docs.ethena.fi" }, { host: "app.ethena.fi", pathPrefix: "/dashboards" }],
  usdg: [{ host: "globaldollar.com" }, { host: "paxos.com" }, { host: "docs.paxos.com" }, { host: "framerusercontent.com", pathPrefix: "/assets/SKxHUTNlo82s3Rrqw0ZL09z2vc.pdf" }],
  usds: [{ host: "sky.money", excludePathPrefix: "/blog" }, { host: "docs.sky.money", pathPrefix: "/legal" }, { host: "developers.skyeco.com" }, { host: "financial.skyeco.com" }, { host: "insights.skyeco.com", pathPrefix: "/sky-documentation" }],
  usdt: [{ host: "tether.to" }, { host: "assets.ctfassets.net", pathPrefix: "/vyse88cgwfbl" }],
  ustb: [{ host: "superstate.com" }, { host: "superstate.co" }, { host: "docs.superstate.com" }, { host: "docs.superstate.co" }, { host: "invesco.com", pathPrefix: "/us/en/institutional/strategies/money-market-and-liquidity/ustb" }, { host: "sec.gov", pathPrefix: "/Archives/edgar/data/2004367" }],
  usx: [{ host: "solstice.finance", excludePathPrefix: "/blog" }, { host: "docs.solstice.finance" }, { host: "attestation.solstice.finance" }],
  // Found by web research on 2026-11-05.
  euroe: [{ host: "paxos.com", pathPrefix: "/euroe-redemptions" }],
  frxusd: [{ host: "docs.frax.com" }, { host: "gov.frax.finance", pathPrefix: "/t/fip-43" }],
  gold: [{ host: "app.oro.finance", pathPrefix: "/terms-and-conditions" }, { host: "oro.finance", excludePathPrefix: "/blog" }, { host: "framerusercontent.com", pathPrefix: "/assets/1HclHdjMZkdWc7ZVGn2zXBSyJlk.pdf" }, { host: "framerusercontent.com", pathPrefix: "/assets/yEgaC3WZqCRAihdZrJQdC7v4osM.pdf" }, { host: "framerusercontent.com", pathPrefix: "/assets/g66PT6wYPfXDgia8HSaf53NK8A.pdf" }, { host: "framerusercontent.com", pathPrefix: "/assets/ZEedomZb5wkZIjpVWn4A9xFXYU.pdf" }, { host: "framerusercontent.com", pathPrefix: "/assets/teK6soTExAlabg5EVFNra0gKs.pdf" }],
  jupusd: [{ host: "docs.jup.ag", pathPrefix: "/user-docs/earn/jupusd" }, { host: "developers.jup.ag", pathPrefix: "/docs/jupusd" }, { host: "developers.jup.ag", pathPrefix: "/docs/legal" }, { host: "jupusd.money" }],
  paxg: [{ host: "paxos.com", pathPrefix: "/assets/paxg" }, { host: "paxos.com", pathPrefix: "/transparency/paxg" }, { host: "paxos.com", pathPrefix: "/terms-and-conditions" }, { host: "paxos.com", pathPrefix: "/paxg-whitepaper.pdf" }, { host: "paxos.com", pathPrefix: "/paxg-1pager-2026.pdf" }, { host: "docs.paxos.com", pathPrefix: "/guides/stablecoin/paxg" }, { host: "framerusercontent.com", pathPrefix: "/assets/uwWybrLRlgkC4vexP3yLyrQVeV0.pdf" }],
  "usd-infra": [{ host: "infrastructure.finance", excludePathPrefix: "/blog" }, { host: "docs.infrastructure.finance" }],
  usdu: [{ host: "docs.unitas.so" }, { host: "3644036359-files.gitbook.io", pathPrefix: "/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fmana7uG6HDPiM9nYjFQg" }],
  vchf: [{ host: "vnx.io", excludePathPrefix: "/blog" }, { host: "vnx.gitbook.io", pathPrefix: "/vnx-global" }, { host: "prod-global-terms.s3.sa-east-1.amazonaws.com", pathPrefix: "/VNX-Global-Terms.pdf" }, { host: "vnx.li", excludePathPrefix: "/blog" }],
  vnxau: [{ host: "vnx.li", excludePathPrefix: "/blog" }, { host: "vnx.io", excludePathPrefix: "/blog" }],
  dejaaa: [{ host: "anemoy.io", excludePathPrefix: "/news" }, { host: "ipfs.centrifuge.io", pathPrefix: "/ipfs/QmaPbC3Pw3Rbnr3nXv1TUfgdtANUpdZRVVzAeTx72wWR8U" }, { host: "gov.centrifuge.io", pathPrefix: "/t/cp158-" }],
  dejtrsy: [{ host: "anemoy.io", excludePathPrefix: "/news" }, { host: "gov.centrifuge.io", pathPrefix: "/t/cp143-" }],
  hyusd: [{ host: "docs.hylo.so" }, { host: "hylo-audits.s3.us-east-2.amazonaws.com", pathPrefix: "/OtterSec-Exchange-Stability-Pool-20250513.pdf" }, { host: "hylo-audits.s3.us-east-2.amazonaws.com", pathPrefix: "/Accretion-Hylo-Dec2025.pdf" }, { host: "hylo-audits.s3.us-east-2.amazonaws.com", pathPrefix: "/Accretion-HyloV2-July2026.pdf" }],
};

/** Useful as references but never official. Kept as links and not downloaded. */
const REFERENCE_HOSTS: ReadonlySet<string> = new Set([
  "eur-lex.europa.eu",
  "esma.europa.eu",
  "bvifsc.vg",
  "bma.bm",
]);

/** Press and blog pieces aren't official, even on an issuer's own domain. */
const EDITORIAL_PATH = /^\/(blog|press|pressroom|news|newsroom|media)(\/|$)/i;

export function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export type LinkClassification =
  | { kind: "official" }
  | { kind: "reference" }
  | { kind: "excluded"; reason: string };

export function classifyLink(assetSlug: string, url: string): LinkClassification {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "excluded", reason: "Invalid URL" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { kind: "excluded", reason: `Not http(s): ${parsed.protocol}` };
  }

  const host = normalizeHost(parsed.hostname);
  if (REFERENCE_HOSTS.has(host)) return { kind: "reference" };

  const rules = OFFICIAL_DOMAINS[assetSlug] ?? [];
  const onDomain = rules.filter((rule) => rule.host === host);
  if (onDomain.length === 0) {
    return { kind: "excluded", reason: "Domain isn't on this asset's allowlist" };
  }
  const allowed = onDomain.some(
    (rule) =>
      (!rule.pathPrefix || parsed.pathname.startsWith(rule.pathPrefix)) &&
      (!rule.excludePathPrefix || !parsed.pathname.startsWith(rule.excludePathPrefix)),
  );
  if (!allowed) return { kind: "excluded", reason: "Path isn't allowed on this domain" };
  if (EDITORIAL_PATH.test(parsed.pathname)) return { kind: "excluded", reason: "Press or blog piece" };
  return { kind: "official" };
}

/** Redirects may move between an asset's official domains, but not leave them. */
export function isHostOfficialForAny(assetSlugs: readonly string[], hostname: string): boolean {
  const host = normalizeHost(hostname);
  return assetSlugs.some((slug) => (OFFICIAL_DOMAINS[slug] ?? []).some((rule) => rule.host === host));
}

export type DocumentCategory =
  | "website"
  | "docs"
  | "legal"
  | "terms"
  | "prospectus"
  | "fact_sheet"
  | "attestation"
  | "audit"
  | "transparency"
  | "guide"
  | "other";

const KAMINO_CATEGORIES: Readonly<Record<string, DocumentCategory>> = {
  Website: "website",
  Docs: "docs",
  Guide: "guide",
  Legal: "legal",
  Terms: "terms",
  Prospectus: "prospectus",
  "Fact sheet": "fact_sheet",
  Attestation: "attestation",
  Audit: "audit",
  Transparency: "transparency",
};

export function categoryFromKamino(label: string): DocumentCategory {
  return KAMINO_CATEGORIES[label] ?? "other";
}

export interface CandidateDocument {
  assetSlug: string;
  url: string;
  title: string;
  category: DocumentCategory;
}

/** Every xStock shares these, plus its own factsheet and product page. */
const XSTOCK_SHARED_DOCUMENTS: readonly Omit<CandidateDocument, "assetSlug">[] = [
  { url: "https://docs.xstocks.fi/docs/dividends-and-stock-splits", title: "Dividends and Stock Splits", category: "guide" },
  { url: "https://docs.xstocks.fi/docs/frequently-asked-questions", title: "Frequently Asked Questions | xStocks Docs", category: "guide" },
  { url: "https://docs.xstocks.fi/docs/issuance-and-redemption", title: "Issuance and Redemption | xStocks Docs", category: "guide" },
  { url: "https://docs.xstocks.fi/docs/issuance-and-redemption/market-flow", title: "Market Flow | xStocks Docs", category: "guide" },
  { url: "https://assets.backed.fi/legal-documentation/issuer", title: "Issuer Documentation - Backed Assets", category: "legal" },
  { url: "https://assets.backed.fi/legal-documentation/restricted-countries", title: "Access Restricted - Backed Assets", category: "legal" },
  { url: "https://assets.backed.fi/legal-documentation/service-providers", title: "Service Providers - Backed Assets", category: "legal" },
  { url: "https://docs.xstocks.fi/docs/product-legal-overview", title: "Product Legal Overview | xStocks Docs", category: "legal" },
  { url: "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a7484f8befacf2551503fd2_20260728%20Backed%20Assets%20(JE)%20Limited%20First%20Supplement.pdf", title: "Backed Assets - First Supplement Base Prospectus 20260727_clean.pdf", category: "prospectus" },
  { url: "https://cdn.prod.website-files.com/655f3efc4be468487052e35a/6a748b81c9b1aca19a11c102_Backed_Assets_Base%20Prospectus_20260727.pdf", title: "Base Prospectus According to Art. 6 Para. 3 Sub-Para. 2 of the Regulation (EU) 2017/1129 of the European Parliament and", category: "prospectus" },
  { url: "https://xstocks.fi/", title: "xStocks - Tokenized Equities", category: "website" },
  { url: "https://xstocks.fi/products", title: "xStocks Products - NVIDIA, Tesla, SPY & Leading Tokenized U.S. Equities", category: "website" },
];

const XSTOCK_DOCUMENTS: readonly CandidateDocument[] = [
  { slug: "crclx", ticker: "CRCLx", product: "circle-xstock", name: "Circle" },
  { slug: "googlx", ticker: "GOOGLx", product: "alphabet-xstock", name: "Alphabet" },
  { slug: "hoodx", ticker: "HOODx", product: "robinhood-xstock", name: "Robinhood" },
  { slug: "metax", ticker: "METAx", product: "meta-xstock", name: "Meta" },
  { slug: "mstrx", ticker: "MSTRx", product: "microstrategy-xstock", name: "MicroStrategy" },
  { slug: "qqqx", ticker: "QQQx", product: "nasdaq-xstock", name: "Nasdaq" },
  { slug: "strcx", ticker: "STRCx", product: "strategy-pp-variable-xstock", name: "Strategy PP Variable" },
  { slug: "tslax", ticker: "TSLAx", product: "tesla-xstock", name: "Tesla" },
  { slug: "abbvx", ticker: "ABBVx", product: "abbvie-xstock", name: "AbbVie" },
  { slug: "abtx", ticker: "ABTx", product: "abbott-xstock", name: "Abbott" },
  { slug: "acnx", ticker: "ACNx", product: "accenture-xstock", name: "Accenture" },
  { slug: "ambrx", ticker: "AMBRx", product: "amber-xstock", name: "AMBRx" },
  { slug: "amznx", ticker: "AMZNx", product: "amazon-xstock", name: "Amazon" },
  { slug: "appx", ticker: "APPx", product: "applovin-xstock", name: "AppLovin" },
  { slug: "avgox", ticker: "AVGOx", product: "broadcom-xstock", name: "Broadcom" },
  { slug: "aznx", ticker: "AZNx", product: "astrazeneca-xstock", name: "AstraZeneca" },
  { slug: "bacx", ticker: "BACx", product: "bank-of-america-xstock", name: "Bank of America" },
  { slug: "brk-bx", ticker: "BRK.Bx", product: "berkshire-hathaway-xstock", name: "Berkshire Hathaway" },
  { slug: "cmcsax", ticker: "CMCSAx", product: "comcast-xstock", name: "Comcast" },
  { slug: "crmx", ticker: "CRMx", product: "salesforce-xstock", name: "Salesforce" },
  { slug: "crwdx", ticker: "CRWDx", product: "crowdstrike-xstock", name: "CrowdStrike" },
  { slug: "cscox", ticker: "CSCOx", product: "cisco-xstock", name: "Cisco" },
  { slug: "cvxx", ticker: "CVXx", product: "chevron-xstock", name: "Chevron" },
  { slug: "dfdvx", ticker: "DFDVx", product: "dfdv-xstock", name: "DFDV" },
  { slug: "dhrx", ticker: "DHRx", product: "danaher-xstock", name: "Danaher" },
  { slug: "gldx", ticker: "GLDx", product: "gold-xstock", name: "Gold" },
  { slug: "gmex", ticker: "GMEx", product: "gamestop-xstock", name: "Gamestop" },
  { slug: "gsx", ticker: "GSx", product: "goldman-sachs-xstock", name: "Goldman Sachs" },
  { slug: "hdx", ticker: "HDx", product: "home-depot-xstock", name: "Home Depot" },
  { slug: "honx", ticker: "HONx", product: "honeywell-xstock", name: "Honeywell" },
  { slug: "ibmx", ticker: "IBMx", product: "international-business-machines-xstock", name: "International Business Machines" },
  { slug: "intcx", ticker: "INTCx", product: "intel-xstock", name: "Intel" },
  { slug: "jnjx", ticker: "JNJx", product: "johnson-johnson-xstock", name: "Johnson & Johnson" },
  { slug: "jpmx", ticker: "JPMx", product: "jpmorgan-chase-xstock", name: "JPMorgan Chase" },
  { slug: "kox", ticker: "KOx", product: "coca-cola-xstock", name: "Coca-Cola" },
  { slug: "linx", ticker: "LINx", product: "linde-xstock", name: "Linde" },
  { slug: "llyx", ticker: "LLYx", product: "eli-lilly-xstock", name: "Eli Lilly" },
  { slug: "max", ticker: "MAx", product: "mastercard-xstock", name: "Mastercard" },
  { slug: "mcdx", ticker: "MCDx", product: "mcdonalds-xstock", name: "McDonald's" },
  { slug: "mdtx", ticker: "MDTx", product: "medtronic-xstock", name: "Medtronic" },
  { slug: "mrkx", ticker: "MRKx", product: "merck-xstock", name: "Merck" },
  { slug: "mrvlx", ticker: "MRVLx", product: "marvell-xstock", name: "Marvell" },
  { slug: "msftx", ticker: "MSFTx", product: "microsoft-xstock", name: "Microsoft" },
  { slug: "nflxx", ticker: "NFLXx", product: "netflix-xstock", name: "Netflix" },
  { slug: "nvox", ticker: "NVOx", product: "novo-nordisk-xstock", name: "Novo Nordisk" },
  { slug: "orclx", ticker: "ORCLx", product: "oracle-xstock", name: "Oracle" },
  { slug: "pepx", ticker: "PEPx", product: "pepsico-xstock", name: "PepsiCo" },
  { slug: "pfex", ticker: "PFEx", product: "pfizer-xstock", name: "Pfizer" },
  { slug: "pgx", ticker: "PGx", product: "procter-gamble-xstock", name: "Procter & Gamble" },
  { slug: "pltrx", ticker: "PLTRx", product: "palantir-xstock", name: "Palantir" },
  { slug: "pmx", ticker: "PMx", product: "philip-morris-xstock", name: "Philip Morris" },
  { slug: "tmox", ticker: "TMOx", product: "thermo-fisher-xstock", name: "Thermo Fisher" },
  { slug: "tonxx", ticker: "TONXx", product: "ton-xstock", name: "TON" },
  { slug: "tqqqx", ticker: "TQQQx", product: "tqqq-xstock", name: "TQQQ" },
  { slug: "unhx", ticker: "UNHx", product: "unitedhealth-xstock", name: "UnitedHealth" },
  { slug: "vtix", ticker: "VTIx", product: "vanguard-xstock", name: "Vanguard" },
  { slug: "vx", ticker: "Vx", product: "visa-xstock", name: "Visa" },
  { slug: "wmtx", ticker: "WMTx", product: "walmart-xstock", name: "Walmart" },
  { slug: "xomx", ticker: "XOMx", product: "exxon-mobil-xstock", name: "Exxon Mobil" },
].flatMap(({ slug, ticker, product, name }): CandidateDocument[] => [
  ...XSTOCK_SHARED_DOCUMENTS.map((document) => ({ ...document, assetSlug: slug })),
  {
    assetSlug: slug,
    url: `https://documents.backed.fi/backed-assets-factsheet-${ticker}.pdf`,
    title: `Backed Assets - Factsheet ${ticker}`,
    category: "fact_sheet",
  },
  {
    assetSlug: slug,
    url: `https://assets.backed.fi/products/${product}`,
    title: `${name} xStock product page`,
    category: "website",
  },
]);

/** Links for assets with none in the Kamino bundle. All are rechecked when loaded. */
export const CANDIDATE_DOCUMENTS: readonly CandidateDocument[] = [
  ...XSTOCK_DOCUMENTS,
  // Found by web research on 2026-11-04.
  { assetSlug: "ausd", url: "https://www.agora.finance/product/ausd", title: "AUSD product page", category: "website" },
  { assetSlug: "ausd", url: "https://static.agora.finance/termsofuse.pdf", title: "Agora Terms of Use", category: "terms" },
  { assetSlug: "ausd", url: "https://static.agora.finance/riskdisclosures.pdf", title: "Agora Risk Disclosures", category: "legal" },
  { assetSlug: "ausd", url: "https://docs.agora.finance/developer/transparency", title: "AUSD Transparency: monthly reserve reports", category: "transparency" },
  { assetSlug: "ausd", url: "https://docs.agora.finance/_fern-files/agora.docs.buildwithfern.com/03ab55af3875dc0420487b38025944f2b379390770d4403b5ea987dec7b5e412/docs/assets/2026%20Sep%20-%20Agora%20Dollar%20Reserve%20Report.pdf", title: "Agora Dollar Reserve Report, September 2026", category: "attestation" },
  { assetSlug: "ausd", url: "https://docs.agora.finance/developer", title: "Agora developer documentation", category: "docs" },
  { assetSlug: "cash", url: "https://bridge.xyz/legal/bridge-stablecoin-terms/bridge-building-inc", title: "Bridge Building Inc Stablecoin Terms", category: "terms" },
  { assetSlug: "cash", url: "https://reserves.bridge.xyz/cash", title: "CASH reserves transparency page", category: "transparency" },
  { assetSlug: "cash", url: "https://apidocs.bridge.xyz/platform/issuance/reporting-and-transparency", title: "Bridge issuance: Reporting and Transparency", category: "docs" },
  { assetSlug: "cash", url: "https://www.usecash.xyz/", title: "CASH website", category: "website" },
  { assetSlug: "eurc", url: "https://www.circle.com/eurc", title: "EURC product page", category: "website" },
  { assetSlug: "eurc", url: "https://www.circle.com/legal/eurc-terms", title: "EURC Terms", category: "terms" },
  { assetSlug: "eurc", url: "https://www.circle.com/legal/mica-eurc-whitepaper", title: "EURC MiCA White Paper", category: "prospectus" },
  { assetSlug: "eurc", url: "https://www.circle.com/legal/mica-redemption-policy", title: "MiCA Redemption Policy", category: "legal" },
  { assetSlug: "eurc", url: "https://www.circle.com/transparency", title: "Circle Transparency (USDC and EURC reserves, all attestations)", category: "transparency" },
  { assetSlug: "eurc", url: "https://6778953.fs1.hubspotusercontent-na1.net/hubfs/6778953/EURC%20Attestations/2026%20EURC_Examination%20Report%20September%2026.pdf", title: "EURC Examination Report, September 2026", category: "attestation" },
  { assetSlug: "eurc", url: "https://6778953.fs1.hubspotusercontent-na1.net/hubfs/6778953/Circle-EURC_Overview.pdf", title: "EURC overview", category: "fact_sheet" },
  { assetSlug: "eurc", url: "https://developers.circle.com/stablecoins/what-is-eurc", title: "EURC developer documentation", category: "docs" },
  { assetSlug: "europ", url: "https://schuman.io/wp-content/uploads/EUROP-White-Paper.pdf", title: "EURØP MiCA White Paper v1.7 (notified to ACPR, amended 23 March 2026)", category: "prospectus" },
  { assetSlug: "europ", url: "https://schuman.io/wp-content/uploads/2026.06.03%20A%20EUROP%20T%26Cs%20v1.1.pdf", title: "EURØP Terms & Conditions v1.1", category: "terms" },
  { assetSlug: "europ", url: "https://schuman.io/wp-content/uploads/2026.06.03%20B%20Platform%20T%26Cs%20v1.1.pdf", title: "Schuman Platform Terms & Conditions v1.1", category: "terms" },
  { assetSlug: "europ", url: "https://schuman.io/wp-content/uploads/2025/10/2024.12.31-Salvus-Rapport_Commissiaires_Comptes-Dry-1-1.pdf", title: "Salvus S.A.S. statutory auditor report (KPMG), FY ending 31 Dec 2024 (French)", category: "audit" },
  { assetSlug: "europ", url: "https://schuman.io/legal-center/", title: "Schuman Legal Center", category: "legal" },
  { assetSlug: "europ", url: "https://schuman.io/smart-contracts/", title: "EURØP smart contracts", category: "docs" },
  { assetSlug: "europ", url: "https://schuman.io/europ/", title: "EURØP product page", category: "website" },
  { assetSlug: "fdusd", url: "https://www.firstdigitallabs.com/legal/fdd-terms", title: "FDD Terms (FD121 (BVI) Limited)", category: "terms" },
  { assetSlug: "fdusd", url: "https://www.firstdigitallabs.com/legal/fd121-account-user-agreement", title: "FD121 Account User Agreement", category: "legal" },
  { assetSlug: "fdusd", url: "https://www.firstdigitallabs.com/legal", title: "Legal & Privacy hub", category: "legal" },
  { assetSlug: "fdusd", url: "https://www.firstdigitallabs.com/transparency", title: "Transparency: reserves and attestation reports", category: "transparency" },
  { assetSlug: "fdusd", url: "https://www.firstdigitallabs.com/fdusd", title: "FDUSD product page (reserve reports, contract audit links)", category: "website" },
  { assetSlug: "fwdi", url: "https://www.sec.gov/Archives/edgar/data/38264/000168316825009068/forward_i10k-093025.htm", title: "Form 10-K for fiscal year ended 2025-09-30, including tokenized share risk factors", category: "legal" },
  { assetSlug: "fwdi", url: "https://www.sec.gov/Archives/edgar/data/38264/000168316826006270/forward_i10q-063026.htm", title: "Form 10-Q for quarter ended 2026-06-30", category: "legal" },
  { assetSlug: "fwdi", url: "https://www.sec.gov/Archives/edgar/data/38264/000168316825007043/forward_s3asr.htm", title: "Form S-3ASR shelf registration, September 2025", category: "prospectus" },
  { assetSlug: "fwdi", url: "https://www.sec.gov/Archives/edgar/data/38264/000168316826007369/forward_424b5.htm", title: "Form 424B5 prospectus supplement, September 2026", category: "prospectus" },
  { assetSlug: "fwdi", url: "https://forwardindustries.com/investors", title: "Forward Industries investor relations", category: "website" },
  { assetSlug: "fwdi", url: "https://forwardindustries.com/sec-filings", title: "Forward Industries SEC filings page", category: "website" },
  { assetSlug: "fwdi", url: "https://framerusercontent.com/assets/TcbjmDJzSxCqdOwGP0Nbxz6hvY.pdf", title: "Forward Industries investor presentation, October 2026", category: "other" },
  { assetSlug: "fwdi", url: "https://superstate.com/assets/fwdi", title: "Superstate FWDI tokenized share page", category: "website" },
  { assetSlug: "fwdi", url: "https://docs.superstate.com/investors/tokenized-equities", title: "Superstate Opening Bell tokenized equities documentation", category: "docs" },
  { assetSlug: "glxy", url: "https://www.sec.gov/Archives/edgar/data/1859392/000185939226000016/glxy-20251231.htm", title: "Form 10-K for fiscal year 2025, including Tokenized GLXY", category: "legal" },
  { assetSlug: "glxy", url: "https://www.sec.gov/Archives/edgar/data/1859392/000185939226000041/glxy2025arsfinal.pdf", title: "2025 Annual Report to shareholders", category: "legal" },
  { assetSlug: "glxy", url: "https://www.sec.gov/Archives/edgar/data/1859392/000185939226000091/glxy-20260630.htm", title: "Form 10-Q for quarter ended 2026-06-30, including tokenization risk factor", category: "legal" },
  { assetSlug: "glxy", url: "https://www.sec.gov/Archives/edgar/data/1859392/000162828026032988/galaxy-sx3asr.htm", title: "Form S-3ASR, May 2026, describing natively tokenized Class A common stock", category: "prospectus" },
  { assetSlug: "glxy", url: "https://investor.galaxy.com/", title: "Galaxy investor relations", category: "website" },
  { assetSlug: "glxy", url: "https://superstate.com/assets/glxy", title: "Superstate GLXY tokenized share page", category: "website" },
  { assetSlug: "glxy", url: "https://docs.superstate.com/investors/tokenized-equities", title: "Superstate Opening Bell tokenized equities documentation", category: "docs" },
  { assetSlug: "nbasis", url: "https://app.nest.credit/vaults/nest-basis-vault", title: "Nest Basis vault page", category: "website" },
  { assetSlug: "nbasis", url: "https://docs.nest.credit/security-and-compliance/terms-and-conditions", title: "Nest Terms and Conditions (Nest DAO LLC)", category: "terms" },
  { assetSlug: "nbasis", url: "https://docs.nest.credit/about/vault-operations-and-valuation", title: "Vault Operations and Valuation", category: "docs" },
  { assetSlug: "nbasis", url: "https://docs.nest.credit/about/liquidity-and-redemptions", title: "Liquidity and Redemptions", category: "docs" },
  { assetSlug: "nbasis", url: "https://docs.nest.credit/security-and-compliance/flow-of-funds", title: "Flow of Funds", category: "docs" },
  { assetSlug: "nbasis", url: "https://docs.nest.credit/security-and-compliance/audits", title: "Audits and risk assessments", category: "audit" },
  { assetSlug: "nbasis", url: "https://raw.githubusercontent.com/plumenetwork/nest-protocol/main/audits/report_cantinacode_plume_2608.pdf", title: "Cantina audit of Nest compliance and cross-chain updates, September 2026", category: "audit" },
  { assetSlug: "nopal", url: "https://app.nest.credit/vaults/nest-opal-vault", title: "BlackOpal LiquidStone II vault page", category: "website" },
  { assetSlug: "nopal", url: "https://docs.nest.credit/security-and-compliance/terms-and-conditions", title: "Nest Terms and Conditions (Nest DAO LLC)", category: "terms" },
  { assetSlug: "nopal", url: "https://docs.nest.credit/about/vault-operations-and-valuation", title: "Vault Operations and Valuation", category: "docs" },
  { assetSlug: "nopal", url: "https://docs.nest.credit/about/liquidity-and-redemptions", title: "Liquidity and Redemptions", category: "docs" },
  { assetSlug: "nopal", url: "https://docs.nest.credit/security-and-compliance/flow-of-funds", title: "Flow of Funds", category: "docs" },
  { assetSlug: "nopal", url: "https://docs.nest.credit/security-and-compliance/audits", title: "Audits and risk assessments", category: "audit" },
  { assetSlug: "nopal", url: "https://raw.githubusercontent.com/plumenetwork/nest-protocol/main/audits/report_cantinacode_plume_2608.pdf", title: "Cantina audit of Nest compliance and cross-chain updates, September 2026", category: "audit" },
  { assetSlug: "nopal", url: "https://www.blackopal.finance/", title: "BlackOpal website (LiquidStone II underlying)", category: "website" },
  { assetSlug: "otfy", url: "https://dwbewdikbt7cmt5fhorm5u7bi5ejtdfd4upadxnxchkub2qynh2q.arweave.net/HYJLDQoM_iZPpTuiztPhR0iZjKPlHgHdtxHVQOoYafU", title: "oTFY eTracker Offering Memorandum V1.0", category: "prospectus" },
  { assetSlug: "otfy", url: "https://www.obligate.com/otfy", title: "oTFY product page", category: "website" },
  { assetSlug: "otfy", url: "https://docs.obligate.com/obligate/etracker-protocol", title: "eTracker Protocol, including oTFY", category: "docs" },
  { assetSlug: "otfy", url: "https://docs.obligate.com/obligate/risks", title: "Risks", category: "docs" },
  { assetSlug: "otfy", url: "https://docs.obligate.com/obligate/legal-and-regulatory-framework", title: "Legal and Regulatory Framework", category: "legal" },
  { assetSlug: "otfy", url: "https://docs.obligate.com/legal/general-terms-of-use", title: "General Terms of Use, version 3.1", category: "terms" },
  { assetSlug: "otfy", url: "https://docs.obligate.com/legal/legal-and-regulatory-notices", title: "Legal and Regulatory Notices, version 1.2", category: "legal" },
  { assetSlug: "otfy", url: "https://app.obligate.com/etracker/3cef0789-88b8-4374-b818-73f9fed942af", title: "oTFY live performance dashboard", category: "transparency" },
  { assetSlug: "pst", url: "https://huma.finance/", title: "Huma website", category: "website" },
  { assetSlug: "pst", url: "https://huma.finance/terms-of-use", title: "Huma Terms of Use", category: "terms" },
  { assetSlug: "pst", url: "https://huma.accountable.capital/", title: "Independent Transparency Dashboard for PST (Accountable)", category: "transparency" },
  { assetSlug: "pst", url: "https://docs.huma.finance/products/huma-2.0/overview", title: "Huma 2.0 overview", category: "docs" },
  { assetSlug: "pst", url: "https://docs.huma.finance/products/huma-2.0/redemption", title: "Huma 2.0 redemption", category: "docs" },
  { assetSlug: "pst", url: "https://docs.huma.finance/ecosystem-resources/security-audits", title: "Security and audits", category: "audit" },
  { assetSlug: "pyusd", url: "https://www.paypal.com/us/digital-wallet/manage-money/crypto/pyusd", title: "PayPal USD product page (PayPal)", category: "website" },
  { assetSlug: "pyusd", url: "https://www.paxos.com/assets/pyusd", title: "PYUSD asset page (Paxos)", category: "website" },
  { assetSlug: "pyusd", url: "https://www.paxos.com/terms-and-conditions/stablecoin-terms-conditions", title: "Paxos US Dollar-Backed Stablecoin Terms and Conditions (covers PYUSD)", category: "terms" },
  { assetSlug: "pyusd", url: "https://www.paypal.com/us/legalhub/paypal/cryptocurrencies-tnc", title: "PayPal Cryptocurrencies Terms and Conditions", category: "terms" },
  { assetSlug: "pyusd", url: "https://www.paxos.com/transparency/pyusd", title: "PYUSD attestation reports", category: "transparency" },
  { assetSlug: "pyusd", url: "https://framerusercontent.com/assets/UZ8Eke3FvB5npXyceLEmiLRV6k.pdf", title: "PYUSD Independent Accountants' Examination Report, September 2026", category: "attestation" },
  { assetSlug: "pyusd", url: "https://docs.paxos.com/guides/stablecoin/pyusd", title: "PYUSD developer documentation", category: "docs" },
  { assetSlug: "reusd", url: "https://storage.googleapis.com/re-files-production/docs/ppm_v2.pdf", title: "Private Placement Memorandum of Resilience (BVI) Ltd, March 16, 2026", category: "prospectus" },
  { assetSlug: "reusd", url: "https://storage.googleapis.com/re-files-production/docs/token_agreement_reUSD_v2.pdf", title: "reUSD Token Agreement v2", category: "legal" },
  { assetSlug: "reusd", url: "https://storage.googleapis.com/re-files-production/docs/resilience_platform_agreement_v2.pdf", title: "Resilience Platform Agreement v2", category: "legal" },
  { assetSlug: "reusd", url: "https://re.xyz/terms", title: "Re Terms of Service, updated September 30, 2026", category: "terms" },
  { assetSlug: "reusd", url: "https://re.xyz/disclosure", title: "Re Legal Disclosures", category: "legal" },
  { assetSlug: "reusd", url: "https://storage.googleapis.com/foundation-files/AUP-Report-2025.pdf", title: "The Network Firm Agreed-Upon Procedures report, as of October 31, 2025", category: "attestation" },
  { assetSlug: "reusd", url: "https://docs.re.xyz/transparency-and-data-show-me-the-receipts/audits-attestations-custody-structure", title: "Audits, attestations and custody structure", category: "docs" },
  { assetSlug: "reusd", url: "https://docs.re.xyz/products/about-reusd", title: "About reUSD", category: "docs" },
  { assetSlug: "solmf-one", url: "https://www.mfsa.mt/wp-content/uploads/2026/07/Midas-Software-GmbH-Base-Prospectus-Document-dated-17-July-2026.pdf", title: "Midas Software GmbH Base Prospectus, 17 July 2026", category: "prospectus" },
  { assetSlug: "solmf-one", url: "https://www.mfsa.mt/wp-content/uploads/2025/08/Midas-Software-GmbH-Base-Prospectus-Document-dated-17-July-2025.pdf", title: "Midas Software GmbH Base Prospectus, 17 July 2025", category: "prospectus" },
  { assetSlug: "solmf-one", url: "https://docs.midas.app/resources/legal-documents/prospectus-documents", title: "Midas prospectus documents index", category: "legal" },
  { assetSlug: "solmf-one", url: "https://midas.app/transparency", title: "Midas transparency page", category: "transparency" },
  { assetSlug: "solmf-one", url: "https://docs.midas.app/transparency/the-midas-attestation-engine", title: "The Midas Attestation Engine", category: "docs" },
  { assetSlug: "solmf-one", url: "https://docs.midas.app/resources/smart-contracts-registry", title: "Smart Contracts Registry, listing solmFONE on Solana", category: "docs" },
  { assetSlug: "solmf-one", url: "https://midas.app/mfone", title: "mF-ONE product page (parent product)", category: "website" },
  { assetSlug: "susde", url: "https://docs.ethena.fi/resources/terms-of-service", title: "Ethena Terms of Service (includes sUSDe restrictions)", category: "terms" },
  { assetSlug: "susde", url: "https://docs.ethena.fi/technical-design/staking-usde", title: "Staking USDe (sUSDe contract design)", category: "docs" },
  { assetSlug: "susde", url: "https://docs.ethena.fi/protocol-overview/rewards-mechanism", title: "Rewards Mechanism (how sUSDe accrues rewards)", category: "docs" },
  { assetSlug: "susde", url: "https://docs.ethena.fi/resources/general-risk-disclosures", title: "General Risk Disclosures", category: "legal" },
  { assetSlug: "susde", url: "https://docs.ethena.fi/resources/custodian-attestations", title: "Custodian Attestations (index)", category: "attestation" },
  { assetSlug: "susde", url: "https://docs.ethena.fi/resources/audits", title: "Smart contract audits", category: "audit" },
  { assetSlug: "susde", url: "https://app.ethena.fi/dashboards/transparency", title: "Ethena transparency dashboard", category: "transparency" },
  { assetSlug: "tgbp", url: "https://www.tokenisedgbp.com/terms", title: "tGBP Terms and Conditions v2.1 (effective 6 Jan 2026)", category: "terms" },
  { assetSlug: "tgbp", url: "https://www.tokenisedgbp.com/assets/reports/independent-accounts-report-2026-08-31.pdf", title: "Independent Accountants Report, reserves at 31 Aug 2026", category: "attestation" },
  { assetSlug: "tgbp", url: "https://www.tokenisedgbp.com/transparency", title: "tGBP reserves and transparency page", category: "transparency" },
  { assetSlug: "tgbp", url: "https://www.tokenisedgbp.com/faq", title: "tGBP FAQ", category: "guide" },
  { assetSlug: "tgbp", url: "https://www.tokenisedgbp.com/", title: "Tokenised GBP website", category: "website" },
  { assetSlug: "usd1", url: "https://worldlibertyfinancial.com/usd1", title: "USD1 product page (World Liberty Financial)", category: "website" },
  { assetSlug: "usd1", url: "https://www.bitgo.com/usd1", title: "USD1 page (BitGo)", category: "website" },
  { assetSlug: "usd1", url: "https://docs.worldlibertyfinancial.com/usd1-token/what-is-usd1", title: "What is USD1", category: "docs" },
  { assetSlug: "usd1", url: "https://docs.worldlibertyfinancial.com/usd1-token/usd1-risk-disclosures", title: "USD1 Risk Disclosures", category: "legal" },
  { assetSlug: "usd1", url: "https://docs.worldlibertyfinancial.com/legal/terms-of-service", title: "World Liberty Financial Terms of Service", category: "terms" },
  { assetSlug: "usd1", url: "https://www.bitgo.com/usd1/attestations", title: "USD1 attestation reports (BitGo)", category: "transparency" },
  { assetSlug: "usd1", url: "https://landing.bitgo.com/rs/552-OGK-141/images/USD1_Reserve_Attestation_Report_Sept_2026.pdf?version=0", title: "USD1 Reserve Attestation Report, September 2026", category: "attestation" },
  { assetSlug: "usd1", url: "https://por.worldlibertyfinancial.com/", title: "USD1 Proof of Reserves", category: "transparency" },
  { assetSlug: "usdc", url: "https://www.circle.com/usdc", title: "USDC product page", category: "website" },
  { assetSlug: "usdc", url: "https://www.circle.com/legal/usdc-terms", title: "USDC Terms (holders outside the EEA)", category: "terms" },
  { assetSlug: "usdc", url: "https://www.circle.com/legal/mica-usdc-whitepaper", title: "USDC MiCA White Paper", category: "prospectus" },
  { assetSlug: "usdc", url: "https://www.circle.com/legal/usdc-risk-factors", title: "USDC Risk Factors", category: "legal" },
  { assetSlug: "usdc", url: "https://www.circle.com/transparency", title: "Circle Transparency (USDC and EURC reserves, all attestations)", category: "transparency" },
  { assetSlug: "usdc", url: "https://6778953.fs1.hubspotusercontent-na1.net/hubfs/6778953/USDCAttestationReports/2026/2026%20USDC_Examination%20Report%20September%2026.pdf", title: "USDC Examination Report, September 2026", category: "attestation" },
  { assetSlug: "usdc", url: "https://developers.circle.com/stablecoins/what-is-usdc", title: "USDC developer documentation", category: "docs" },
  { assetSlug: "usdc", url: "https://investor.circle.com/financials/sec-filings/default.aspx", title: "Circle Internet Group SEC filings", category: "other" },
  { assetSlug: "usde", url: "https://docs.ethena.fi/resources/usde-terms-and-conditions", title: "USDe Terms and Conditions", category: "terms" },
  { assetSlug: "usde", url: "https://docs.ethena.fi/resources/usde-mint-user-agreement", title: "USDe Mint User Agreement", category: "legal" },
  { assetSlug: "usde", url: "https://docs.ethena.fi/resources/terms-of-service", title: "Ethena Terms of Service", category: "terms" },
  { assetSlug: "usde", url: "https://docs.ethena.fi/resources/general-risk-disclosures", title: "General Risk Disclosures", category: "legal" },
  { assetSlug: "usde", url: "https://docs.ethena.fi/resources/custodian-attestations", title: "Custodian Attestations (index)", category: "attestation" },
  { assetSlug: "usde", url: "https://docs.ethena.fi/resources/audits", title: "Smart contract audits", category: "audit" },
  { assetSlug: "usde", url: "https://app.ethena.fi/dashboards/transparency", title: "Ethena transparency dashboard", category: "transparency" },
  { assetSlug: "usde", url: "https://docs.ethena.fi/overview/how-usde-works", title: "How USDe Works", category: "docs" },
  { assetSlug: "usdg", url: "https://globaldollar.com/about-usdg", title: "Global Dollar (USDG) product page", category: "website" },
  { assetSlug: "usdg", url: "https://www.paxos.com/assets/usdg", title: "USDG asset page (Paxos)", category: "website" },
  { assetSlug: "usdg", url: "https://www.paxos.com/terms-and-conditions/stablecoin-terms-conditions", title: "Paxos US Dollar-Backed Stablecoin Terms and Conditions (covers USDG)", category: "terms" },
  { assetSlug: "usdg", url: "https://www.paxos.com/terms-and-conditions/usdg-eu-whitepaper", title: "USDG EU (MiCA) White Paper", category: "prospectus" },
  { assetSlug: "usdg", url: "https://www.paxos.com/terms-and-conditions/casp-emt-data-reporting", title: "MiCA CASP EMT Data Reporting for USDG", category: "legal" },
  { assetSlug: "usdg", url: "https://www.paxos.com/transparency/usdg", title: "USDG attestation reports", category: "transparency" },
  { assetSlug: "usdg", url: "https://framerusercontent.com/assets/SKxHUTNlo82s3Rrqw0ZL09z2vc.pdf", title: "USDG Attestation Report, September 2026", category: "attestation" },
  { assetSlug: "usdg", url: "https://docs.paxos.com/guides/stablecoin/usdg", title: "USDG developer documentation", category: "docs" },
  { assetSlug: "usds", url: "https://docs.sky.money/legal/skybase-international/terms-of-use", title: "Sky.money Terms of Use (Skybase International)", category: "terms" },
  { assetSlug: "usds", url: "https://docs.sky.money/legal/skybase-international/user-risks", title: "User Risks (Skybase International)", category: "legal" },
  { assetSlug: "usds", url: "https://developers.skyeco.com/protocol/tokens/usds/", title: "USDS token technical documentation", category: "docs" },
  { assetSlug: "usds", url: "https://developers.skyeco.com/security/security-measures/overview/", title: "Sky Protocol security measures", category: "docs" },
  { assetSlug: "usds", url: "https://financial.skyeco.com/usds/collateral-backing", title: "USDS collateral backing dashboard", category: "transparency" },
  { assetSlug: "usds", url: "https://insights.skyeco.com/sky-documentation", title: "Sky Protocol documentation: capital allocation and balance sheet", category: "docs" },
  { assetSlug: "usds", url: "https://sky.money", title: "Sky.money website", category: "website" },
  { assetSlug: "usdt", url: "https://tether.to/en/", title: "Tether website", category: "website" },
  { assetSlug: "usdt", url: "https://tether.to/en/legal/", title: "Token Terms of Sale and Service", category: "terms" },
  { assetSlug: "usdt", url: "https://tether.to/public/Relevant_Information_Document_-_Tether_International,_S.A._de_C.V..pdf", title: "Relevant Information Document, Tether International, S.A. de C.V.", category: "prospectus" },
  { assetSlug: "usdt", url: "https://tether.to/en/transparency/", title: "Transparency page", category: "transparency" },
  { assetSlug: "usdt", url: "https://assets.ctfassets.net/vyse88cgwfbl/7nQYtcoP9GxIUFSyro2dGK/8d0521470b9e99c8c0831019cabea4ee/ISAE_3000R_-_Opinion_Tether_International_Financial_Figure_30-09-2026.pdf", title: "ISAE 3000R Assurance Report on Financial Figures and Reserves Report, 30 September 2026", category: "attestation" },
  { assetSlug: "usdt", url: "https://assets.ctfassets.net/vyse88cgwfbl/5UWgHMvz071t2Cq5yTw5vi/c9798ea8db99311bf90ebe0810938b01/TetherWhitePaper.pdf", title: "Tether White Paper", category: "other" },
  { assetSlug: "usdt", url: "https://tether.to/en/supported-protocols/", title: "Integration Guidelines", category: "docs" },
  { assetSlug: "usx", url: "https://docs.solstice.finance/legal-documents/terms-and-conditions", title: "Solstice Terms and Conditions", category: "terms" },
  { assetSlug: "usx", url: "https://solstice.finance/terms", title: "Solstice website Terms & Conditions", category: "terms" },
  { assetSlug: "usx", url: "https://docs.solstice.finance/legal-documents/risk-disclosures", title: "Risk Disclosures", category: "legal" },
  { assetSlug: "usx", url: "https://docs.solstice.finance/legal-documents/attestations-and-proof-of-solvency", title: "Proof of Solvency (explainer)", category: "attestation" },
  { assetSlug: "usx", url: "https://attestation.solstice.finance/", title: "Live Proof of Solvency dashboard (by Accountable)", category: "transparency" },
  { assetSlug: "usx", url: "https://docs.solstice.finance/legal-documents/audits", title: "Smart contract audits (Halborn)", category: "audit" },
  { assetSlug: "usx", url: "https://docs.solstice.finance/", title: "Solstice documentation", category: "docs" },
  { assetSlug: "usx", url: "https://solstice.finance/usx", title: "USX product page", category: "website" },
  // Found by web research on 2026-11-05.
  { assetSlug: "euroe", url: "https://www.paxos.com/euroe-redemptions", title: "EUROe redemptions (Paxos)", category: "website" },
  { assetSlug: "frxusd", url: "https://docs.frax.com/frxusd", title: "frxUSD docs overview", category: "docs" },
  { assetSlug: "frxusd", url: "https://docs.frax.com/protocol/assets/frxusd/frxusd", title: "Frax USD stablecoin: reserves, governance and custodians", category: "docs" },
  { assetSlug: "frxusd", url: "https://docs.frax.com/protocol/assets/frxusd/addresses", title: "frxUSD contract addresses", category: "docs" },
  { assetSlug: "frxusd", url: "https://docs.frax.com/fraxnet/addresses/fraxnet-custodians", title: "FraxNet custodian addresses", category: "docs" },
  { assetSlug: "frxusd", url: "https://docs.frax.com/protocol/security/audit", title: "Frax protocol audits", category: "audit" },
  { assetSlug: "frxusd", url: "https://gov.frax.finance/t/fip-432-transfer-of-compliance-collateral-management-of-frxusd-to-frax-inc/3748", title: "FIP-432: transfer of frxUSD compliance and collateral management to Frax Inc", category: "legal" },
  { assetSlug: "frxusd", url: "https://gov.frax.finance/t/fip-430-preparation-for-frxusd-payment-stablecoin-charter-compliance/3698", title: "FIP-430: preparation for frxUSD payment stablecoin charter compliance", category: "legal" },
  { assetSlug: "gold", url: "https://app.oro.finance/terms-and-conditions", title: "Oro Terms of Use and risk disclosure", category: "terms" },
  { assetSlug: "gold", url: "https://framerusercontent.com/assets/1HclHdjMZkdWc7ZVGn2zXBSyJlk.pdf", title: "GOLD Redemption Assets assurance report, 30 June 2026", category: "attestation" },
  { assetSlug: "gold", url: "https://framerusercontent.com/assets/yEgaC3WZqCRAihdZrJQdC7v4osM.pdf", title: "GOLD Redemption Assets assurance report, 31 March 2026", category: "attestation" },
  { assetSlug: "gold", url: "https://framerusercontent.com/assets/g66PT6wYPfXDgia8HSaf53NK8A.pdf", title: "GOLD Redemption Assets assurance report, 28 February 2026", category: "attestation" },
  { assetSlug: "gold", url: "https://framerusercontent.com/assets/ZEedomZb5wkZIjpVWn4A9xFXYU.pdf", title: "ORO Protocol audit by Adevar Labs (Inti, stGOLD, liquid staking), March 2026", category: "audit" },
  { assetSlug: "gold", url: "https://framerusercontent.com/assets/teK6soTExAlabg5EVFNra0gKs.pdf", title: "Oro Inti security review by Cantina, April 2025", category: "audit" },
  { assetSlug: "jupusd", url: "https://docs.jup.ag/user-docs/earn/jupusd", title: "JupUSD user docs: mint, redeem, peg, fees, risks", category: "docs" },
  { assetSlug: "jupusd", url: "https://docs.jup.ag/user-docs/earn/jupusd/faq", title: "JupUSD FAQ: reserves, custody, risks", category: "docs" },
  { assetSlug: "jupusd", url: "https://developers.jup.ag/docs/jupusd", title: "JupUSD Mint and Redeem developer docs", category: "guide" },
  { assetSlug: "jupusd", url: "https://jupusd.money/homepage/audits/guardian.pdf", title: "JupUSD audit by Guardian", category: "audit" },
  { assetSlug: "jupusd", url: "https://jupusd.money/homepage/audits/offsidelabs.pdf", title: "JupUSD audit by Offside Labs", category: "audit" },
  { assetSlug: "jupusd", url: "https://jupusd.money/homepage/audits/pashov.pdf", title: "JupUSD audit by Pashov", category: "audit" },
  { assetSlug: "paxg", url: "https://www.paxos.com/assets/paxg", title: "Pax Gold product page", category: "website" },
  { assetSlug: "paxg", url: "https://www.paxos.com/transparency/paxg", title: "PAXG transparency reports", category: "transparency" },
  { assetSlug: "paxg", url: "https://www.paxos.com/terms-and-conditions/pax-gold-terms-conditions", title: "Pax Gold Terms and Conditions", category: "terms" },
  { assetSlug: "paxg", url: "https://www.paxos.com/terms-and-conditions/general-terms-and-conditions", title: "Paxos General Terms and Conditions", category: "terms" },
  { assetSlug: "paxg", url: "https://www.paxos.com/paxg-whitepaper.pdf", title: "Pax Gold white paper v1.0 (September 2019)", category: "prospectus" },
  { assetSlug: "paxg", url: "https://www.paxos.com/paxg-1pager-2026.pdf", title: "PAXG one-pager 2026", category: "fact_sheet" },
  { assetSlug: "paxg", url: "https://docs.paxos.com/guides/stablecoin/paxg", title: "PAXG developer guide", category: "docs" },
  { assetSlug: "paxg", url: "https://framerusercontent.com/assets/uwWybrLRlgkC4vexP3yLyrQVeV0.pdf", title: "PAXG independent accountants' examination report, September 2026", category: "attestation" },
  { assetSlug: "usd-infra", url: "https://infrastructure.finance/USD.infra-terms-and-disclosures", title: "USD.infra Vault Terms and Disclosures", category: "terms" },
  { assetSlug: "usd-infra", url: "https://infrastructure.finance/terms", title: "DAWN website terms", category: "terms" },
  { assetSlug: "usd-infra", url: "https://docs.infrastructure.finance/usd.infra-vault/core-primitives-usd.infra-and-susd.infra", title: "Core primitives: USD.infra and sUSD.infra", category: "docs" },
  { assetSlug: "usd-infra", url: "https://docs.infrastructure.finance/usd.infra-vault/liquidity-and-redemptions", title: "Liquidity and redemptions", category: "docs" },
  { assetSlug: "usd-infra", url: "https://docs.infrastructure.finance/usd.infra-vault/proof-of-reserves", title: "Proof of reserves", category: "transparency" },
  { assetSlug: "usd-infra", url: "https://docs.infrastructure.finance/usd.infra-vault/transparency-and-reporting", title: "Transparency and reporting", category: "transparency" },
  { assetSlug: "usd-infra", url: "https://docs.infrastructure.finance/usd.infra-vault/risks-and-mitigation", title: "Risks and mitigation", category: "docs" },
  { assetSlug: "usd-infra", url: "https://docs.infrastructure.finance/resources/terms", title: "Docs terms and risk disclosure", category: "legal" },
  { assetSlug: "usdu", url: "https://docs.unitas.so/overview/unitas-overview", title: "Unitas overview", category: "docs" },
  { assetSlug: "usdu", url: "https://docs.unitas.so/backing-custody-and-security/overview", title: "Backing, custody and security overview", category: "docs" },
  { assetSlug: "usdu", url: "https://docs.unitas.so/solution-design/minting-usdu", title: "Minting USDu", category: "docs" },
  { assetSlug: "usdu", url: "https://docs.unitas.so/resources/terms-of-service", title: "Unitas Terms of Service", category: "terms" },
  { assetSlug: "usdu", url: "https://docs.unitas.so/resources/audits", title: "Audits index", category: "audit" },
  { assetSlug: "usdu", url: "https://3644036359-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fmana7uG6HDPiM9nYjFQg%2Fuploads%2FNkj2EbDw0ux8Th5XvKTM%2FUnitas%20SVM%20Audit%20by%20Scalebit.pdf?alt=media&token=1575df95-ff1e-4408-8a2a-f491dad914aa", title: "Unitas SVM audit by Scalebit", category: "audit" },
  { assetSlug: "usdu", url: "https://3644036359-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fmana7uG6HDPiM9nYjFQg%2Fuploads%2FrZyYzQAemzNCWOoRgl1m%2FUnitas%20SVM%20Audit%20by%20Oaksecurity.pdf?alt=media&token=057f553a-5dc5-463d-a124-dc7f328e5664", title: "Unitas SVM audit by Oak Security", category: "audit" },
  { assetSlug: "usdu", url: "https://3644036359-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2Fmana7uG6HDPiM9nYjFQg%2Fuploads%2FMHq0yLqLy81pmP59obcX%2FUnitas%20EVM%20Audit%20by%20Scalebit.pdf?alt=media&token=616d40e5-547a-432f-887f-edadeb9bd45b", title: "Unitas EVM audit by Scalebit", category: "audit" },
  { assetSlug: "vchf", url: "https://vnx.io/swiss-franc", title: "VNX Swiss Franc product page", category: "website" },
  { assetSlug: "vchf", url: "https://vnx.io/reports/vnx-attestation-report-2026-09-30.pdf", title: "Independent attestation report on VCHF and VGBP reserves, 30 September 2026", category: "attestation" },
  { assetSlug: "vchf", url: "https://prod-global-terms.s3.sa-east-1.amazonaws.com/VNX-Global-Terms.pdf", title: "VNX Global Ltd. Terms and Conditions", category: "terms" },
  { assetSlug: "vchf", url: "https://vnx.gitbook.io/vnx-global/institutional/products/stablecoins", title: "Stablecoins: VCHF and VGBP", category: "docs" },
  { assetSlug: "vchf", url: "https://vnx.gitbook.io/vnx-global/institutional/reserve/reserve-management", title: "Reserve management", category: "docs" },
  { assetSlug: "vchf", url: "https://vnx.gitbook.io/vnx-global/institutional/custody/asset-segregation", title: "Asset segregation", category: "docs" },
  { assetSlug: "vchf", url: "https://vnx.gitbook.io/vnx-global/institutional/risk/stablecoin-specific-risks", title: "Stablecoin-specific risks", category: "docs" },
  { assetSlug: "vnxau", url: "https://vnx.li/vnxau", title: "VNX Gold case study", category: "website" },
  { assetSlug: "vnxau", url: "https://vnx.li/vnxau-transparency", title: "VNXAU transparency: supply, reserves, contracts", category: "transparency" },
  { assetSlug: "vnxau", url: "https://vnx.li/uploads/2026/03/VNX_Examination_on_Management_Assertions_VNXAU_31_12_2025_signiert.pdf", title: "Agreed-upon procedures report on VNXAU gold reserves, 31 December 2025", category: "attestation" },
  { assetSlug: "vnxau", url: "https://vnx.io/gold", title: "VNX Gold product page (vnx.io)", category: "website" },
  { assetSlug: "vnxau", url: "https://vnx.li/imprint", title: "VNX Commodities AG imprint: company and registry details", category: "legal" },
  { assetSlug: "dejaaa", url: "https://www.anemoy.io/funds/jaaa", title: "Janus Henderson Anemoy AAA CLO Fund page", category: "website" },
  { assetSlug: "dejaaa", url: "https://www.anemoy.io/business-continuity", title: "Anemoy business continuity statement", category: "other" },
  { assetSlug: "dejaaa", url: "https://gov.centrifuge.io/t/cp158-pool-onboarding-janus-henderson-anemoy-aaa-clo-fund/6845", title: "CP158: pool onboarding of the fund", category: "other" },
  { assetSlug: "dejtrsy", url: "https://www.anemoy.io/funds/jtrsy", title: "Janus Henderson Anemoy Treasury Fund page", category: "website" },
  { assetSlug: "dejtrsy", url: "https://www.anemoy.io/business-continuity", title: "Anemoy business continuity statement", category: "other" },
  { assetSlug: "dejtrsy", url: "https://gov.centrifuge.io/t/cp143-change-fee-for-anemoy-ltf/6755", title: "CP143: fee change for Anemoy LTF, now JTRSY", category: "other" },
  { assetSlug: "hyusd", url: "https://docs.hylo.so/product-guide/stablecoin", title: "Stablecoin and yield: hyUSD and eHYUSD", category: "docs" },
  { assetSlug: "hyusd", url: "https://docs.hylo.so/protocol-overview/core-mechanism", title: "Core mechanism", category: "docs" },
  { assetSlug: "hyusd", url: "https://docs.hylo.so/protocol-overview/risk-management", title: "Risk management", category: "docs" },
  { assetSlug: "hyusd", url: "https://docs.hylo.so/security/audits", title: "Audits index", category: "audit" },
  { assetSlug: "hyusd", url: "https://hylo-audits.s3.us-east-2.amazonaws.com/Accretion-HyloV2-July2026.pdf", title: "Hylo v2 audit by Accretion, July 2026", category: "audit" },
  { assetSlug: "hyusd", url: "https://hylo-audits.s3.us-east-2.amazonaws.com/Accretion-Hylo-Dec2025.pdf", title: "Hylo v1.2 audit by Accretion, December 2025", category: "audit" },
  { assetSlug: "hyusd", url: "https://hylo-audits.s3.us-east-2.amazonaws.com/OtterSec-Exchange-Stability-Pool-20250513.pdf", title: "Hylo v1.1 audit by OtterSec", category: "audit" },
];

/** Assets deliberately left with no documents, with the reason to flag. */
export const NO_DOCUMENTS: Readonly<Record<string, string>> = {
  eurcv: "The issuer's site, sgforge.com, returns 403 to our fetcher.",
  usdcv: "The issuer's site, sgforge.com, returns 403 to our fetcher.",
  veur: "Appears discontinued. No VEUR document could be reached on the VNX sites.",
};
