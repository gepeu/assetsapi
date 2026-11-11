import { settings } from '../config.ts';

/**
 * The name a client sends for a group or category, which the database only stores as a label:
 * "Yield and returns" is `yield`. The catalog lists them all.
 */
export function toShortName(label: string): string {
  return label.toLowerCase().match(/[a-z0-9]+/)?.[0] ?? '';
}

/** A metric's group label, with ungrouped metrics under the configured fallback. */
export function toGroupLabel(group: string | null): string {
  return group ?? settings.api.otherGroupLabel;
}

/** A metric's group as clients see it: the key that `groups` accepts and `catalog.groups` labels. */
export function toGroupKey(group: string | null): string {
  return toShortName(toGroupLabel(group));
}

/** The items of a comma-separated parameter, without repeats. Undefined when it wasn't sent. */
export function parseList(value: string | undefined): string[] | undefined {
  return value === undefined ? undefined : [...new Set(value.split(','))];
}
