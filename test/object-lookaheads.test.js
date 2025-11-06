/**
 * Object Lookahead Tests
 *
 * Tests for (?=pattern) and (?!pattern) in object contexts
 *
 * Run with: node test/object-lookaheads.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril, matches, extractAll } from '../src/tendril-api.js';

// ==================== Positive Lookaheads ====================

test('positive lookahead - single key assertion', () => {
  // {(?=a:5)} - assert that key 'a' has value 5, don't consume
  const result = Tendril('{(?=a:5)}').all({a: 5, b: 3});
  assert.equal(result.length, 1);
});

test('positive lookahead - fails when key missing', () => {
  const result = Tendril('{(?=a:5)}').all({b: 3});
  assert.equal(result.length, 0);
});

test('positive lookahead - fails when value mismatch', () => {
  const result = Tendril('{(?=a:5)}').all({a: 3, b: 3});
  assert.equal(result.length, 0);
});

test('positive lookahead with binding - bindings escape', () => {
  // {(?=a:$x) b:$x} - lookahead binds x, must unify with b's value
  const result = Tendril('{(?=a:$x) b:$x}').all({a: 5, b: 5});
  assert.equal(result.length, 1);
  assert.equal(result[0].bindings.x, 5);
});

test('positive lookahead with binding - unification fails', () => {
  // {(?=a:$x) b:$x} - lookahead binds x=5, but b=3, unification fails
  const result = Tendril('{(?=a:$x) b:$x}').all({a: 5, b: 3});
  assert.equal(result.length, 0);
});

// ==================== Negative Lookaheads ====================

test('negative lookahead - succeeds when key absent', () => {
  // {(?!a=5)} - assert that key 'a' does NOT have value 5
  const result = Tendril('{(?!a:5)}').all({b: 3});
  assert.equal(result.length, 1);
});

test('negative lookahead - succeeds when value mismatch', () => {
  const result = Tendril('{(?!a:5)}').all({a: 3, b: 3});
  assert.equal(result.length, 1);
});

test('negative lookahead - fails when key matches', () => {
  const result = Tendril('{(?!a:5)}').all({a: 5, b: 3});
  assert.equal(result.length, 0);
});

test('negative lookahead - no binding escape', () => {
  // {(?!a:$x) b:$y} - x should NOT escape negative lookahead
  // Test with object that lacks key 'a', so negative lookahead succeeds
  const result = Tendril('{(?!a:$x) b:$y}').all({b: 3, c: 7});
  assert.equal(result.length, 1);
  assert.equal(result[0].bindings.x, undefined); // x did not escape
  assert.equal(result[0].bindings.y, 3);
});

// ==================== Combined Lookaheads ====================

test('multiple positive lookaheads', () => {
  // {(?=a:5) (?=b:3)} - both must be present
  const result = Tendril('{(?=a:5) (?=b:3)}').all({a: 5, b: 3, c: 7});
  assert.equal(result.length, 1);
});

test('positive and negative lookahead', () => {
  // {(?=a:5) (?!b:_)} - a must equal 5, b must not exist
  const result = Tendril('{(?=a:5) (?!b:_)}').all({a: 5, c: 7});
  assert.equal(result.length, 1);
});

test('positive and negative lookahead - negative fails', () => {
  const result = Tendril('{(?=a:5) (?!b:_)}').all({a: 5, b: 3, c: 7});
  assert.equal(result.length, 0); // b exists, negative lookahead fails
});

// ==================== Lookaheads with Wildcard Keys ====================

test('positive lookahead with wildcard key', () => {
  // {(?=_:5)} - at least one key has value 5
  const result = Tendril('{(?=_:5)}').all({a: 3, b: 5});
  assert.equal(result.length, 1);
});

test('negative lookahead with wildcard key', () => {
  // {(?!_:5)} - no key has value 5
  const result = Tendril('{(?!_:5)}').all({a: 3, b: 7});
  assert.equal(result.length, 1);
});

test('negative lookahead with wildcard key - fails', () => {
  const result = Tendril('{(?!_:5)}').all({a: 3, b: 5});
  assert.equal(result.length, 0);
});

console.log('\n✓ All object lookahead tests defined\n');
