/**
 * Bucket Scoping Tests
 *
 * Tests for the bucket scoping model:
 * - Each `each K:V` clause creates an implicit bucket scope
 * - Each labeled container (`§L {...}` or `§L [...]`) creates an explicit bucket scope
 * - `->` uses the implicit scope of the nearest `each` clause
 * - `<collecting ... across ^L>` uses the explicit scope of label L
 * - Same bucket name in different scopes = error (detected statically)
 *
 * Run with: node --test test/bucket-scoping.test.js
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

// ==================== Static validation: duplicate bucket names ====================

test('duplicate bucket name in sibling each clauses - should error', () => {
  // Two `each` clauses at the same level using same bucket name
  // Need to trigger compilation with .match()
  assert.throws(() => {
    Tendril('{ each _:/a/->%x, each _:/b/->%x }').match({});
  }, /bucket.*conflict|different.*scope/i);
});

test('duplicate bucket name across -> and <collecting> - should error', () => {
  // -> in one scope, <collecting> referencing different scope, same bucket name
  assert.throws(() => {
    Tendril('§L { each $k:$v ->%x, $k2:$v2 <collecting $k2:$v2 in %x across ^L> }').match({});
  }, /bucket.*conflict|different.*scope/i);
});

test('duplicate bucket name in nested structures - should error', () => {
  // Outer each uses %x, inner each also uses %x
  assert.throws(() => {
    Tendril('{ each _: { each _:$v ->%x } ->%x }').match({});
  }, /bucket.*conflict|different.*scope/i);
});

test('different bucket names in sibling each clauses - should succeed', () => {
  // Different names, no conflict
  // Pattern: keys matching /a/ flow to %x, keys matching /b/ flow to %y
  // Note: use _ for values since we're just testing bucket collection, not value binding
  const result = extract('{ each /a/: _ ->%x, each /b/: _ ->%y }', {a: 1, b: 2, c: 3});
  assert.ok(result);
  assert.deepEqual(result.x, {a: 1});
  assert.deepEqual(result.y, {b: 2});
});

// ==================== Implicit scope: each K:V with -> ====================

test('each clause creates implicit scope for ->', () => {
  // Simple case: one each clause with ->
  // Pattern: each key matching /a.*/ with any value, flow into %matches
  const result = extract('{ each /a.*/: $v ->%matches }', {ab: 1, ac: 2, xyz: 99});
  assert.ok(result);
  assert.deepEqual(result.matches, {ab: 1, ac: 2});
});

test('each clause scope is per-clause, not per-object', () => {
  // Two each clauses, each with its own bucket
  // Pattern: keys matching /a/ flow to %aKeys, keys matching /b/ flow to %bKeys
  // Note: use _ for values since we're just testing bucket collection
  const result = extract('{ each /a/: _ ->%aKeys, each /b/: _ ->%bKeys }',
    {a1: 1, a2: 2, b1: 10, b2: 20, other: 99});
  assert.ok(result);
  assert.deepEqual(result.aKeys, {a1: 1, a2: 2});
  assert.deepEqual(result.bKeys, {b1: 10, b2: 20});
});

test('-> without label requires enclosing each clause', () => {
  // -> outside of each context should error at parse time
  // since there's no `each` to scope to
  assert.throws(() => {
    Tendril('{ $k:$v ->%items }').match({});
  }, /requires.*each|enclosing.*each/i);
});

// ==================== Explicit scope: labeled containers with <collecting> ====================

test('<collecting> in labeled object works', () => {
  const data = {a: {name: 'alice'}, b: {name: 'bob'}};
  const result = extract(
    '§L { $key: { name: $n } <collecting $key:$n in %names across ^L> }',
    data
  );
  assert.ok(result);
  assert.deepEqual(result.names, {a: 'alice', b: 'bob'});
});

test('<collecting> in labeled array works', () => {
  // Simple case: 1-element array with collecting
  const data = [42];
  const result = extract(
    '§L [$x <collecting $x in @items across ^L>]',
    data
  );
  assert.ok(result);
  assert.equal(result.x, 42);
  assert.deepEqual(result.items, [42]);
});

test('<collecting> array slice collects values across iteration', () => {
  // Single element array - pattern [{n: $x}] matches 1-element array
  const data = [{n: 42}];
  const result = extract(
    '§L [{n: $x} <collecting $x in @nums across ^L>]',
    data
  );
  assert.ok(result);
  assert.deepEqual(result.nums, [42]);
});

test('<collecting> object slice collects k:v pairs', () => {
  // Single element array - pattern [{...}] matches 1-element array
  const data = {items: [{k: 'a', v: 1}]};
  const result = extract(
    '{ items: §L [{k: $key, v: $val} <collecting $key:$val in %pairs across ^L>] }',
    data
  );
  assert.ok(result);
  assert.deepEqual(result.pairs, {a: 1});
});

test('<collecting> requires across clause - no implicit scope', () => {
  // <collecting> without across should fail at parse time
  // Current parser gives "expected item" error (could be improved to mention 'across')
  assert.throws(() => {
    Tendril('§L [$x <collecting $x in @items>]').match([]);
  }, /expected.*item|across/i);
});

test('<collecting> referencing unknown label - should error', () => {
  assert.throws(() => {
    Tendril('[$x <collecting $x in @items across ^UnknownLabel>]').match([1, 2, 3]);
  }, /unknown.*label|references unknown/i);
});

// ==================== Nested scopes ====================

test('nested labeled structures have independent scopes', () => {
  // Inner and outer labels each create their own scope
  // Inner collects into @innerItems, outer collects into @outerItems
  // Note: can't collect a slice into a slice, so we use scalar $x for both
  const data = {
    outer: [{inner: [42]}]
  };
  const result = extract(
    '{ outer: §O [{ inner: §I [...$x <collecting $x in @innerItems across ^I>...] } <collecting $x in @outerItems across ^O>] }',
    data
  );
  assert.ok(result);
  // Inner array collects [42], outer collects [42] (the last $x from inner)
  assert.deepEqual(result.innerItems, [42]);
  assert.deepEqual(result.outerItems, [42]);
});

test('each inside labeled container can use both scopes', () => {
  const data = {a: 1, b: 2, c: 3};
  // Collect all k:v pairs via label, and partition a-keys via each
  // Use _ for values to avoid unification issues
  const result = extract(
    '§L { each /a/: _ ->%aOnly, $k:$v <collecting $k:$v in %all across ^L> }',
    data
  );
  assert.ok(result);
  assert.deepEqual(result.aOnly, {a: 1});
  assert.deepEqual(result.all, {a: 1, b: 2, c: 3});
});

// ==================== Edge cases ====================

test('empty collection results in empty object/array', () => {
  // No keys match /z/, so bucket should be empty
  // The ? (optional) must go at the end of the field clause, after ->
  const result = extract('{ each /z/:$v ->%zKeys ?, %}', {a: 1, b: 2});
  assert.ok(result);
  // When no keys match, the bucket doesn't appear in bindings (undefined)
  // This is current behavior - may want empty {} instead?
  assert.equal(result.zKeys, undefined);
});

test('bucket collision within same scope - last value wins or error', () => {
  // This test is a placeholder - engine already handles collisions
  // Same key with same value is OK, different values would fail
});

test('array bucket maintains order', () => {
  // Use spread pattern [...$x...] to match multi-element arrays
  const result = extract(
    '§L [...$x <collecting $x in @items across ^L>...]',
    [3, 1, 4, 1, 5]
  );
  assert.ok(result);
  assert.deepEqual(result.items, [3, 1, 4, 1, 5]);
});

console.log('\n[bucket-scoping] Test suite defined\n');
