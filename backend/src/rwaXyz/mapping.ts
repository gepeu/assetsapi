/**
 * RWA.xyz field to catalog field. This list is the only way a value reaches a Claim: any API
 * field not named here, including every financial metric, is ignored.
 */
import type { ApiRecord } from "./client.ts";

type Getter = (record: ApiRecord) => unknown;

export interface FieldMapping {
  field: string;
  /** The RWA.xyz field(s), for the mapping document. */
  from: string;
  get: Getter;
  /** For organization fields: which link role this creates between an asset and the organization. */
  role?: string;
}

const pick = (name: string): Getter => (record) => record[name];

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

const primaryMarkets = (record: ApiRecord): ApiRecord[] =>
  Array.isArray(record.primary_markets) ? (record.primary_markets as ApiRecord[]) : [];

/** One value if all of an asset's primary markets agree, or nothing if they differ. */
const marketValue =
  (name: string): Getter =>
  (record) => {
    const values = primaryMarkets(record)
      .map((market) => market[name])
      .filter((value) => value !== null && value !== undefined && value !== "");
    const distinct = [...new Set(values.map((value) => JSON.stringify(value)))];
    return distinct.length === 1 ? values[0] : null;
  };

/** Every value across an asset's primary markets. */
const marketList =
  (name: string): Getter =>
  (record) => {
    const values = primaryMarkets(record).flatMap((market) => market[name] ?? []);
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
  { field: "identity.name", from: "name", get: pick("name") },
  { field: "identity.ticker", from: "ticker", get: pick("ticker") },
  { field: "identity.website", from: "website", get: pick("website") },
  { field: "identity.isin", from: "isin", get: pick("isin") },
  { field: "identity.cusip", from: "cusip", get: pick("cusip") },
  { field: "identity.inception_date", from: "inception_date", get: pick("inception_date") },
  { field: "identity.reference_asset", from: "pegged_asset.name", get: firstOf(nested("pegged_asset", "name"), pick("pegged_asset_name")) },
  { field: "identity.underlying_ticker", from: "pegged_asset.ticker", get: nested("pegged_asset", "ticker") },
  { field: "identity.reference_ratio", from: "asset_to_pegged_asset_ratio", get: pick("asset_to_pegged_asset_ratio") },
  { field: "identity.description", from: "description", get: pick("description") },
  { field: "identity.logo", from: "icon_url", get: pick("icon_url") },
  { field: "identity.brand_color", from: "color_hex", get: pick("color_hex") },
  { field: "identity.reference_asset_isin", from: "pegged_asset.isin", get: nested("pegged_asset", "isin") },
  { field: "identity.rwa_xyz_slug", from: "slug", get: pick("slug") },

  { field: "classification.asset_class", from: "asset_class_name", get: pick("asset_class_name") },
  { field: "classification.sector", from: "sector_names", get: pick("sector_names") },
  { field: "classification.region", from: "region_names", get: pick("region_names") },
  { field: "classification.type", from: "type", get: pick("type") },
  { field: "classification.tokenization_type", from: "tokenization_types", get: pick("tokenization_types") },
  { field: "classification.tokenization_sponsorship", from: "tokenization_sponsorship_type", get: pick("tokenization_sponsorship_type") },
  { field: "classification.tokenization_structure", from: "tokenization_structure", get: pick("tokenization_structure") },
  { field: "classification.issuance_status", from: "asset_status, status", get: firstOf(pick("asset_status"), pick("status")) },

  { field: "issuer.name", from: "issuer", get: pick("issuer"), role: "issuer" },
  { field: "issuer.transparency_url", from: "transparency_url", get: pick("transparency_url") },

  { field: "legal.domicile", from: "legal_structure__country_name", get: pick("legal_structure__country_name") },
  { field: "legal.dispute_resolution", from: "dispute_resolution_description, dispute_resolution_country_name", get: firstOf(pick("dispute_resolution_description"), pick("dispute_resolution_country_name")) },
  { field: "legal.regulator", from: "governing_body", get: pick("governing_body") },
  { field: "legal.regulatory_framework", from: "regulatory_framework", get: pick("regulatory_framework") },
  { field: "legal.bankruptcy_remote", from: "are_holdings_bankruptcy_remote", get: pick("are_holdings_bankruptcy_remote") },
  { field: "legal.account_segregation", from: "are_accounts_segregated", get: pick("are_accounts_segregated") },
  { field: "legal.jurisdiction", from: "jurisdiction_country_name", get: pick("jurisdiction_country_name") },
  { field: "legal.deposit_insurance", from: "has_deposit_insurance", get: pick("has_deposit_insurance") },
  { field: "legal.registration_number", from: "regulatory_registration_number", get: pick("regulatory_registration_number") },

  { field: "holder.rights", from: "holder_rights_description", get: pick("holder_rights_description") },
  { field: "holder.fork_rights", from: "fork_rights_description, has_fork_rights", get: firstOf(pick("fork_rights_description"), yesNo("has_fork_rights")) },
  { field: "holder.holdings_security", from: "holdings_security_description", get: pick("holdings_security_description") },
  { field: "holder.custody_description", from: "custody_description", get: pick("custody_description") },
  { field: "holder.peg_maintenance", from: "peg_maintenance_description", get: pick("peg_maintenance_description") },

  { field: "provider.manager", from: "manager", get: pick("manager"), role: "manager" },
  { field: "provider.sub_advisor", from: "sub_advisor", get: pick("sub_advisor"), role: "sub_advisor" },
  { field: "provider.custodian", from: "traditional_custodian", get: pick("traditional_custodian"), role: "custodian" },
  { field: "provider.crypto_custodian", from: "crypto_custodian", get: pick("crypto_custodian"), role: "crypto_custodian" },
  { field: "provider.transfer_agent", from: "transfer_agent", get: pick("transfer_agent"), role: "transfer_agent" },
  { field: "provider.fund_administrator", from: "fund_administrator", get: pick("fund_administrator"), role: "fund_administrator" },
  { field: "provider.traditional_broker", from: "traditional_broker", get: pick("traditional_broker"), role: "traditional_broker" },
  { field: "provider.financial_auditor", from: "auditor", get: pick("auditor"), role: "financial_auditor" },
  { field: "provider.custodian_legal_identifier", from: "traditional_custodian.lei", get: nested("traditional_custodian", "lei") },
  { field: "provider.crypto_broker", from: "crypto_broker", get: pick("crypto_broker"), role: "crypto_broker" },
  { field: "provider.paying_agent", from: "paying_agent", get: pick("paying_agent"), role: "paying_agent" },
  { field: "provider.transparency_method", from: "transparency_type, transparency_description", get: firstOf(pick("transparency_type"), pick("transparency_description")) },

  { field: "primary.eligible_investors", from: "primary_markets[].allowed_investor_types", get: marketList("allowed_investor_types") },
  { field: "primary.kyc_required", from: "primary_markets[].kyc_is_required", get: marketValue("kyc_is_required") },
  { field: "primary.base_assets", from: "primary_markets[].base_asset_ticker", get: marketList("base_asset_ticker") },
  { field: "primary.open_ended", from: "is_open_ended", get: pick("is_open_ended") },
  { field: "primary.kyc_description", from: "primary_markets[].kyc_description", get: marketValue("kyc_description") },
  { field: "primary.subscription_frequency", from: "primary_markets[].subscription_frequency", get: marketValue("subscription_frequency") },
  { field: "primary.redemption_frequency", from: "primary_markets[].redemption_frequency", get: marketValue("redemption_frequency") },
  { field: "primary.subscriptions_open", from: "primary_markets[].is_subscription_allowed", get: marketValue("is_subscription_allowed") },
  { field: "primary.redemptions_open", from: "primary_markets[].is_redemption_allowed", get: marketValue("is_redemption_allowed") },
  { field: "primary.subscription_description", from: "primary_markets[].subscription_description", get: marketValue("subscription_description") },
  { field: "primary.redemption_description", from: "primary_markets[].redemption_description", get: marketValue("redemption_description") },
  { field: "primary.term", from: "term_description, term_length_years", get: firstOf(pick("term_description"), withUnit("term_length_years", "years")) },
  { field: "primary.right_to_redeem", from: "holder_has_right_to_redeem", get: pick("holder_has_right_to_redeem") },
  { field: "primary.lockup_period", from: "lockup_description, lockup_period_months", get: firstOf(pick("lockup_description"), withUnit("lockup_period_months", "months")) },
];

