/** The field catalog. Edit here and re-run the seed; adding a field needs no migration. */

export type AssetType =
  | "tokenized_equity"
  | "tokenized_fund"
  | "tokenized_commodity"
  | "wrapped_crypto"
  | "native_crypto"
  | "defi_yield"
  | "stablecoin";

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

export type Level = "asset" | "token" | "organization" | "network" | "contract";

export interface FieldDefinition {
  key: string;
  category: string;
  label: string;
  valueType: ValueType;
  level: Level;
  applicableAssetTypes: readonly AssetType[];
  conflictPolicy: "chain_first" | "documents_first";
  requiresAsOf: boolean;
  recordGroup: string | null;
}

const EQ = "tokenized_equity";
const FD = "tokenized_fund";
const CM = "tokenized_commodity";
const WR = "wrapped_crypto";
const NT = "native_crypto";
const DF = "defi_yield";
const ST = "stablecoin";

const ALL: readonly AssetType[] = [EQ, FD, CM, WR, NT, DF, ST];
/** Products with an off-chain legal wrapper or backing. */
const RWA: readonly AssetType[] = [EQ, FD, CM, ST];
/** Anything with something held on the holder's behalf. */
const BACKED: readonly AssetType[] = [EQ, FD, CM, WR, ST];
/** Anything with a holder claim or a mint and redeem route. */
const CLAIM: readonly AssetType[] = [EQ, FD, CM, WR, DF, ST];
const SECURITY: readonly AssetType[] = [EQ, FD];
const PROTOCOL: readonly AssetType[] = [NT, DF];

interface Options {
  asOf?: boolean;
  group?: string;
}

type Row = [
  name: string,
  label: string,
  valueType: ValueType,
  level: Level,
  applicable: readonly AssetType[],
  options?: Options,
];

interface Category {
  /** Prefix of each field's key. */
  prefix: string;
  category: string;
  conflictPolicy: FieldDefinition["conflictPolicy"];
  rows: readonly Row[];
}

