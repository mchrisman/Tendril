/**
 * Flow Operator (->) Test Suite
 *
 * Tests for the '->' operator which collects k:v pairs into buckets during
 * object iteration. The key comes from the enclosing K:V, but the value
 * comes from the Flow's match point (Plan B semantics).
 *
 * Run with: node --test test/flow-operator.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

// Helper functions
function matches(pattern, data) {
  return Tendril(pattern).match(data).hasMatch();
}

function extract(pattern, data) {
  const sol = Tendril(pattern).match(data).solutions().first();
  return sol ? sol.toObject() : null;
}

function extractAll(pattern, data) {
  return Tendril(pattern).match(data).solutions().toArray().map(s => s.toObject());
}

// ==================== Basic Flow ====================
// Note: -> requires 'each' clause for scoping

test('basic flow - single key', () => {
  const result = extract('{each a: 1 -> %bucket}', {a: 1});
  assert.ok(result);
  assert.deepEqual(result.bucket, {a: 1});
});

test('basic flow - multiple keys', () => {
  // With 'each $k:', ALL keys must match the value pattern (strong semantics)
  // So use data where all values are 1
  const result = extract('{each $k: 1 -> %ones}', {a: 1, b: 1});
  assert.ok(result);
  // Bucket should contain all k:v
  assert.deepEqual(result.ones, {a: 1, b: 1});
});

test('basic flow - no matches', () => {
  const result = extract('{each $k: 1 -> %ones}', {a: 2, b: 3});
  // No values match 1, so pattern fails (existence required)
  assert.equal(result, null);
});

test('basic flow with optional - no matches ok', () => {
  // Use a specific key pattern so non-matching keys are skipped
  // With /z/: (no keys match), the optional ? allows zero matches
  const result = extract('{each /z/: $v -> %zKeys ?}', {a: 2, b: 3});
  assert.ok(result);
  // Bucket is undefined when no keys matched the key pattern
  assert.equal(result.zKeys, undefined);
});

// ==================== Flow with else ====================

test('flow with else - categorization', () => {
  const result = extract('{each $k: 1 -> %ones else 2 -> %twos}', {a: 1, b: 2, c: 1});
  assert.ok(result);
  assert.deepEqual(result.ones, {a: 1, c: 1});
  assert.deepEqual(result.twos, {b: 2});
});

test('flow with else - some keys match neither', () => {
  // With strong semantics, ALL keys must match one of the alternatives
  // Keys matching neither cause failure unless there's a catch-all
  // Use _ as catch-all to handle keys that don't match 1 or 2
  const result = extract('{each $k: (1 -> %ones else 2 -> %twos else _)}', {a: 1, b: 3});
  assert.ok(result);
  assert.deepEqual(result.ones, {a: 1});
  // %twos is undefined because no values matched 2
  assert.equal(result.twos, undefined);
});

test('flow with each - strong semantics', () => {
  // With each, keys matching neither cause failure
  const result = extract('{each $k: (1 -> %ones else 2 -> %twos)}', {a: 1, b: 3});
  assert.equal(result, null); // b:3 matches neither, fails strong semantics
});

test('flow with else _ - catch-all', () => {
  const result = extract('{each $k: 1 -> %ones else _ -> %rest}', {a: 1, b: 3, c: 1});
  assert.ok(result);
  assert.deepEqual(result.ones, {a: 1, c: 1});
  assert.deepEqual(result.rest, {b: 3});
});

// ==================== Flow inside arrays under K:V ====================

test('flow inside array under K:V - uses outer key', () => {
  // Flow inside an array uses the outer K:V key
  // Multiple array elements flowing the same value are deduplicated
  const result = extract('{each $k: [/a/ -> %captured, b]}', {x: ['apple', 'b']});
  assert.ok(result);
  // 'apple' matches /a/ and flows to %captured with key 'x' (from outer $k)
  assert.deepEqual(result.captured, {x: 'apple'});
});

test('flow at outer level - captures full value', () => {
  // Flow at the VALUE level (outside the array) is allowed
  // and captures the full K:V value
  const result = extract('{each $k: ([/a/, b] -> %captured)}', {x: ['apple', 'b'], y: ['avocado', 'b']});
  assert.ok(result);
  assert.deepEqual(result.captured, {x: ['apple', 'b'], y: ['avocado', 'b']});
});

// ==================== Backtracking with Flow ====================

test('flow with backtracking at value level', () => {
  // Test backtracking with Flow at the value level (not inside array)
  // Pattern: match array->%a OR string /c/->%c
  const result = extract(
    '{each $k: ([/a/, /b/] -> %arrays) else (/c/ -> %strings)}',
    {k1: 'c1', k2: 'c2', k3: ['a1', 'b1'], k4: ['a2', 'b2']}
  );
  assert.ok(result);
  // k3, k4 match the array pattern - full arrays go to %arrays
  assert.deepEqual(result.arrays, {k3: ['a1', 'b1'], k4: ['a2', 'b2']});
  // k1, k2 match /c/ pattern - their values go to %strings
  assert.deepEqual(result.strings, {k1: 'c1', k2: 'c2'});
});

// ==================== Flow with scalar bindings ====================

test('flow with scalar binding - both work together', () => {
  const results = extractAll('{each $k: ($v -> %all)}', {a: 1, b: 2});
  // Should have 2 solutions (branching on $k)
  assert.equal(results.length, 2);
  // But all solutions should have the same %all bucket (accumulated)
  for (const r of results) {
    assert.deepEqual(r.all, {a: 1, b: 2});
  }
  // Each solution has different $k and $v
  const keys = results.map(r => r.k).sort();
  assert.deepEqual(keys, ['a', 'b']);
});

test('flow inside binding - captures bound value', () => {
  // With strong semantics, ALL keys must match the pattern
  // Add catch-all for non-numeric values
  const result = extract('{each $k: ((/\\d+/ as $num) -> %numbers else _)}', {a: '123', b: 'abc', c: '456'});
  assert.ok(result);
  // Only a and c match /\d+/
  assert.deepEqual(result.numbers, {a: '123', c: '456'});
});

// ==================== Multiple flows in same pattern ====================

test('multiple independent flows', () => {
  // Use two separate each clauses for independent flows
  const result = extract('{each a: $x -> %avals, each b: $y -> %bvals}', {a: 1, b: 2, c: 3});
  assert.ok(result);
  assert.deepEqual(result.avals, {a: 1});
  assert.deepEqual(result.bvals, {b: 2});
});

// ==================== Edge cases ====================

test('flow with regex key pattern', () => {
  const result = extract('{each /^user/: $v -> %users}', {user1: 'alice', user2: 'bob', admin: 'root'});
  assert.ok(result);
  assert.deepEqual(result.users, {user1: 'alice', user2: 'bob'});
});

test('empty bucket when optional', () => {
  // Use a key pattern that doesn't match any keys
  const result = extract('{each /z/: $v -> %zKeys ?}', {a: 2});
  assert.ok(result);
  // No keys match /z/, so %zKeys is undefined
  assert.equal(result.zKeys, undefined);
});

// ==================== Array bucket (values only) ====================

test('array bucket - collects values only', () => {
  // With strong semantics, all keys must match the value pattern
  const result = extract('{each $k: 1 -> @ones}', {a: 1, b: 1});
  assert.ok(result);
  // @bucket collects values only (no keys)
  assert.deepEqual(result.ones, [1, 1]);
});

test('array bucket - single value', () => {
  const result = extract('{each a: 1 -> @bucket}', {a: 1});
  assert.ok(result);
  assert.deepEqual(result.bucket, [1]);
});

test('array bucket - with else categorization', () => {
  const result = extract('{each $k: 1 -> @ones else 2 -> @twos}', {a: 1, b: 2, c: 1});
  assert.ok(result);
  // Values are collected without keys
  assert.deepEqual(result.ones, [1, 1]);
  assert.deepEqual(result.twos, [2]);
});

test('array bucket - inside nested array', () => {
  const result = extract('{each $k: [/a/ -> @captured, b]}', {x: ['apple', 'b']});
  assert.ok(result);
  // @captured collects just the matched value, not k:v
  assert.deepEqual(result.captured, ['apple']);
});

test('array bucket - multiple values from array elements', () => {
  const result = extract('{each $k: [(/\\d+/ -> @nums)+]}', {x: ['1', '2', '3']});
  assert.ok(result);
  // All matching values collected
  assert.deepEqual(result.nums, ['1', '2', '3']);
});

// ==================== Mixing % and @ buckets ====================

test('mixed buckets - object and array in same pattern', () => {
  // Use two separate each clauses for independent flows
  const result = extract('{each a: $x -> %aobj, each b: $y -> @barr}', {a: 1, b: 2, c: 3});
  assert.ok(result);
  assert.deepEqual(result.aobj, {a: 1});
  assert.deepEqual(result.barr, [2]);
});

test('mixed buckets - different buckets for same pattern branches', () => {
  const result = extract('{each $k: 1 -> %ones else 2 -> @twos}', {a: 1, b: 2, c: 1});
  assert.ok(result);
  assert.deepEqual(result.ones, {a: 1, c: 1});
  assert.deepEqual(result.twos, [2]);
});

// ==================== Slice kind conflict detection ====================

test('slice conflict - same name with different sigils throws', () => {
  // Using %foo and @foo in same pattern should throw
  assert.throws(() => {
    extract('{each a: $x -> %foo, each b: $y -> @foo}', {a: 1, b: 2});
  }, /Slice name conflict.*foo.*used as both/);
});

console.log('\n[flow-operator] Test suite defined\n');
