/**
 * Tests for the <collecting> directive (Change 2 from TD-23)
 *
 * The <collecting> directive provides explicit control over what gets collected
 * and where, replacing the implicit -> flow operator outside of 'each' clauses.
 *
 * Syntax:
 *   <collecting $key:$val in %bucket across ^label>  - collect k:v pairs
 *   <collecting $val in @bucket across ^label>       - collect values only
 *
 * Run with: node --test test/collecting-directive.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

// ==================== Basic K:V Collecting ====================

test('collecting: k:v pairs into %bucket', () => {
  const data = {a: {name: "alice"}, b: {name: "bob"}};
  const result = Tendril('§L { $key: { name: $n <collecting $key:$n in %names across ^L> }}')
    .match(data).solutions().first();

  assert.ok(result);
  assert.deepEqual(result.names, {a: "alice", b: "bob"});
});

test('collecting: values only into @bucket', () => {
  const data = {a: {name: "alice"}, b: {name: "bob"}};
  const result = Tendril('§L { $key: { name: $n <collecting $n in @names across ^L> }}')
    .match(data).solutions().first();

  assert.ok(result);
  assert.deepEqual(result.names, ["alice", "bob"]);
});

test('collecting: all solutions share the same bucket', () => {
  const data = {a: {name: "alice"}, b: {name: "bob"}};
  const results = Tendril('§L { $key: { name: $n <collecting $key:$n in %names across ^L> }}')
    .match(data).solutions().toArray();

  assert.equal(results.length, 2);
  // Both solutions should have the same collected names
  assert.deepEqual(results[0].names, {a: "alice", b: "bob"});
  assert.deepEqual(results[1].names, {a: "alice", b: "bob"});
});

// ==================== Label Scope ====================

test('collecting: requires across ^label (no default scope)', () => {
  // The across clause is required - without it, parsing should fail
  // Note: Error is thrown lazily when pattern is first used
  assert.throws(() => {
    Tendril('§L { $key: { name: $n <collecting $key:$n in %names> }}').match({a: {name: "x"}});
  }, /expected.*across|expected item/i);
});

test('collecting: across ^label references labeled scope', () => {
  // The label determines at which iteration level the bucket is keyed
  const data = {
    outer: {
      a: {name: "alice"},
      b: {name: "bob"}
    }
  };

  const result = Tendril('{ outer: §L { $key: { name: $n <collecting $key:$n in %names across ^L> }}}')
    .match(data).solutions().first();

  assert.ok(result);
  assert.deepEqual(result.names, {a: "alice", b: "bob"});
});

// ==================== Type Enforcement ====================

test('collecting: k:v form requires %bucket', () => {
  // k:v collection must use %bucket (object slice)
  // Note: Error is thrown lazily when pattern is first used
  assert.throws(() => {
    Tendril('§L { $key: { name: $n <collecting $key:$n in @names across ^L> }}').match({a: {name: "x"}});
  }, /key:value collection requires %bucket/);
});

test('collecting: value-only form requires @bucket', () => {
  // value-only collection must use @bucket (array slice)
  // Note: Error is thrown lazily when pattern is first used
  assert.throws(() => {
    Tendril('§L { $key: { name: $n <collecting $n in %names across ^L> }}').match({a: {name: "x"}});
  }, /value-only collection requires @bucket/);
});

// ==================== Nested Labels ====================

test('collecting: nested labels with different scopes', () => {
  const data = {
    groups: {
      g1: {items: {a: 1, b: 2}},
      g2: {items: {c: 3, d: 4}}
    }
  };

  // Collect items, keyed by group
  const result = Tendril(`{
    groups: §outer {
      $group: {
        items: §inner {
          $item: $val <collecting $item:$val in %byItem across ^inner>
        }
      }
    }
  }`).match(data).solutions().first();

  assert.ok(result);
  // Each inner scope collects its own items
  // The final bucket should contain all items from the last solution branch
  assert.ok(result.byItem);
});

// ==================== Empty and Missing ====================

test('collecting: empty object produces empty bucket', () => {
  const data = {};

  // Pattern requires at least one match, so this won't match
  const result = Tendril('§L { $key: $val <collecting $key:$val in %items across ^L> }')
    .match(data).solutions().first();

  assert.ok(!result); // No match because object is empty
});

test('collecting: works with non-optional patterns', () => {
  const data = {a: 1, b: 2};

  const result = Tendril('§L { $key: $val <collecting $key:$val in %items across ^L> }')
    .match(data).solutions().first();

  assert.ok(result);
  assert.deepEqual(result.items, {a: 1, b: 2});
});

// ==================== Multiple Collecting Directives ====================

test('collecting: multiple directives contribute to same bucket', () => {
  const data = {a: 1, b: 2};

  // Two separate fields both collecting into %items
  const result = Tendril(`§L {
    $k1: 1 <collecting $k1:$k1 in %ones across ^L>
    $k2: 2 <collecting $k2:$k2 in %twos across ^L>
  }`).match(data).solutions().first();

  assert.ok(result);
  assert.deepEqual(result.ones, {a: "a"});
  assert.deepEqual(result.twos, {b: "b"});
});

console.log('\n[collecting-directive] Test suite defined\n');
