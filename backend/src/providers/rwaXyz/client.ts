/**
 * RWA.xyz HTTP calls and the API key. Responses start as unknown and are checked here for the shape
 * the adapter relies on, so a format change surfaces as ContractBrokenError on that asset.
 */
import { ContractBrokenError } from "../errors.ts";
import { HttpClient, type HttpClientOptions } from "../http.ts";

const RWA_XYZ_BASE_URL = "https://api.rwa.xyz/v4";
const PER_PAGE = 100;

export type ApiRecord = Record<string, unknown>;

export interface TimeseriesSeries {
  measure: { slug: string; name: string | null; unit: string | null };
  groupId: unknown;
  points: unknown[];
}

export type RwaXyzClientOptions = { apiKey: string } & Partial<Omit<HttpClientOptions, "provider" | "headers">>;

export function isRecord(value: unknown): value is ApiRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, what: string): ApiRecord {
  if (!isRecord(value)) throw new ContractBrokenError(`RWA.xyz ${what} isn't an object`);
  return value;
}

interface Page {
  results: ApiRecord[];
  pageCount: number;
}

function parsePage(body: unknown, what: string): Page {
  const page = expectRecord(body, what);
  if (!Array.isArray(page.results)) throw new ContractBrokenError(`RWA.xyz ${what} has no results list`);
  const pagination = isRecord(page.pagination) ? page.pagination : {};
  return {
    results: page.results.map((result: unknown) => expectRecord(result, `${what} result`)),
    pageCount: typeof pagination.pageCount === "number" ? pagination.pageCount : 1,
  };
}

function parseSeries(record: ApiRecord): TimeseriesSeries {
  const measure = expectRecord(record.measure, "series measure");
  if (typeof measure.slug !== "string" || measure.slug === "") {
    throw new ContractBrokenError("RWA.xyz series has no measure slug");
  }
  if (!Array.isArray(record.points)) throw new ContractBrokenError("RWA.xyz series has no points list");
  return {
    measure: {
      slug: measure.slug,
      name: typeof measure.name === "string" ? measure.name : null,
      unit: typeof measure.unit === "string" ? measure.unit : null,
    },
    groupId: isRecord(record.group) ? record.group.id : undefined,
    points: record.points,
  };
}

export class RwaXyzClient {
  private readonly http: HttpClient;

  constructor({ apiKey, ...options }: RwaXyzClientOptions) {
    this.http = new HttpClient({
      baseUrl: RWA_XYZ_BASE_URL,
      ...options,
      provider: "RWA.xyz",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  }

  async getAsset(id: string): Promise<ApiRecord> {
    return expectRecord(await this.http.getJson(`/assets/${encodeURIComponent(id)}`), "asset");
  }

  async getNetwork(id: number): Promise<ApiRecord> {
    return expectRecord(await this.http.getJson(`/networks/${id}`), "network");
  }

  async findTokensByAddress(address: string): Promise<ApiRecord[]> {
    const path = `/tokens?address=${encodeURIComponent(address)}&per_page=${PER_PAGE}`;
    return parsePage(await this.http.getJson(path), "token search").results;
  }

  async listTokensForAsset(assetId: string): Promise<ApiRecord[]> {
    const tokens: ApiRecord[] = [];
    for (let page = 1; ; page++) {
      const path = `/tokens?asset_id=${encodeURIComponent(assetId)}&per_page=${PER_PAGE}&page=${page}`;
      const { results, pageCount } = parsePage(await this.http.getJson(path), "token list");
      tokens.push(...results);
      if (page >= pageCount) return tokens;
    }
  }

  /**
   * Daily history for every measure the filters match, one series per measure and entity. The
   * grouping is explicit because the token endpoint otherwise groups by protocol.
   */
  async timeseries(
    scope: "assets" | "tokens",
    filters: readonly { field: string; value: string | number }[],
  ): Promise<TimeseriesSeries[]> {
    const conditions = filters.map(({ field, value }) => ({ operator: "equals", field, value: String(value) }));

    const series: TimeseriesSeries[] = [];
    for (let page = 1; ; page++) {
      const query = JSON.stringify({
        filter: { operator: "and", filters: conditions },
        aggregate: {
          groupBy: scope === "assets" ? "asset" : "token",
          aggregateFunction: "sum",
          interval: "day",
          mode: "stock",
        },
        pagination: { page, perPage: PER_PAGE },
      });
      const body = await this.http.getJson(`/${scope}/aggregates/timeseries?query=${encodeURIComponent(query)}`);
      const { results, pageCount } = parsePage(body, "timeseries");
      series.push(...results.map(parseSeries));
      if (page >= pageCount) return series;
    }
  }
}
