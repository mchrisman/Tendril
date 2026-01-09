/**
 * Complex Pattern Tests
 *
 * Tests for complex patterns including sequences, groups, and replaceAll.
 *
 * Run with: node --test test/complex-patterns.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

test('complex: array with spread and group binding', () => {
  const data = [1, 2, 3, 4, 5];
  const pattern = Tendril('[1 (... as @middle) 5]');
  const sol = pattern.match(data).solutions().first();
  assert.ok(sol);
  assert.deepEqual(sol.middle, [2, 3, 4]);
});

test('complex: nested object with multiple bindings', () => {
  const data = {
    user: {name: 'Alice', age: 30},
    settings: {theme: 'dark'}
  };
  const pattern = Tendril('{user: {name: $name, age: $age}, settings: {theme: $theme}}');
  const sol = pattern.match(data).solutions().first();
  assert.ok(sol);
  assert.equal(sol.name, 'Alice');
  assert.equal(sol.age, 30);
  assert.equal(sol.theme, 'dark');
});

test('complex: alternation in array', () => {
  const data = [1, 'two', 3, 'four'];
  // Match numbers only
  const pattern = Tendril('[(any_number | any_string)*]');
  const sol = pattern.match(data).solutions().first();
  assert.ok(sol);
});

test('complex: find and replaceAll', () => {
  const data = {items: [{type: 'A', val: 1}, {type: 'B', val: 2}, {type: 'A', val: 3}]};
  const pattern = Tendril('{type: A, val: $v}');

  const result = pattern.find(data).replaceAll($ => ({type: 'X', val: $.v * 10}));

  assert.equal(result.items[0].type, 'X');
  assert.equal(result.items[0].val, 10);
  assert.equal(result.items[1].type, 'B');  // Unchanged
  assert.equal(result.items[2].type, 'X');
  assert.equal(result.items[2].val, 30);
});

test('complex: optional pattern in sequence', () => {
  const pattern = Tendril('[1 2? 3]');

  // Matches with 2
  assert.ok(pattern.match([1, 2, 3]).hasMatch());
  // Matches without 2
  assert.ok(pattern.match([1, 3]).hasMatch());
  // Doesn't match wrong sequence
  assert.ok(!pattern.match([1, 4, 3]).hasMatch());
});

test('complex: quantifiers with binding', () => {
  const pattern = Tendril('[((_ where _ > 0)+ as @positives)]');
  const sol = pattern.match([1, 2, 3]).solutions().first();
  assert.ok(sol);
  assert.deepEqual(sol.positives, [1, 2, 3]);
});

test('complex: alternation of sequences in group binding', () => {
  // Alt branches can consume different numbers of elements
  const pattern = Tendril('[(((2 3) | (4 5 6)) as @x) 7]');

  const sol1 = pattern.match([2, 3, 7]).solutions().first();
  assert.ok(sol1);
  assert.deepEqual(sol1.x, [2, 3]);

  const sol2 = pattern.match([4, 5, 6, 7]).solutions().first();
  assert.ok(sol2);
  assert.deepEqual(sol2.x, [4, 5, 6]);
});

test('complex: plain parentheses for grouping in array', () => {
  // Parentheses should just group, not create special structures
  assert.ok(Tendril('[1 2 (3 4)]').match([1, 2, 3, 4]).hasMatch());
  assert.ok(Tendril('[(1 | 2) (3 | 4)]').match([1, 4]).hasMatch());
  assert.ok(Tendril('[(1 | 2) (3 | 4)]').match([2, 3]).hasMatch());
});

test('complex: backtracking with multiple group bindings', () => {
  // Pattern should find all valid ways to split the array
  const pattern = Tendril('[((... 1) as @a) (... as @b) 2]');
  const sols = pattern.match([1, 1, 2, 2]).solutions().toArray();

  assert.equal(sols.length, 2);
  // First solution: @a captures first 1, @b captures [1, 2]
  assert.deepEqual(sols[0].a, [1]);
  assert.deepEqual(sols[0].b, [1, 2]);
  // Second solution: @a captures both 1s, @b captures [2]
  assert.deepEqual(sols[1].a, [1, 1]);
  assert.deepEqual(sols[1].b, [2]);
});

console.log('\n[complex-patterns] Test suite defined\n');
