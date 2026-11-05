/**
 * RWA.xyz field to catalog field. This list is the only way a value reaches `field_value`: any API
 * field not named here is ignored. Financial fields go to their own tables instead (see measures.ts).
 * Each mapping repeats its catalog value type so the adapter can clean values without a database,
 * and a test checks these types against the catalog.
 */
import type { AssetType, IssuanceType } from "../types.ts";
import type { ApiRecord } from "./client.ts";

type Getter = (record: ApiRecord) => unknown;

export type ValueType =
  | "text"
  | "long_text"
  | "url"
  | "date"
  | "boolean"
  | "integer"
  | "decimal"
  | "enum"
  | "list"
  | "identifier"
  | "address"
  | "organization";

export interface FieldMapping {
  field: string;
  type: ValueType;
  /** The RWA.xyz field(s), for readers of this list. */
  from: string;
  get: Getter;
  /** For organization fields: the role this creates between an asset and the organization. */
  role?: string;
}

const pick =
  (name: string): Getter =>
  (record) =>
    record[name];

const nested =
  (object: string, name: string): Getter =>
  (record) =>
    (record[object] as ApiRecord | null | undefined)?.[name];

const firstOf =
  (...getters: Getter[]): Getter =>
  (record) => {
    for (const getter of getters) {
      const value = getter(record);
      if (value !== null && value !== undefined && value !== "") return value;
    }
    return null;
  };

const readPrimaryMarkets = (record: ApiRecord): ApiRecord[] =>
  Array.isArray(record.primary_markets) ? (record.primary_markets as ApiRecord[]) : [];

/** One value if all of an asset's primary markets agree, or nothing if they differ. */
const marketValue =
  (name: string): Getter =>
  (record) => {
    const values = readPrimaryMarkets(record)
      .map((market) => market[name])
      .filter((value) => value !== null && value !== undefined && value !== "");
    const distinct = [...new Set(values.map((value) => JSON.stringify(value)))];
    return distinct.length === 1 ? values[0] : null;
  };

/** Every value across an asset's primary markets. */
const marketList =
  (name: string): Getter =>
  (record) => {
    const values = readPrimaryMarkets(record).flatMap((market) => market[name] ?? []);
    return values.length > 0 ? values : null;
  };

const withUnit =
  (name: string, unit: string): Getter =>
  (record) => {
    const value = record[name];
    return typeof value === "number" ? `${value} ${unit}` : null;
  };

const yesNo =
  (name: string): Getter =>
  (record) => {
    const value = record[name];
    return typeof value === "boolean" ? (value ? "Yes" : "No") : null;
  };

