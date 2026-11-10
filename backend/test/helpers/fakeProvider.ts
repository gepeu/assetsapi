/**
 * A programmable provider behind the real interfaces, so job tests exercise everything except the
 * network. Each asset's data is plain objects a test can change between runs.
 */
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { buildApp } from "../../src/api/app.ts";
import type { UpdateJobDeps } from "../../src/jobs/updateData.ts";
import { runUniverseJob, type UniverseJobDeps } from "../../src/jobs/updateUniverse.ts";
import type {
  CurrentData,
  HistoryData,
  ProviderRef,
  ReferenceData,
  TokenRef,
  VerifiedToken,
} from "../../src/providers/types.ts";
import { createTestDb, createTestKey, silentLogger, type TestDb } from "./testDb.ts";

export const TODAY = "2026-11-05";
export const YESTERDAY = "2026-11-04";

export interface FakeAsset {
  ref: ProviderRef;
  mint: string;
  reference: ReferenceData;
  current: CurrentData;
  history: HistoryData;
  /** Thrown by any fetch for this asset. */
  error?: Error;
}

export interface FakeAssetOptions {
  ref: string;
  slug?: string;
  ticker?: string;
  assetClass?: string;
  assetType?: ReferenceData["assetType"];
}

export function makeAsset(options: FakeAssetOptions): FakeAsset {
  const { ref } = options;
  const slug = options.slug ?? `asset-${ref}`;
  const ticker = options.ticker ?? `T${ref}`;
  const mint = `Mint${ref}AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`.slice(0, 44);
  const evmAddress = `0xABC${ref.padStart(37, "0")}`.toLowerCase();
  const solana: TokenRef = { network: "solana", address: mint };
  const value = Number(ref) + 1;

  const tracked = (val: number) => ({ val, val_7d: val - 1, val_30d: val - 2, val_90d: val - 3 });
  const figure = (metric: string, val: number, token: TokenRef | null = null) => ({
    metric,
    token,
    value: val,
    value7d: val - 1,
    value30d: val - 2,
    value90d: val - 3,
    raw: tracked(val),
    asOf: TODAY,
  });

  return {
    ref,
    mint,
    reference: {
      slug,
      ticker,
      name: `Asset ${ref}`,
      assetClass: options.assetClass ?? "Stablecoins",
      assetType: options.assetType === undefined ? "stablecoin" : options.assetType,
      fields: [
        { field: "identity.name", value: `Asset ${ref}`, raw: `Asset ${ref}`, asOf: TODAY },
        { field: "identity.ticker", value: ticker, raw: ticker, asOf: TODAY },
        { field: "identity.description", value: `About asset ${ref}`, raw: `About asset ${ref}`, asOf: TODAY },
        { field: "identity.rwa_xyz_slug", value: slug, raw: slug, asOf: TODAY },
        { field: "classification.sector", value: ["Cash"], raw: ["Cash"], asOf: TODAY },
        { field: "issuer.name", value: { organization: "shared-issuer" }, raw: { slug: "shared-issuer" }, asOf: TODAY },
        {
          field: "provider.manager",
          value: { organization: `manager-${ref}` },
          raw: { slug: `manager-${ref}` },
          asOf: TODAY,
        },
      ],
      organizations: [
        {
          slug: "shared-issuer",
          name: "Shared Issuer",
          legalName: "Shared Issuer Ltd",
          fields: [
            { field: "issuer.website", value: "https://issuer.example", raw: "https://issuer.example", asOf: TODAY },
          ],
        },
        { slug: `manager-${ref}`, name: `Manager ${ref}`, legalName: null, fields: [] },
      ],
      roles: [
        { organization: "shared-issuer", role: "issuer" },
        { organization: `manager-${ref}`, role: "manager" },
      ],
      networks: [
        {
          key: "solana",
          name: "Solana",
          addressCaseSensitive: true,
          fields: [{ field: "technology.network_layer", value: "L1", raw: "L1", asOf: TODAY }],
        },
        {
          key: "ethereum",
          name: "Ethereum",
          addressCaseSensitive: false,
          fields: [{ field: "technology.chain_id", value: "1", raw: 1, asOf: TODAY }],
        },
      ],
      tokens: [
        {
          network: "solana",
          address: mint,
          issuanceType: "native",
          fields: [
            { field: "token.decimals", value: 6, raw: 6, asOf: TODAY },
            { field: "token.standard", value: ["SPL"], raw: ["SPL"], asOf: TODAY },
          ],
        },
        {
          network: "ethereum",
          address: evmAddress,
          issuanceType: "bridged",
          fields: [{ field: "token.decimals", value: 18, raw: 18, asOf: TODAY }],
        },
      ],
      notes: [],
    },
    current: {
      values: [
        figure("price_dollar", value),
        figure("net_asset_value_dollar", value),
        figure("total_asset_value_dollar", value * 1000),
        figure("holding_addresses_count", value * 10),
        figure("top_holder_concentration", 500),
        figure("top_holder_concentration", 40, solana),
        figure("top_5_holder_concentration", 140, solana),
        figure("raw_supply", 5),
        figure("total_asset_value_dollar", value * 600, solana),
        figure("total_asset_value_dollar", value * 400, { network: "ethereum", address: evmAddress }),
        figure("market_value_dollar", value * 590, solana),
        figure("total_supply_token", value * 100, solana),
        figure("holding_addresses_count", value * 5, solana),
        {
          metric: "primary_market__subscription_frequency",
          token: null,
          value: null,
          value7d: null,
          value30d: null,
          value90d: null,
          raw: "Daily",
          asOf: TODAY,
        },
        {
          metric: "total_management_fee_bps",
          token: null,
          value: 25,
          value7d: null,
          value30d: null,
          value90d: null,
          raw: 25,
          asOf: TODAY,
        },
        {
          metric: "primary_markets",
          token: null,
          value: null,
          value7d: null,
          value30d: null,
          value90d: null,
          raw: [{ id: 1 }],
          asOf: TODAY,
        },
      ],
    },
    history: {
      series: [
        {
          measure: "price_dollar",
          label: "Price",
          unit: "dollar",
          token: null,
          points: [
            ["2026-11-01", value],
            ["2026-11-02", value + 1],
            ["2026-11-03", value + 2],
            [YESTERDAY, value + 3],
          ],
        },
        {
          measure: "top_holder_concentration",
          label: "Top holder",
          unit: "percent",
          token: solana,
          points: [
            ["2026-11-02", 50],
            ["2026-11-03", 150],
            [YESTERDAY, 40],
          ],
        },
        {
          measure: "raw_supply",
          label: "Raw supply",
          unit: "shares",
          token: null,
          points: [[YESTERDAY, 5]],
        },
        {
          measure: "holding_addresses_count",
          label: "Holders",
          unit: "address",
          token: solana,
          points: [[YESTERDAY, 77]],
        },
      ],
      notes: [],
    },
  };
}

