/**
 * CW 2B Conformance Tests: Guarded Patterns
 *
 * Tests for (PATTERN where EXPR) syntax without binding.
 * The _ variable in guard expressions refers to the matched value.
 *
 * Run with: node --test test/guarded-patterns.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

// ==================== Basic Anonymous Guards ====================

test('guarded: (_ where _ > 3) matches value > 3', () => {
  assert.ok(Tendril('(_ where _ > 3)').match(5).hasMatch());
  assert.ok(!Tendril('(_ where _ > 3)').match(2).hasMatch());
});

test('guarded: (_ where _ == "hello") matches string', () => {
  assert.ok(Tendril('(_ where _ == "hello")').match("hello").hasMatch());
  assert.ok(!Tendril('(_ where _ == "hello")').match("world").hasMatch());
});

test('guarded: (_ where size(_) > 2) matches long arrays', () => {
  assert.ok(Tendril('(_ where size(_) > 2)').match([1, 2, 3]).hasMatch());
  assert.ok(!Tendril('(_ where size(_) > 2)').match([1, 2]).hasMatch());
});

test('guarded: (_ where size(_) > 2) matches long strings', () => {
  assert.ok(Tendril('(_ where size(_) > 2)').match("abc").hasMatch());
  assert.ok(!Tendril('(_ where size(_) > 2)').match("ab").hasMatch());
});

test('guarded: (_ where size(_) > 2) matches objects with many keys', () => {
  assert.ok(Tendril('(_ where size(_) > 2)').match({a:1, b:2, c:3}).hasMatch());
  assert.ok(!Tendril('(_ where size(_) > 2)').match({a:1, b:2}).hasMatch());
});

// ==================== Pattern with Guard ====================

test('guarded: ([_ _ _] where size(_) == 3) checks array structure and size', () => {
  assert.ok(Tendril('([_ _ _] where size(_) == 3)').match([1, 2, 3]).hasMatch());
  // Pattern requires 3 elements, guard redundant but valid
  assert.ok(!Tendril('([_ _ _] where size(_) == 3)').match([1, 2]).hasMatch());
});

test('guarded: ({x:$x} where $x > 0) uses pattern bindings in guard', () => {
  const sol = Tendril('({x:$x} where $x > 0)').match({x: 5}).solutions().first();
  assert.ok(sol);
  assert.equal(sol.x, 5);
  assert.ok(!Tendril('({x:$x} where $x > 0)').match({x: -1}).hasMatch());
});

test('guarded: ([$x $y] where $y == $x + 1) checks consecutive values', () => {
  const sol = Tendril('([$x $y] where $y == $x + 1)').match([3, 4]).solutions().first();
  assert.ok(sol);
  assert.equal(sol.x, 3);
  assert.equal(sol.y, 4);
  assert.ok(!Tendril('([$x $y] where $y == $x + 1)').match([3, 5]).hasMatch());
});

test('guarded: pattern with multiple bindings and complex guard', () => {
  const pat = '({a:$a, b:$b} where $a + $b > 10)';
  assert.ok(Tendril(pat).match({a: 5, b: 6}).hasMatch());
  assert.ok(!Tendril(pat).match({a: 3, b: 4}).hasMatch());
});

// ==================== Guard with _ Inside Container Patterns ====================

test('guarded: _ refers to entire matched value in nested context', () => {
  // Match any 2-element array where the array itself has size 2
  assert.ok(Tendril('([_ _] where size(_) == 2)').match([1, 2]).hasMatch());
});

// ==================== Guarded Pattern in Array Context ====================

test('guarded: filter array elements with guard', () => {
  const data = [1, 5, 2, 8, 3];
  const sol = Tendril('[(_ where _ > 3)*]').match(data).solutions().first();
  // Pattern matches the whole array when all elements satisfy guard
  // This won't match because 1, 2, 3 don't satisfy _ > 3
  assert.ok(!sol);
});

test('guarded: find elements in array with guard', () => {
  const data = [1, 5, 2, 8, 3];
  // Find values > 3
  const matches = Tendril('(_ where _ > 3)').find(data).occurrences().toArray();
  assert.equal(matches.length, 2);
  assert.deepEqual(matches.map(m => m.value()), [5, 8]);
});

// ==================== Guarded Pattern in Object Context ====================

test('guarded: filter object values with guard', () => {
  const data = {a: 1, b: 5, c: 2};
  // Match values > 3
  const sol = Tendril('{$k: (_ where _ > 3)}').match(data).solutions().first();
  // This will only match the 'b' key since only b:5 satisfies _ > 3
  assert.ok(sol);
  assert.equal(sol.k, 'b');
});

test('guarded: categorize with guard in value pattern', () => {
  const data = {a: 1, b: 5, c: 2, d: 10};
  const sol = Tendril('{$k: ((_ where _ > 3)->@big else _->@small)}')
    .match(data).solutions().first();
  assert.deepEqual(sol.big, {b: 5, d: 10});
  assert.deepEqual(sol.small, {a: 1, c: 2});
});

// ==================== Combined with Other Features ====================

test('guarded: with alternation', () => {
  const pat = '(1 where _ == 1) else (2 where _ == 2)';
  assert.ok(Tendril(pat).match(1).hasMatch());
  assert.ok(Tendril(pat).match(2).hasMatch());
  assert.ok(!Tendril(pat).match(3).hasMatch());
});

test('guarded: nested guarded patterns', () => {
  const pat = '({x: (_ where _ > 0)} where size(_) == 1)';
  assert.ok(Tendril(pat).match({x: 5}).hasMatch());
  assert.ok(!Tendril(pat).match({x: 5, y: 1}).hasMatch());  // size != 1
  assert.ok(!Tendril(pat).match({x: -1}).hasMatch());  // inner guard fails
});

test('guarded: _ does not bind to solution', () => {
  const sol = Tendril('(_ where _ > 3)').match(5).solutions().first();
  assert.ok(sol);
  // _ should not appear in bindings
  assert.ok(!('_' in sol._raw.bindings));
});

test('guarded: pattern bindings still work', () => {
  const sol = Tendril('({x:$x, y:$y} where $x < $y)').match({x: 1, y: 5}).solutions().first();
  assert.ok(sol);
  assert.equal(sol.x, 1);
  assert.equal(sol.y, 5);
});

// ==================== Error Cases ====================

test('guarded: invalid guard expression fails gracefully', () => {
  // Modulo by zero in guard should not match (not throw)
  assert.ok(!Tendril('(_ where _ % 0 > 0)').match(5).hasMatch());
});

test('guarded: guard with unbound variable fails', () => {
  // $z is not bound by the pattern
  // This should fail to match (guard can't evaluate)
  assert.ok(!Tendril('({x:$x} where $z > 0)').match({x: 5}).hasMatch());
});

console.log('\n[guarded-patterns] Test suite defined\n');
