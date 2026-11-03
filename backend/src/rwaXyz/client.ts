export const RWA_XYZ_BASE_URL = "https://api.rwa.xyz/v4";
const REQUEST_INTERVAL_MS = 250;
const PER_PAGE = 100;

export type ApiRecord = Record<string, unknown>;

export interface RawResponse {
  path: string;
  status: number;
  body: string;
}

export interface RwaXyzClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Called with every response, so a caller can keep raw copies for audit. */
  onResponse?: (response: RawResponse) => Promise<void>;
  requestIntervalMs?: number;
}

/** Errors name the path and status only, so the key can't end up in a log. */
export class RwaXyzError extends Error {
  readonly status: number;

  constructor(path: string, status: number) {
    super(`RWA.xyz returned HTTP ${status} for ${path}`);
    this.status = status;
  }
}

export class RwaXyzClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly onResponse?: RwaXyzClientOptions["onResponse"];
  private readonly requestIntervalMs: number;
  private nextRequestAt = 0;

  constructor(options: RwaXyzClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? RWA_XYZ_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.onResponse = options.onResponse;
    this.requestIntervalMs = options.requestIntervalMs ?? REQUEST_INTERVAL_MS;
  }

  private async get(path: string): Promise<unknown> {
    const delay = this.nextRequestAt - Date.now();
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    this.nextRequestAt = Date.now() + this.requestIntervalMs;

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(60_000),
    });
    const body = await response.text();
    await this.onResponse?.({ path, status: response.status, body });
    if (!response.ok) throw new RwaXyzError(path, response.status);
    return JSON.parse(body);
  }

  /** Returns null if RWA.xyz has no asset with this ID. */
  async getAsset(id: number): Promise<ApiRecord | null> {
    try {
      return (await this.get(`/assets/${id}`)) as ApiRecord;
    } catch (error) {
      if (error instanceof RwaXyzError && error.status === 404) return null;
      throw error;
    }
  }

  async getNetwork(id: number): Promise<ApiRecord | null> {
    try {
      return (await this.get(`/networks/${id}`)) as ApiRecord;
    } catch (error) {
      if (error instanceof RwaXyzError && error.status === 404) return null;
      throw error;
    }
  }

  async findAssetsByTicker(ticker: string): Promise<ApiRecord[]> {
    const { results } = (await this.get(
      `/assets?ticker=${encodeURIComponent(ticker)}&per_page=${PER_PAGE}`,
    )) as { results?: ApiRecord[] };
    return results ?? [];
  }

  async findTokensByAddress(address: string): Promise<ApiRecord[]> {
    const { results } = (await this.get(
      `/tokens?address=${encodeURIComponent(address)}&per_page=${PER_PAGE}`,
    )) as { results?: ApiRecord[] };
    return results ?? [];
  }

  async listTokensForAsset(assetId: number): Promise<ApiRecord[]> {
    const tokens: ApiRecord[] = [];
    for (let page = 1; ; page++) {
      const { results, pagination } = (await this.get(
        `/tokens?asset_id=${assetId}&per_page=${PER_PAGE}&page=${page}`,
      )) as { results?: ApiRecord[]; pagination?: { pageCount?: number } };
      tokens.push(...(results ?? []));
      if (page >= (pagination?.pageCount ?? 1)) return tokens;
    }
  }
}
