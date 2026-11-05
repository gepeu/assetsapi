/**
 * Checks converted data before it's written, with no I/O. This is where value type checks live now:
 * a failure here fails that one asset, which keeps its last good data.
 */
import { ContractBrokenError } from "../providers/errors.ts";
import type { CurrentData, FieldInput, HistoryData, ReferenceData } from "../providers/types.ts";

export interface CatalogEntry {
  valueType: string;
  level: string;
  recordGroup: string | null;
}

export type Catalog = ReadonlyMap<string, CatalogEntry>;

export interface AssetData {
  reference: ReferenceData;
  current: CurrentData;
  history: HistoryData;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MEASURE_PATTERN = /^[a-z0-9_]{1,64}$/;

function fail(slug: string, message: string): never {
  throw new ContractBrokenError(`${slug}: ${message}`);
}

function checkDay(slug: string, day: string, today: string, what: string): void {
  if (!DAY_PATTERN.test(day)) fail(slug, `${what} has a malformed date`);
  if (day > today) fail(slug, `${what} has a date in the future`);
}

function checkValueType(slug: string, input: FieldInput, valueType: string): void {
  const { value } = input;
  const isOrganizationRef = typeof value === "object" && !Array.isArray(value);
  let fits: boolean;
  switch (valueType) {
    case "organization":
      fits = isOrganizationRef;
      break;
    case "boolean":
      fits = typeof value === "boolean";
      break;
    case "integer":
      fits = typeof value === "number" && Number.isInteger(value);
      break;
    case "decimal":
      fits = typeof value === "number" && Number.isFinite(value);
      break;
    case "list":
      fits = Array.isArray(value) && value.every((item) => typeof item === "string");
      break;
    case "date":
      fits = typeof value === "string" && DAY_PATTERN.test(value);
      break;
    default:
      fits = typeof value === "string";
  }
  if (!fits) fail(slug, `${input.field} isn't a valid ${valueType}`);
}

function checkFields(
  slug: string,
  inputs: readonly FieldInput[],
  level: string,
  catalog: Catalog,
  organizations: ReadonlySet<string>,
  today: string,
): void {
  const seen = new Set<string>();
  for (const input of inputs) {
    const entry = catalog.get(input.field);
    if (!entry) fail(slug, `${input.field} isn't in the catalog`);
    if (entry.level !== level) fail(slug, `${input.field} belongs on a ${entry.level}, not a ${level}`);
    if (entry.recordGroup !== null) fail(slug, `${input.field} repeats, and needs a record key`);
    if (seen.has(input.field)) fail(slug, `${input.field} appears twice`);
    seen.add(input.field);
    checkValueType(slug, input, entry.valueType);
    checkDay(slug, input.asOf, today, input.field);
    const { value } = input;
    if (typeof value === "object" && !Array.isArray(value) && !organizations.has(value.organization)) {
      fail(slug, `${input.field} names an unlisted organization`);
    }
  }
}

function checkNumber(slug: string, value: number | null, what: string): void {
  if (value !== null && !Number.isFinite(value)) fail(slug, `${what} isn't a finite number`);
}

/** Throws ContractBrokenError at the first problem. */
export function validateAssetData(data: AssetData, catalog: Catalog, today: string): void {
  const { reference, current, history } = data;
  const slug = reference.slug;
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) fail(slug, "the slug doesn't fit our rule");
  // Every asset here has a mint on the provider's list, so an empty list is a bad response. Taken at
  // face value, it would deactivate every token and start the missing clock on all their values.
  if (reference.tokens.length === 0) fail(slug, "the provider listed no tokens");

  const organizations = new Set(reference.organizations.map((organization) => organization.slug));
  const networks = new Set(reference.networks.map((network) => network.key));

  checkFields(slug, reference.fields, "asset", catalog, organizations, today);
  for (const organization of reference.organizations) {
    checkFields(slug, organization.fields, "organization", catalog, organizations, today);
  }
  for (const network of reference.networks) {
    checkFields(slug, network.fields, "network", catalog, organizations, today);
  }
  for (const token of reference.tokens) {
    if (!networks.has(token.network)) fail(slug, `a token is on unlisted network ${token.network}`);
    checkFields(slug, token.fields, "token", catalog, organizations, today);
  }
  for (const { organization } of reference.roles) {
    if (!organizations.has(organization)) fail(slug, "a role names an unlisted organization");
  }

  for (const row of current.values) {
    if (!MEASURE_PATTERN.test(row.metric)) fail(slug, `measure name ${row.metric} doesn't fit our rule`);
    for (const [what, value] of [
      ["value", row.value],
      ["7-day value", row.value7d],
      ["30-day value", row.value30d],
      ["90-day value", row.value90d],
    ] as const) {
      checkNumber(slug, value, `${row.metric} ${what}`);
    }
    checkDay(slug, row.asOf, today, row.metric);
  }

  for (const series of history.series) {
    if (!MEASURE_PATTERN.test(series.measure)) fail(slug, `measure name ${series.measure} doesn't fit our rule`);
    for (const [day, value] of series.points) {
      checkDay(slug, day, today, `${series.measure} history`);
      checkNumber(slug, value, `${series.measure} history`);
    }
  }
}

export interface LargeSwing {
  metric: string;
  from: number;
  to: number;
}

const SWING_METRICS = ["price_dollar", "net_asset_value_dollar", "total_asset_value_dollar"] as const;
const SWING_THRESHOLD = 0.5;

export function listSwingMetrics(): readonly string[] {
  return SWING_METRICS;
}

/** Real values can jump, so a swing is noted in the run summary and still written. */
export function findLargeSwings(previous: ReadonlyMap<string, number>, current: CurrentData): LargeSwing[] {
  const swings: LargeSwing[] = [];
  for (const row of current.values) {
    if (row.token !== null || row.value === null || !(SWING_METRICS as readonly string[]).includes(row.metric))
      continue;
    const from = previous.get(row.metric);
    if (from === undefined || from === 0) continue;
    if (Math.abs(row.value - from) / Math.abs(from) >= SWING_THRESHOLD) {
      swings.push({ metric: row.metric, from, to: row.value });
    }
  }
  return swings;
}
