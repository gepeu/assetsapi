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
  { assetSlug: "near", url: "https://near.org", title: "NEAR website", category: "website" },
  { assetSlug: "near", url: "https://docs.near.org", title: "NEAR documentation", category: "docs" },
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
  { assetSlug: "uscc", url: "https://superstate.com/assets/uscc", title: "USCC fund page with risk disclosures", category: "website" },
  { assetSlug: "uscc", url: "https://bitwiseinvestments.com/crypto-funds/uscc", title: "Bitwise USCC fund overview", category: "website" },
  { assetSlug: "uscc", url: "https://bitwise-materials.s3.us-east-1.amazonaws.com/public/fact-sheets/Fact-Sheet_USCC_Bitwise-Crypto-Carry-Fund.pdf", title: "Bitwise Crypto Carry Fund fact sheet", category: "fact_sheet" },
  { assetSlug: "uscc", url: "https://docs.superstate.com/investors/tokenized-funds/available-funds/bitwise-uscc", title: "Bitwise USCC product documentation", category: "docs" },
  { assetSlug: "uscc", url: "https://superstate.com/terms", title: "Superstate Terms of Service", category: "terms" },
  { assetSlug: "uscc", url: "https://www.sec.gov/Archives/edgar/data/2030263/000094562125000588/xslFormDX01/primary_doc.xml", title: "SEC Form D/A filed 2025-07-17", category: "legal" },
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
  { assetSlug: "ustb", url: "https://superstate.com/assets/ustb", title: "USTB fund page with risk disclosures", category: "website" },
  { assetSlug: "ustb", url: "https://www.invesco.com/us/en/institutional/strategies/money-market-and-liquidity/ustb.html", title: "Invesco USTB fund overview", category: "website" },
  { assetSlug: "ustb", url: "https://docs.superstate.com/investors/tokenized-funds/available-funds/invesco-ustb", title: "Invesco USTB product documentation", category: "docs" },
  { assetSlug: "ustb", url: "https://docs.superstate.com/investors/smart-contracts", title: "Superstate smart contracts documentation", category: "docs" },
  { assetSlug: "ustb", url: "https://superstate.com/terms", title: "Superstate Terms of Service", category: "terms" },
  { assetSlug: "ustb", url: "https://www.sec.gov/Archives/edgar/data/2004367/000200436726000008/xslFormDX01/primary_doc.xml", title: "SEC Form D/A filed 2026-07-14", category: "legal" },
  { assetSlug: "usx", url: "https://docs.solstice.finance/legal-documents/terms-and-conditions", title: "Solstice Terms and Conditions", category: "terms" },
  { assetSlug: "usx", url: "https://solstice.finance/terms", title: "Solstice website Terms & Conditions", category: "terms" },
  { assetSlug: "usx", url: "https://docs.solstice.finance/legal-documents/risk-disclosures", title: "Risk Disclosures", category: "legal" },
  { assetSlug: "usx", url: "https://docs.solstice.finance/legal-documents/attestations-and-proof-of-solvency", title: "Proof of Solvency (explainer)", category: "attestation" },
  { assetSlug: "usx", url: "https://attestation.solstice.finance/", title: "Live Proof of Solvency dashboard (by Accountable)", category: "transparency" },
  { assetSlug: "usx", url: "https://docs.solstice.finance/legal-documents/audits", title: "Smart contract audits (Halborn)", category: "audit" },
  { assetSlug: "usx", url: "https://docs.solstice.finance/", title: "Solstice documentation", category: "docs" },
  { assetSlug: "usx", url: "https://solstice.finance/usx", title: "USX product page", category: "website" },
];

/** Assets deliberately left with no documents, with the reason to flag. */
export const NO_DOCUMENTS: Readonly<Record<string, string>> = {};
