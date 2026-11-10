/** Tests for HttpClient. */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { AuthOrQuotaError, ContractBrokenError, NotFoundError, TransientError } from '../../src/providers/errors.ts';
import { HttpClient, type HttpClientOptions } from '../../src/providers/http.ts';

type Step = { status?: number; body?: string; headers?: Record<string, string> } | Error;

/** A client whose clock only moves when it sleeps, so tests take no real time. */
function makeClient(steps: readonly Step[], options: Partial<HttpClientOptions> = {}) {
  let time = 1_000_000;
  const sleeps: number[] = [];
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  let index = 0;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const step = steps[Math.min(index++, steps.length - 1)];
    if (step === undefined) throw new Error('no step');
    if (step instanceof Error) throw step;
    return new Response(step.body ?? '{}', { status: step.status ?? 200, headers: step.headers ?? {} });
  }) as typeof fetch;
  const client = new HttpClient({
    provider: 'Test',
    baseUrl: 'https://example.test',
    requestIntervalMs: 250,
    fetchImpl,
    now: () => time,
    sleep: async (ms) => {
      sleeps.push(ms);
      time += ms;
    },
    ...options,
  });
  return { client, sleeps, calls, setTime: (next: number) => (time = next), getTime: () => time };
}

describe('network guard', () => {
  test('the real fetch is blocked in every test, so none can reach a provider', () => {
    assert.equal(globalThis.fetch.name, 'blockedFetch', 'Run the tests with: npm test');
  });
});

describe('HttpClient', () => {
  test('returns parsed JSON and sends its headers', async () => {
    const { client, calls } = makeClient([{ body: '{"ok":true}' }], { headers: { Authorization: 'Bearer secret' } });
    assert.deepEqual(await client.getJson('/a'), { ok: true });
    assert.equal(calls[0]?.url, 'https://example.test/a');
    assert.deepEqual(calls[0]?.init?.headers, { Authorization: 'Bearer secret' });
  });

  test('paces requests apart', async () => {
    const { client, sleeps } = makeClient([{}, {}, {}]);
    await client.getJson('/a');
    await client.getJson('/b');
    await client.getJson('/c');
    assert.deepEqual(sleeps, [250, 250]);
  });

  test('a 5xx is retried with growing backoff, then succeeds', async () => {
    const { client, sleeps, calls } = makeClient([{ status: 500 }, { status: 503 }, { body: '[1]' }]);
    assert.deepEqual(await client.getJson('/a'), [1]);
    assert.equal(calls.length, 3);
    assert.ok((sleeps[0] ?? 0) >= 1000);
    assert.ok(sleeps.includes(2000));
  });

  test('a 5xx that never clears ends as Transient', async () => {
    const { client, calls } = makeClient([{ status: 502 }], { maxRetries: 2 });
    await assert.rejects(client.getJson('/a'), TransientError);
    assert.equal(calls.length, 3);
  });

  test('a network failure is Transient and its message names only the path', async () => {
    const { client } = makeClient([new Error('connect failed with Bearer secret-key')], { maxRetries: 1 });
    await assert.rejects(client.getJson('/a'), (error: Error) => {
      assert.ok(error instanceof TransientError);
      assert.ok(!error.message.includes('secret-key'));
      assert.ok(error.message.includes('/a'));
      return true;
    });
  });

  test('a network failure says why, by its name and system code only', async () => {
    const refused = new TypeError('fetch failed for Bearer secret-key', { cause: { code: 'ECONNREFUSED' } });
    const timedOut = new DOMException('Bearer secret-key', 'TimeoutError');
    const { client } = makeClient([refused], { maxRetries: 0 });
    await assert.rejects(client.getJson('/a'), /request failed for \/a \(ECONNREFUSED\)$/);
    const second = makeClient([timedOut], { maxRetries: 0 });
    await assert.rejects(second.client.getJson('/a'), /request failed for \/a \(timed out\)$/);
  });

  test('a 404 is NotFound, with no retry', async () => {
    const { client, calls } = makeClient([{ status: 404 }]);
    await assert.rejects(client.getJson('/a'), NotFoundError);
    assert.equal(calls.length, 1);
  });

  for (const status of [401, 402, 403]) {
    test(`a ${status} is AuthOrQuota, with no retry`, async () => {
      const { client, calls } = makeClient([{ status }]);
      await assert.rejects(client.getJson('/a'), AuthOrQuotaError);
      assert.equal(calls.length, 1);
    });
  }

  test("another 4xx means our request no longer fits, so it's ContractBroken", async () => {
    const { client } = makeClient([{ status: 400 }]);
    await assert.rejects(client.getJson('/a'), ContractBrokenError);
  });

  test('invalid JSON is ContractBroken', async () => {
    const { client } = makeClient([{ body: '<html>' }]);
    await assert.rejects(client.getJson('/a'), ContractBrokenError);
  });

  test('a 429 waits until X-RateLimit-Reset, then retries', async () => {
    const reset = Math.ceil((1_000_000 + 30_000) / 1000);
    const { client, getTime, calls } = makeClient([
      { status: 429, headers: { 'X-RateLimit-Reset': String(reset) } },
      { body: '{}' },
    ]);
    await client.getJson('/a');
    assert.equal(calls.length, 2);
    assert.ok(getTime() >= reset * 1000);
  });

  test('a 429 honours Retry-After', async () => {
    const { client, getTime } = makeClient([{ status: 429, headers: { 'Retry-After': '10' } }, { body: '{}' }]);
    await client.getJson('/a');
    assert.ok(getTime() >= 1_010_000);
  });

  test('a 429 that resets too far away is a used-up quota', async () => {
    const reset = Math.ceil((1_000_000 + 3_600_000) / 1000);
    const { client } = makeClient([{ status: 429, headers: { 'X-RateLimit-Reset': String(reset) } }]);
    await assert.rejects(client.getJson('/a'), AuthOrQuotaError);
  });

  test('a 429 that never lets up ends as Transient', async () => {
    const { client } = makeClient([{ status: 429 }], { maxRetries: 2 });
    await assert.rejects(client.getJson('/a'), TransientError);
  });

  test('zero remaining waits for the window before the next request', async () => {
    const reset = Math.ceil((1_000_000 + 20_000) / 1000);
    const { client, getTime } = makeClient([
      { headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(reset) } },
      {},
    ]);
    await client.getJson('/a');
    assert.ok(getTime() < reset * 1000);
    await client.getJson('/b');
    assert.ok(getTime() >= reset * 1000);
  });
});
