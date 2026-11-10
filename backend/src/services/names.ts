/**
 * The name a client sends for a group or category, which the database only stores as a label:
 * "Yield and returns" is `yield`. The catalog lists them all.
 */
export function toShortName(label: string): string {
  return label.toLowerCase().match(/[a-z0-9]+/)?.[0] ?? "";
}

/** The items of a comma-separated parameter, without repeats. Undefined when it wasn't sent. */
export function parseList(value: string | undefined): string[] | undefined {
  return value === undefined ? undefined : [...new Set(value.split(","))];
}
