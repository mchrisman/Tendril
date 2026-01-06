// slice-patterns.test.js — Tests for %{ } and @[ ] slice pattern syntax

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

console.log('\n✓ All slice pattern tests defined\n');

// ==================== Object Slice Patterns ====================

test('%{ } - object slice find and replace', () => {
  const data = {a: 1, b: 2, c: 3};
  const result = Tendril('%{ a:1 }').find(data).replaceAll({x: 99});
  assert.deepEqual(result, {x: 99, b: 2, c: 3});
});

test('%{ } - object slice with multiple fields', () => {
  const data = {a: 1, b: 2, c: 3, d: 4};
  const result = Tendril('%{ a:1 b:2 }').find(data).replaceAll({replaced: true});
  assert.deepEqual(result, {replaced: true, c: 3, d: 4});
});

test('%{ } - object slice with regex key', () => {
  const data = {foo_1: 'a', foo_2: 'b', bar: 'c'};
  const result = Tendril('%{ /^foo/:_ }').find(data).replaceAll({foos: 'gone'});
  assert.deepEqual(result, {foos: 'gone', bar: 'c'});
});

test('%{ } - object slice with binding', () => {
  const data = [{name: 'Alice', age: 30}, {name: 'Bob', age: 25}];
  const solutions = Tendril('%{ name:$n }').find(data).solutions().toArray();
  assert.equal(solutions.length, 2);
  assert.equal(solutions[0].n, 'Alice');
  assert.equal(solutions[1].n, 'Bob');
});

test('%{ } - object slice nested', () => {
  const data = {outer: {inner: {target: 1, keep: 2}}};
  const result = Tendril('%{ target:_ }').find(data).replaceAll({replaced: true});
  assert.deepEqual(result, {outer: {inner: {replaced: true, keep: 2}}});
});

// ==================== Array Slice Patterns ====================

test('@[ ] - array slice find and replace', () => {
  const data = [1, 2, 3, 4, 5];
  const result = Tendril('@[ 2 3 ]').find(data).replaceAll([20, 30]);
  assert.deepEqual(result, [1, 20, 30, 4, 5]);
});

test('@[ ] - array slice with single element', () => {
  const data = [1, 2, 3, 4, 5];
  const result = Tendril('@[ 3 ]').find(data).replaceAll([30, 31, 32]);
  assert.deepEqual(result, [1, 2, 30, 31, 32, 4, 5]);
});

test('@[ ] - array slice with binding', () => {
  const data = [[1, 2], [3, 4], [5, 6]];
  const solutions = Tendril('@[ $x $y ]').find(data).solutions().toArray();
  // Should find pairs within each sub-array
  assert.ok(solutions.length > 0);
});

test('@[ ] - array slice nested', () => {
  const data = {items: [1, 2, 3, 4, 5]};
  const result = Tendril('@[ 2 3 ]').find(data).replaceAll([20, 30, 31]);
  assert.deepEqual(result, {items: [1, 20, 30, 31, 4, 5]});
});

test('@[ ] - array slice with pattern', () => {
  const data = ['a', 'b', 'c', 'd'];
  const result = Tendril('@[ /[bc]/ ]').find(data).replaceAll(['X']);
  // Should replace first match
  assert.ok(result.includes('X'));
});

// ==================== Error Cases ====================

test('%{ } with match() throws error', () => {
  assert.throws(
    () => Tendril('%{ a:1 }').match({a: 1}),
    /Slice patterns.*require find\(\) or first\(\)/
  );
});

test('@[ ] with match() throws error', () => {
  assert.throws(
    () => Tendril('@[ 1 2 ]').match([1, 2, 3]),
    /Slice patterns.*require find\(\) or first\(\)/
  );
});

test('%{ } with hasMatch() throws error', () => {
  assert.throws(
    () => Tendril('%{ a:1 }').hasMatch({a: 1}),
    /Slice patterns.*require find\(\) or first\(\)/
  );
});

test('%{ } empty is parse error', () => {
  assert.throws(
    () => Tendril('%{ }').find({}),  // Trigger parsing
    /empty object slice pattern/
  );
});

test('@[ ] empty is parse error', () => {
  assert.throws(
    () => Tendril('@[ ]').find([]),  // Trigger parsing
    /empty array slice pattern/
  );
});

// ==================== first() works with slice patterns ====================

test('%{ } with first() works', () => {
  const data = [{a: 1}, {a: 2}];
  const occ = Tendril('%{ a:$x }').first(data);
  assert.equal(occ.count(), 1);
  const sol = occ.solutions().first();
  assert.ok(sol.x === 1 || sol.x === 2);
});

test('@[ ] with first() works', () => {
  const data = [[1, 2, 3], [4, 5, 6]];
  const occ = Tendril('@[ $a $b ]').first(data);
  assert.equal(occ.count(), 1);
});

// ==================== hasAnyMatch works with slice patterns ====================

test('%{ } with hasAnyMatch() works', () => {
  const data = {nested: {a: 1}};
  assert.ok(Tendril('%{ a:1 }').hasAnyMatch(data));
  assert.ok(!Tendril('%{ a:2 }').hasAnyMatch(data));
});

test('@[ ] with hasAnyMatch() works', () => {
  const data = {arr: [1, 2, 3]};
  assert.ok(Tendril('@[ 2 3 ]').hasAnyMatch(data));
  assert.ok(!Tendril('@[ 5 6 ]').hasAnyMatch(data));
});