export const ASSET_MAPPINGS: readonly FieldMapping[] = [
  { field: "identity.name", type: "text", from: "name", get: pick("name") },
  { field: "identity.ticker", type: "text", from: "ticker", get: pick("ticker") },
  { field: "identity.website", type: "url", from: "website", get: pick("website") },
  { field: "identity.isin", type: "identifier", from: "isin", get: pick("isin") },
  { field: "identity.cusip", type: "identifier", from: "cusip", get: pick("cusip") },
  { field: "identity.inception_date", type: "date", from: "inception_date", get: pick("inception_date") },
  {
    field: "identity.reference_asset",
    type: "text",
    from: "pegged_asset.name",
    get: firstOf(nested("pegged_asset", "name"), pick("pegged_asset_name")),
  },
  {
    field: "identity.underlying_ticker",
    type: "text",
    from: "pegged_asset.ticker",
    get: nested("pegged_asset", "ticker"),
  },
  {
    field: "identity.reference_ratio",
    type: "decimal",
    from: "asset_to_pegged_asset_ratio",
    get: pick("asset_to_pegged_asset_ratio"),
  },
  { field: "identity.description", type: "long_text", from: "description", get: pick("description") },
  { field: "identity.logo", type: "url", from: "icon_url", get: pick("icon_url") },
  { field: "identity.brand_color", type: "text", from: "color_hex", get: pick("color_hex") },
  {
    field: "identity.reference_asset_isin",
    type: "identifier",
    from: "pegged_asset.isin",
    get: nested("pegged_asset", "isin"),
  },
  { field: "identity.rwa_xyz_slug", type: "identifier", from: "slug", get: pick("slug") },

  { field: "classification.asset_class", type: "enum", from: "asset_class_name", get: pick("asset_class_name") },
  { field: "classification.sector", type: "list", from: "sector_names", get: pick("sector_names") },
  { field: "classification.region", type: "list", from: "region_names", get: pick("region_names") },
  { field: "classification.type", type: "enum", from: "type", get: pick("type") },
  {
    field: "classification.tokenization_type",
    type: "list",
    from: "tokenization_types",
    get: pick("tokenization_types"),
  },
  {
    field: "classification.tokenization_sponsorship",
    type: "enum",
    from: "tokenization_sponsorship_type",
    get: pick("tokenization_sponsorship_type"),
  },
  {
    field: "classification.tokenization_structure",
    type: "enum",
    from: "tokenization_structure",
    get: pick("tokenization_structure"),
  },
  {
    field: "classification.issuance_status",
    type: "enum",
    from: "asset_status, status",
    get: firstOf(pick("asset_status"), pick("status")),
  },

  { field: "issuer.name", type: "organization", from: "issuer", get: pick("issuer"), role: "issuer" },
  { field: "issuer.transparency_url", type: "url", from: "transparency_url", get: pick("transparency_url") },

  {
    field: "legal.domicile",
    type: "text",
    from: "legal_structure__country_name",
    get: pick("legal_structure__country_name"),
  },
  {
    field: "legal.dispute_resolution",
    type: "long_text",
    from: "dispute_resolution_description, dispute_resolution_country_name",
    get: firstOf(pick("dispute_resolution_description"), pick("dispute_resolution_country_name")),
  },
  { field: "legal.regulator", type: "list", from: "governing_body", get: pick("governing_body") },
  {
    field: "legal.regulatory_framework",
    type: "list",
    from: "regulatory_framework",
    get: pick("regulatory_framework"),
  },
  {
    field: "legal.bankruptcy_remote",
    type: "boolean",
    from: "are_holdings_bankruptcy_remote",
    get: pick("are_holdings_bankruptcy_remote"),
  },
  {
    field: "legal.account_segregation",
    type: "boolean",
    from: "are_accounts_segregated",
    get: pick("are_accounts_segregated"),
  },
  {
    field: "legal.jurisdiction",
    type: "text",
    from: "jurisdiction_country_name",
    get: pick("jurisdiction_country_name"),
  },
  {
    field: "legal.deposit_insurance",
    type: "boolean",
    from: "has_deposit_insurance",
    get: pick("has_deposit_insurance"),
  },
  {
    field: "legal.registration_number",
    type: "identifier",
    from: "regulatory_registration_number",
    get: pick("regulatory_registration_number"),
  },

  {
    field: "holder.rights",
    type: "long_text",
    from: "holder_rights_description",
    get: pick("holder_rights_description"),
  },
  {
    field: "holder.fork_rights",
    type: "long_text",
    from: "fork_rights_description, has_fork_rights",
    get: firstOf(pick("fork_rights_description"), yesNo("has_fork_rights")),
  },
  {
    field: "holder.holdings_security",
    type: "long_text",
    from: "holdings_security_description",
    get: pick("holdings_security_description"),
  },
  {
    field: "holder.custody_description",
    type: "long_text",
    from: "custody_description",
    get: pick("custody_description"),
  },
  {
    field: "holder.peg_maintenance",
    type: "long_text",
    from: "peg_maintenance_description",
    get: pick("peg_maintenance_description"),
  },

  { field: "provider.manager", type: "organization", from: "manager", get: pick("manager"), role: "manager" },
  {
    field: "provider.sub_advisor",
    type: "organization",
    from: "sub_advisor",
    get: pick("sub_advisor"),
    role: "sub_advisor",
  },
  {
    field: "provider.custodian",
    type: "organization",
    from: "traditional_custodian",
    get: pick("traditional_custodian"),
    role: "custodian",
  },
  {
    field: "provider.crypto_custodian",
    type: "organization",
    from: "crypto_custodian",
    get: pick("crypto_custodian"),
    role: "crypto_custodian",
  },
  {
    field: "provider.transfer_agent",
    type: "organization",
    from: "transfer_agent",
    get: pick("transfer_agent"),
    role: "transfer_agent",
  },
  {
    field: "provider.fund_administrator",
    type: "organization",
    from: "fund_administrator",
    get: pick("fund_administrator"),
    role: "fund_administrator",
  },
  {
    field: "provider.traditional_broker",
    type: "organization",
    from: "traditional_broker",
    get: pick("traditional_broker"),
    role: "traditional_broker",
  },
  {
    field: "provider.financial_auditor",
    type: "organization",
    from: "auditor",
    get: pick("auditor"),
    role: "financial_auditor",
  },
  {
    field: "provider.custodian_legal_identifier",
    type: "identifier",
    from: "traditional_custodian.lei",
    get: nested("traditional_custodian", "lei"),
  },
  {
    field: "provider.crypto_broker",
    type: "organization",
    from: "crypto_broker",
    get: pick("crypto_broker"),
    role: "crypto_broker",
  },
  {
    field: "provider.paying_agent",
    type: "organization",
    from: "paying_agent",
    get: pick("paying_agent"),
    role: "paying_agent",
  },
  {
    field: "provider.transparency_method",
    type: "text",
    from: "transparency_type, transparency_description",
    get: firstOf(pick("transparency_type"), pick("transparency_description")),
  },

  {
    field: "primary.eligible_investors",
    type: "list",
    from: "primary_markets[].allowed_investor_types",
    get: marketList("allowed_investor_types"),
  },
  {
    field: "primary.kyc_required",
    type: "boolean",
    from: "primary_markets[].kyc_is_required",
    get: marketValue("kyc_is_required"),
  },
  {
    field: "primary.base_assets",
    type: "list",
    from: "primary_markets[].base_asset_ticker",
    get: marketList("base_asset_ticker"),
  },
  { field: "primary.open_ended", type: "boolean", from: "is_open_ended", get: pick("is_open_ended") },
  {
    field: "primary.kyc_description",
    type: "long_text",
    from: "primary_markets[].kyc_description",
    get: marketValue("kyc_description"),
  },
  {
    field: "primary.subscription_frequency",
    type: "text",
    from: "primary_markets[].subscription_frequency",
    get: marketValue("subscription_frequency"),
  },
  {
    field: "primary.redemption_frequency",
    type: "text",
    from: "primary_markets[].redemption_frequency",
    get: marketValue("redemption_frequency"),
  },
  {
    field: "primary.subscriptions_open",
    type: "boolean",
    from: "primary_markets[].is_subscription_allowed",
    get: marketValue("is_subscription_allowed"),
  },
  {
    field: "primary.redemptions_open",
    type: "boolean",
    from: "primary_markets[].is_redemption_allowed",
    get: marketValue("is_redemption_allowed"),
  },
  {
    field: "primary.subscription_description",
    type: "long_text",
    from: "primary_markets[].subscription_description",
    get: marketValue("subscription_description"),
  },
  {
    field: "primary.redemption_description",
    type: "long_text",
    from: "primary_markets[].redemption_description",
    get: marketValue("redemption_description"),
  },
  {
    field: "primary.term",
    type: "text",
    from: "term_description, term_length_years",
    get: firstOf(pick("term_description"), withUnit("term_length_years", "years")),
  },
  {
    field: "primary.right_to_redeem",
    type: "boolean",
    from: "holder_has_right_to_redeem",
    get: pick("holder_has_right_to_redeem"),
  },
  {
    field: "primary.lockup_period",
    type: "text",
    from: "lockup_description, lockup_period_months",
    get: firstOf(pick("lockup_description"), withUnit("lockup_period_months", "months")),
  },
];

