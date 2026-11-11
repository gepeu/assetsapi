/**
 * Declares the routes a test file exercises, as "METHOD /path" with the contract's path template,
 * such as "GET /assets/{slug}". It does nothing when run: routeCoverage.test.ts reads these
 * calls from the source, and fails when a route in the contract has none.
 */
export function coversRoutes(_routes: readonly string[]): void {}
