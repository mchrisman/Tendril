/**
 * Tests for the 'each' clause (Change 3 from TD-23)
 *
 * The 'each' clause provides "validate all" semantics:
 * for all keys matching K, the value must match one of the VALUE_CLAUSEs.
 *
 * Syntax:
 *   each K: V                    - all K keys must have value matching V
 *   each K: V1 else V2           - all K keys must match V1 or V2
 *   each K: V -> %bucket         - validate and collect k:v pairs
 *   each K: V -> @bucket         - validate and collect values only
 *   each K: V #{m,n}             - validate all AND require m-n matching keys
 *
 * Run with: node --test test/each-clause.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

// ==================== Basic each ====================

test('each: validates all matching keys pass', () => {
  // All keys matching /a.*/ must have value 1
  assert.ok(Tendril('{ each /a.*/: 1 }').match({ab: 1, ac: 1}).hasMatch());
  assert.ok(!Tendril('{ each /a.*/: 1 }').match({ab: 1, ac: 2}).hasMatch());
});

test('each: empty set of matching keys passes', () => {
  // No keys match /x.*/, so vacuously true
  assert.ok(Tendril('{ each /x.*/: 1 }').match({ab: 1, ac: 2}).hasMatch());
});

test('each: with literal key', () => {
  // Literal key 'a' must have value 1
  assert.ok(Tendril('{ each a: 1 }').match({a: 1, b: 2}).hasMatch());
  assert.ok(!Tendril('{ each a: 1 }').match({a: 2, b: 2}).hasMatch());
});

test('each: with variable binding in value', () => {
  // All /a.*/ keys must have same value (via unification)
  const data1 = {a1: 5, a2: 5};
  const data2 = {a1: 5, a2: 6};

  assert.ok(Tendril('{ each /a.*/: $x }').match(data1).hasMatch());
  // Note: $x is unified across all keys, so different values fail
  assert.ok(!Tendril('{ each /a.*/: $x }').match(data2).hasMatch());
});

// ==================== each with else chains ====================

test('each: else chain allows multiple valid values', () => {
  // All keys must be 1 or 2
  assert.ok(Tendril('{ each /a.*/: 1 else 2 }').match({ab: 1, ac: 2}).hasMatch());
  assert.ok(!Tendril('{ each /a.*/: 1 else 2 }').match({ab: 1, ac: 3}).hasMatch());
});

test('each: else chain with pattern matching', () => {
  // All keys must be a number or "N/A"
  const pattern = '{ each /val.*/: _number else "N/A" }';
  assert.ok(Tendril(pattern).match({val1: 42, val2: "N/A"}).hasMatch());
  assert.ok(!Tendril(pattern).match({val1: 42, val2: "unknown"}).hasMatch());
});

// ==================== each with quantifiers ====================

test('each: quantifier requires exact count', () => {
  // Must have exactly 2 keys matching /a.*/, and all must have value 1
  assert.ok(Tendril('{ each /a.*/: 1 #{2} }').match({a1: 1, a2: 1}).hasMatch());
  assert.ok(!Tendril('{ each /a.*/: 1 #{2} }').match({a1: 1}).hasMatch());
  assert.ok(!Tendril('{ each /a.*/: 1 #{2} }').match({a1: 1, a2: 1, a3: 1}).hasMatch());
});

test('each: quantifier with range', () => {
  // Must have 2-3 keys matching /a.*/, and all must have value > 0
  const pattern = '{ each /a.*/: (_number where _ > 0) #{2,3} }';
  assert.ok(Tendril(pattern).match({a1: 1, a2: 2}).hasMatch());
  assert.ok(Tendril(pattern).match({a1: 1, a2: 2, a3: 3}).hasMatch());
  assert.ok(!Tendril(pattern).match({a1: 1}).hasMatch());
  assert.ok(!Tendril(pattern).match({a1: 1, a2: 2, a3: 3, a4: 4}).hasMatch());
});

// ==================== each with flow operators ====================

test('each: flow -> %bucket collects k:v pairs', () => {
  // All values are the same, so $v unifies
  const data = {a1: 10, a2: 10, b: 99};
  const result = Tendril('{ each /a.*/: $v -> %collected }')
    .match(data).solutions().first();

  assert.ok(result);
  assert.deepEqual(result.collected, {a1: 10, a2: 10});
});

test('each: flow -> @bucket collects values only', () => {
  // All values are the same, so $v unifies
  const data = {a1: 10, a2: 10, b: 99};
  const result = Tendril('{ each /a.*/: $v -> @collected }')
    .match(data).solutions().first();

  assert.ok(result);
  assert.deepEqual(result.collected, [10, 10]);
});

test('each: else chain with different buckets', () => {
  const data = {a1: 1, a2: 2, a3: 1};
  const result = Tendril('{ each /a.*/: 1 -> %ones else 2 -> %twos }')
    .match(data).solutions().first();

  assert.ok(result);
  assert.deepEqual(result.ones, {a1: 1, a3: 1});
  assert.deepEqual(result.twos, {a2: 2});
});

// ==================== each combined with other clauses ====================

test('each: combined with regular field clause', () => {
  const data = {type: "config", a1: 1, a2: 1};
  const result = Tendril('{ type: "config", each /a.*/: 1 }')
    .match(data).solutions().first();

  assert.ok(result);
});

test('each: combined with remainder', () => {
  const data = {a1: 1, a2: 1, other: "kept"};
  // All /a.*/ must be 1, and there must be other keys
  assert.ok(Tendril('{ each /a.*/: 1, % }').match(data).hasMatch());
});

// ==================== Comparison with legacy else ! ====================

test('each vs else !: equivalent semantics', () => {
  const data1 = {a1: 1, a2: 1};
  const data2 = {a1: 1, a2: 2};

  // New syntax: each
  assert.ok(Tendril('{ each /a.*/: 1 }').match(data1).hasMatch());
  assert.ok(!Tendril('{ each /a.*/: 1 }').match(data2).hasMatch());

  // Legacy syntax: else ! (still supported)
  assert.ok(Tendril('{ /a.*/: 1 else ! }').match(data1).hasMatch());
  assert.ok(!Tendril('{ /a.*/: 1 else ! }').match(data2).hasMatch());
});

console.log('\n[each-clause] Test suite defined\n');
