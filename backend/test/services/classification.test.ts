/** Tests for placing assets in our group and subclass taxonomy. */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ASSET_TYPE_BY_CLASS } from '../../src/providers/rwaXyz/mapping.ts';
import { classify, toClassPairs } from '../../src/services/classification.ts';

const keys = (assetClass: string, assetType: string) => {
  const found = classify(assetClass, assetType);
  return found && `${found.group.key}/${found.subclass.key}`;
};

describe('classification', () => {
  test('every RWA.xyz class the provider knows has a group', () => {
    for (const [assetClass, assetType] of Object.entries(ASSET_TYPE_BY_CLASS)) {
      assert.notEqual(classify(assetClass, assetType), null, assetClass);
    }
  });

  test('RWA.xyz classes land in the agreed groups', () => {
    assert.equal(keys('Asset-Backed Credit', 'tokenized_fund'), 'fixed_income/private_credit');
    assert.equal(keys('US Treasury Debt', 'tokenized_fund'), 'fixed_income/treasuries');
    assert.equal(keys('Stablecoins', 'stablecoin'), 'crypto/stablecoins');
    assert.equal(keys('Stocks', 'tokenized_equity'), 'equities/stocks');
    assert.equal(keys('Specialty Finance', 'tokenized_fund'), 'alternatives/specialty_finance');
  });

  test('Active Strategies splits by asset type', () => {
    assert.equal(keys('Active Strategies', 'tokenized_fund'), 'alternatives/active_strategies');
    assert.equal(keys('Active Strategies', 'defi_yield'), 'crypto/defi_yield');
  });

  test('an unmapped class is null rather than a guess', () => {
    assert.equal(classify('Brand New Class', 'tokenized_fund'), null);
  });

  test('a filter matches exactly the pairs that classify into it', () => {
    const pairs = toClassPairs('crypto', undefined);
    assert.ok(pairs);
    const matched = pairs.classes.map((assetClass, i) => `${assetClass}|${pairs.types[i]}`);
    assert.ok(matched.includes('Stablecoins|stablecoin'));
    assert.ok(matched.includes('Active Strategies|defi_yield'));
    assert.ok(!matched.includes('Active Strategies|tokenized_fund'));
    assert.equal(toClassPairs(undefined, undefined), null);
  });
});
