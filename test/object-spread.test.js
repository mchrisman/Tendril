/**
 * Unit tests for object spread restrictions
 *
 * Run with: node test/object-spread.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril, Group } from '../src/tendril-api.js';

test('valid: remainder at end {k:$v remainder}', () => {
  const t = Tendril('{k:$v remainder}');
  const result = t.match({k: 1, extra: 2});
  assert.ok(result, 'Should match with extra keys');
});

test('valid: group binding at end {k:$v @rest=(remainder)}', () => {
  const t = Tendril('{k:$v @rest=(remainder)}');
  const result = t.match({k: 1, extra: 2});
  assert.ok(result, 'Should match');
  assert.deepEqual(result.bindings.rest, Group.object({extra: 2}));
});

test('invalid: remainder at beginning throws', () => {
  try {
    const t = Tendril('{remainder k:$v}');
    t.match({});  // Trigger compilation
    assert.fail('Should have thrown parse error');
  } catch (e) {
    assert.ok(e.message.includes('expected }'), 'Error indicates remainder must be at end');
  }
});

test('invalid: remainder in middle throws', () => {
  try {
    const t = Tendril('{k:$v remainder m:$n}');
    t.match({});  // Trigger compilation
    assert.fail('Should have thrown parse error');
  } catch (e) {
    assert.ok(e.message.includes('expected }'), 'Error indicates remainder must be at end');
  }
});

test('group binding captures residual keys', () => {
  const t = Tendril('{a:$x @rest=(remainder)}');
  const result = t.match({a: 1, b: 2, c: 3});
  assert.equal(result.bindings.x, 1);
  assert.deepEqual(result.bindings.rest, Group.object({b: 2, c: 3}));
});

test('group bindings with patterns match whole object, can overlap', () => {
  const t = Tendril('{@a=(/[ab]/:_) @b=(/[bc]/:_) @c=(remainder)}');
  const result = t.match({b: 1, x: 2});
  assert.ok(result, 'Should match');
  assert.deepEqual(result.bindings.a, Group.object({b: 1}));
  assert.deepEqual(result.bindings.b, Group.object({b: 1}));
  assert.deepEqual(result.bindings.c, Group.object({x: 2}));
});

test('nested group bindings', () => {
  const t = Tendril('{@x=(a:_ @y=(c:_))}');
  const result = t.match({a: 'A', c: 'C', d: 'D'});
  assert.ok(result, 'Should match');
  assert.deepEqual(result.bindings.x, Group.object({a: 'A', c: 'C'}));
  assert.deepEqual(result.bindings.y, Group.object({c: 'C'}));
});

console.log('\n✓ All object spread tests defined\n');
