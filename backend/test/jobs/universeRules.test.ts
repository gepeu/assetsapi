/** Tests for planUniverse; isSafeToApply. */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isSafeToApply, type KnownAsset, planUniverse } from '../../src/jobs/universeRules.ts';

const asset = (id: number, overrides: Partial<KnownAsset> = {}): KnownAsset => ({
  id,
  slug: `asset-${id}`,
  ref: `r${id}`,
  active: true,
  solanaMints: [`m${id}`],
  ...overrides,
});

describe('planUniverse', () => {
  test('an asset whose mint is in both lists stays active', () => {
    const plan = planUniverse([asset(1)], [{ mint: 'm1', ref: 'r1' }]);
    assert.deepEqual(plan.deactivate, []);
    assert.deepEqual(plan.reactivate, []);
    assert.deepEqual(plan.newAssets, []);
    assert.equal(plan.remaining, 1);
  });

  test('an asset whose mint left either list is deactivated', () => {
    const plan = planUniverse([asset(1), asset(2)], [{ mint: 'm1', ref: 'r1' }]);
    assert.deepEqual(plan.deactivate, [2]);
    assert.equal(plan.remaining, 1);
    assert.equal(plan.active, 2);
  });

  test('an inactive asset that qualifies again is reactivated', () => {
    const plan = planUniverse([asset(1, { active: false })], [{ mint: 'm1', ref: 'r1' }]);
    assert.deepEqual(plan.reactivate, [1]);
    assert.deepEqual(plan.deactivate, []);
  });

  test("an inactive asset that still doesn't qualify is left alone", () => {
    const plan = planUniverse([asset(1, { active: false })], []);
    assert.deepEqual(plan.reactivate, []);
    assert.deepEqual(plan.deactivate, []);
  });

  test('an unknown ID is a new asset, with all its mints', () => {
    const plan = planUniverse(
      [],
      [
        { mint: 'a', ref: 'new' },
        { mint: 'b', ref: 'new' },
      ]
    );
    assert.deepEqual(plan.newAssets, [{ ref: 'new', mints: ['a', 'b'] }]);
  });

  test('another mint on a record we know keeps that asset active, with no new asset', () => {
    const plan = planUniverse([asset(1, { solanaMints: ['old'] })], [{ mint: 'other', ref: 'r1' }]);
    assert.deepEqual(plan.newAssets, []);
    assert.deepEqual(plan.deactivate, []);
  });

  test('a mint moved to another ID is reported, and its asset is left as it is', () => {
    const plan = planUniverse([asset(1)], [{ mint: 'm1', ref: 'elsewhere' }]);
    assert.deepEqual(plan.moved, [{ mint: 'm1', slug: 'asset-1', ref: 'elsewhere' }]);
    assert.deepEqual(plan.deactivate, []);
    assert.deepEqual(plan.newAssets, []);
    assert.equal(plan.remaining, 1);
  });

  test('matching is on the exact mint, so a different case is a different token', () => {
    const plan = planUniverse([asset(1, { solanaMints: ['AbC'] })], [{ mint: 'abc', ref: 'other' }]);
    assert.deepEqual(plan.newAssets, [{ ref: 'other', mints: ['abc'] }]);
    assert.deepEqual(plan.deactivate, [1]);
  });
});

describe('isSafeToApply', () => {
  test("80% remaining is safe, and anything less isn't", () => {
    assert.equal(isSafeToApply({ active: 10, remaining: 8 }), true);
    assert.equal(isSafeToApply({ active: 10, remaining: 7 }), false);
  });

  test('an empty database can always start', () => {
    assert.equal(isSafeToApply({ active: 0, remaining: 0 }), true);
  });
});
