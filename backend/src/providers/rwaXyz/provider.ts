/**
 * Puts RWA.xyz behind the provider interfaces. Reference and current values come from the same two
 * records, so the last asset's records are kept briefly rather than fetched twice, and network
 * records are kept for the whole run because they rarely change and one can reach 1 MB.
 */
import { ContractBrokenError } from "../errors.ts";
import type {
  AddressResolver,
  CurrentData,
  CurrentValue,
  FieldInput,
  FinancialProvider,
  HistoryData,
  HistorySeries,
  NetworkInput,
  OrganizationInput,
  ProviderRef,
  ReferenceData,
  ReferenceProvider,
  TokenInput,
  TokenRef,
} from "../types.ts";
import { type ApiRecord, isRecord, RwaXyzClient, type RwaXyzClientOptions } from "./client.ts";
import {
  ASSET_MAPPINGS,
  cleanValue,
  type FieldMapping,
  ISSUER_MAPPINGS,
  NETWORK_MAPPINGS,
  PLATFORM_FIELD,
  slugify,
  TOKEN_MAPPINGS,
  toAssetType,
  toIssuanceType,
} from "./mapping.ts";
import { toDailyPoints, toMeasureName, toMetrics, toStandardUnit } from "./measures.ts";

// The chain the universe is defined on. Other chains' history isn't loaded.
const SOLANA = "solana";
const SLUG_MAX_LENGTH = 64;

export type RwaXyzProvider = AddressResolver & ReferenceProvider & FinancialProvider;

export type RwaXyzProviderOptions = RwaXyzClientOptions & {
  /** The current UTC day, as YYYY-MM-DD. */
  today?: () => string;
};

interface AssetRecords {
  ref: ProviderRef;
  asset: ApiRecord;
  tokens: ApiRecord[];
}

const utcToday = (): string => new Date().toISOString().slice(0, 10);

const toDay = (value: unknown): string | null => {
  const date = typeof value === "string" ? value.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
};

const networkSlugOf = (token: ApiRecord): string | null => {
  const network = isRecord(token.network) ? token.network : null;
  return typeof network?.slug === "string" ? network.slug : null;
};

/** Hex addresses compare case-insensitively, and everything else exactly. */
function sameAddress(a: string, b: string): boolean {
  if (a === b) return true;
  return a.startsWith("0x") && b.startsWith("0x") && a.toLowerCase() === b.toLowerCase();
}

function requireString(record: ApiRecord, name: string, what: string): string {
  const value = record[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ContractBrokenError(`RWA.xyz ${what} has no ${name}`);
  }
  return value;
}

/** Null without a usable name. Only identity fields are read. */
function toOrganization(value: unknown): Omit<OrganizationInput, "fields"> | null {
  if (!isRecord(value)) return null;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name) return null;
  const slug = typeof value.slug === "string" && value.slug ? value.slug : slugify(name);
  const legalName = typeof value.legal_name === "string" ? value.legal_name : null;
  return { slug, name, legalName };
}

interface MappingResult {
  fields: FieldInput[];
  organizations: Omit<OrganizationInput, "fields">[];
  roles: { organization: string; role: string }[];
}

function applyMappings(mappings: readonly FieldMapping[], record: ApiRecord, asOf: string): MappingResult {
  const result: MappingResult = { fields: [], organizations: [], roles: [] };
  for (const mapping of mappings) {
    const raw = mapping.get(record);
    if (raw === null || raw === undefined) continue;

    if (mapping.type === "organization") {
      const organization = toOrganization(raw);
      if (!organization) continue;
      result.organizations.push(organization);
      if (mapping.role) result.roles.push({ organization: organization.slug, role: mapping.role });
      result.fields.push({
        field: mapping.field,
        value: { organization: organization.slug },
        raw: { name: organization.name, slug: organization.slug, legal_name: organization.legalName },
        asOf,
      });
      continue;
    }

    const value = cleanValue(mapping.type, raw);
    if (value !== null) result.fields.push({ field: mapping.field, value, raw, asOf });
  }
  return result;
}

