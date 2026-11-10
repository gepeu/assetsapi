/**
 * Loaded before every test by `npm test`, so no test can reach RWA.xyz, Kamino or anything else.
 * Tests inject a fake `fetchImpl`, and the real one must never run. The failure is thrown outside the
 * caller, because the code under test catches network errors and would otherwise treat it as an outage.
 */
function blockedFetch(input: unknown): never {
  const failure = new Error(`A test tried to reach the network: ${String(input)}`);
  setImmediate(() => {
    throw failure;
  });
  throw failure;
}

globalThis.fetch = blockedFetch as typeof fetch;
