/**
 * Residual Key Tracking Tests
 *
 * Tests that % correctly computes residual keys based on COVERAGE.
 * A key is "covered" if it matches ANY key pattern K in the object pattern,
 * regardless of whether the value matches V.
 *
 * Run with: node test/residual-tracking.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

// ==================== Coverage-Based Remainder ====================

test('residual with literal keys - uncovered keys in %', () => {
  // {a:1 (%? as %r)} against {a:1, b:2, c:3}
  // Covered keys: {a} (matches literal 'a')
  // Remainder: {b:2, c:3}
  const results = Tendril('{a:1 (%? as %r)}').match({a: 1, b: 2, c: 3}).solutions().toArray();

  assert.equal(results.length, 1);
  assert.deepEqual(results[0].r, {b: 2, c: 3});
});

test('residual with wildcard key - all keys covered', () => {
  // {_:1 (%? as %r)} against {a:1, b:2}
  // Wildcard _ matches ALL keys, so all are covered
  // Remainder: {} (empty)
  const results = Tendril('{_:1 (%? as %r)}').match({a: 1, b: 2}).solutions().toArray();

  assert.equal(results.length, 1);
  assert.deepEqual(results[0].r, {}, 'All keys covered by wildcard');
});

test('residual with variable key - all keys covered', () => {
  // {$k:1 (%? as %r)} against {a:1, b:2, c:1}
  // Variable $k matches ALL keys, so all are covered
  // Remainder: {} (empty)
  // Note: multiple solutions (k='a' and k='c'), but all have same empty %
  const results = Tendril('{$k:1 (%? as %r)}').match({a: 1, b: 2, c: 1}).solutions().toArray();

  assert.equal(results.length, 2); // Two keys have value 1

  // ALL solutions should have empty % (all keys covered by $k)
  for (const sol of results) {
    assert.deepEqual(sol.r, {}, `Remainder should be empty for k=${sol.k}`);
  }
});

test('residual with regex key - uncovered keys in %', () => {
  // {(/^[a-z]$/ as $k):3 (%? as %r)} against {a:3, b:3, foo:3}
  // Covered keys: {a, b} (match /^[a-z]$/)
  // Remainder: {foo:3}
  // Note: use key binding to get multiple distinguishable solutions
  const results = Tendril('{(/^[a-z]$/ as $k):3 (%? as %r)}').match({a: 3, b: 3, foo: 3}).solutions().toArray();

  // Two solutions (one for k='a', one for k='b')
  assert.equal(results.length, 2);

  // BOTH solutions should have same %: {foo:3}
  for (const sol of results) {
    assert.deepEqual(sol.r, {foo: 3}, `foo should be in % for k=${sol.k}`);
  }
});

test('residual with alternation in key', () => {
  // {(a|b as $k):1 (%? as %r)} against {a:1, b:1, c:2}
  // Covered keys: {a, b} (match alternation (a|b))
  // Remainder: {c:2}
  // Note: use key binding to get multiple distinguishable solutions
  const results = Tendril('{(a|b as $k):1 (%? as %r)}').match({a: 1, b: 1, c: 2}).solutions().toArray();

  // Two solutions (one for k='a', one for k='b')
  assert.equal(results.length, 2);

  // BOTH solutions should have same %: {c:2}
  for (const sol of results) {
    assert.deepEqual(sol.r, {c: 2}, `c should be in % for k=${sol.k}`);
  }
});

// ==================== Bad Entries Are Covered (Not In Remainder) ====================

test('bad entries are covered not in %', () => {
  // {/^[a-z]$/:3 (%? as %r)} against {a:3, b:5, foo:3}
  // Covered keys: {a, b} (both match /^[a-z]$/)
  // 'a:3' is in slice (value matches)
  // 'b:5' is a bad entry (key matches, value doesn't)
  // Remainder: {foo:3} (doesn't match key pattern)
  const results = Tendril('{/^[a-z]$/:3 (%? as %r)}').match({a: 3, b: 5, foo: 3}).solutions().toArray();

  assert.equal(results.length, 1); // Only 'a' produces a solution

  // Remainder should be {foo:3}, NOT {b:5, foo:3}
  // because 'b' is covered (matches /^[a-z]$/) even though it's a bad entry
  assert.deepEqual(results[0].r, {foo: 3}, 'b should be covered (not in %)');
});

// ==================== Empty Residuals ====================

test('empty residual when all keys covered', () => {
  // {a:1 b:2 (%? as %r)} against {a:1, b:2}
  // Covered keys: {a, b}
  // Remainder: {} (empty)
  const results = Tendril('{a:1 b:2 (%? as %r)}').match({a: 1, b: 2}).solutions().toArray();

  assert.equal(results.length, 1);
  assert.deepEqual(results[0].r, {});
});

test('%? allows empty and multiple keys', () => {
  // {a:1 (%? as %r)} against {a:1, b:2, c:3}
  const results = Tendril('{a:1 (%? as %r)}').match({a: 1, b: 2, c: 3}).solutions().toArray();
  assert.equal(results.length, 1);
  assert.deepEqual(results[0].r, {b: 2, c: 3});
});

// ==================== Multiple Key Patterns ====================

test('multiple key patterns - coverage is union', () => {
  // {a:1 /^b/:2 (%? as %r)} against {a:1, bar:2, c:3}
  // Covered by 'a': {a}
  // Covered by /^b/: {bar}
  // Total covered: {a, bar}
  // Remainder: {c:3}
  const results = Tendril('{a:1 /^b/:2 (%? as %r)}').match({a: 1, bar: 2, c: 3}).solutions().toArray();

  assert.equal(results.length, 1);
  assert.deepEqual(results[0].r, {c: 3});
});

console.log('\n[residual-tracking] Test suite defined\n');
