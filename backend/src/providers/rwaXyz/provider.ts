/**
 * Puts RWA.xyz behind the provider interfaces. Reference and current values come from the same
 * records, so one asset is loaded once and shared between them. Network records are kept for the
 * whole run, because they rarely change and one can reach 1 MB.
 */
import { ContractBrokenError } from "../errors.ts";
import {
  type AddressResolver,
  type CurrentData,
  type CurrentValue,
  type FieldInput,
  type FinancialProvider,
  type HistoryData,
  type HistorySeries,
  isDay,
  MAX_SLUG_LENGTH,
  type NetworkInput,
  type OrganizationInput,
  type ProviderRef,
  type ReferenceData,
  type ReferenceProvider,
  SOLANA_NETWORK,
  type TokenRef,
  utcToday,
} from "../types.ts";
import { type ApiRecord, isRecord, RwaXyzClient, type RwaXyzClientOptions, type TimeseriesSeries } from "./client.ts";
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

type RwaXyzProvider = AddressResolver & ReferenceProvider & FinancialProvider;

type RwaXyzProviderOptions = RwaXyzClientOptions & {
  /** The current UTC day, as YYYY-MM-DD. */
  today?: () => string;
};

type OrganizationIdentity = Omit<OrganizationInput, "fields">;

interface LoadedToken {
  id: unknown;
  record: ApiRecord;
  ref: TokenRef;
  networkId: number;
  asOf: string;
}

/** One asset's records, with its tokens placed on their networks. */
interface LoadedAsset {
  record: ApiRecord;
  asOf: string;
  tokens: LoadedToken[];
  networks: NetworkInput[];
  /** Things skipped while loading, for the run summary. */
  notes: string[];
}

const toDay = (value: unknown): string | null => {
  const date = typeof value === "string" ? value.slice(0, 10) : "";
  return isDay(date) ? date : null;
};

/** Hex addresses compare case-insensitively, and everything else exactly. */
function isSameAddress(a: string, b: string): boolean {
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
function toOrganization(value: unknown): OrganizationIdentity | null {
  if (!isRecord(value)) return null;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name) return null;
  const slug = typeof value.slug === "string" && value.slug ? value.slug : slugify(name);
  const legalName = typeof value.legal_name === "string" ? value.legal_name : null;
  return { slug, name, legalName };
}

