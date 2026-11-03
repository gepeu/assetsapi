const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_CLIENT = 10;
/** Holds even if an attacker changes address or forges the header that identifies them. */
const MAX_FAILURES_TOTAL = 100;

interface FailureCount {
  count: number;
  resetsAt: number;
}

/**
 * Limits failed sign-ins, per client and overall. Counts live in memory, so a restart clears them.
 * Reaching the overall limit blocks every new sign-in until it resets. Existing sessions keep working.
 */
export class LoginLimiter {
  private readonly clients = new Map<string, FailureCount>();
  private total: FailureCount | undefined;
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** Seconds until this client may try again, or 0 if it may try now. */
  retryAfterSeconds(client: string): number {
    const now = this.now();
    const blockedUntil = Math.max(
      blockedUntilTime(this.clients.get(client), MAX_FAILURES_PER_CLIENT, now),
      blockedUntilTime(this.total, MAX_FAILURES_TOTAL, now),
    );
    return blockedUntil === 0 ? 0 : Math.ceil((blockedUntil - now) / 1000);
  }

  recordFailure(client: string): void {
    const now = this.now();
    for (const [key, failures] of this.clients) {
      if (failures.resetsAt <= now) this.clients.delete(key);
    }
    this.clients.set(client, increment(this.clients.get(client), now));
    this.total = increment(this.total, now);
  }

  /** Clears only this client's count, so signing in can't reset the overall limit. */
  recordSuccess(client: string): void {
    this.clients.delete(client);
  }
}

function blockedUntilTime(failures: FailureCount | undefined, limit: number, now: number): number {
  return failures && failures.resetsAt > now && failures.count >= limit ? failures.resetsAt : 0;
}

function increment(failures: FailureCount | undefined, now: number): FailureCount {
  return failures && failures.resetsAt > now
    ? { count: failures.count + 1, resetsAt: failures.resetsAt }
    : { count: 1, resetsAt: now + WINDOW_MS };
}
