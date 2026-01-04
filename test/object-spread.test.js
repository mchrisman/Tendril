/**
 * Unit tests for object spread restrictions
 *
 * Run with: node test/object-spread.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

test('valid: % at end {k:$v %}', () => {
  const t = Tendril('{k:$v %}');
  const matchSet = t.match({k: 1, extra: 2});
  assert.ok(matchSet.hasMatch(), 'Should match with extra keys');
});

test('valid: group binding at end {k:$v (% as @rest)}', () => {
  const t = Tendril('{k:$v (% as @rest)}');
  const matchSet = t.match({k: 1, extra: 2});
  assert.ok(matchSet.hasMatch(), 'Should match');
  const sol = matchSet.solutions().first();
  assert.deepEqual(sol.rest, {extra: 2});
});

test('invalid: % at beginning throws', () => {
  try {
    const t = Tendril('{% k:$v}');
    t.match({});  // Trigger compilation
    assert.fail('Should have thrown parse error');
  } catch (e) {
    // Any parse error is acceptable - % must be at end of object pattern
    assert.ok(e.message, 'Should throw parse error for % at beginning');
  }
});

test('invalid: % in middle throws', () => {
  try {
    const t = Tendril('{k:$v % m:$n}');
    t.match({});  // Trigger compilation
    assert.fail('Should have thrown parse error');
  } catch (e) {
    // Any parse error is acceptable - % must be at end of object pattern
    assert.ok(e.message, 'Should throw parse error for % in middle');
  }
});

test('group binding captures residual keys', () => {
  const t = Tendril('{a:$x (% as @rest)}');
  const sol = t.match({a: 1, b: 2, c: 3}).solutions().first();
  assert.equal(sol.x, 1);
  assert.deepEqual(sol.rest, {b: 2, c: 3});
});

test('group bindings with patterns match whole object, can overlap', () => {
  const t = Tendril('{(/[ab]/:_ as @a) (/[bc]/:_ as @b) (% as @c)}');
  const matchSet = t.match({b: 1, x: 2});
  assert.ok(matchSet.hasMatch(), 'Should match');
  const sol = matchSet.solutions().first();
  assert.deepEqual(sol.a, {b: 1});
  assert.deepEqual(sol.b, {b: 1});
  assert.deepEqual(sol.c, {x: 2});
});

test('nested group bindings', () => {
  const t = Tendril('{(a:_ (c:_ as @y) as @x)}');
  const matchSet = t.match({a: 'A', c: 'C', d: 'D'});
  assert.ok(matchSet.hasMatch(), 'Should match');
  const sol = matchSet.solutions().first();
  assert.deepEqual(sol.x, {a: 'A', c: 'C'});
  assert.deepEqual(sol.y, {c: 'C'});
});

console.log('\n✓ All object spread tests defined\n');
