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

test('basic flow - single key', () => {
  const result = extract('{a: 1 -> %bucket}', {a: 1});
  assert.ok(result);
  assert.deepEqual(result.bucket, {a: 1});
});

test('basic flow - multiple keys', () => {
  const result = extract('{$k: 1 -> %ones}', {a: 1, b: 1, c: 2});
  assert.ok(result);
  // Bucket should contain all k:v where value matched 1
  assert.deepEqual(result.ones, {a: 1, b: 1});
});

test('basic flow - no matches', () => {
  const result = extract('{$k: 1 -> %ones}', {a: 2, b: 3});
  // No values match 1, so pattern fails (existence required)
  assert.equal(result, null);
});

test('basic flow with optional - no matches ok', () => {
  const result = extract('{$k: 1 -> %ones ?}', {a: 2, b: 3});
  assert.ok(result);
  // Bucket is undefined when no values matched (no entries flowed in)
  assert.equal(result.ones, undefined);
});

// ==================== Flow with else ====================

test('flow with else - categorization', () => {
  const result = extract('{$k: 1 -> %ones else 2 -> %twos}', {a: 1, b: 2, c: 1});
  assert.ok(result);
  assert.deepEqual(result.ones, {a: 1, c: 1});
  assert.deepEqual(result.twos, {b: 2});
});

test('flow with else - some keys match neither', () => {
  // Keys matching neither go to "bad" set; with weak semantics, this is allowed
  const result = extract('{$k: 1 -> %ones else 2 -> %twos}', {a: 1, b: 3});
  assert.ok(result);
  assert.deepEqual(result.ones, {a: 1});
  // %twos is undefined because no values matched 2
  assert.equal(result.twos, undefined);
});

test('flow with else ! - strong semantics', () => {
  // With else !, keys matching neither cause failure
  const result = extract('{$k: 1 -> %ones else 2 -> %twos else !}', {a: 1, b: 3});
  assert.equal(result, null); // b:3 matches neither, fails strong semantics
});

test('flow with else _ - catch-all', () => {
  const result = extract('{$k: 1 -> %ones else _ -> %rest}', {a: 1, b: 3, c: 1});
  assert.ok(result);
  assert.deepEqual(result.ones, {a: 1, c: 1});
  assert.deepEqual(result.rest, {b: 3});
});

// ==================== Flow inside arrays under K:V ====================

test('flow inside array under K:V - uses outer key', () => {
  // Flow inside an array uses the outer K:V key
  // Multiple array elements flowing the same value are deduplicated
  const result = extract('{$k: [/a/ -> %captured, b]}', {x: ['apple', 'b']});
  assert.ok(result);
  // 'apple' matches /a/ and flows to %captured with key 'x' (from outer $k)
  assert.deepEqual(result.captured, {x: 'apple'});
});

test('flow at outer level - captures full value', () => {
  // Flow at the VALUE level (outside the array) is allowed
  // and captures the full K:V value
  const result = extract('{$k: ([/a/, b] -> %captured)}', {x: ['apple', 'b'], y: ['avocado', 'b']});
  assert.ok(result);
  assert.deepEqual(result.captured, {x: ['apple', 'b'], y: ['avocado', 'b']});
});

// ==================== Backtracking with Flow ====================

test('flow with backtracking at value level', () => {
  // Test backtracking with Flow at the value level (not inside array)
  // Pattern: match array->%a OR string /c/->%c
  const result = extract(
    '{$k: ([/a/, /b/] -> %arrays) else (/c/ -> %strings)}',
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
  const results = extractAll('{$k: ($v -> %all)}', {a: 1, b: 2});
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
  const result = extract('{$k: ((/\\d+/ as $num) -> %numbers)}', {a: '123', b: 'abc', c: '456'});
  assert.ok(result);
  // Only a and c match /\d+/
  assert.deepEqual(result.numbers, {a: '123', c: '456'});
});

// ==================== Multiple flows in same pattern ====================

test('multiple independent flows', () => {
  const result = extract('{a: $x -> %avals, b: $y -> %bvals}', {a: 1, b: 2, c: 3});
  assert.ok(result);
  assert.deepEqual(result.avals, {a: 1});
  assert.deepEqual(result.bvals, {b: 2});
});

// ==================== Edge cases ====================

test('flow with regex key pattern', () => {
  const result = extract('{/^user/: $v -> %users}', {user1: 'alice', user2: 'bob', admin: 'root'});
  assert.ok(result);
  assert.deepEqual(result.users, {user1: 'alice', user2: 'bob'});
});

test('empty bucket when optional', () => {
  const result = extract('{a: 1 -> %ones ?}', {a: 2});
  assert.ok(result);
  // a:2 doesn't match 1, so %ones is undefined (no entries flowed in)
  assert.equal(result.ones, undefined);
});

// ==================== Array bucket (values only) ====================

test('array bucket - collects values only', () => {
  const result = extract('{$k: 1 -> @ones}', {a: 1, b: 1, c: 2});
  assert.ok(result);
  // @bucket collects values only (no keys)
  assert.deepEqual(result.ones, [1, 1]);
});

test('array bucket - single value', () => {
  const result = extract('{a: 1 -> @bucket}', {a: 1});
  assert.ok(result);
  assert.deepEqual(result.bucket, [1]);
});

test('array bucket - with else categorization', () => {
  const result = extract('{$k: 1 -> @ones else 2 -> @twos}', {a: 1, b: 2, c: 1});
  assert.ok(result);
  // Values are collected without keys
  assert.deepEqual(result.ones, [1, 1]);
  assert.deepEqual(result.twos, [2]);
});

test('array bucket - inside nested array', () => {
  const result = extract('{$k: [/a/ -> @captured, b]}', {x: ['apple', 'b']});
  assert.ok(result);
  // @captured collects just the matched value, not k:v
  assert.deepEqual(result.captured, ['apple']);
});

test('array bucket - multiple values from array elements', () => {
  const result = extract('{$k: [(/\\d+/ -> @nums)+]}', {x: ['1', '2', '3']});
  assert.ok(result);
  // All matching values collected
  assert.deepEqual(result.nums, ['1', '2', '3']);
});

// ==================== Mixing % and @ buckets ====================

test('mixed buckets - object and array in same pattern', () => {
  const result = extract('{a: $x -> %aobj, b: $y -> @barr}', {a: 1, b: 2, c: 3});
  assert.ok(result);
  assert.deepEqual(result.aobj, {a: 1});
  assert.deepEqual(result.barr, [2]);
});

test('mixed buckets - different buckets for same pattern branches', () => {
  const result = extract('{$k: 1 -> %ones else 2 -> @twos}', {a: 1, b: 2, c: 1});
  assert.ok(result);
  assert.deepEqual(result.ones, {a: 1, c: 1});
  assert.deepEqual(result.twos, [2]);
});

// ==================== Slice kind conflict detection ====================

test('slice conflict - same name with different sigils throws', () => {
  // Using %foo and @foo in same pattern should throw
  assert.throws(() => {
    extract('{a: $x -> %foo, b: $y -> @foo}', {a: 1, b: 2});
  }, /Slice name conflict.*foo.*used as both/);
});

console.log('\n[flow-operator] Test suite defined\n');