export interface FakeProvider {
  assets: Map<ProviderRef, FakeAsset>;
  listError: Error | null;
  resolveError: Error | null;
  /** Mints the data provider no longer lists, though Kamino may. */
  unresolved: Set<string>;
  /** Mints Kamino no longer lists. */
  delisted: Set<string>;
  /** Overrides: a mint that now resolves to another ID. */
  movedTo: Map<string, ProviderRef>;
  /** Each getHistory call. */
  historyCalls: { ref: ProviderRef }[];
  extraTokens: VerifiedToken[];
}

export function createFakeProvider(assets: readonly FakeAsset[]): FakeProvider {
  return {
    assets: new Map(assets.map((asset) => [asset.ref, asset])),
    listError: null,
    resolveError: null,
    unresolved: new Set(),
    delisted: new Set(),
    movedTo: new Map(),
    historyCalls: [],
    extraTokens: [],
  };
}

function requireAsset(fake: FakeProvider, ref: ProviderRef): FakeAsset {
  const asset = fake.assets.get(ref);
  if (!asset) throw new Error(`The fake has no asset ${ref}`);
  if (asset.error) throw asset.error;
  return asset;
}

/** Copies, so a test changing its fake between runs is what the next run sees. */
const clone = <T>(value: T): T => structuredClone(value);

export function toProviders(fake: FakeProvider) {
  return {
    universe: {
      listTokens: async (): Promise<VerifiedToken[]> => {
        if (fake.listError) throw fake.listError;
        const tokens = [...fake.assets.values()]
          .filter((asset) => !fake.delisted.has(asset.mint))
          .map((asset) => ({ network: "solana", address: asset.mint }));
        return [...tokens, ...fake.extraTokens];
      },
    },
    resolver: {
      resolve: async (_network: string, address: string): Promise<ProviderRef | null> => {
        if (fake.resolveError) throw fake.resolveError;
        if (fake.unresolved.has(address)) return null;
        const moved = fake.movedTo.get(address);
        if (moved) return moved;
        return [...fake.assets.values()].find((asset) => asset.mint === address)?.ref ?? null;
      },
    },
    reference: { getReference: async (ref: ProviderRef) => clone(requireAsset(fake, ref).reference) },
    financial: {
      getCurrent: async (ref: ProviderRef) => clone(requireAsset(fake, ref).current),
      getHistory: async (ref: ProviderRef) => {
        fake.historyCalls.push({ ref });
        return clone(requireAsset(fake, ref).history);
      },
    },
  };
}

export function jobDeps(db: TestDb, overrides: Partial<UpdateJobDeps> = {}) {
  return {
    connectionString: db.url,
    pool: db.pool,
    logger: silentLogger,
    monitorUrl: null,
    stop: { isStopping: () => false },
    today: () => TODAY,
    ...overrides,
  };
}

export function updateDeps(db: TestDb, fake: FakeProvider, overrides: Partial<UpdateJobDeps> = {}): UpdateJobDeps {
  const { reference, financial } = toProviders(fake);
  return { ...jobDeps(db, overrides), reference, financial };
}

export function universeDeps(
  db: TestDb,
  fake: FakeProvider,
  overrides: Partial<UniverseJobDeps> = {},
): UniverseJobDeps {
  return { ...jobDeps(db, overrides), ...toProviders(fake), ...overrides };
}

/** Fills a database through the real universe job. */
export async function seedAssets(db: TestDb, assets: readonly FakeAsset[]): Promise<void> {
  await runUniverseJob(universeDeps(db, createFakeProvider(assets)));
}

export interface ApiHarness {
  db: TestDb;
  app: FastifyInstance;
  /** A GET with a valid key. */
  get(url: string): Promise<LightMyRequestResponse>;
  close(): Promise<void>;
}

/** A seeded database, the real app and a valid key. */
export async function createApiHarness(assets: readonly FakeAsset[]): Promise<ApiHarness> {
  const db = await createTestDb();
  await seedAssets(db, assets);
  // The data version is read on every request, so a test that changes data sees it at once.
  const app = await buildApp({ db: db.pool, logger: silentLogger, cacheVersionCheckMs: 0 });
  const headers = { authorization: `Bearer ${await createTestKey(db.pool)}` };
  return {
    db,
    app,
    get: (url) => app.inject({ method: "GET", url, headers }),
    close: async () => {
      await app.close();
      await db.close();
    },
  };
}