interface MappingResult {
  fields: FieldInput[];
  organizations: OrganizationIdentity[];
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

function toNetworkInput(record: ApiRecord, parent: ApiRecord | null, fallbackAsOf: string): NetworkInput {
  const withParent = { ...record, parent_network_name: parent?.name ?? null };
  return {
    key: requireString(record, "slug", "network"),
    name: requireString(record, "name", "network"),
    // Addresses compare case-insensitively on EVM chains only.
    addressCaseSensitive: record.evm_chain_id == null,
    fields: applyMappings(NETWORK_MAPPINGS, withParent, toDay(record._updated_at) ?? fallbackAsOf).fields,
  };
}

function toReferenceData(loaded: LoadedAsset): ReferenceData {
  const { record, asOf } = loaded;
  const organizations = new Map<string, OrganizationInput>();
  const addOrganizations = (found: readonly OrganizationIdentity[]) => {
    for (const organization of found) {
      if (!organizations.has(organization.slug)) organizations.set(organization.slug, { ...organization, fields: [] });
    }
  };

  const mapped = applyMappings(ASSET_MAPPINGS, record, asOf);
  addOrganizations(mapped.organizations);

  const issuer = toOrganization(record.issuer);
  if (issuer && isRecord(record.issuer)) {
    addOrganizations([issuer]);
    const entry = organizations.get(issuer.slug);
    if (entry) entry.fields = applyMappings(ISSUER_MAPPINGS, record.issuer, asOf).fields;
  }

  const platforms = new Map<string, OrganizationIdentity>();
  const tokens = loaded.tokens.map((token) => {
    const tokenMapped = applyMappings(TOKEN_MAPPINGS, token.record, token.asOf);
    addOrganizations(tokenMapped.organizations);
    for (const organization of tokenMapped.organizations) platforms.set(organization.slug, organization);
    return { ...token.ref, issuanceType: toIssuanceType(token.record.issuance_type), fields: tokenMapped.fields };
  });

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

  const assetClass = requireString(record, "asset_class_name", "asset");
  return {
    slug: slugify(requireString(record, "slug", "asset"))
      .slice(0, MAX_SLUG_LENGTH)
      .replace(/-$/, ""),
    ticker: requireString(record, "ticker", "asset"),
    name: requireString(record, "name", "asset"),
    assetClass,
    assetType: toAssetType(assetClass),
    fields,
    organizations: [...organizations.values()],
    roles,
    networks: loaded.networks,
    tokens,
    notes: loaded.notes,
  };
}

function toCurrentData(loaded: LoadedAsset): CurrentData {
  const values: CurrentValue[] = toMetrics(loaded.record).map((metric) => ({
    ...metric,
    token: null,
    asOf: loaded.asOf,
  }));
  for (const token of loaded.tokens) {
    for (const metric of toMetrics(token.record)) values.push({ ...metric, token: token.ref, asOf: token.asOf });
  }
  return { values };
}

/** Null for a series with nothing left once the current day is dropped. */
function toHistorySeries(found: TimeseriesSeries, token: TokenRef | null, today: string): HistorySeries | null {
  const points = toDailyPoints(found.points, today);
  if (points.length === 0) return null;
  const measure = toMeasureName(found.measure.slug);
  return { measure, label: found.measure.name, unit: toStandardUnit(measure, found.measure.unit), token, points };
}

export function createRwaXyzProvider({ today = utcToday, ...options }: RwaXyzProviderOptions): RwaXyzProvider {
  const client = new RwaXyzClient(options);
  const networkRecords = new Map<number, Promise<ApiRecord>>();
  let lastLoad: { ref: ProviderRef; loaded: Promise<LoadedAsset> } | null = null;

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

  const loadNetwork = async (id: number, asOf: string): Promise<NetworkInput> => {
    const record = await getNetworkRecord(id);
    const parentId = typeof record.parent_network_id === "number" ? record.parent_network_id : null;
    const parent = parentId === null ? null : await getNetworkRecord(parentId);
    return toNetworkInput(record, parent, asOf);
  };

  const loadAsset = async (ref: ProviderRef): Promise<LoadedAsset> => {
    const record = await client.getAsset(ref);
    const tokenRecords = await client.listTokensForAsset(ref);
    const asOf = toDay(record._updated_at) ?? today();

    const notes: string[] = [];
    const networks = new Map<number, NetworkInput>();
    const tokens: LoadedToken[] = [];
    for (const token of tokenRecords) {
      const name = typeof token.name === "string" ? token.name : "unnamed";
      if (token.hidden === true) {
        notes.push(`Skipped hidden token ${name}`);
        continue;
      }
      const { address, network_id: networkId } = token;
      if (typeof address !== "string" || !address || typeof networkId !== "number") {
        notes.push(`Skipped token ${name}: no address or network`);
        continue;
      }
      const network = networks.get(networkId) ?? (await loadNetwork(networkId, asOf));
      networks.set(networkId, network);
      tokens.push({
        id: token.id,
        record: token,
        // Our form of an address, which is lower case on EVM chains.
        ref: { network: network.key, address: network.addressCaseSensitive ? address : address.toLowerCase() },
        networkId,
        asOf: toDay(token._updated_at) ?? asOf,
      });
    }
    return { record, asOf, tokens, networks: [...networks.values()], notes };
  };

  const getLoadedAsset = (ref: ProviderRef): Promise<LoadedAsset> => {
    if (lastLoad?.ref === ref) return lastLoad.loaded;
    const loaded = loadAsset(ref);
    lastLoad = { ref, loaded };
    return loaded;
  };

  return {
    async resolve(network, address) {
      const matches = (await client.findTokensByAddress(address)).filter((token) => {
        const tokenNetwork = isRecord(token.network) ? token.network.slug : null;
        return (
          token.hidden !== true &&
          tokenNetwork === network &&
          typeof token.address === "string" &&
          isSameAddress(token.address, address)
        );
      });
      const ids = new Set(matches.map((token) => (isRecord(token.asset) ? token.asset.id : token.asset_id)));
      if (ids.size === 0) return null;
      if (ids.size > 1) throw new ContractBrokenError(`RWA.xyz lists ${address} on several assets`);
      const [id] = ids;
      if (typeof id !== "number" && typeof id !== "string") {
        throw new ContractBrokenError(`RWA.xyz lists ${address} without an asset`);
      }
      return String(id);
    },

    getReference: async (ref) => toReferenceData(await getLoadedAsset(ref)),

    getCurrent: async (ref) => toCurrentData(await getLoadedAsset(ref)),

    async getHistory(ref): Promise<HistoryData> {
      const loaded = await getLoadedAsset(ref);
      const day = today();
      const notes: string[] = [];
      const series: HistorySeries[] = [];
      const addSeries = (found: TimeseriesSeries, token: TokenRef | null) => {
        const converted = toHistorySeries(found, token, day);
        if (converted) series.push(converted);
      };

      for (const found of await client.timeseries("assets", [{ field: "asset_id", value: ref }])) {
        if (found.groupId === loaded.record.id) addSeries(found, null);
        else notes.push(`Skipped a ${found.measure.slug} series for another asset`);
      }

      // Solana is the chain the universe is defined on. Other chains' history isn't loaded.
      const solanaTokens = loaded.tokens.filter((token) => token.ref.network === SOLANA_NETWORK);
      const [firstSolana] = solanaTokens;
      if (firstSolana) {
        const tokenRefs = new Map(solanaTokens.map((token) => [token.id, token.ref]));
        const filters = [
          { field: "asset_id", value: ref },
          { field: "network_id", value: firstSolana.networkId },
        ];
        for (const found of await client.timeseries("tokens", filters)) {
          const tokenRef = tokenRefs.get(found.groupId);
          if (tokenRef) addSeries(found, tokenRef);
          else notes.push(`Skipped a ${found.measure.slug} series for a token we can't place`);
        }
      }
      return { series, notes };
    },
  };
}
