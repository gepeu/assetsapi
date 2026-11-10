// Turns API answers into the shapes the Figma pages draw (src/model.ts).

import {
  CLASS_TABS,
  CLASS_TAGS,
  type AssetPageData,
  type ChainRow,
  type ClassKey,
  type DocumentRow,
  type FactRow,
  type IconFactRow,
  type LinkRow,
  type ListAsset,
  type Points,
  type SimilarCard,
  type StatTile,
} from "../model";
import { type AssetListItem, type AssetPage, type DataValue, LIST_METRICS } from "./assets";

// ----- Formatting -----

const MINUS = "−";

export function money(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? MINUS : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

/** Whole dollars and cents, as the Figma writes "Growth of $10k". */
export const dollars = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A per-token price: more decimals for small prices. */
export function price(value: number): string {
  const digits = value < 10 ? 4 : 2;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function percent(value: number, signed = true): string {
  const sign = value < 0 ? MINUS : signed && value > 0 ? "+" : "";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

export const count = (value: number) => Math.round(value).toLocaleString("en-US");

export function date(iso: string, withYear = true): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

const tone = (value: number) => (value < 0 ? "down" : "up");

const host = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

// ----- Classes -----

/** The API's asset class, sorted into the Figma's tabs and "More categories". */
const CLASSES: Record<string, { tab: ClassKey; categories?: string[] }> = {
  Stocks: { tab: "equities" },
  "Private Equity": { tab: "alternatives", categories: ["private-equity"] },
  "Venture Capital": { tab: "alternatives", categories: ["venture-capital"] },
  "US Treasury Debt": { tab: "fixed-income", categories: ["us-treasury-funds"] },
  "Non-US Government Debt": { tab: "fixed-income", categories: ["non-us-government-debt"] },
  "Asset-Backed Credit": { tab: "fixed-income" },
  "Corporate Credit": { tab: "fixed-income" },
  "Private Credit": { tab: "fixed-income" },
  Commodities: { tab: "commodities" },
  Stablecoins: { tab: "crypto", categories: ["stablecoins"] },
  "Active Strategies": { tab: "alternatives", categories: ["active-strategies"] },
  "Real Estate": { tab: "alternatives", categories: ["real-estate"] },
  "Specialty Finance": { tab: "alternatives" },
};

const classOf = (assetClass: string) => CLASSES[assetClass] ?? { tab: "alternatives" as ClassKey };

const tabLabel = (key: ClassKey) => CLASS_TABS.find((t) => t.key === key)!.label;

// ----- List -----

export function toListAsset(item: AssetListItem): ListAsset {
  const { tab, categories = [] } = classOf(item.assetClass);
  const yieldRate = item.metrics[LIST_METRICS.yield] ?? null;
  const yoy = item.metrics[LIST_METRICS.yearReturn] ?? null;
  const tvl = item.solanaMetrics[LIST_METRICS.solanaValue] ?? null;
  return {
    slug: item.slug,
    ticker: item.ticker,
    name: item.name,
    // Logos cut from the Figma, by slug; assets without one show their initial.
    logo: item.slug,
    classKey: tab,
    className: tabLabel(tab),
    subclass: item.assetClass,
    categories,
    issuer: item.issuer,
    issuerLogo: null,
    yield: yieldRate === null ? null : percent(yieldRate, false),
    yieldRate,
    yoy: yoy === null ? null : percent(yoy),
    tvl: tvl === null ? null : money(tvl),
    tvlValue: tvl,
  };
}

// ----- Asset page -----

/** The series the page charts, fetched with the page so no chart needs a request of its own. */
export const HISTORY_METRICS = ["hypothetical_10_000_performance", "price_dollar", "net_asset_value_dollar"] as const;

/** Activity rows, in order. Their labels come from the API. */
const ACTIVITY_METRICS = [
  "trailing_30_day_transfer_volume",
  "daily_transfer_volume_dollar",
  "daily_mints_dollar",
  "daily_burns_dollar",
  "holding_addresses_count",
];

/** Chain logos cut from the Figma, where the file name differs from the network key. */
const CHAIN_LOGOS: Record<string, string> = { "bnb-chain": "bnb" };

function text(value: DataValue | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value)) return value.length ? value.join(", ") : null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

const short = (address: string) => (address.length > 12 ? `${address.slice(0, 4)}...${address.slice(-4)}` : address);

export function toAssetPage(page: AssetPage, list: ListAsset[]): AssetPageData {
  const fields = new Map(page.fields.categories.flatMap((c) => c.fields).map((f) => [f.key, f.value]));
  const field = (key: string) => text(fields.get(key));
  const terms = new Map(page.terms.map((t) => [t.key, t.value]));
  const financials = new Map(page.financials.map((f) => [f.metric, f]));
  const metric = (key: string) => financials.get(key)?.value ?? null;
  const history = (key: string): Points | null => {
    const points = page.history.find((h) => h.metric === key)?.points ?? [];
    return points.length > 1 ? points : null;
  };

  const self = list.find((a) => a.slug === page.slug);
  const { tab } = classOf(page.assetClass);
  const tag = CLASS_TAGS[tab];

  const yieldRate = metric("apy_30_day");
  const tokenPrice = metric("price_dollar");
  const nav = metric("net_asset_value_dollar");
  const yearReturn = metric("trailing_1_year_return_percent");
  const solanaValue = page.valueByNetwork.find((n) => n.key === "solana")?.value ?? null;
  const marketValue = metric("market_value_dollar");

  const overview: StatTile[] = [];
  if (yieldRate !== null) overview.push({ icon: "lineChart", label: "Yield", value: percent(yieldRate, false), tone: "up" });
  if (tokenPrice !== null) overview.push({ icon: "target", label: "Price", value: price(tokenPrice) });
  else if (nav !== null) overview.push({ icon: "target", label: "NAV", value: price(nav) });
  if (yearReturn !== null) overview.push({ icon: "barChart", label: "1Y change", value: percent(yearReturn), tone: tone(yearReturn) });
  if (solanaValue !== null) overview.push({ icon: "lock", label: "TVL on Solana", value: money(solanaValue) });
  if (marketValue !== null) overview.push({ icon: "coins", label: "Market value", value: money(marketValue) });

  const growth = history("hypothetical_10_000_performance");
  const priceHistory = history("price_dollar");
  const navHistory = history("net_asset_value_dollar");

  // Returns
  const returnValues = [
    "trailing_1_month_return_percent",
    "trailing_3_month_return_percent",
    null,
    "year_to_date_return_percent",
    "trailing_1_year_return_percent",
    "since_inception_return_percent",
  ].map((key) => {
    const value = key ? metric(key) : null;
    return value === null ? null : percent(value);
  });
  const inception = field("identity.inception_date");
  const returnsAsOf = financials.get("trailing_1_month_return_percent")?.asOf ?? page.asOf;

  // The underlying
  const reference = field("identity.reference_asset");
  const underlyingTicker = field("identity.underlying_ticker");
  const referenceIsin = field("identity.reference_asset_isin");
  const sector = [field("classification.sector"), field("classification.region")].filter(Boolean).join(" · ");
  const solanaToken =
    page.tokens.find((t) => t.network.key === "solana" && t.issuanceType === "native") ?? page.tokens.find((t) => t.network.key === "solana");
  const tokenField = (key: string) => text(solanaToken?.fields.find((f) => f.key === key)?.value);
  const accrual =
    terms.get("distributes_income") === true ? "Income is distributed" : terms.get("nav_reflects_income_only") === true ? "Income accrues into NAV" : null;
  const underlyingRows: FactRow[] = [
    { label: "Asset class", value: tag.label },
    { label: "Subclass", value: page.assetClass },
    { label: "Sector / region", value: sector },
    {
      label: "Reference asset",
      value: [reference && (underlyingTicker ? `${reference} (${underlyingTicker})` : reference), referenceIsin && `ISIN ${referenceIsin}`]
        .filter(Boolean)
        .join(" · "),
    },
    { label: "Accrual", value: accrual ?? "" },
    { label: "Distribution frequency", value: text(terms.get("distribution_frequency_type")) ?? "" },
    { label: "Transferability", value: tokenField("token.transferability") ?? "" },
  ].filter((r) => r.value);
  const pricePair = priceHistory && navHistory;

  // Issuer
  const issuerName = field("issuer.name") ?? page.issuer;
  const issuerSite = field("issuer.website");
  const productSite = field("identity.website");
  const transparency = field("issuer.transparency_url");
  const orgRows: IconFactRow[] = [
    { icon: "building", label: "Legal entity", value: field("issuer.legal_entity") ?? "" },
    { icon: "building", label: "Legal structure", value: field("issuer.legal_structure") ?? "" },
    { icon: "globe", label: "Country", value: field("legal.domicile") ?? "" },
    { icon: "doc", label: "LEI", value: field("issuer.lei") ?? "" },
    { icon: "building", label: "Platform", value: field("provider.platform") ?? "" },
    { icon: "shieldCheck", label: "Custodian", value: field("provider.custodian") ?? "" },
    { icon: "shieldCheck", label: "Auditor", value: field("provider.financial_auditor") ?? "" },
  ].filter((r) => r.value);
  const orgButtons: LinkRow[] = [
    productSite && { label: `${page.ticker} product page`, href: productSite },
    transparency && { label: "Transparency and proof of reserves", href: transparency },
  ].filter((b): b is LinkRow => Boolean(b));

  // Similar assets: the largest on Solana in the same tab.
  const similar: SimilarCard[] = list
    .filter((a) => a.classKey === tab && a.slug !== page.slug)
    .sort((a, b) => (b.tvlValue ?? -1) - (a.tvlValue ?? -1))
    .slice(0, 3)
    .map((a) => {
      const card: SimilarCard = { slug: a.slug, ticker: a.ticker, logo: a.logo, issuer: a.issuer ?? "–", tvl: a.tvl ?? "–", tag: CLASS_TAGS[a.classKey] };
      if (a.yieldRate !== null && a.yield && yieldRate !== null) {
        const gap = a.yieldRate - yieldRate;
        card.yield = { value: a.yield, versus: `${percent(gap)} vs ${page.ticker}`, tone: tone(gap) };
      }
      return card;
    });

  // Onchain
  const activity: FactRow[] = ACTIVITY_METRICS.flatMap((key) => {
    const f = financials.get(key);
    if (!f) return [];
    return [{ label: f.label, value: f.unit === "dollar" ? money(f.value) : count(f.value) }];
  });
  const activityScopes = new Set(ACTIVITY_METRICS.flatMap((key) => financials.get(key)?.scope ?? []));
  const holdersByNetwork = new Map<string, number>();
  const bridged = new Set<string>();
  for (const t of page.tokens) {
    const holders = t.metrics.holding_addresses_count;
    if (holders !== null && holders !== undefined) holdersByNetwork.set(t.network.key, (holdersByNetwork.get(t.network.key) ?? 0) + holders);
    if (t.issuanceType === "bridged") bridged.add(t.network.key);
  }
  const chains: ChainRow[] = page.valueByNetwork.map((n) => {
    const holders = holdersByNetwork.get(n.key);
    return {
      logo: CHAIN_LOGOS[n.key] ?? n.key,
      name: n.name,
      detail: [holders !== undefined && `${count(holders)} holders`, bridged.has(n.key) && "Bridged"].filter(Boolean).join(" · ") || `${n.share.toFixed(1)}% of value`,
      value: money(n.value),
    };
  });

  // Documents
  const documents: DocumentRow[] = [
    productSite && { kind: "Website", title: `${page.name} product page`, href: productSite },
    transparency && { kind: "Attestation", title: "Transparency and proof of reserves", href: transparency },
    issuerSite && { kind: "Issuer", title: `${issuerName ?? "Issuer"} website`, href: issuerSite },
  ].filter((d): d is DocumentRow => Boolean(d));

  const minimum = terms.get("primary_market__minimum_subscription_amt");

  return {
    slug: page.slug,
    ticker: page.ticker,
    name: page.name,
    logo: self?.logo ?? null,
    tag,
    description: page.description ?? field("identity.description") ?? undefined,
    overview: overview.slice(0, 4),
    growth: growth ? { label: "Growth of $10k", points: growth } : undefined,
    performance: priceHistory
      ? { label: "Price per token", points: priceHistory }
      : navHistory
        ? { label: "NAV per token", points: navHistory }
        : undefined,
    returns: returnValues.some((v) => v !== null)
      ? {
          asOf: returnsAsOf ? date(returnsAsOf) : null,
          lastColumn: "Inception",
          values: returnValues,
          note: `${inception ? `Inception ${date(inception)}. ` : ""}“–” means no value for that period. Past performance does not guarantee future results.`,
        }
      : undefined,
    underlying: {
      intro: field("holder.holdings_security") ?? undefined,
      chart: pricePair
        ? {
            title: `${page.ticker} price vs NAV`,
            lines: [
              { label: `${page.ticker} onchain price`, points: priceHistory },
              { label: underlyingTicker ? `Issuer NAV (${underlyingTicker})` : "Issuer NAV", points: navHistory },
            ],
          }
        : undefined,
      rows: underlyingRows,
    },
    organization: issuerName
      ? {
          logo: self?.issuerLogo ?? null,
          name: issuerName,
          subtitle: field("issuer.description") ?? undefined,
          link: issuerSite ? { label: host(issuerSite), href: issuerSite } : undefined,
          rows: orgRows,
          buttons: orgButtons,
        }
      : undefined,
    similar,
    onchain:
      solanaToken || chains.length
        ? {
            token: solanaToken
              ? [
                  { label: "Network", value: "Solana" },
                  { label: "Mint address", value: short(solanaToken.address) },
                  { label: "Standard", value: tokenField("token.standard") ?? "–" },
                  { label: "Decimals", value: tokenField("token.decimals") ?? "–" },
                ]
              : [],
            explorer: solanaToken ? { label: "View on Solscan", href: `https://solscan.io/token/${solanaToken.address}` } : undefined,
            activity,
            activityNote: activityScopes.has("asset") ? "Across all chains." : activityScopes.size ? "On Solana." : undefined,
            chains,
          }
        : undefined,
    documents,
    buy: {
      multiply: yieldRate !== null,
      price: tokenPrice ?? nav,
      yieldRate,
      minimum: typeof minimum === "number" && minimum > 0 ? money(minimum) : null,
    },
  };
}
