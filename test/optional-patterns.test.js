/**
 * Optional Pattern Tests (K?:V)
 *
 * Tests for optional object assertions K?:V which desugar to (K=V | (?!K))
 * These tests document the expected behavior before implementation.
 *
 * Run with: node test/optional-patterns.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

// Simple optional literal key
test('optional literal key - key exists and matches', () => {
  const result = Tendril('{a?:5}').match({a: 5, b: 3}).solutions().toArray();
  assert.equal(result.length, 1);
  // No bindings in this pattern
});

test('optional literal key - key exists but does not match', () => {
  const result = Tendril('{a?:5}').match({a: 3, b: 3}).solutions().toArray();
  assert.equal(result.length, 0); // Should fail - a exists but wrong value
});

test('optional literal key - key does not exist', () => {
  const result = Tendril('{a?:5}').match({b: 3}).solutions().toArray();
  assert.equal(result.length, 1); // Should succeed - a is optional
});

// Optional with value binding
test('optional with value binding - key exists', () => {
  const result = Tendril('{a?:$x}').match({a: 5, b: 3}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 5);
});

test('optional with value binding - key does not exist', () => {
  const result = Tendril('{a?:$x}').match({b: 3}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.equal(result[0].x, undefined); // x not bound
});

// Complex key pattern with alternation
test('optional complex pattern - matches via key binding', () => {
  // {($x=(/x/)|foo)?:$x} against {foo:5}
  // Should match "foo" literal branch, bind x=5 (the value)
  const result = Tendril('{($x=(/x/)|foo)?:$x}').match({foo: 5}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 5);
});

test('optional complex pattern - matches via regex key binding', () => {
  // {($x=(/x/)|foo)?:$x} against {box:5}
  // "box" matches /x/, binds x="box", but value 5 != "box", fails first alternative
  // Then negative lookahead: "box" matches pattern, so lookahead fails
  // No solutions
  const result = Tendril('{($x=(/x/)|foo)?:$x}').match({box: 5}).solutions().toArray();
  assert.equal(result.length, 0);
});

test('optional complex pattern - no match, negative succeeds', () => {
  // {($x=(/x/)|foo)?:$x} against {bar:5}
  // "bar" doesn't match /x/ or "foo", first alternative fails
  // Negative lookahead: no key matches pattern, succeeds with empty bindings
  const result = Tendril('{($x=(/x/)|foo)?:$x}').match({bar: 5}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.equal(result[0].x, undefined); // x not bound
});

// Optional with unification across multiple assertions
test('optional with unification - both present', () => {
  const result = Tendril('{a?:$x b:$x}').match({a: 5, b: 5}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 5);
});

test('optional with unification - optional absent, required determines binding', () => {
  const result = Tendril('{a?:$x b:$x}').match({b: 5}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 5); // x bound by b:$x
});

test('optional with unification - values do not unify', () => {
  const result = Tendril('{a?:$x b:$x}').match({a: 3, b: 5}).solutions().toArray();
  assert.equal(result.length, 0); // a exists with value 3, but b requires x:5
});

console.log('\n✓ All optional pattern tests defined\n');