/** Read from the asset's `issuer` object. These describe the organization itself. */
export const ISSUER_MAPPINGS: readonly FieldMapping[] = [
  { field: "issuer.legal_entity", type: "text", from: "issuer.legal_name", get: pick("legal_name") },
  { field: "issuer.lei", type: "identifier", from: "issuer.lei", get: pick("lei") },
  { field: "issuer.cik", type: "identifier", from: "issuer.cik", get: pick("cik") },
  { field: "issuer.website", type: "url", from: "issuer.website", get: pick("website") },
  {
    field: "issuer.legal_structure",
    type: "text",
    from: "issuer.legal_structure_type",
    get: pick("legal_structure_type"),
  },
  { field: "issuer.description", type: "long_text", from: "issuer.description", get: pick("description") },
  { field: "issuer.logo", type: "url", from: "issuer.icon_url", get: pick("icon_url") },
];

export const TOKEN_MAPPINGS: readonly FieldMapping[] = [
  { field: "token.standard", type: "list", from: "standards", get: pick("standards") },
  {
    field: "token.network",
    type: "text",
    from: "network.name",
    get: firstOf(nested("network", "name"), pick("network_name")),
  },
  { field: "token.contract_address", type: "address", from: "address", get: pick("address") },
  { field: "token.decimals", type: "integer", from: "decimals", get: pick("decimals") },
  {
    field: "token.issuance_type",
    type: "enum",
    from: "issuance_type",
    get: (token) => toIssuanceType(token.issuance_type),
  },
  { field: "token.tokenization_type", type: "enum", from: "tokenization_type", get: pick("tokenization_type") },
  { field: "token.platform", type: "organization", from: "platform", get: pick("platform") },
  {
    field: "token.transferability",
    type: "text",
    from: "transferability_description, transferability_type",
    get: firstOf(pick("transferability_description"), pick("transferability_type")),
  },
];

