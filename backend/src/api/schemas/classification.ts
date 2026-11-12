/**
 * Our own taxonomy of groups and subclasses, which sits above RWA.xyz's flat asset classes. It's part of
 * the contract: clients filter by these keys and build their menus from `/assets/catalog`.
 */
import type { FromSchema } from 'json-schema-to-ts';

export const CLASSIFICATIONS = [
  {
    key: 'fixed_income',
    label: 'Fixed income',
    subclasses: [
      { key: 'treasuries', label: 'Treasuries' },
      { key: 'corporate_credit', label: 'Corporate credit' },
      { key: 'private_credit', label: 'Private credit' },
    ],
  },
  { key: 'equities', label: 'Equities', subclasses: [{ key: 'stocks', label: 'Stocks' }] },
  { key: 'commodities', label: 'Commodities', subclasses: [{ key: 'commodities', label: 'Commodities' }] },
  {
    key: 'crypto',
    label: 'Crypto',
    subclasses: [
      { key: 'stablecoins', label: 'Stablecoins' },
      { key: 'defi_yield', label: 'DeFi yield' },
    ],
  },
  {
    key: 'alternatives',
    label: 'Alternatives',
    subclasses: [
      { key: 'specialty_finance', label: 'Specialty finance' },
      { key: 'active_strategies', label: 'Active strategies' },
    ],
  },
] as const;

export type GroupKey = (typeof CLASSIFICATIONS)[number]['key'];
export type SubclassKey = (typeof CLASSIFICATIONS)[number]['subclasses'][number]['key'];

export const GROUP_KEYS: readonly GroupKey[] = CLASSIFICATIONS.map((group) => group.key);
export const SUBCLASS_KEYS: readonly SubclassKey[] = CLASSIFICATIONS.flatMap((group) =>
  group.subclasses.map((subclass) => subclass.key)
);

const keyLabel = {
  type: 'object',
  additionalProperties: false,
  required: ['key', 'label'],
  properties: { key: { type: 'string' }, label: { type: 'string' } },
} as const;

export const classificationSchema = {
  type: ['object', 'null'],
  additionalProperties: false,
  required: ['group', 'subclass'],
  description:
    "The asset's group and subclass, from its RWA.xyz class. `null` for a class that isn't mapped yet. `/assets/catalog` lists them all",
  properties: { group: keyLabel, subclass: keyLabel },
} as const;
export type Classification = FromSchema<typeof classificationSchema>;

export const classificationTreeSchema = {
  type: 'array',
  description: 'Every group and subclass, including ones with no assets yet. Keys are what `group` and `subclass` take',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['key', 'label', 'subclasses'],
    properties: {
      key: { type: 'string' },
      label: { type: 'string' },
      subclasses: { type: 'array', items: keyLabel },
    },
  },
} as const;
