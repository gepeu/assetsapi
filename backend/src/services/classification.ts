/** Places each asset in our group and subclass taxonomy, from its RWA.xyz class and our asset type. */
import { ApiError } from '../api/errors.ts';
import {
  type Classification,
  CLASSIFICATIONS,
  type GroupKey,
  type SubclassKey,
} from '../api/schemas/classification.ts';
import { ASSET_TYPES } from '../api/schemas/shared.ts';

interface Rule {
  assetClass: string;
  /** Narrows the rule to one asset type. Rules are read in order, so a narrow one goes first. */
  assetType?: string;
  subclass: SubclassKey;
}

// RWA.xyz files both funds and DeFi yield under "Active Strategies", so its asset type picks the group.
const RULES: readonly Rule[] = [
  { assetClass: 'US Treasury Debt', subclass: 'treasuries' },
  { assetClass: 'Corporate Credit', subclass: 'corporate_credit' },
  { assetClass: 'Asset-Backed Credit', subclass: 'private_credit' },
  { assetClass: 'Stocks', subclass: 'stocks' },
  { assetClass: 'Commodities', subclass: 'commodities' },
  { assetClass: 'Stablecoins', subclass: 'stablecoins' },
  { assetClass: 'Specialty Finance', subclass: 'specialty_finance' },
  { assetClass: 'Active Strategies', assetType: 'defi_yield', subclass: 'defi_yield' },
  { assetClass: 'Active Strategies', subclass: 'active_strategies' },
];

const BY_SUBCLASS = new Map<SubclassKey, NonNullable<Classification>>(
  CLASSIFICATIONS.flatMap((group) =>
    group.subclasses.map((subclass): [SubclassKey, NonNullable<Classification>] => [
      subclass.key,
      { group: { key: group.key, label: group.label }, subclass: { key: subclass.key, label: subclass.label } },
    ])
  )
);

/** Null for a class with no rule yet, rather than a guess. */
export function classify(assetClass: string, assetType: string): Classification {
  const rule = RULES.find(
    (candidate) =>
      candidate.assetClass === assetClass && (candidate.assetType === undefined || candidate.assetType === assetType)
  );
  return rule ? (BY_SUBCLASS.get(rule.subclass) ?? null) : null;
}

/** The (class, type) pairs a classification filter matches, as two parallel arrays for the query. */
export interface ClassPairs {
  classes: string[];
  types: string[];
}

/** Null when neither filter was sent. A subclass outside the sent group would match nothing, so it's a 400. */
export function toClassPairs(group: GroupKey | undefined, subclass: SubclassKey | undefined): ClassPairs | null {
  if (group === undefined && subclass === undefined) return null;
  if (group !== undefined && subclass !== undefined && BY_SUBCLASS.get(subclass)?.group.key !== group) {
    throw new ApiError('bad_request', `Subclass ${subclass} isn't in group ${group}. /assets/catalog lists them`);
  }
  const pairs: ClassPairs = { classes: [], types: [] };
  for (const assetClass of new Set(RULES.map((rule) => rule.assetClass))) {
    for (const assetType of ASSET_TYPES) {
      const found = classify(assetClass, assetType);
      if (
        found &&
        (group === undefined || found.group.key === group) &&
        (subclass === undefined || found.subclass.key === subclass)
      ) {
        pairs.classes.push(assetClass);
        pairs.types.push(assetType);
      }
    }
  }
  return pairs;
}
