/**
 * Constraint Pattern Tests
 *
 * Tests for declarative object semantics, negative assertions, and group bindings.
 * See doc/v5-constraints-limitations.md for known limitations.
 *
 * Run with: node test/constraint-patterns.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

// ============================================================================
// NEGATIVE ASSERTIONS - What Works
// ============================================================================

test('simple negative assertion - key does not exist', () => {
  const result = Tendril('{(!c:_) a:1}').match({a: 1}).solutions().toArray();
  assert.equal(result.length, 1);
});

test('simple negative assertion - key exists (should fail)', () => {
  const result = Tendril('{(!c:_) a:1}').match({a: 1, c: 2}).solutions().toArray();
  assert.equal(result.length, 0);
});

test('negative assertion - value does not exist', () => {
  const result = Tendril('{(!_:1) a:2}').match({a: 2}).solutions().toArray();
  assert.equal(result.length, 1);
});

test('negative assertion - value exists (should fail)', () => {
  const result = Tendril('{(!_:1) a:2}').match({a: 1}).solutions().toArray();
  assert.equal(result.length, 0);
});

test('negative assertion with already-bound variable', () => {
  // $x bound to value first, then checked in negation
  const result = Tendril('{a:$x (!b:$x)}').match({a: 5}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 5);
});

test('negative assertion with already-bound variable - fails when present', () => {
  const result = Tendril('{a:$x (!b:$x)}').match({a: 5, b: 5}).solutions().toArray();
  assert.equal(result.length, 0);
});

test('closed object assertion - no residual keys', () => {
  const result = Tendril('{a:1 (!%)}').match({a: 1}).solutions().toArray();
  assert.equal(result.length, 1);
});

test('closed object assertion - fails with extra keys', () => {
  const result = Tendril('{a:1 (!%)}').match({a: 1, b: 2}).solutions().toArray();
  assert.equal(result.length, 0);
});

test('multiple negative assertions', () => {
  const result = Tendril('{(!a:_) (!b:_) c:1}').match({c: 1}).solutions().toArray();
  assert.equal(result.length, 1);
});

test('negative assertion does not leak bindings', () => {
  // Variables bound inside (!%) should not escape
  const result = Tendril('{(!$x:1) a:2}').match({a: 2}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.equal(result[0].x, undefined); // x should not be bound
});

// ============================================================================
// NEGATIVE ASSERTIONS - Known Limitations (V5)
// ============================================================================

test.skip('LIMITATION: bidirectional constraint - negation before binding', () => {
  // This pattern SHOULD constrain $x to not equal any existing value
  // But current implementation cannot handle this due to evaluation order
  // See doc/v5-constraints-limitations.md
  const result = Tendril('{(!_:$x) $x:_}').match({a: 1, b: 2}).solutions().toArray();
  // Would need constraint propagation to work correctly
  assert.equal(result.length, 0); // Should fail but currently succeeds
});

test('WORKAROUND: bind variable before negation', () => {
  // This works because $x is bound before the negation checks it
  const result = Tendril('{$x:_ (!_:$x)}').match({a: 1}).solutions().toArray();
  // This checks: "for all OTHER keys, value != $x"
  // But this is NOT the same as the bidirectional constraint above
  assert.equal(result.length, 1);
});

// ============================================================================
// GROUP BINDINGS - Arrays
// ============================================================================

test('array group binding - middle group', () => {
  const result = Tendril('[1 @x 5]').match([1, 2, 3, 4, 5]).solutions().toArray();
  assert.equal(result.length, 1);
  assert.deepEqual([...result[0].x], [2, 3, 4]);
});

test('array group binding - end group', () => {
  const result = Tendril('[1 @x]').match([1, 2, 3]).solutions().toArray();
  assert.equal(result.length, 1);
  assert.deepEqual([...result[0].x], [2, 3]);
});

test('array group binding - empty group', () => {
  const result = Tendril('[1 @x 2]').match([1, 2]).solutions().toArray();
  assert.equal(result.length, 1);
  assert.equal(result[0].x.length, 0);
});

test('array group binding with pattern - specific sequence', () => {
  const result = Tendril('[(1 2 as @x) 3]').match([1, 2, 3]).solutions().toArray();
  assert.equal(result.length, 1);
  assert.deepEqual([...result[0].x], [1, 2]);
});

test('array group binding with pattern - quantified', () => {
  const result = Tendril('[((1|2)* as @x) 3]').match([1, 2, 1, 3]).solutions().toArray();
  assert.equal(result.length, 1);
  assert.deepEqual([...result[0].x], [1, 2, 1]);
});

test('array group binding with pattern - any elements', () => {
  const result = Tendril('[(_* as @x) 5]').match([1, 2, 3, 4, 5]).solutions().toArray();
  assert.equal(result.length, 1);
  assert.deepEqual([...result[0].x], [1, 2, 3, 4]);
});

// ============================================================================
// GROUP BINDINGS - Objects
// ============================================================================

test('object group binding - residual keys', () => {
  const result = Tendril('{a:1 (% as %x)}').match({a: 1, b: 2, c: 3}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].x, {b: 2, c: 3});
});

test('object group binding - empty residual', () => {
  // Use %? to allow empty residual (bare % requires nonempty)
  const result = Tendril('{a:1 (%? as %x)}').match({a: 1}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].x, {});
});

test('object group binding with pattern - match subset', () => {
  const result = Tendril('{(a:1 b:2 as %x) c:3}').match({a: 1, b: 2, c: 3}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].x, {a: 1, b: 2});
});

// ============================================================================
// VARIABLE UNIFICATION
// ============================================================================

test('variable unification across assertions', () => {
  const result = Tendril('{a:$x b:$x}').match({a: 5, b: 5}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 5);
});

test('variable unification fails with conflicting values', () => {
  const result = Tendril('{a:$x b:$x}').match({a: 5, b: 3}).solutions().toArray();
  assert.equal(result.length, 0);
});

test('variable unification with negation', () => {
  const result = Tendril('{a:$x b:$x (!c:$x)}').match({a: 5, b: 5}).solutions().toArray();
  assert.equal(result.length, 1);
});

test('variable unification with negation - fails when present', () => {
  const result = Tendril('{a:$x b:$x (!c:$x)}').match({a: 5, b: 5, c: 5}).solutions().toArray();
  assert.equal(result.length, 0);
});

// ============================================================================
// EXISTENTIAL SEMANTICS
// ============================================================================

test('existential key matching - creates branches', () => {
  // Pattern {$k=1} should match any key with value 1
  const result = Tendril('{$k:1}').match({a: 1, b: 1}).solutions().toArray();
  assert.equal(result.length, 2); // Two solutions: k="a" and k="b"
  const keys = result.map(r => r.k).sort();
  assert.deepEqual(keys, ['a', 'b']);
});

test('existential matching with unification', () => {
  // Pattern {$k=$v $k=$v} should match keys where key appears once with consistent value
  const result = Tendril('{$k:$v $k:$v}').match({a: 1}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.equal(result[0].k, 'a');
  assert.equal(result[0].v, 1);
});

// ============================================================================
// COMBINED PATTERNS
// ============================================================================

test('group binding with negation', () => {
  const result = Tendril('{(a:1 as %x) (!b:_)}').match({a: 1, c: 2}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].x, {a: 1});
});

test('multiple groups and negations', () => {
  const result = Tendril('{(a:1 as %x) (c:3 as %y) (!d:_)}').match({a: 1, b: 2, c: 3}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].x, {a: 1});
  assert.deepEqual(result[0].y, {c: 3});
});

test('nested arrays with groups', () => {
  const result = Tendril('[[(1* as @x) (2* as @y)]]').match([[1, 1, 2, 2]]).solutions().toArray();
  assert.equal(result.length, 1);
  assert.deepEqual([...result[0].x], [1, 1]);
  assert.deepEqual([...result[0].y], [2, 2]);
});

console.log('\n✓ All constraint pattern tests defined\n');
