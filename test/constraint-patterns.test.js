/**
 * Constraint Pattern Tests
 *
 * Tests for declarative object semantics, negative assertions, and slice bindings.
 * See doc/v5-constraints-limitations.md for known limitations.
 *
 * Run with: node test/constraint-patterns.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril, Slice } from '../src/tendril-api.js';

// ============================================================================
// NEGATIVE ASSERTIONS - What Works
// ============================================================================

test('simple negative assertion - key does not exist', () => {
  const result = Tendril('{(?!c:_) a:1}').all({a: 1});
  assert.equal(result.length, 1);
});

test('simple negative assertion - key exists (should fail)', () => {
  const result = Tendril('{(?!c:_) a:1}').all({a: 1, c: 2});
  assert.equal(result.length, 0);
});

test('negative assertion - value does not exist', () => {
  const result = Tendril('{(?!_:1) a:2}').all({a: 2});
  assert.equal(result.length, 1);
});

test('negative assertion - value exists (should fail)', () => {
  const result = Tendril('{(?!_:1) a:2}').all({a: 1});
  assert.equal(result.length, 0);
});

test('negative assertion with already-bound variable', () => {
  // $x bound to value first, then checked in negation
  const result = Tendril('{a:$x (?!b:$x)}').all({a: 5});
  assert.equal(result.length, 1);
  assert.equal(result[0].bindings.x, 5);
});

test('negative assertion with already-bound variable - fails when present', () => {
  const result = Tendril('{a:$x (?!b:$x)}').all({a: 5, b: 5});
  assert.equal(result.length, 0);
});

test('closed object assertion - no residual keys', () => {
  const result = Tendril('{a:1 (?!remainder)}').all({a: 1});
  assert.equal(result.length, 1);
});

test('closed object assertion - fails with extra keys', () => {
  const result = Tendril('{a:1 (?!remainder)}').all({a: 1, b: 2});
  assert.equal(result.length, 0);
});

test('multiple negative assertions', () => {
  const result = Tendril('{(?!a:_) (?!b:_) c:1}').all({c: 1});
  assert.equal(result.length, 1);
});

test('negative assertion does not leak bindings', () => {
  // Variables bound inside (?!remainder) should not escape
  const result = Tendril('{(?!$x:1) a:2}').all({a: 2});
  assert.equal(result.length, 1);
  assert.equal(result[0].bindings.x, undefined); // x should not be bound
});

// ============================================================================
// NEGATIVE ASSERTIONS - Known Limitations (V5)
// ============================================================================

test.skip('LIMITATION: bidirectional constraint - negation before binding', () => {
  // This pattern SHOULD constrain $x to not equal any existing value
  // But current implementation cannot handle this due to evaluation order
  // See doc/v5-constraints-limitations.md
  const result = Tendril('{(?!_:$x) $x:_}').all({a: 1, b: 2});
  // Would need constraint propagation to work correctly
  assert.equal(result.length, 0); // Should fail but currently succeeds
});

test('WORKAROUND: bind variable before negation', () => {
  // This works because $x is bound before the negation checks it
  const result = Tendril('{$x:_ (?!_:$x)}').all({a: 1});
  // This checks: "for all OTHER keys, value != $x"
  // But this is NOT the same as the bidirectional constraint above
  assert.equal(result.length, 1);
});

// ============================================================================
// SLICE BINDINGS - Arrays
// ============================================================================

test('array slice binding - middle slice', () => {
  const result = Tendril('[1 @x 5]').all([1, 2, 3, 4, 5]);
  assert.equal(result.length, 1);
  assert.deepEqual([...result[0].bindings.x], [2, 3, 4]);
});

test('array slice binding - end slice', () => {
  const result = Tendril('[1 @x]').all([1, 2, 3]);
  assert.equal(result.length, 1);
  assert.deepEqual([...result[0].bindings.x], [2, 3]);
});

test('array slice binding - empty slice', () => {
  const result = Tendril('[1 @x 2]').all([1, 2]);
  assert.equal(result.length, 1);
  assert.equal(result[0].bindings.x.length, 0);
});

test('array slice binding with pattern - specific sequence', () => {
  const result = Tendril('[@x=(1 2) 3]').all([1, 2, 3]);
  assert.equal(result.length, 1);
  assert.deepEqual([...result[0].bindings.x], [1, 2]);
});

test('array slice binding with pattern - quantified', () => {
  const result = Tendril('[@x=((1|2)*) 3]').all([1, 2, 1, 3]);
  assert.equal(result.length, 1);
  assert.deepEqual([...result[0].bindings.x], [1, 2, 1]);
});

test('array slice binding with pattern - any elements', () => {
  const result = Tendril('[@x=(_*) 5]').all([1, 2, 3, 4, 5]);
  assert.equal(result.length, 1);
  assert.deepEqual([...result[0].bindings.x], [1, 2, 3, 4]);
});

// ============================================================================
// SLICE BINDINGS - Objects
// ============================================================================

test('object slice binding - residual keys', () => {
  const result = Tendril('{a:1 @x=(remainder)}').all({a: 1, b: 2, c: 3});
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].bindings.x, Slice.object({b: 2, c: 3}));
});

test('object slice binding - empty residual', () => {
  const result = Tendril('{a:1 @x=(remainder)}').all({a: 1});
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].bindings.x, Slice.object({}));
});

test('object slice binding with pattern - match subset', () => {
  const result = Tendril('{@x=(a:1 b:2) c:3}').all({a: 1, b: 2, c: 3});
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].bindings.x, Slice.object({a: 1, b: 2}));
});

// ============================================================================
// VARIABLE UNIFICATION
// ============================================================================

test('variable unification across assertions', () => {
  const result = Tendril('{a:$x b:$x}').all({a: 5, b: 5});
  assert.equal(result.length, 1);
  assert.equal(result[0].bindings.x, 5);
});

test('variable unification fails with conflicting values', () => {
  const result = Tendril('{a:$x b:$x}').all({a: 5, b: 3});
  assert.equal(result.length, 0);
});

test('variable unification with negation', () => {
  const result = Tendril('{a:$x b:$x (?!c:$x)}').all({a: 5, b: 5});
  assert.equal(result.length, 1);
});

test('variable unification with negation - fails when present', () => {
  const result = Tendril('{a:$x b:$x (?!c:$x)}').all({a: 5, b: 5, c: 5});
  assert.equal(result.length, 0);
});

// ============================================================================
// EXISTENTIAL SEMANTICS
// ============================================================================

test('existential key matching - creates branches', () => {
  // Pattern {$k=1} should match any key with value 1
  const result = Tendril('{$k:1}').all({a: 1, b: 1});
  assert.equal(result.length, 2); // Two solutions: k="a" and k="b"
  const keys = result.map(r => r.bindings.k).sort();
  assert.deepEqual(keys, ['a', 'b']);
});

test('existential matching with unification', () => {
  // Pattern {$k=$v $k=$v} should match keys where key appears once with consistent value
  const result = Tendril('{$k:$v $k:$v}').all({a: 1});
  assert.equal(result.length, 1);
  assert.equal(result[0].bindings.k, 'a');
  assert.equal(result[0].bindings.v, 1);
});

// ============================================================================
// COMBINED PATTERNS
// ============================================================================

test('slice binding with negation', () => {
  const result = Tendril('{@x=(a:1) (?!b:_)}').all({a: 1, c: 2});
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].bindings.x, Slice.object({a: 1}));
});

test('multiple slices and negations', () => {
  const result = Tendril('{@x=(a:1) @y=(c:3) (?!d:_)}').all({a: 1, b: 2, c: 3});
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].bindings.x, Slice.object({a: 1}));
  assert.deepEqual(result[0].bindings.y, Slice.object({c: 3}));
});

test('nested arrays with slices', () => {
  const result = Tendril('[[@x=(1*) @y=(2*)]]').all([[1, 1, 2, 2]]);
  assert.equal(result.length, 1);
  assert.deepEqual([...result[0].bindings.x], [1, 1]);
  assert.deepEqual([...result[0].bindings.y], [2, 2]);
});

console.log('\n✓ All constraint pattern tests defined\n');
