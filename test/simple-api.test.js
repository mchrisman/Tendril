// simple-api.test.js — Tests for the new simple API (.on() / .in())

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

console.log('\n✓ All simple API tests defined\n');

// ==================== OnMatcher tests (.on()) ====================

test('on().test() returns boolean', () => {
  assert.equal(Tendril('{name: $x}').on({name: 'Alice'}).test(), true);
  assert.equal(Tendril('{name: $x}').on({age: 30}).test(), false);
  assert.equal(Tendril('[1 2 3]').on([1, 2, 3]).test(), true);
  assert.equal(Tendril('[1 2 3]').on([1, 2]).test(), false);
});

test('on().solve() returns plain object or null', () => {
  const result = Tendril('{name: $x}').on({name: 'Alice'}).solve();
  assert.deepEqual(result, {x: 'Alice'});

  const noMatch = Tendril('{name: $x}').on({age: 30}).solve();
  assert.equal(noMatch, null);
});

test('on().solve() returns empty object for match without bindings', () => {
  const result = Tendril('{name: _}').on({name: 'Alice'}).solve();
  assert.deepEqual(result, {});
});

test('on().solutions() returns array of plain objects', () => {
  const result = Tendril('{a: (1|2)}').on({a: 1}).solutions();
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 1);
});

test('on().replace() replaces entire match', () => {
  const result = Tendril('{a: $x}').on({a: 1, b: 2}).replace({replaced: true});
  assert.deepEqual(result, {replaced: true});
});

test('on().replace() with function', () => {
  const result = Tendril('{a: $x}').on({a: 1}).replace(b => ({doubled: b.x * 2}));
  assert.deepEqual(result, {doubled: 2});
});

test('on().mutate() edits specific bindings', () => {
  const result = Tendril('{a: $x, b: $y}').on({a: 1, b: 2}).mutate({x: 10});
  assert.deepEqual(result, {a: 10, b: 2});
});

test('on().mutate() with function', () => {
  const result = Tendril('{a: $x, b: $y}').on({a: 1, b: 2}).mutate(b => ({x: b.y, y: b.x}));
  assert.deepEqual(result, {a: 2, b: 1});
});

// ==================== InMatcher tests (.in()) ====================

test('in().count() returns number of occurrences', () => {
  const data = [{name: 'Alice'}, {name: 'Bob'}, {age: 30}];
  assert.equal(Tendril('{name: $n}').in(data).count(), 2);
  assert.equal(Tendril('{age: $a}').in(data).count(), 1);
  assert.equal(Tendril('{missing: $m}').in(data).count(), 0);
});

test('in().locations() returns array of {path, fragment, bindings}', () => {
  const data = {users: [{name: 'Alice'}, {name: 'Bob'}]};
  const locations = Tendril('{name: $n}').in(data).locations();

  assert.equal(locations.length, 2);
  assert.deepEqual(locations[0].bindings, {n: 'Alice'});
  assert.deepEqual(locations[1].bindings, {n: 'Bob'});
  assert.ok(Array.isArray(locations[0].path));
  assert.ok(locations[0].fragment !== undefined);
});

test('in().replace() replaces all occurrences', () => {
  const data = [{a: 1}, {a: 2}, {b: 3}];
  const result = Tendril('{a: $x}').in(data).replace({replaced: true});
  assert.deepEqual(result, [{replaced: true}, {replaced: true}, {b: 3}]);
});

test('in().replace() with function', () => {
  const data = [{a: 1}, {a: 2}];
  const result = Tendril('{a: $x}').in(data).replace(b => ({a: b.x * 10}));
  assert.deepEqual(result, [{a: 10}, {a: 20}]);
});

test('in().mutate() edits specific bindings across occurrences', () => {
  const data = [{a: 1, b: 10}, {a: 2, b: 20}];
  const result = Tendril('{a: $x}').in(data).mutate({x: 99});
  assert.deepEqual(result, [{a: 99, b: 10}, {a: 99, b: 20}]);
});

// ==================== Edge cases ====================

test('on() with no match returns original data from replace/mutate', () => {
  const data = {a: 1};
  const result = Tendril('{b: $x}').on(data).replace({replaced: true});
  assert.deepEqual(result, {a: 1});
});

test('in() with no matches returns original data', () => {
  const data = [{a: 1}, {a: 2}];
  const result = Tendril('{b: $x}').in(data).replace({replaced: true});
  assert.deepEqual(result, [{a: 1}, {a: 2}]);
});

test('operations are pure (do not mutate original)', () => {
  const data = {a: 1, b: 2};
  const original = JSON.stringify(data);

  Tendril('{a: $x}').on(data).replace({replaced: true});
  assert.equal(JSON.stringify(data), original);

  Tendril('{a: $x}').on(data).mutate({x: 99});
  assert.equal(JSON.stringify(data), original);
});

// ==================== Legacy API compatibility ====================

test('match() still works (legacy alias)', () => {
  const result = Tendril('{name: $x}').match({name: 'Alice'});
  assert.ok(result.hasMatch());
  assert.equal(result.solutions().first().x, 'Alice');
});

test('find() still works (legacy alias)', () => {
  const data = [{name: 'Alice'}, {name: 'Bob'}];
  const result = Tendril('{name: $n}').find(data);
  assert.equal(result.count(), 2);
});

test('advancedMatch() works', () => {
  const result = Tendril('{name: $x}').advancedMatch({name: 'Alice'});
  assert.ok(result.hasMatch());
});

test('advancedFind() works', () => {
  const data = [{name: 'Alice'}, {name: 'Bob'}];
  const result = Tendril('{name: $n}').advancedFind(data);
  assert.equal(result.count(), 2);
});
