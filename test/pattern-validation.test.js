/**
 * Pattern Validation Tests
 *
 * Tests that bound variables still validate against their inner patterns.
 * Example: {a=$x $x=(/abc/)=$y} should verify that the bound value of $x
 * matches the pattern /abc/ before using it.
 *
 * Run with: node test/pattern-validation.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

test('pattern validation - bound variable with non-matching regex pattern', () => {
  const data = {
    a: 'xyz',
    xyz: 'found_it',
    abc123: 'also_found'
  };

  const pattern = '{a:$x $x=(/abc/):$y}';
  const result = Tendril(pattern).match(data).solutions().toArray();

  // Should find 0 solutions because "xyz" does not match /abc/
  assert.equal(result.length, 0);
});

test('pattern validation - bound variable with matching regex pattern', () => {
  const data = {
    a: 'abc123',
    abc123: 'found_it',
    xyz: 'not_found'
  };

  const pattern = '{a:$x $x=(/abc/):$y}';
  const result = Tendril(pattern).match(data).solutions().toArray();

  // Should find 1 solution because "abc123" matches /abc/
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].toObject(), { x: 'abc123', y: 'found_it'});
});

test('pattern validation - bound variable with literal pattern', () => {
  const data = {
    a: 'b',
    b: 'value',
    c: 'wrong'
  };

  const pattern = '{a:$x $x=("b"):$y}';
  const result = Tendril(pattern).match(data).solutions().toArray();

  // Should find 1 solution because "b" === "b"
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].toObject(), { x: 'b', y: 'value'});
});

test('pattern validation - bound variable that doesn\'t match literal pattern', () => {
  const data = {
    a: 'c',
    b: 'value',
    c: 'wrong'
  };

  const pattern = '{a:$x $x=("b"):$y}';
  const result = Tendril(pattern).match(data).solutions().toArray();

  // Should find 0 solutions because "c" !:: "b"
  assert.equal(result.length, 0);
});

test('pattern validation - array index pattern validation', () => {
  const data = {
    items: [
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f']
    ],
    idx: 1
  };

  const pattern = '{idx:$i items[$i=(1)][0]:$x}';
  const result = Tendril(pattern).match(data).solutions().toArray();

  // Should find 1 solution because idx:1 matches pattern (1)
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].toObject(), { i: 1, x: 'c'});
});

test('pattern validation - array index that doesn\'t match', () => {
  const data = {
    items: [
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f']
    ],
    idx: 2
  };

  const pattern = '{idx:$i items[$i=(1)][0]:$x}';
  const result = Tendril(pattern).match(data).solutions().toArray();

  // Should find 0 solutions because idx=2 doesn't match pattern (1)
  assert.equal(result.length, 0);
});

console.log('\n✓ All pattern validation tests defined\n');
