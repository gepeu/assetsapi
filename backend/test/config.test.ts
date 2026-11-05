/** Tests for loadApiConfig and loadSettings. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { loadApiConfig, loadSettings, toPercent } from "../src/config.ts";

const BACKEND_DIR = join(import.meta.dirname, "..");

/** Every variable loadSettings reads, taken from its source so a new one can't be missed. */
const SETTING_NAMES = [
  ...readFileSync(join(BACKEND_DIR, "src/config.ts"), "utf8").matchAll(
    /read(?:WholeNumber|Share|Url|Text|Path)\("([A-Z_]+)"/g,
  ),
].map((match) => match[1] ?? "");

/** The uncommented `NAME=value` lines of .env.example. */
const EXAMPLE_VALUES = new Map(
  readFileSync(join(BACKEND_DIR, ".env.example"), "utf8")
    .split("\n")
    .flatMap((line): [string, string][] => {
      const match = /^([A-Z_]+)=(.*)$/.exec(line);
      return match ? [[match[1] ?? "", match[2] ?? ""]] : [];
    }),
);

describe("config", () => {
  const NAMES = ["DATABASE_URL", "NODE_ENV", "API_AUTH_DISABLED", ...SETTING_NAMES];
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));
    for (const name of NAMES) delete process.env[name];
    process.env.DATABASE_URL = "postgres://rwa_api:x@127.0.0.1:5432/rwa";
  });
  afterEach(() => {
    for (const name of NAMES) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  test("keys are required by default", () => {
    assert.equal(loadApiConfig().authDisabled, false);
  });

  test("auth can be turned off locally", () => {
    process.env.API_AUTH_DISABLED = "true";
    assert.equal(loadApiConfig().authDisabled, true);
  });

  test("auth can't be turned off in production, so the API won't start", () => {
    process.env.NODE_ENV = "production";
    process.env.API_AUTH_DISABLED = "true";
    assert.throws(() => loadApiConfig(), /API_AUTH_DISABLED/);
  });

  test("production starts normally with the flag off or unset", () => {
    process.env.NODE_ENV = "production";
    assert.equal(loadApiConfig().authDisabled, false);
    process.env.API_AUTH_DISABLED = "false";
    assert.equal(loadApiConfig().authDisabled, false);
  });

  test("every setting has a default, which an empty variable keeps", () => {
    const defaults = loadSettings();
    assert.equal(defaults.api.poolSize, 5);
    assert.equal(defaults.api.rateLimitMax, 600);
    assert.equal(defaults.api.rateLimitWindowMs, 60_000);
    assert.equal(defaults.db.lockId, 7_315_204);
    assert.equal(defaults.limits.maxSlugLength, 64);
    assert.equal(defaults.jobs.maxFailedShare, 0.1);
    assert.equal(defaults.providers.rwaXyzBaseUrl, "https://api.rwa.xyz/v4");
    for (const name of SETTING_NAMES) process.env[name] = "";
    assert.deepEqual(loadSettings(), defaults);
  });

  test(".env.example lists every setting, with the default as its value", () => {
    assert.ok(SETTING_NAMES.length > 45);
    for (const name of SETTING_NAMES) assert.ok(EXAMPLE_VALUES.has(name), `${name} is missing from .env.example`);
    const defaults = loadSettings();
    for (const name of SETTING_NAMES) process.env[name] = EXAMPLE_VALUES.get(name);
    assert.deepEqual(loadSettings(), defaults);
  });

  test("settings can be changed, each from its own variable", () => {
    process.env.DB_POOL_SIZE = "8";
    process.env.RATE_LIMIT_MAX = "6000";
    process.env.JOB_MAX_FAILED_SHARE = "0.25";
    process.env.LARGE_SWING_SHARE = "1.5";
    process.env.PROVIDER_MAX_RETRIES = "0";
    process.env.RWA_XYZ_BASE_URL = "https://staging.example.test/v4/";
    const settings = loadSettings();
    assert.equal(settings.api.poolSize, 8);
    assert.equal(settings.api.rateLimitMax, 6000);
    assert.equal(settings.jobs.maxFailedShare, 0.25);
    assert.equal(settings.jobs.largeSwingShare, 1.5);
    assert.equal(settings.providers.maxRetries, 0);
    assert.equal(settings.providers.rwaXyzBaseUrl, "https://staging.example.test/v4");
  });

  test("a value that isn't a sensible number or address stops the process", () => {
    const bad: [string, string[]][] = [
      ["DB_POOL_SIZE", ["0", "-1", "2.5", "many", "51"]],
      ["RATE_LIMIT_MAX", ["0", "-5", "1.5", "unlimited"]],
      ["MAX_SLUG_LENGTH", ["0", "65"]],
      ["MAX_PAGE_OFFSET", ["2147483648"]],
      ["MAX_HISTORY_METRICS", ["0", "-1", "abc"]],
      ["MAX_NAMES_PER_PARAMETER", ["0", "1.5"]],
      ["PROVIDER_MAX_RETRIES", ["-1", "0.5"]],
      ["JOB_MAX_FAILED_SHARE", ["0", "1.5", "-0.1", "half"]],
      ["UNIVERSE_MIN_REMAINING_SHARE", ["0", "80"]],
      ["KAMINO_BASE_URL", ["api.kamino.finance", "ftp://api.kamino.finance"]],
    ];
    for (const [name, values] of bad) {
      for (const value of values) {
        process.env[name] = value;
        assert.throws(() => loadSettings(), new RegExp(name), `${name}=${value}`);
      }
      delete process.env[name];
    }
  });

  test("the API's query timeout has to stay above its statement timeout", () => {
    process.env.DB_QUERY_TIMEOUT_MS = "4000";
    assert.throws(() => loadSettings(), /DB_QUERY_TIMEOUT_MS must be above API_STATEMENT_TIMEOUT_MS/);
    process.env.API_STATEMENT_TIMEOUT_MS = "3000";
    assert.equal(loadSettings().api.queryTimeoutMs, 4000);
  });

  test("the default page size can't be above the largest", () => {
    process.env.DEFAULT_PAGE_SIZE = "300";
    assert.throws(() => loadSettings(), /DEFAULT_PAGE_SIZE can't be above MAX_PAGE_SIZE/);
    process.env.MAX_PAGE_SIZE = "500";
    assert.equal(loadSettings().api.defaultPageSize, 300);
  });

  test("a path setting is used as given, and its default sits inside the repository", () => {
    assert.match(loadSettings().db.migrationsDir, /backend[\\/]db[\\/]migrations$/);
    assert.match(loadSettings().api.openApiPath, /backend[\\/]openapi\.json$/);
    process.env.MIGRATIONS_DIR = "/tmp/other-migrations";
    assert.equal(loadSettings().db.migrationsDir, "/tmp/other-migrations");
  });

  test("shares read as percentages in messages", () => {
    assert.equal(toPercent(0.1), "10%");
    assert.equal(toPercent(0.8), "80%");
    assert.equal(toPercent(0.07), "7%");
    assert.equal(toPercent(0.125), "12.5%");
  });
});