export const NETWORK_MAPPINGS: readonly FieldMapping[] = [
  { field: "technology.network_layer", type: "enum", from: "layer_description", get: pick("layer_description") },
  {
    field: "technology.chain_id",
    type: "identifier",
    from: "evm_chain_id",
    get: (network) => (network.evm_chain_id == null ? null : String(network.evm_chain_id)),
  },
  {
    field: "technology.parent_network",
    type: "text",
    from: "parent_network.name (looked up by parent_network_id)",
    get: pick("parent_network_name"),
  },
];

/** The asset-level platform only exists when all of an asset's tokens share one. */
export const PLATFORM_FIELD = "provider.platform";

// "Active Strategies" covers both funds and DeFi yield today. New ones start as funds, and existing
// assets keep the type they have.
const ASSET_TYPE_BY_CLASS: Readonly<Record<string, AssetType>> = {
  "Active Strategies": "tokenized_fund",
  "Asset-Backed Credit": "tokenized_fund",
  Commodities: "tokenized_commodity",
  "Corporate Credit": "tokenized_fund",
  "Specialty Finance": "tokenized_fund",
  Stablecoins: "stablecoin",
  Stocks: "tokenized_equity",
  "US Treasury Debt": "tokenized_fund",
};

/** Null for a class with no mapping yet. */
export function toAssetType(assetClass: string): AssetType | null {
  return ASSET_TYPE_BY_CLASS[assetClass] ?? null;
}

/** Our label for RWA.xyz's. Unknown values come back as "unknown", not as a guess. */
export function toIssuanceType(value: unknown): IssuanceType {
  switch (value) {
    case "NATIVE":
      return "native";
    case "BRIDGE":
      return "bridged";
    case "WRAPPER":
      return "wrapper";
    default:
      return "unknown";
  }
}

type CleanValue = string | number | boolean | string[];

/** Fits an API value to a catalog value type. Null means no usable value, so no row at all. */
export function cleanValue(valueType: ValueType, raw: unknown): CleanValue | null {
  if (raw === null || raw === undefined || raw === "") return null;

  switch (valueType) {
    case "boolean":
      return typeof raw === "boolean" ? raw : null;
    case "integer":
    case "decimal":
      return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    case "date": {
      const date = String(raw).slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
    }
    case "url":
      return typeof raw === "string" && /^https?:\/\//i.test(raw) ? raw.trim() : null;
    case "list": {
      const items = (Array.isArray(raw) ? raw : [raw])
        .filter((item) => typeof item === "string" || typeof item === "number")
        .map((item) => String(item).trim())
        .filter((item) => item !== "");
      return items.length === 0 ? null : [...new Set(items)].sort();
    }
    default: {
      if (typeof raw !== "string" && typeof raw !== "number") return null;
      const text = String(raw).trim();
      return text === "" ? null : text;
    }
  }
}

/** Fits a provider's name to our slug rule. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
