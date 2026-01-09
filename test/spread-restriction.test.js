/**
 * Spread/Remainder Tests
 *
 * Tests for spread (...) and remainder (%) syntax in patterns.
 *
 * Run with: node --test test/spread-restriction.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

// ==================== Object Patterns ====================

test('object: basic field matching', () => {
  const t = Tendril('{k: $v}');
  const r = t.match({k: 1, extra: 2});
  assert.ok(r.hasMatch());
  assert.equal(r.solutions().first().v, 1);
});

test('object: % allows and ignores remainder', () => {
  const t = Tendril('{k: $v, %}');
  const r = t.match({k: 1, extra: 2, more: 3});
  assert.ok(r.hasMatch());
  assert.equal(r.solutions().first().v, 1);
});

test('object: (% as %rest) captures remainder', () => {
  const t = Tendril('{k: $v, (% as %rest)}');
  const r = t.match({k: 1, extra: 2, more: 3});
  assert.ok(r.hasMatch());
  const sol = r.solutions().first();
  assert.equal(sol.v, 1);
  assert.deepEqual(sol.rest, {extra: 2, more: 3});
});

// ==================== Array Patterns ====================

test('array: basic element matching', () => {
  const t = Tendril('[1 2 3]');
  assert.ok(t.match([1, 2, 3]).hasMatch());
  assert.ok(!t.match([1, 2]).hasMatch());
});

test('array: ... spread matches any elements', () => {
  const t = Tendril('[1 ... 5]');
  assert.ok(t.match([1, 2, 3, 4, 5]).hasMatch());
  assert.ok(t.match([1, 5]).hasMatch());
  assert.ok(!t.match([1, 2, 3]).hasMatch());
});

test('array: (... as @x) captures spread', () => {
  const t = Tendril('[1 (... as @middle) 5]');
  const sol = t.match([1, 2, 3, 4, 5]).solutions().first();
  assert.ok(sol);
  assert.deepEqual(sol.middle, [2, 3, 4]);
});

// ==================== Invalid Patterns ====================

test('invalid: bare .. in object is error', () => {
  assert.throws(
    () => Tendril('{.. k: $v}').match({}),
    /bare.*not allowed|expected/i
  );
});

console.log('\n[spread-restriction] Test suite defined\n');