/** Read from the asset's `issuer` object. Claims about the organization itself. */
export const ISSUER_MAPPINGS: readonly FieldMapping[] = [
  { field: "issuer.legal_entity", from: "issuer.legal_name", get: pick("legal_name") },
  { field: "issuer.lei", from: "issuer.lei", get: pick("lei") },
  { field: "issuer.cik", from: "issuer.cik", get: pick("cik") },
  { field: "issuer.website", from: "issuer.website", get: pick("website") },
  { field: "issuer.legal_structure", from: "issuer.legal_structure_type", get: pick("legal_structure_type") },
  { field: "issuer.description", from: "issuer.description", get: pick("description") },
  { field: "issuer.logo", from: "issuer.icon_url", get: pick("icon_url") },
];

export const TOKEN_MAPPINGS: readonly FieldMapping[] = [
  { field: "token.standard", from: "standards", get: pick("standards") },
  { field: "token.network", from: "network.name", get: firstOf(nested("network", "name"), pick("network_name")) },
  { field: "token.contract_address", from: "address", get: pick("address") },
  { field: "token.decimals", from: "decimals", get: pick("decimals") },
  { field: "token.issuance_type", from: "issuance_type", get: (token) => issuanceType(token.issuance_type) },
  { field: "token.tokenization_type", from: "tokenization_type", get: pick("tokenization_type") },
  { field: "token.platform", from: "platform", get: pick("platform") },
  { field: "token.transferability", from: "transferability_description, transferability_type", get: firstOf(pick("transferability_description"), pick("transferability_type")) },
];

