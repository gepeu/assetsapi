/**
 * Shared HTTP for providers: pacing, timeouts, retries and rate-limit headers. A class, because the
 * pacing is real state shared across calls. Every failure leaves here as one of the typed provider
 * errors, and messages carry only the path, never headers.
 */
import { setTimeout as delay } from "node:timers/promises";
import { settings } from "../config.ts";
import { AuthOrQuotaError, ContractBrokenError, NotFoundError, TransientError } from "./errors.ts";

/** Anything left out takes its value from the provider settings in config.ts. */
export interface HttpClientOptions {
  provider: string;
  baseUrl: string;
  headers?: Record<string, string>;
  requestIntervalMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
  maxRateLimitWaitMs?: number;
  backoffMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<unknown>;
  now?: () => number;
}

/**
 * Why a request failed, in terms that can't leak anything: an error's message can quote the request,
 * so only its name and system code are used.
 */
function toFailureReason(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  if (error.name === "TimeoutError") return "timed out";
  const code = (error.cause as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : error.name;
}

export class HttpClient {
  private readonly provider: string;
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly requestIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly maxRateLimitWaitMs: number;
  private readonly backoffMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<unknown>;
  private readonly now: () => number;
  private nextRequestAt = 0;

  constructor(options: HttpClientOptions) {
    this.provider = options.provider;
    this.baseUrl = options.baseUrl;
    this.headers = options.headers ?? {};
    const defaults = settings.providers;
    this.requestIntervalMs = options.requestIntervalMs ?? defaults.requestIntervalMs;
    this.timeoutMs = options.timeoutMs ?? defaults.timeoutMs;
    this.maxRetries = options.maxRetries ?? defaults.maxRetries;
    this.maxRateLimitWaitMs = options.maxRateLimitWaitMs ?? defaults.maxRateLimitWaitMs;
    this.backoffMs = options.backoffMs ?? defaults.backoffMs;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => delay(ms));
    this.now = options.now ?? Date.now;
  }

  async getJson(path: string): Promise<unknown> {
    let lastError: TransientError | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0 && lastError) await this.sleep(this.backoffMs * 2 ** (attempt - 1));
      await this.waitForTurn(path);

      let response: Response;
      let body: string;
      try {
        response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          headers: this.headers,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        body = await response.text();
      } catch (error) {
        lastError = new TransientError(`${this.provider}: request failed for ${path} (${toFailureReason(error)})`);
        continue;
      }

      this.noteRateLimit(response);
      if (response.ok) return this.parse(path, body);

      const status = response.status;
      if (status === 404) throw new NotFoundError(`${this.provider} returned 404 for ${path}`);
      if (status === 401 || status === 402 || status === 403) {
        throw new AuthOrQuotaError(`${this.provider} returned ${status} for ${path}`);
      }
      if (status === 429) {
        this.noteRetryAfter(response);
        lastError = undefined;
        // Counts as an attempt, so a provider that never lets up still ends in an error.
        if (attempt === this.maxRetries) lastError = new TransientError(`${this.provider} returned 429 for ${path}`);
        continue;
      }
      if (status === 408 || status >= 500) {
        lastError = new TransientError(`${this.provider} returned ${status} for ${path}`);
        continue;
      }
      throw new ContractBrokenError(`${this.provider} returned ${status} for ${path}`);
    }
    throw lastError ?? new TransientError(`${this.provider}: gave up on ${path}`);
  }

  private parse(path: string, body: string): unknown {
    try {
      return JSON.parse(body);
    } catch {
      throw new ContractBrokenError(`${this.provider} returned invalid JSON for ${path}`);
    }
  }

  private async waitForTurn(path: string): Promise<void> {
    const wait = this.nextRequestAt - this.now();
    if (wait > this.maxRateLimitWaitMs) {
      throw new AuthOrQuotaError(`${this.provider} rate limit won't reset soon enough for ${path}`);
    }
    if (wait > 0) await this.sleep(wait);
    this.nextRequestAt = Math.max(this.now(), this.nextRequestAt) + this.requestIntervalMs;
  }

  /** Stops early when the window is used up, rather than spending a request on a certain 429. */
  private noteRateLimit(response: Response): void {
    if (response.headers.get("x-ratelimit-remaining") !== "0") return;
    this.waitUntilReset(response);
  }

  private noteRetryAfter(response: Response): void {
    const retryAfter = Number(response.headers.get("retry-after"));
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      this.nextRequestAt = Math.max(this.nextRequestAt, this.now() + retryAfter * 1000);
      return;
    }
    if (!this.waitUntilReset(response)) {
      this.nextRequestAt = Math.max(this.nextRequestAt, this.now() + this.backoffMs);
    }
  }

  private waitUntilReset(response: Response): boolean {
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    if (!Number.isFinite(reset) || reset <= 0) return false;
    this.nextRequestAt = Math.max(this.nextRequestAt, reset * 1000);
    return true;
  }
}
