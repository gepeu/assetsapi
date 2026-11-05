import type { AssetFinancials, AssetPage, DataValue } from "../api/assets";
import { displayText, humanize } from "./fieldValues";
import { dayToTime, formatFor, formatValue } from "./financialFormat";

export interface Fact {
  label: string;
  value: string;
}

/** The facts that answer one investor question. Only facts with a value are kept. */
export interface FactGroup {
  name: string;
  facts: Fact[];
}

export interface ReturnPeriod {
  label: string;
  cumulative: number;
  /** Null where the period is under a month or its length isn't known. */
  averageMonthly: number | null;
}

const MINUS = "−";
const DAY_MS = 86_400_000;
const DAYS_PER_MONTH = 30.4375;

export const signedPercent = (value: number) => `${value < 0 ? MINUS : "+"}${Math.abs(value).toFixed(2)}%`;

const FIGURES: readonly { metric: string; label: string; signed?: boolean }[] = [
  { metric: "apy_30_day", label: "30-day APY" },
  { metric: "trailing_1_year_return_percent", label: "1-year return", signed: true },
  { metric: "price_dollar", label: "Price" },
  { metric: "total_asset_value_dollar", label: "Total value" },
  { metric: "holding_addresses_count", label: "Holders" },
];

export function keyFigures(financials: AssetFinancials | null): Fact[] {
  if (!financials) return [];
  return FIGURES.flatMap(({ metric, label, signed }) => {
    const row = financials.financials.find((candidate) => candidate.metric === metric && candidate.scope === "asset");
    if (!row) return [];
    return [{ label, value: signed ? signedPercent(row.value) : formatValue(row.value, formatFor(row.metric, row.unit)) }];
  });
}

const RETURNS: readonly { metric: string; label: string; months: number | "ytd" | "inception" }[] = [
  { metric: "trailing_1_month_return_percent", label: "1 mo", months: 1 },
  { metric: "trailing_3_month_return_percent", label: "3 mo", months: 3 },
  { metric: "year_to_date_return_percent", label: "YTD", months: "ytd" },
  { metric: "trailing_1_year_return_percent", label: "1 yr", months: 12 },
  { metric: "since_inception_return_percent", label: "Since inception", months: "inception" },
];

const monthsBetween = (from: number, to: number) => (to - from) / DAY_MS / DAYS_PER_MONTH;

/** The monthly rate that compounds to the cumulative return over the period. */
function averageMonthly(cumulative: number, months: number | null): number | null {
  const growth = 1 + cumulative / 100;
  if (months === null || months < 1 || growth <= 0) return null;
  return (growth ** (1 / months) - 1) * 100;
}

/** The return periods the asset reports. The average monthly row is worked out from them. */
export function returnPeriods(financials: AssetFinancials | null, inceptionDay: string | null): ReturnPeriod[] {
  if (!financials) return [];
  return RETURNS.flatMap(({ metric, label, months }) => {
    const row = financials.financials.find((candidate) => candidate.metric === metric);
    if (!row) return [];
    const asOf = dayToTime(row.asOf);
    const span =
      months === "ytd"
        ? monthsBetween(Date.UTC(new Date(asOf).getUTCFullYear(), 0, 1), asOf)
        : months === "inception"
          ? inceptionDay && monthsBetween(dayToTime(inceptionDay), asOf)
          : months;
    return [{ label, cumulative: row.value, averageMonthly: averageMonthly(row.value, span || null) }];
  });
}

/** "BMA - Bermuda Monetary Authority" reads better without its abbreviation. */
const withoutAbbreviation = (name: string) => (name.includes(" - ") ? name.slice(name.indexOf(" - ") + 3) : name);

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Basis points as a percentage, with decimals only when they're needed. */
const bpsToPercent = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;

/**
 * What an investor asks about an asset, answered from the data it has. Performance has its own
 * chart and table, so it isn't repeated here, and risk covers protections rather than market numbers.
 */
