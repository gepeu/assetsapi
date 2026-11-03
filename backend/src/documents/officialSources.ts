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

/** Links for assets with none in the Kamino bundle. All are rechecked when loaded. */
export const CANDIDATE_DOCUMENTS: readonly CandidateDocument[] = [
  { assetSlug: "aave", url: "https://aave.com", title: "Aave website", category: "website" },
  { assetSlug: "aave", url: "https://aave.com/docs", title: "Aave documentation", category: "docs" },
  { assetSlug: "hype", url: "https://hyperliquid.xyz", title: "Hyperliquid website", category: "website" },
  { assetSlug: "hype", url: "https://hyperliquid.gitbook.io/hyperliquid-docs", title: "Hyperliquid documentation", category: "docs" },
  { assetSlug: "jlp", url: "https://jup.ag/perps", title: "Jupiter Perps", category: "website" },
  { assetSlug: "jlp", url: "https://developers.jup.ag/docs/perps", title: "Jupiter Perps documentation", category: "docs" },
  { assetSlug: "jup", url: "https://jup.ag", title: "Jupiter website", category: "website" },
  { assetSlug: "jup", url: "https://developers.jup.ag/docs/get-started", title: "Jupiter developer documentation", category: "docs" },
  { assetSlug: "kmno", url: "https://kamino.com", title: "Kamino website", category: "website" },
  { assetSlug: "kmno", url: "https://kamino.com/docs", title: "Kamino documentation", category: "docs" },
  { assetSlug: "mon", url: "https://monad.xyz", title: "Monad website", category: "website" },
  { assetSlug: "mon", url: "https://docs.monad.xyz", title: "Monad documentation", category: "docs" },
  { assetSlug: "msol", url: "https://marinade.finance", title: "Marinade website", category: "website" },
  { assetSlug: "msol", url: "https://docs.marinade.finance", title: "Marinade documentation", category: "docs" },
  { assetSlug: "near", url: "https://near.org", title: "NEAR website", category: "website" },
  { assetSlug: "near", url: "https://docs.near.org", title: "NEAR documentation", category: "docs" },
  { assetSlug: "zec", url: "https://z.cash", title: "Zcash website", category: "website" },
  { assetSlug: "zec", url: "https://zcash.readthedocs.io", title: "Zcash documentation", category: "docs" },
  { assetSlug: "jitosol", url: "https://go.jito.network/docs/jitosol", title: "JitoSOL documentation", category: "docs" },
  { assetSlug: "jitosol", url: "https://www.jito.network", title: "Jito website", category: "website" },
  { assetSlug: "ki-usdc", url: "https://kamino.com/docs/products/institutional-yield", title: "Kamino institutional yield", category: "docs" },
  { assetSlug: "ki-usdc", url: "https://kamino.com/docs/products/institutional-yield/faq", title: "Kamino institutional yield FAQ", category: "guide" },
  { assetSlug: "cbbtc", url: "https://www.coinbase.com/cbbtc", title: "Coinbase cbBTC", category: "website" },
  { assetSlug: "cbbtc", url: "https://www.coinbase.com/cbbtc/proof-of-reserves", title: "cbBTC proof of reserves", category: "transparency" },
  // The bare /xbtc path redirects by location, so these use a fixed region.
  { assetSlug: "xbtc", url: "https://www.okx.com/en-us/xbtc", title: "Get started with xBTC", category: "website" },
  { assetSlug: "xbtc", url: "https://www.okx.com/en-eu/xbtc", title: "Get started with xBTC (EU)", category: "website" },
  { assetSlug: "xbtc", url: "https://www.okx.com/en-us/help/okx-officially-launches-the-multi-chain-wrapped-token-xbtc", title: "OKX launches xBTC", category: "guide" },
  { assetSlug: "xbtc", url: "https://www.okx.com/en-us/help/how-does-xbtc-work", title: "How do I deposit and withdraw xBTC?", category: "guide" },
];

/** Assets deliberately left with no documents, with the reason to flag. */
export const NO_DOCUMENTS: Readonly<Record<string, string>> = {
  jtbil: "No official source found, and its Kamino entry appears to use generated data. It may not be a real product.",
};
