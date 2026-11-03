import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 60_000;
/** Identifies us honestly. Bot walls are recorded as failures, never worked around. */
const USER_AGENT = "rwa-agent-document-fetcher/0.1";

const LOGIN_PATH = /(^|\/)(login|log-in|signin|sign-in|sign_in|auth\/|oauth)/i;

const privateAddresses = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  privateAddresses.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  privateAddresses.addSubnet(network, prefix, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  // BlockList has no rule for IPv4-mapped IPv6: one would match every IPv4 address too.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (mapped) return !privateAddresses.check(mapped, "ipv4");
  return !privateAddresses.check(address, isIP(address) === 6 ? "ipv6" : "ipv4");
}

async function resolvesToPublicAddress(hostname: string): Promise<boolean> {
  const bare = hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(bare) ? [{ address: bare }] : await lookup(bare, { all: true });
  return addresses.length > 0 && addresses.every(({ address }) => isPublicAddress(address));
}

export interface FetchOptions {
  /** Called for each hop's host. Returning false stops the fetch with a recorded error. */
  isHostAllowed?: (hostname: string) => boolean;
  maxBytes?: number;
  timeoutMs?: number;
  /** Tests only: lets the fetcher reach a local test server. */
  allowPrivateHosts?: boolean;
}

export interface FetchResult {
  ok: boolean;
  url: string;
  finalUrl: string | null;
  redirectChain: { url: string; status: number }[];
  httpStatus: number | null;
  contentType: string | null;
  body: Uint8Array | null;
  error: string | null;
}

async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > maxBytes) {
    await response.body?.cancel();
    return null;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body ?? []) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * Fetches one public http(s) URL, following redirects by hand so each hop gets checked.
 * Never sends cookies or credentials, and never throws: a failure comes back as a result,
 * so the attempt can be recorded.
 */
export async function fetchDocument(url: string, options: FetchOptions = {}): Promise<FetchResult> {
  const {
    isHostAllowed = () => true,
    maxBytes = MAX_DOCUMENT_BYTES,
    timeoutMs = TIMEOUT_MS,
    allowPrivateHosts = false,
  } = options;

  const redirectChain: FetchResult["redirectChain"] = [];
  let current = url;
  let httpStatus: number | null = null;
  const signal = AbortSignal.timeout(timeoutMs);

  const failure = (error: string): FetchResult => ({
    ok: false,
    url,
    finalUrl: current,
    redirectChain,
    httpStatus,
    contentType: null,
    body: null,
    error,
  });

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const parsed = new URL(current);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return failure(`Only http(s) URLs are allowed, got ${parsed.protocol}`);
      }
      if (parsed.username || parsed.password) return failure("URLs with credentials are not allowed");
      if (!isHostAllowed(parsed.hostname)) return failure(`Redirected off the allowed domains to ${parsed.hostname}`);
      if (hop > 0 && LOGIN_PATH.test(parsed.pathname)) return failure("Login required: redirected to a sign-in page");
      if (!allowPrivateHosts && !(await resolvesToPublicAddress(parsed.hostname))) {
        return failure(`${parsed.hostname} does not resolve to a public address`);
      }

      const response = await fetch(current, {
        redirect: "manual",
        credentials: "omit",
        signal,
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/pdf,text/plain,*/*;q=0.5" },
      });
      httpStatus = response.status;

      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel();
        redirectChain.push({ url: current, status: response.status });
        current = new URL(location, current).toString();
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel();
        return failure(`HTTP ${response.status}`);
      }

      const body = await readLimited(response, maxBytes);
      if (!body) return failure(`Larger than the ${maxBytes}-byte limit`);
      return {
        ok: true,
        url,
        finalUrl: current,
        redirectChain,
        httpStatus,
        contentType: response.headers.get("content-type"),
        body,
        error: null,
      };
    }
    return failure(`More than ${MAX_REDIRECTS} redirects`);
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause?.code;
    return failure(cause ?? (error instanceof Error ? error.message : String(error)));
  }
}

/** Spaces out requests to each host. Run calls one after another for this to hold. */
export class HostRateLimiter {
  private readonly nextAllowed = new Map<string, number>();
  private readonly intervalMs: number;

  constructor(intervalMs: number) {
    this.intervalMs = intervalMs;
  }

  async wait(url: string): Promise<void> {
    const host = new URL(url).hostname;
    const delay = (this.nextAllowed.get(host) ?? 0) - Date.now();
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    this.nextAllowed.set(host, Date.now() + this.intervalMs);
  }
}