export function factGroups(asset: AssetPage, financials: AssetFinancials | null): FactGroup[] {
  const fields = new Map<string, DataValue>();
  for (const category of asset.fields.categories) {
    for (const field of category.fields) {
      if (field.value !== null) fields.set(field.key, field.value);
    }
  }
  const terms = new Map<string, DataValue>();
  for (const term of financials?.terms ?? []) {
    if (term.value !== null) terms.set(term.key, term.value);
  }

  const text = (key: string) => {
    const value = fields.get(key);
    return value === undefined ? null : displayText(value);
  };
  const choice = (key: string) => {
    const value = fields.get(key);
    return typeof value === "string" ? humanize(value.toLowerCase()) : null;
  };
  const flag = (key: string) => {
    const value = fields.get(key);
    return typeof value === "boolean" ? value : null;
  };
  const amount = (key: string) => {
    const value = terms.get(key);
    return typeof value === "number" ? value : null;
  };
  const metric = (name: string) => financials?.financials.find((row) => row.metric === name)?.value ?? null;

  const issuer = text("issuer.legal_entity") ?? asset.issuer;
  const domicile = text("legal.domicile");

  const protections = [
    [flag("legal.bankruptcy_remote"), "bankruptcy remote", "not bankruptcy remote"],
    [flag("legal.account_segregation"), "segregated accounts", "accounts not segregated"],
    [flag("legal.deposit_insurance"), "deposit insurance", "no deposit insurance"],
  ].flatMap(([value, yes, no]) => (value === null ? [] : [value ? yes : no]));

  const regulators = fields.get("legal.regulator");
  const kyc = flag("primary.kyc_required");
  const minimum = amount("primary_market__minimum_subscription_amt");
  const solanaToken = asset.tokens.find((token) => token.network.key === "solana") ?? asset.tokens[0];
  const transfers = solanaToken?.fields.find((field) => field.key === "token.transferability")?.value ?? null;

  const redemptionFee = amount("primary_market__redemption_fee_bps");
  const redemption = [
    text("primary.redemption_frequency"),
    redemptionFee === null ? null : redemptionFee === 0 ? "no fee" : `${bpsToPercent(redemptionFee)} fee`,
  ].filter((part) => part !== null);

  const moved = metric("trailing_30_day_transfer_volume");
  const largest = metric("top_holder_concentration");
  // A share of supply above 100% is a provider error, not a holding.
  const largestIsShare = largest !== null && largest > 0 && largest <= 100;

  const groups: [string, [string, string | null][]][] = [
    [
      "Exposure",
      [
        ["Tracks", text("identity.reference_asset")],
        ["Asset class", asset.assetClass],
        ["Sector", text("classification.sector")],
        ["Backing", text("holder.holdings_security") ?? text("holder.peg_maintenance")],
        ["Issuer", issuer && domicile ? `${issuer}, ${domicile}` : issuer],
        ["Denominated in", terms.has("denomination_asset_ticker") ? displayText(terms.get("denomination_asset_ticker")!) : null],
      ],
    ],
    [
      "Risk",
      [
        ["If the issuer fails", protections.length > 0 ? capitalize(protections.join(", ")) : null],
        ["Regulator", Array.isArray(regulators) ? regulators.map(withoutAbbreviation).join(", ") : null],
        ["Regulatory framework", text("legal.regulatory_framework")],
        ["Custodian", text("provider.custodian")],
        ["Auditor", text("provider.financial_auditor")],
      ],
    ],
    [
      "Ownership",
      [
        ["Structure", choice("classification.tokenization_structure")],
        ["Tokenized by", choice("classification.tokenization_sponsorship")],
        ["Legal form", text("issuer.legal_structure")],
        ["Holder rights", text("holder.rights")],
      ],
    ],
    [
      "Access",
      [
        ["Who can buy", text("primary.eligible_investors")],
        ["KYC", kyc === null ? null : kyc ? "Required" : "Not required"],
        ["Minimum", minimum === null ? null : minimum === 0 ? "None" : formatValue(minimum, "dollar")],
        ["Pay in", text("primary.base_assets")],
        ["Networks", asset.networks.map((network) => network.name).join(", ")],
        ["Transfers", transfers === null ? null : displayText(transfers)],
      ],
    ],
    [
      "Exit",
      [
        ["Redemption", redemption.length > 0 ? capitalize(redemption.join(", ")) : null],
        ["Lock-up", text("primary.lockup_period")],
        ["Moved on-chain, 30 days", moved === null ? null : formatValue(moved, "dollar")],
        [asset.networks.length > 1 ? "Largest holder (Solana)" : "Largest holder", largestIsShare ? `${largest.toFixed(1)}% of supply` : null],
      ],
    ],
  ];

  return groups
    .map(([name, rows]) => ({ name, facts: rows.flatMap(([label, value]) => (value ? [{ label, value }] : [])) }))
    .filter((group) => group.facts.length > 0);
}
