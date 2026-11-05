/**
 * The interfaces providers supply, and the data types the jobs consume. Everything here is in our
 * own vocabulary: catalog field keys, our measure names and our asset types. Adapters work with the
 * provider's IDs, as an opaque `ProviderRef`, and never see database IDs.
 */

export type ProviderRef = string;

export type AssetType =
  | "tokenized_equity"
  | "tokenized_fund"
  | "tokenized_commodity"
  | "wrapped_crypto"
  | "native_crypto"
  | "defi_yield"
  | "stablecoin";

export type IssuanceType = "native" | "bridged" | "wrapper" | "unknown";

/** A cleaned value, or a reference to an organization listed in the same response. */
export type FieldContent = string | number | boolean | string[] | { organization: string };

export interface FieldInput {
  /** Catalog key, such as `identity.name`. */
  field: string;
  value: FieldContent;
  raw: unknown;
  asOf: string;
}

export interface OrganizationInput {
  slug: string;
  name: string;
  legalName: string | null;
  fields: FieldInput[];
}

export interface NetworkInput {
  key: string;
  name: string;
  addressCaseSensitive: boolean;
  fields: FieldInput[];
}

export interface TokenRef {
  network: string;
  address: string;
}

export interface TokenInput extends TokenRef {
  issuanceType: IssuanceType;
  fields: FieldInput[];
}

export interface ReferenceData {
  slug: string;
  ticker: string;
  name: string;
  assetClass: string;
  /** Null when the provider's class has no mapping yet, which holds a new asset back. */
  assetType: AssetType | null;
  fields: FieldInput[];
  organizations: OrganizationInput[];
  roles: { organization: string; role: string }[];
  networks: NetworkInput[];
  tokens: TokenInput[];
  /** Things the adapter skipped, for the run summary. */
  notes: string[];
}

export interface CurrentValue {
  metric: string;
  /** Null means the whole asset. */
  token: TokenRef | null;
  value: number | null;
  value7d: number | null;
  value30d: number | null;
  value90d: number | null;
  raw: unknown;
  asOf: string;
}

export interface CurrentData {
  values: CurrentValue[];
}

export interface HistorySeries {
  measure: string;
  label: string | null;
  unit: string | null;
  /** Null means the whole asset. */
  token: TokenRef | null;
  /** Oldest first, as [day, value], up to the last complete day. */
  points: [string, number][];
}

export interface HistoryData {
  series: HistorySeries[];
  notes: string[];
}

export interface VerifiedToken extends TokenRef {}

export interface UniverseProvider {
  listTokens(): Promise<VerifiedToken[]>;
}

export interface AddressResolver {
  /** The provider's ID for this exact address, or null if it doesn't list it. */
  resolve(network: string, address: string): Promise<ProviderRef | null>;
}

export interface ReferenceProvider {
  getReference(ref: ProviderRef): Promise<ReferenceData>;
}

export interface FinancialProvider {
  getCurrent(ref: ProviderRef): Promise<CurrentData>;
  /** A null `since` means the full series. */
  getHistory(ref: ProviderRef, since: string | null): Promise<HistoryData>;
}