export function createRwaXyzProvider({ today = utcToday, ...options }: RwaXyzProviderOptions): RwaXyzProvider {
  const client = new RwaXyzClient(options);
  const networkRecords = new Map<number, Promise<ApiRecord>>();
  let lastRecords: Promise<AssetRecords> | null = null;
  let lastRef: ProviderRef | null = null;

  const getNetworkRecord = (id: number): Promise<ApiRecord> => {
    let record = networkRecords.get(id);
    if (!record) {
      record = client.getNetwork(id);
      networkRecords.set(id, record);
      // A failure stays with this asset. Kept, it would fail every later asset on this network.
      void record.catch(() => networkRecords.delete(id));
    }
    return record;
  };

  const fetchRecords = async (ref: ProviderRef): Promise<AssetRecords> => {
    const asset = await client.getAsset(ref);
    const tokens = await client.listTokensForAsset(ref);
    return { ref, asset, tokens };
  };

  const getRecords = (ref: ProviderRef): Promise<AssetRecords> => {
    if (lastRecords && lastRef === ref) return lastRecords;
    lastRef = ref;
    lastRecords = fetchRecords(ref);
    return lastRecords;
  };

  /** Tokens hidden by RWA.xyz, or without an address and network, can't be placed. */
  const usableTokens = (records: AssetRecords, notes: string[]): ApiRecord[] =>
    records.tokens.filter((token) => {
      const name = typeof token.name === "string" ? token.name : "unnamed";
      if (token.hidden === true) {
        notes.push(`Skipped hidden token ${name}`);
        return false;
      }
      if (typeof token.address !== "string" || !token.address || typeof token.network_id !== "number") {
        notes.push(`Skipped token ${name}: no address or network`);
        return false;
      }
      return true;
    });

  const toNetwork = async (id: number, asOf: string): Promise<NetworkInput> => {
    const record = await getNetworkRecord(id);
    const parentId = typeof record.parent_network_id === "number" ? record.parent_network_id : null;
    const parent = parentId === null ? null : await getNetworkRecord(parentId);
    const networkAsOf = toDay(record._updated_at) ?? asOf;
    return {
      key: requireString(record, "slug", "network"),
      name: requireString(record, "name", "network"),
      addressCaseSensitive: record.evm_chain_id == null,
      fields: applyMappings(NETWORK_MAPPINGS, { ...record, parent_network_name: parent?.name ?? null }, networkAsOf)
        .fields,
    };
  };

  /** Our form of a token's address, which is lower case on EVM chains. */
  const toTokenRef = (token: ApiRecord, network: NetworkInput): TokenRef => {
    const address = token.address as string;
    return { network: network.key, address: network.addressCaseSensitive ? address : address.toLowerCase() };
  };

  const networksFor = async (tokens: readonly ApiRecord[], asOf: string): Promise<Map<number, NetworkInput>> => {
    const networks = new Map<number, NetworkInput>();
    for (const token of tokens) {
      const id = token.network_id as number;
      if (!networks.has(id)) networks.set(id, await toNetwork(id, asOf));
    }
    return networks;
  };

  const requireNetwork = (networks: Map<number, NetworkInput>, token: ApiRecord): NetworkInput => {
    const network = networks.get(token.network_id as number);
    if (!network) throw new ContractBrokenError("RWA.xyz token has an unknown network");
    return network;
  };

  return {
    async resolve(network, address) {
      const matches = (await client.findTokensByAddress(address)).filter(
        (token) =>
          token.hidden !== true &&
          networkSlugOf(token) === network &&
          typeof token.address === "string" &&
          sameAddress(token.address, address),
      );
      const ids = new Set(matches.map((token) => (isRecord(token.asset) ? token.asset.id : token.asset_id)));
      if (ids.size === 0) return null;
      if (ids.size > 1) throw new ContractBrokenError(`RWA.xyz lists ${address} on several assets`);
      const [id] = ids;
      if (typeof id !== "number" && typeof id !== "string") {
        throw new ContractBrokenError(`RWA.xyz lists ${address} without an asset`);
      }
      return String(id);
    },

    async getReference(ref): Promise<ReferenceData> {
      const records = await getRecords(ref);
      const { asset } = records;
      const asOf = toDay(asset._updated_at) ?? today();
      const notes: string[] = [];
      const tokens = usableTokens(records, notes);
      const networks = await networksFor(tokens, asOf);

      const organizations = new Map<string, OrganizationInput>();
      const addOrganizations = (found: readonly Omit<OrganizationInput, "fields">[]) => {
        for (const organization of found) {
          if (!organizations.has(organization.slug))
            organizations.set(organization.slug, { ...organization, fields: [] });
        }
      };

      const mapped = applyMappings(ASSET_MAPPINGS, asset, asOf);
      addOrganizations(mapped.organizations);

      const issuer = isRecord(asset.issuer) ? toOrganization(asset.issuer) : null;
      if (issuer && isRecord(asset.issuer)) {
        addOrganizations([issuer]);
        const entry = organizations.get(issuer.slug);
        if (entry) entry.fields = applyMappings(ISSUER_MAPPINGS, asset.issuer, asOf).fields;
      }

      const tokenInputs: TokenInput[] = [];
      const platforms = new Map<string, Omit<OrganizationInput, "fields">>();
      for (const token of tokens) {
        const network = requireNetwork(networks, token);
        const tokenMapped = applyMappings(TOKEN_MAPPINGS, token, toDay(token._updated_at) ?? asOf);
        addOrganizations(tokenMapped.organizations);
        for (const organization of tokenMapped.organizations) platforms.set(organization.slug, organization);
        tokenInputs.push({
          ...toTokenRef(token, network),
          issuanceType: toIssuanceType(token.issuance_type),
          fields: tokenMapped.fields,
        });
      }

      const fields = [...mapped.fields];
      const roles = [...mapped.roles];
      // The asset-level platform only makes sense when all its tokens share one.
      const [platform] = platforms.values();
      if (platforms.size === 1 && platform) {
        roles.push({ organization: platform.slug, role: "platform" });
        fields.push({
          field: PLATFORM_FIELD,
          value: { organization: platform.slug },
          raw: { name: platform.name, slug: platform.slug },
          asOf,
        });
      }

      const assetClass = requireString(asset, "asset_class_name", "asset");
      return {
        slug: slugify(requireString(asset, "slug", "asset"))
          .slice(0, SLUG_MAX_LENGTH)
          .replace(/-$/, ""),
        ticker: requireString(asset, "ticker", "asset"),
        name: requireString(asset, "name", "asset"),
        assetClass,
        assetType: toAssetType(assetClass),
        fields,
        organizations: [...organizations.values()],
        roles,
        networks: [...networks.values()],
        tokens: tokenInputs,
        notes,
      };
    },

    async getCurrent(ref): Promise<CurrentData> {
      const records = await getRecords(ref);
      const asOf = toDay(records.asset._updated_at) ?? today();
      const tokens = usableTokens(records, []);
      const networks = await networksFor(tokens, asOf);

      const values: CurrentValue[] = toMetrics(records.asset).map((metric) => ({ ...metric, token: null, asOf }));
      for (const token of tokens) {
        const tokenRef = toTokenRef(token, requireNetwork(networks, token));
        const tokenAsOf = toDay(token._updated_at) ?? asOf;
        for (const metric of toMetrics(token)) values.push({ ...metric, token: tokenRef, asOf: tokenAsOf });
      }
      return { values };
    },

    async getHistory(ref, since): Promise<HistoryData> {
      const records = await getRecords(ref);
      const asOf = toDay(records.asset._updated_at) ?? today();
      const day = today();
      const notes: string[] = [];
      const series: HistorySeries[] = [];
      const assetId = records.asset.id;

      const addSeries = (
        found: { measure: { slug: string; name: string | null; unit: string | null }; points: unknown[] },
        token: TokenRef | null,
      ) => {
        const points = toDailyPoints(found.points, day);
        if (points.length === 0) return;
        const measure = toMeasureName(found.measure.slug);
        series.push({
          measure,
          label: found.measure.name,
          unit: toStandardUnit(measure, found.measure.unit),
          token,
          points,
        });
      };

      for (const found of await client.timeseries("assets", [{ field: "asset_id", value: ref }], since)) {
        if (found.groupId === assetId) addSeries(found, null);
        else notes.push(`Skipped a ${found.measure.slug} series for another asset`);
      }

      const solanaTokens = usableTokens(records, []).filter((token) => networkSlugOf(token) === SOLANA);
      const [firstSolana] = solanaTokens;
      if (firstSolana) {
        const networks = await networksFor(solanaTokens, asOf);
        const tokenRefs = new Map(
          solanaTokens.map((token) => [token.id, toTokenRef(token, requireNetwork(networks, token))]),
        );
        const filters = [
          { field: "asset_id", value: ref },
          { field: "network_id", value: firstSolana.network_id as number },
        ];
        for (const found of await client.timeseries("tokens", filters, since)) {
          const tokenRef = tokenRefs.get(found.groupId);
          if (tokenRef) addSeries(found, tokenRef);
          else notes.push(`Skipped a ${found.measure.slug} series for a token we can't place`);
        }
      }
      return { series, notes };
    },
  };
}