const CATEGORIES: readonly Category[] = [
  {
    prefix: "identity",
    category: "Identity",
    conflictPolicy: "documents_first",
    rows: [
      ["name", "Name", "text", "asset", ALL],
      ["ticker", "Ticker", "text", "asset", ALL],
      ["website", "Website", "url", "asset", ALL],
      ["isin", "ISIN", "identifier", "asset", SECURITY],
      ["cusip", "CUSIP", "identifier", "asset", SECURITY],
      ["inception_date", "Inception date", "date", "asset", ALL],
      ["reference_asset", "Reference asset", "text", "asset", CLAIM],
      ["underlying_ticker", "Underlying ticker", "text", "asset", [EQ, CM, WR]],
      ["reference_ratio", "Reference ratio", "decimal", "asset", [EQ, CM, WR, DF], { asOf: true }],
      ["description", "Description", "long_text", "asset", ALL],
      ["logo", "Logo", "url", "asset", ALL],
      ["brand_color", "Brand color", "text", "asset", ALL],
      ["reference_asset_isin", "Reference asset ISIN", "identifier", "asset", [EQ]],
      ["figi", "FIGI", "identifier", "asset", SECURITY],
      ["coingecko_id", "CoinGecko ID", "identifier", "asset", ALL],
      ["equivalent_group_dti", "Equivalent group DTI", "identifier", "asset", ALL],
      ["rwa_xyz_slug", "RWA.xyz slug", "identifier", "asset", ALL],
    ],
  },
  {
    prefix: "classification",
    category: "Classification",
    conflictPolicy: "documents_first",
    rows: [
      ["asset_class", "Asset class", "enum", "asset", ALL],
      ["sector", "Sector", "list", "asset", ALL],
      ["region", "Region", "list", "asset", RWA],
      ["type", "Type", "enum", "asset", ALL],
      ["tags", "Tags", "list", "asset", ALL],
      ["tokenization_type", "Tokenization type", "list", "asset", BACKED],
      ["tokenization_sponsorship", "Tokenization sponsorship", "enum", "asset", BACKED],
      ["tokenization_structure", "Tokenization structure", "enum", "asset", BACKED],
      ["claim_type", "Claim type", "enum", "asset", CLAIM],
      ["issuance_status", "Issuance status", "enum", "asset", ALL, { asOf: true }],
      ["token_function", "Token function", "enum", "asset", ALL],
    ],
  },
  {
    prefix: "issuer",
    category: "Issuer",
    conflictPolicy: "documents_first",
    rows: [
      ["name", "Issuer name", "organization", "asset", ALL],
      ["legal_entity", "Legal entity", "text", "organization", ALL],
      ["lei", "LEI", "identifier", "organization", BACKED],
      ["cik", "CIK", "identifier", "organization", SECURITY],
      ["website", "Issuer website", "url", "organization", ALL],
      ["legal_structure", "Legal structure", "text", "organization", ALL],
      ["description", "Issuer description", "long_text", "organization", ALL],
      ["logo", "Issuer logo", "url", "organization", ALL],
      ["transparency_url", "Transparency URL", "url", "asset", CLAIM],
      ["affiliate_entity", "Affiliate entity", "list", "organization", ALL],
    ],
  },
  {
    prefix: "legal",
    category: "Legal and regulatory",
    conflictPolicy: "documents_first",
    rows: [
      ["domicile", "Domicile", "text", "asset", ALL],
      ["dispute_resolution", "Dispute resolution", "long_text", "asset", CLAIM],
      ["regulator", "Regulator", "list", "asset", BACKED, { asOf: true }],
      ["regulatory_framework", "Regulatory framework", "list", "asset", BACKED, { asOf: true }],
      ["bankruptcy_remote", "Bankruptcy remote", "boolean", "asset", BACKED],
      ["account_segregation", "Account segregation", "boolean", "asset", BACKED],
      ["jurisdiction", "Jurisdiction", "text", "asset", ALL],
      ["deposit_insurance", "Deposit insurance", "boolean", "asset", RWA],
      ["governing_law", "Governing law", "text", "asset", CLAIM],
      ["governing_law_subdivision", "Governing law subdivision", "text", "asset", CLAIM],
      ["mica_marker", "MiCA marker", "enum", "asset", ALL, { asOf: true }],
      ["registration_number", "Registration or licence number", "identifier", "asset", BACKED],
      ["exemption_basis", "Exemption basis", "text", "asset", SECURITY],
    ],
  },
  {
    prefix: "holder",
    category: "Holder rights and backing",
    conflictPolicy: "documents_first",
    rows: [
      ["rights", "Holder rights", "long_text", "asset", CLAIM],
      ["fork_rights", "Fork rights", "long_text", "asset", [WR, DF]],
      ["holdings_security", "Holdings security", "long_text", "asset", BACKED],
      ["custody_description", "Custody description", "long_text", "asset", BACKED],
      ["peg_maintenance", "Peg maintenance", "long_text", "asset", [CM, WR, DF, FD, ST]],
      ["voting_rights", "Voting rights", "long_text", "asset", [EQ, FD, NT, DF]],
      ["dividend_eligibility", "Dividend eligibility", "boolean", "asset", [EQ]],
      ["dividend_handling", "Dividend handling", "long_text", "asset", [EQ]],
      ["reserve_composition", "Reserve composition", "long_text", "asset", [FD, CM, WR, DF, ST], { asOf: true }],
      ["storage_location", "Storage location", "text", "asset", [CM]],
      ["claims_seniority", "Claims seniority and loss order", "long_text", "asset", CLAIM],
      ["rights_modification", "Rights modification conditions", "long_text", "asset", CLAIM],
      ["authoritative_record", "Authoritative ownership record", "text", "asset", BACKED],
    ],
  },
  {
    prefix: "provider",
    category: "Service providers",
    conflictPolicy: "documents_first",
    rows: [
      ["platform", "Platform", "organization", "asset", CLAIM],
      ["manager", "Manager", "organization", "asset", [FD]],
      ["sub_advisor", "Sub-advisor", "organization", "asset", [FD]],
      ["custodian", "Custodian", "organization", "asset", BACKED],
      ["crypto_custodian", "Crypto custodian", "organization", "asset", BACKED],
      ["transfer_agent", "Transfer agent", "organization", "asset", SECURITY],
      ["fund_administrator", "Fund administrator", "organization", "asset", [FD]],
      ["traditional_broker", "Traditional broker", "organization", "asset", [EQ]],
      // Financial or reserve assurance. Smart contract reviewers are security.audit_firm.
      ["financial_auditor", "Financial or reserve auditor", "organization", "asset", BACKED, { asOf: true }],
      ["custodian_legal_identifier", "Custodian legal identifier", "identifier", "asset", BACKED],
      ["crypto_broker", "Crypto broker", "organization", "asset", [EQ]],
      ["paying_agent", "Paying agent", "organization", "asset", SECURITY],
      ["digital_transfer_agent", "Digital transfer agent", "organization", "asset", SECURITY],
      ["security_trustee", "Security trustee", "organization", "asset", RWA],
      ["attestation_frequency", "Attestation frequency", "text", "asset", BACKED],
      ["transparency_method", "Transparency method", "text", "asset", CLAIM],
    ],
  },
  {
    prefix: "primary",
    category: "Primary market",
    conflictPolicy: "documents_first",
    rows: [
      ["eligible_investors", "Eligible investors", "list", "asset", CLAIM],
      ["kyc_required", "KYC required", "boolean", "asset", CLAIM],
      ["base_assets", "Base assets", "list", "asset", CLAIM],
      ["subscription_time", "Subscription time", "text", "asset", CLAIM],
      ["redemption_time", "Redemption time", "text", "asset", CLAIM],
      ["open_ended", "Open-ended", "boolean", "asset", [FD]],
      ["kyc_description", "KYC description", "long_text", "asset", CLAIM],
      ["subscription_frequency", "Subscription frequency", "text", "asset", CLAIM],
      ["redemption_frequency", "Redemption frequency", "text", "asset", CLAIM],
      ["subscriptions_open", "Subscriptions open", "boolean", "asset", CLAIM, { asOf: true }],
      ["redemptions_open", "Redemptions open", "boolean", "asset", CLAIM, { asOf: true }],
      ["subscription_description", "Subscription description", "long_text", "asset", CLAIM],
      ["redemption_description", "Redemption description", "long_text", "asset", CLAIM],
      ["term", "Term", "text", "asset", [FD]],
      ["route", "Primary route", "text", "asset", CLAIM],
      ["eligible_jurisdictions", "Eligible jurisdictions", "list", "asset", CLAIM, { asOf: true }],
      ["excluded_jurisdictions", "Excluded jurisdictions", "list", "asset", CLAIM, { asOf: true }],
      ["right_to_redeem", "Right to redeem", "boolean", "asset", CLAIM],
      ["physical_redemption", "Physical redemption", "boolean", "asset", [EQ, CM, WR]],
      ["lockup_period", "Lockup period", "text", "asset", CLAIM],
    ],
  },
  {
    prefix: "token",
    category: "Token, per chain",
    conflictPolicy: "chain_first",
    rows: [
      ["standard", "Token standard", "list", "token", ALL],
      ["network", "Network", "text", "token", ALL],
      ["contract_address", "Contract address", "address", "token", ALL],
      ["decimals", "Decimals", "integer", "token", ALL],
      ["issuance_type", "Issuance type", "enum", "token", ALL],
      ["tokenization_type", "Tokenization type", "enum", "token", BACKED],
      ["platform", "Platform", "organization", "token", CLAIM],
      ["extensions", "Token extensions", "list", "token", ALL, { asOf: true }],
      ["admin_permissions", "Admin permissions", "list", "token", ALL, { asOf: true }],
      ["first_issued_date", "First issued date", "date", "token", ALL],
      ["bridge_platforms", "Bridge platforms", "list", "token", ALL, { asOf: true }],
      ["dti", "DTI", "identifier", "token", ALL],
      ["transferability", "Transferability", "text", "token", ALL, { asOf: true }],
    ],
  },
  {
    // Contract-wide rows (proxy, verified source) use the record key "contract".
    prefix: "control",
    category: "Control and upgradeability",
    conflictPolicy: "chain_first",
    rows: [
      ["contract_or_program", "Contract or program", "text", "contract", ALL, { group: "control" }],
      ["authority_role", "Authority role", "enum", "contract", ALL, { group: "control" }],
      ["holder_address", "Holder address", "address", "contract", ALL, { group: "control", asOf: true }],
      ["holder_type", "Holder type", "enum", "contract", ALL, { group: "control", asOf: true }],
      ["multisig_threshold", "Multisig threshold", "text", "contract", ALL, { group: "control", asOf: true }],
      ["signers_disclosed", "Signers disclosed", "boolean", "contract", ALL, { group: "control", asOf: true }],
      ["timelock_delay", "Timelock delay", "text", "contract", ALL, { group: "control", asOf: true }],
      ["proxy_pattern", "Proxy pattern", "text", "contract", ALL, { group: "control", asOf: true }],
      ["verified_source_status", "Verified source status", "enum", "contract", ALL, { group: "control", asOf: true }],
    ],
  },
  {
    prefix: "security",
    category: "Security and incidents",
    conflictPolicy: "documents_first",
    rows: [
      ["audit_firm", "Smart contract audit firm", "organization", "asset", ALL, { group: "audit" }],
      ["audit_date", "Audit date", "date", "asset", ALL, { group: "audit" }],
      ["audit_scope", "Audit scope and version", "long_text", "asset", ALL, { group: "audit" }],
      ["bug_bounty_platform", "Bug bounty platform", "organization", "asset", ALL, { group: "bug_bounty", asOf: true }],
      ["incident_date", "Incident date", "date", "asset", ALL, { group: "incident" }],
      ["incident_type", "Incident type", "enum", "asset", ALL, { group: "incident" }],
      ["incident_affected_entity", "Incident affected entity", "text", "asset", ALL, { group: "incident" }],
      ["incident_directly_affected", "Directly affected", "boolean", "asset", ALL, { group: "incident" }],
      ["remediation_status", "Remediation status", "enum", "asset", ALL, { group: "incident", asOf: true }],
    ],
  },
  {
    prefix: "governance",
    category: "Governance",
    conflictPolicy: "documents_first",
    rows: [
      ["model", "Governance model", "text", "asset", PROTOCOL, { asOf: true }],
      ["decision_process", "Decision process and venue", "long_text", "asset", PROTOCOL, { asOf: true }],
      ["governing_entity", "Governing entity", "organization", "asset", PROTOCOL, { asOf: true }],
      ["parent_protocol", "Parent protocol", "text", "asset", [DF, WR]],
    ],
  },
  {
    prefix: "technology",
    category: "Technology and dependencies",
    conflictPolicy: "documents_first",
    rows: [
      ["consensus_mechanism", "Consensus mechanism", "text", "network", ALL],
      ["network_layer", "Network layer", "enum", "network", ALL],
      ["parent_network", "Parent network", "text", "network", ALL],
      ["chain_id", "Chain ID", "identifier", "network", ALL],
      ["oracle_provider", "Oracle provider", "organization", "asset", ALL, { group: "oracle", asOf: true }],
      ["oracle_role", "Oracle role", "text", "asset", ALL, { group: "oracle", asOf: true }],
      ["protocol_dependencies", "Protocol dependencies", "list", "asset", ALL, { asOf: true }],
      ["staking_design", "Staking design", "long_text", "asset", PROTOCOL],
      ["slashing_status", "Slashing status", "enum", "asset", PROTOCOL, { asOf: true }],
    ],
  },
];

export const FIELDS: readonly FieldDefinition[] = CATEGORIES.flatMap((category) =>
  category.rows.map(([name, label, valueType, level, applicable, options]) => ({
    key: `${category.prefix}.${name}`,
    category: category.category,
    label,
    valueType,
    level,
    applicableAssetTypes: applicable,
    conflictPolicy: category.conflictPolicy,
    requiresAsOf: options?.asOf ?? false,
    recordGroup: options?.group ?? null,
  })),
);