export const NETWORK_MAPPINGS: readonly FieldMapping[] = [
  { field: "technology.network_layer", from: "layer_description", get: pick("layer_description") },
  {
    field: "technology.chain_id",
    from: "evm_chain_id",
    get: (network) => (network.evm_chain_id == null ? null : String(network.evm_chain_id)),
  },
  { field: "technology.parent_network", from: "parent_network.name (looked up by parent_network_id)", get: pick("parent_network_name") },
];

/** Our label for RWA.xyz's. Unknown values come back as "unknown", not as a guess. */
export function issuanceType(value: unknown): "native" | "bridged" | "wrapper" | "unknown" {
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

export type NormalizedValue = { kind: "none" } | { kind: "value"; value: unknown };

const NONE: NormalizedValue = { kind: "none" };

/** Fits an API value to a catalog value type. A null or unusable value means no claim at all. */
export function normalizeValue(valueType: string, raw: unknown): NormalizedValue {
  if (raw === null || raw === undefined || raw === "") return NONE;

  switch (valueType) {
    case "boolean":
      return typeof raw === "boolean" ? { kind: "value", value: raw } : NONE;
    case "integer":
    case "decimal":
      return typeof raw === "number" && Number.isFinite(raw) ? { kind: "value", value: raw } : NONE;
    case "date": {
      const date = String(raw).slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(date) ? { kind: "value", value: date } : NONE;
    }
    case "url":
      return typeof raw === "string" && /^https?:\/\//i.test(raw) ? { kind: "value", value: raw.trim() } : NONE;
    case "list": {
      const items = (Array.isArray(raw) ? raw : [raw])
        .filter((item) => typeof item === "string" || typeof item === "number")
        .map((item) => String(item).trim())
        .filter((item) => item !== "");
      if (items.length === 0) return NONE;
      return { kind: "value", value: [...new Set(items)].sort() };
    }
    default: {
      if (typeof raw !== "string" && typeof raw !== "number") return NONE;
      const text = String(raw).trim();
      if (text === "") return NONE;
      return { kind: "value", value: text };
    }
  }
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
