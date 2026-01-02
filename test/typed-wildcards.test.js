/**
 * Typed Wildcards Tests
 *
 * Tests for _string, _number, _boolean type-checking wildcards
 *
 * Run with: node test/typed-wildcards.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';
import { tokenize } from '../src/microparser.js';

// ==================== _string ====================

test('_string matches string values', () => {
  assert.ok(Tendril('_string').match('hello').hasMatch());
  assert.ok(Tendril('_string').match('').hasMatch());
  assert.ok(Tendril('_string').match('123').hasMatch());
});

test('_string does not match non-strings', () => {
  assert.ok(!Tendril('_string').match(123).hasMatch());
  assert.ok(!Tendril('_string').match(true).hasMatch());
  assert.ok(!Tendril('_string').match(null).hasMatch());
  assert.ok(!Tendril('_string').match([]).hasMatch());
  assert.ok(!Tendril('_string').match({}).hasMatch());
});

// ==================== _number ====================

test('_number matches number values', () => {
  assert.ok(Tendril('_number').match(42).hasMatch());
  assert.ok(Tendril('_number').match(0).hasMatch());
  assert.ok(Tendril('_number').match(-1).hasMatch());
  assert.ok(Tendril('_number').match(3.14).hasMatch());
  assert.ok(Tendril('_number').match(Infinity).hasMatch());
  assert.ok(Tendril('_number').match(NaN).hasMatch());
});

test('_number does not match non-numbers', () => {
  assert.ok(!Tendril('_number').match('123').hasMatch());
  assert.ok(!Tendril('_number').match(true).hasMatch());
  assert.ok(!Tendril('_number').match(null).hasMatch());
  assert.ok(!Tendril('_number').match([]).hasMatch());
  assert.ok(!Tendril('_number').match({}).hasMatch());
});

// ==================== _boolean ====================

test('_boolean matches boolean values', () => {
  assert.ok(Tendril('_boolean').match(true).hasMatch());
  assert.ok(Tendril('_boolean').match(false).hasMatch());
});

test('_boolean does not match non-booleans', () => {
  assert.ok(!Tendril('_boolean').match(1).hasMatch());
  assert.ok(!Tendril('_boolean').match(0).hasMatch());
  assert.ok(!Tendril('_boolean').match('true').hasMatch());
  assert.ok(!Tendril('_boolean').match(null).hasMatch());
  assert.ok(!Tendril('_boolean').match([]).hasMatch());
  assert.ok(!Tendril('_boolean').match({}).hasMatch());
});

// ==================== Typed wildcards with bindings ====================

test('typed wildcard with binding captures value', () => {
  const sol = Tendril('{n:(_number as $x)}').match({n: 42}).solutions().first();
  assert.ok(sol);
  assert.equal(sol.x, 42);
});

test('typed wildcard with binding fails on type mismatch', () => {
  const sol = Tendril('{n:(_number as $x)}').match({n: 'hello'}).solutions().first();
  assert.equal(sol, null);
});

test('typed wildcard in array with spread', () => {
  const sols = Tendril('[... (_number as $x) ...]').match([1, 'a', 2, 'b', 3]).solutions().toArray();
  assert.equal(sols.length, 3);
  assert.deepEqual(sols.map(s => s.x), [1, 2, 3]);
});

test('typed wildcard filters in find', () => {
  const data = {a: 1, b: 'hello', c: 2, d: true};
  const matches = Tendril('{_:(_number as $x)}').match(data).solutions().toArray();
  assert.equal(matches.length, 2);
  const values = matches.map(m => m.x).sort();
  assert.deepEqual(values, [1, 2]);
});

// ==================== Typed wildcards as object keys ====================

test('_string as object key matches all keys', () => {
  // Keys are always strings, so _string matches any key
  const result = Tendril('{_string:$v}').match({foo: 1, bar: 2}).solutions().toArray();
  assert.equal(result.length, 2);
});

test('_number as object key matches nothing', () => {
  // Keys are strings, not numbers, so _number never matches
  const result = Tendril('{_number:$v}').match({foo: 1, bar: 2}).solutions().toArray();
  assert.equal(result.length, 0);
});

// ==================== Underscore-prefixed identifier rejection ====================

test('underscore-prefixed identifiers throw syntax error', () => {
  assert.throws(
    () => tokenize('_foo'),
    /identifiers cannot start with underscore: _foo/
  );
});

test('_String throws syntax error', () => {
  assert.throws(
    () => tokenize('_String'),
    /identifiers cannot start with underscore: _String/
  );
});

test('_123 throws syntax error', () => {
  assert.throws(
    () => tokenize('_123'),
    /identifiers cannot start with underscore: _123/
  );
});

test('__double throws syntax error', () => {
  assert.throws(
    () => tokenize('__double'),
    /identifiers cannot start with underscore: __double/
  );
});

// ==================== Typed wildcards tokenize correctly ====================

test('_string tokenizes as any_string', () => {
  const toks = tokenize('_string');
  assert.equal(toks.length, 1);
  assert.equal(toks[0].k, 'any_string');
});

test('_number tokenizes as any_number', () => {
  const toks = tokenize('_number');
  assert.equal(toks.length, 1);
  assert.equal(toks[0].k, 'any_number');
});

test('_boolean tokenizes as any_boolean', () => {
  const toks = tokenize('_boolean');
  assert.equal(toks.length, 1);
  assert.equal(toks[0].k, 'any_boolean');
});

test('_ still tokenizes as any', () => {
  const toks = tokenize('_');
  assert.equal(toks.length, 1);
  assert.equal(toks[0].k, 'any');
});

// ==================== SameValueZero equality ====================

test('NaN unifies with NaN through variable', () => {
  // Two NaN values should unify (SameValueZero semantics)
  const sol = Tendril('[$x $x]').match([NaN, NaN]).solutions().first();
  assert.ok(sol);
  assert.ok(Number.isNaN(sol.x));
});

test('0 matches -0', () => {
  // 0 and -0 should be equal with SameValueZero
  assert.ok(Tendril('0').match(-0).hasMatch());
  assert.ok(Tendril('0').match(0).hasMatch());
});

test('0 and -0 unify through variable', () => {
  // 0 and -0 should unify as the same value
  const sol = Tendril('[$x $x]').match([0, -0]).solutions().first();
  assert.ok(sol);
});

console.log('\n✓ All typed wildcard tests defined\n');
