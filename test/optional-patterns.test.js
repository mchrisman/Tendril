/**
 * Optional Pattern Tests (each K:V ?)
 *
 * Tests for optional strong patterns `each K:V ?` which mean:
 * - No existence requirement (slice can be empty)
 * - No bad entries allowed (if key matches K, value must match V)
 *
 * Run with: node test/optional-patterns.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

// Simple optional literal key with strong semantics
test('optional literal key - key exists and matches', () => {
  const result = Tendril('{each a:5 ?}').match({a: 5, b: 3}).solutions().toArray();
  assert.equal(result.length, 1);
  // No bindings in this pattern
});

test('optional literal key - key exists but does not match', () => {
  const result = Tendril('{each a:5 ?}').match({a: 3, b: 3}).solutions().toArray();
  assert.equal(result.length, 0); // Should fail - a exists with wrong value (bad entry)
});

test('optional literal key - key does not exist', () => {
  const result = Tendril('{each a:5 ?}').match({b: 3}).solutions().toArray();
  assert.equal(result.length, 1); // Should succeed - a is optional and no bad entries
});

// Optional with value binding
test('optional with value binding - key exists', () => {
  const result = Tendril('{each a:$x ?}').match({a: 5, b: 3}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 5);
});

test('optional with value binding - key does not exist', () => {
  const result = Tendril('{each a:$x ?}').match({b: 3}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.equal(result[0].x, undefined); // x not bound
});

// Complex key pattern with alternation
test('optional complex pattern - matches via key binding', () => {
  // {each foo:$x ?} against {foo:5}
  const result = Tendril('{each foo:$x ?}').match({foo: 5}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 5);
});

test('optional complex pattern - matches via regex key binding', () => {
  // {each /x/:$x ?} against {box: 5}
  // 'box' matches /x/, value is 5, binds x=5
  const result = Tendril('{each /x/:$x ?}').match({box: 5}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 5);
});

test('optional complex pattern - no match, succeeds with empty slice', () => {
  // {each /x/:$x ?} against {bar: 5}
  // 'bar' doesn't match /x/, so slice is empty (allowed by ?)
  // No bad entries since 'bar' doesn't match /x/
  const result = Tendril('{each /x/:$x ?}').match({bar: 5}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.equal(result[0].x, undefined); // x not bound
});

// Optional with unification across multiple assertions
test('optional with unification - both present', () => {
  const result = Tendril('{each a:$x ? b:$x}').match({a: 5, b: 5}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 5);
});

test('optional with unification - optional absent, required determines binding', () => {
  const result = Tendril('{each a:$x ? b:$x}').match({b: 5}).solutions().toArray();
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 5); // x bound by b:$x
});

test('optional with unification - values do not unify', () => {
  const result = Tendril('{each a:$x ? b:$x}').match({a: 3, b: 5}).solutions().toArray();
  assert.equal(result.length, 0); // a has value 3, b requires x=5, doesn't unify
});

console.log('\n[optional-patterns] Test suite defined\n');
