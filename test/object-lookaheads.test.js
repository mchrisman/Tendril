/**
 * Object Lookahead Tests
 *
 * Tests for (?pattern) and (!pattern) in object contexts
 *
 * Run with: node test/object-lookaheads.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril, matches, extractAll } from '../src/tendril-api.js';

// ==================== Positive Lookaheads ====================

test('positive lookahead - single key assertion', () => {
  // {(?a:5)} - assert that key 'a' has value 5, don't consume
  const result = Tendril('{(?a:5)}').match({a: 5, b: 3}).solutions().toArray();
  assert.equal(result.length, 1);
});

test('positive lookahead - fails when key missing', () => {
  const result = Tendril('{(?a:5)}').match({b: 3}).solutions().toArray();
  assert.equal(result.length, 0);
});

test('positive lookahead - fails when value mismatch', () => {
  const result = Tendril('{(?a:5)}').match({a: 3, b: 3}).solutions().toArray();
  assert.equal(result.length, 0);
});

test('positive lookahead with binding - bindings escape', () => {
  // {(?a:$x) b:$x} - lookahead binds x, must unify with b's value
  const result = Tendril('{(?a:$x) b:$x}').match({a: 5, b: 5}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 5);
});

test('positive lookahead with binding - unification fails', () => {
  // {(?a:$x) b:$x} - lookahead binds x=5, but b=3, unification fails
  const result = Tendril('{(?a:$x) b:$x}').match({a: 5, b: 3}).solutions().toArray();
  assert.equal(result.length, 0);
});

// ==================== Negative Lookaheads ====================

test('negative lookahead - succeeds when key absent', () => {
  // {(!a=5)} - assert that key 'a' does NOT have value 5
  const result = Tendril('{(!a:5)}').match({b: 3}).solutions().toArray();
  assert.equal(result.length, 1);
});

test('negative lookahead - succeeds when value mismatch', () => {
  const result = Tendril('{(!a:5)}').match({a: 3, b: 3}).solutions().toArray();
  assert.equal(result.length, 1);
});

test('negative lookahead - fails when key matches', () => {
  const result = Tendril('{(!a:5)}').match({a: 5, b: 3}).solutions().toArray();
  assert.equal(result.length, 0);
});

test('negative lookahead - no binding escape', () => {
  // {(!a:$x) b:$y} - x should NOT escape negative lookahead
  // Test with object that lacks key 'a', so negative lookahead succeeds
  const result = Tendril('{(!a:$x) b:$y}').match({b: 3, c: 7}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.equal(result[0].x, undefined); // x did not escape
  assert.equal(result[0].y, 3);
});

// ==================== Combined Lookaheads ====================

test('multiple positive lookaheads', () => {
  // {(?a:5) (?b:3)} - both must be present
  const result = Tendril('{(?a:5) (?b:3)}').match({a: 5, b: 3, c: 7}).solutions().toArray();
  assert.equal(result.length, 1);
});

test('positive and negative lookahead', () => {
  // {(?a:5) (!b:_)} - a must equal 5, b must not exist
  const result = Tendril('{(?a:5) (!b:_)}').match({a: 5, c: 7}).solutions().toArray();
  assert.equal(result.length, 1);
});

test('positive and negative lookahead - negative fails', () => {
  const result = Tendril('{(?a:5) (!b:_)}').match({a: 5, b: 3, c: 7}).solutions().toArray();
  assert.equal(result.length, 0); // b exists, negative lookahead fails
});

// ==================== Lookaheads with Wildcard Keys ====================

test('positive lookahead with wildcard key', () => {
  // {(?_:5)} - at least one key has value 5
  const result = Tendril('{(?_:5)}').match({a: 3, b: 5}).solutions().toArray();
  assert.equal(result.length, 1);
});

test('negative lookahead with wildcard key', () => {
  // {(!_:5)} - no key has value 5
  const result = Tendril('{(!_:5)}').match({a: 3, b: 7}).solutions().toArray();
  assert.equal(result.length, 1);
});

test('negative lookahead with wildcard key - fails', () => {
  const result = Tendril('{(!_:5)}').match({a: 3, b: 5}).solutions().toArray();
  assert.equal(result.length, 0);
});

// ==================== Multiple Solutions from Lookahead Bindings ====================

test('positive lookahead with wildcard binding - enumerates all solutions', () => {
  // {(?_:$x)} with multiple keys - should produce multiple solutions
  const result = Tendril('{(?_:$x)}').match({a: 1, b: 2}).solutions().toArray();
  assert.equal(result.length, 2);
  const values = result.map(r => r.x).sort();
  assert.deepEqual(values, [1, 2]);
});

test('positive lookahead binding with subsequent unification - finds valid solution', () => {
  // {(?_:$x) target:$x} - lookahead binds x to some value, then target must equal it
  // With {a:1, b:2, target:2}, only x=2 allows unification
  const result = Tendril('{(?_:$x) target:$x}').match({a: 1, b: 2, target: 2}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 2);
});

test('positive lookahead binding with unification - multiple valid solutions', () => {
  // {(?_:$x) (?_:$x)} - find pairs of keys with equal values
  // With {a:1, b:1, c:2}, x can be 1 (matched by a and b)
  const result = Tendril('{(?_:$x) (?_:$x)}').match({a: 1, b: 1, c: 2}).solutions().toArray();
  // Should find solutions where x=1 (a=1, b=1 both match)
  assert.ok(result.length >= 1);
  assert.ok(result.some(r => r.x === 1));
});

test('positive lookahead binding - no valid unification yields no solutions', () => {
  // {(?/other/:$x) target:$x} - lookahead only matches keys starting with "other"
  // With {other1: 1, other2: 2, target: 99}, x can be 1 or 2, but target is 99
  const result = Tendril('{(?/other/:$x) target:$x}').match({other1: 1, other2: 2, target: 99}).solutions().toArray();
  assert.equal(result.length, 0);
});

test('positive lookahead without binding - single solution (optimization)', () => {
  // {(?_:5)} - no binding, should produce exactly 1 solution even with multiple matching keys
  const result = Tendril('{(?_:5)}').match({a: 5, b: 5, c: 5}).solutions().toArray();
  assert.equal(result.length, 1);
});

// ==================== Array Context Lookahead Bindings ====================

test('array positive lookahead with binding - enumerates solutions', () => {
  // [(?$x) ..] where multiple elements could bind
  const result = Tendril('[(?$x) ..]').match([1, 2, 3]).solutions().toArray();
  // The lookahead tests at position 0, so only 1 should bind
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 1);
});

test('array lookahead with nested binding', () => {
  // [(?[$x ..]) ..] - lookahead into nested array
  const result = Tendril('[(?[$x ..]) ..]').match([[1, 2], [3, 4]]).solutions().toArray();
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 1);
});

console.log('\n✓ All object lookahead tests defined\n');
