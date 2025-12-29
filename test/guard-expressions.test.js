/**
 * Guard Expression Tests
 *
 * Tests for guard expressions: $x=(PATTERN; EXPR)
 *
 * Guard expressions allow constraining bound values with boolean expressions.
 * The guard is evaluated when all variables referenced in the expression are bound.
 *
 * Run with: node test/guard-expressions.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

// ==================== Basic Guard Expressions ====================

test('guard: $x > 100 matches numbers greater than 100', () => {
  const result = Tendril('$x=(_number; $x > 100)').match(150).solutions().first();
  assert.ok(result);
  assert.equal(result.x, 150);
});

test('guard: $x > 100 does not match numbers <= 100', () => {
  assert.ok(!Tendril('$x=(_number; $x > 100)').match(50).hasMatch());
  assert.ok(!Tendril('$x=(_number; $x > 100)').match(100).hasMatch());
});

test('guard: $x < 0 matches negative numbers', () => {
  const result = Tendril('$x=(_number; $x < 0)').match(-5).solutions().first();
  assert.ok(result);
  assert.equal(result.x, -5);
});

test('guard: equality comparison', () => {
  assert.ok(Tendril('$x=(_number; $x == 42)').match(42).hasMatch());
  assert.ok(!Tendril('$x=(_number; $x == 42)').match(41).hasMatch());
});

test('guard: inequality comparison', () => {
  assert.ok(Tendril('$x=(_number; $x != 0)').match(1).hasMatch());
  assert.ok(!Tendril('$x=(_number; $x != 0)').match(0).hasMatch());
});

test('guard: less than or equal', () => {
  assert.ok(Tendril('$x=(_number; $x <= 10)').match(10).hasMatch());
  assert.ok(Tendril('$x=(_number; $x <= 10)').match(5).hasMatch());
  assert.ok(!Tendril('$x=(_number; $x <= 10)').match(11).hasMatch());
});

test('guard: greater than or equal', () => {
  assert.ok(Tendril('$x=(_number; $x >= 10)').match(10).hasMatch());
  assert.ok(Tendril('$x=(_number; $x >= 10)').match(15).hasMatch());
  assert.ok(!Tendril('$x=(_number; $x >= 10)').match(9).hasMatch());
});

// ==================== Logical Operators ====================

test('guard: && (and) operator', () => {
  // x must be > 0 AND < 10
  assert.ok(Tendril('$x=(_number; $x > 0 && $x < 10)').match(5).hasMatch());
  assert.ok(!Tendril('$x=(_number; $x > 0 && $x < 10)').match(0).hasMatch());
  assert.ok(!Tendril('$x=(_number; $x > 0 && $x < 10)').match(15).hasMatch());
});

test('guard: || (or) operator', () => {
  // x must be < 0 OR > 100
  assert.ok(Tendril('$x=(_number; $x < 0 || $x > 100)').match(-5).hasMatch());
  assert.ok(Tendril('$x=(_number; $x < 0 || $x > 100)').match(150).hasMatch());
  assert.ok(!Tendril('$x=(_number; $x < 0 || $x > 100)').match(50).hasMatch());
});

test('guard: ! (not) operator', () => {
  assert.ok(Tendril('$x=(_number; !($x == 0))').match(1).hasMatch());
  assert.ok(!Tendril('$x=(_number; !($x == 0))').match(0).hasMatch());
});

test('guard: short-circuit && (false && X does not evaluate X)', () => {
  // This tests that false && error-inducing-expr doesn't throw
  assert.ok(!Tendril('$x=(_number; false && $x > 0)').match(5).hasMatch());
});

test('guard: short-circuit || (true || X does not evaluate X)', () => {
  // This tests that true || error-inducing-expr doesn't throw
  assert.ok(Tendril('$x=(_number; true || $x / 0 > 0)').match(5).hasMatch());
});

// ==================== Arithmetic Operators ====================

test('guard: addition', () => {
  assert.ok(Tendril('$x=(_number; $x + 10 == 15)').match(5).hasMatch());
});

test('guard: subtraction', () => {
  assert.ok(Tendril('$x=(_number; $x - 5 == 10)').match(15).hasMatch());
});

test('guard: multiplication', () => {
  assert.ok(Tendril('$x=(_number; $x * 2 == 10)').match(5).hasMatch());
});

test('guard: division', () => {
  assert.ok(Tendril('$x=(_number; $x / 2 == 5)').match(10).hasMatch());
});

test('guard: modulo', () => {
  // x must be even
  assert.ok(Tendril('$x=(_number; $x % 2 == 0)').match(4).hasMatch());
  assert.ok(!Tendril('$x=(_number; $x % 2 == 0)').match(3).hasMatch());
});

test('guard: division by zero fails match', () => {
  assert.ok(!Tendril('$x=(_number; $x / 0 > 0)').match(5).hasMatch());
});

test('guard: modulo by zero fails match', () => {
  assert.ok(!Tendril('$x=(_number; $x % 0 == 0)').match(5).hasMatch());
});

// ==================== Built-in Functions ====================

test('guard: size() on string', () => {
  const result = Tendril('$x=(_string; size($x) > 5)').match('hello world').solutions().first();
  assert.ok(result);
  assert.equal(result.x, 'hello world');
});

test('guard: size() on string - fails', () => {
  assert.ok(!Tendril('$x=(_string; size($x) > 10)').match('hi').hasMatch());
});

test('guard: size() on array', () => {
  const result = Tendril('$x=(_; size($x) == 3)').match([1, 2, 3]).solutions().first();
  assert.ok(result);
});

test('guard: size() on object', () => {
  const result = Tendril('$x=(_; size($x) == 2)').match({a: 1, b: 2}).solutions().first();
  assert.ok(result);
});

test('guard: number() conversion', () => {
  assert.ok(Tendril('$x=(_string; number($x) > 100)').match('150').hasMatch());
  assert.ok(!Tendril('$x=(_string; number($x) > 100)').match('50').hasMatch());
});

test('guard: string() conversion', () => {
  assert.ok(Tendril('$x=(_number; string($x) == "42")').match(42).hasMatch());
});

test('guard: boolean() conversion', () => {
  assert.ok(Tendril('$x=(_number; boolean($x))').match(1).hasMatch());
  assert.ok(!Tendril('$x=(_number; boolean($x))').match(0).hasMatch());
});

// ==================== String Operations ====================

test('guard: string concatenation', () => {
  assert.ok(Tendril('$x=(_string; $x + "!" == "hello!")').match('hello').hasMatch());
});

test('guard: string comparison', () => {
  // Lexicographic comparison
  assert.ok(Tendril('$x=(_string; $x > "abc")').match('abd').hasMatch());
  assert.ok(!Tendril('$x=(_string; $x > "abc")').match('abb').hasMatch());
});

// ==================== Multi-Variable Guards ====================

test('guard: multi-variable comparison', () => {
  // Match arrays where first element is less than second
  const pattern = '[$x=(_number; $x < $y) $y=(_number)]';
  assert.ok(Tendril(pattern).match([5, 10]).hasMatch());
  assert.ok(!Tendril(pattern).match([10, 5]).hasMatch());
});

test('guard: deferred evaluation until all vars bound', () => {
  // $x guard references $y, which is bound later
  // Guard should wait until $y is bound
  const pattern = '[$x=(_number; $x < $y) ... $y=(_number)]';
  const result = Tendril(pattern).match([1, 2, 3, 10]).solutions().first();
  assert.ok(result);
  assert.equal(result.x, 1);
  assert.equal(result.y, 10);
});

test('guard: fails when expression not satisfied', () => {
  const pattern = '[$x=(_number; $x < $y) ... $y=(_number)]';
  // 10 is not < 1
  assert.ok(!Tendril(pattern).match([10, 2, 3, 1]).hasMatch());
});

// ==================== Guards in Arrays ====================

test('guard: filter numbers in array', () => {
  const pattern = '[... $x=(_number; $x > 0) ...]';
  const sols = Tendril(pattern).match([1, -2, 3, -4, 5]).solutions().toArray();
  assert.equal(sols.length, 3);
  const values = sols.map(s => s.x).sort((a, b) => a - b);
  assert.deepEqual(values, [1, 3, 5]);
});

test('guard: extract even numbers', () => {
  const pattern = '[... $x=(_number; $x % 2 == 0) ...]';
  const sols = Tendril(pattern).match([1, 2, 3, 4, 5, 6]).solutions().toArray();
  assert.equal(sols.length, 3);
  const values = sols.map(s => s.x).sort((a, b) => a - b);
  assert.deepEqual(values, [2, 4, 6]);
});

// ==================== Guards in Objects ====================

test('guard: filter object values', () => {
  const data = {a: 10, b: 50, c: 200, d: 5};
  const pattern = '{_:$v=(_number; $v > 20)}';
  const sols = Tendril(pattern).match(data).solutions().toArray();
  assert.equal(sols.length, 2);
  const values = sols.map(s => s.v).sort((a, b) => a - b);
  assert.deepEqual(values, [50, 200]);
});

test('guard: key-value relationship', () => {
  // Match properties where key length equals value
  const pattern = '{$k=(_; size($k) == $v):$v=(_number)}';
  const data = {ab: 2, abc: 3, x: 5};
  const sols = Tendril(pattern).match(data).solutions().toArray();
  assert.equal(sols.length, 2);
  const pairs = sols.map(s => [s.k, s.v]).sort((a, b) => a[1] - b[1]);
  assert.deepEqual(pairs, [['ab', 2], ['abc', 3]]);
});

// ==================== Edge Cases ====================

test('guard: unbound variable at end of match fails', () => {
  // Guard references $y but $y is never bound
  // This should cause the match to fail (guard never closes)
  const pattern = '$x=(_number; $x < $y)';
  assert.ok(!Tendril(pattern).match(5).hasMatch());
});

test('guard: literal values in expression', () => {
  assert.ok(Tendril('$x=(_number; $x > 10 && $x < 20)').match(15).hasMatch());
  assert.ok(!Tendril('$x=(_number; $x > 10 && $x < 20)').match(25).hasMatch());
});

test('guard: null comparison', () => {
  assert.ok(Tendril('$x=(_; $x == null)').match(null).hasMatch());
  assert.ok(!Tendril('$x=(_; $x == null)').match(0).hasMatch());
});

test('guard: boolean literal', () => {
  assert.ok(Tendril('$x=(_boolean; $x == true)').match(true).hasMatch());
  assert.ok(!Tendril('$x=(_boolean; $x == true)').match(false).hasMatch());
});

test('guard: string literal in expression', () => {
  assert.ok(Tendril('$x=(_string; $x == "hello")').match('hello').hasMatch());
  assert.ok(!Tendril('$x=(_string; $x == "hello")').match('world').hasMatch());
});

test('guard: parentheses for precedence', () => {
  // Without parens: $x > 0 && $x < 10 || $x > 90
  // With parens: $x > 0 && ($x < 10 || $x > 90)
  const p1 = '$x=(_number; $x > 0 && ($x < 10 || $x > 90))';
  assert.ok(Tendril(p1).match(5).hasMatch());
  assert.ok(Tendril(p1).match(95).hasMatch());
  assert.ok(!Tendril(p1).match(50).hasMatch());
});

test('guard: unary minus', () => {
  assert.ok(Tendril('$x=(_number; $x == -5)').match(-5).hasMatch());
  assert.ok(Tendril('$x=(_number; -$x > 0)').match(-5).hasMatch());
});

// ==================== Guard with Pattern Constraints ====================

test('guard: typed wildcard with guard', () => {
  // _number pattern + guard expression
  const result = Tendril('$x=(_number; $x > 0)').match(42).solutions().first();
  assert.ok(result);
  assert.equal(result.x, 42);
});

test('guard: regex pattern with guard', () => {
  // Regex pattern + size guard
  const pattern = '$x=(/[a-z]+/; size($x) >= 3)';
  assert.ok(Tendril(pattern).match('hello').hasMatch());
  assert.ok(!Tendril(pattern).match('hi').hasMatch());
  assert.ok(!Tendril(pattern).match('123').hasMatch());
});

test('guard: combined with object pattern', () => {
  const pattern = '{age: $x=(_number; $x >= 18)}';
  assert.ok(Tendril(pattern).match({age: 25}).hasMatch());
  assert.ok(!Tendril(pattern).match({age: 15}).hasMatch());
});

// ==================== Operator Precedence ====================

test('guard: precedence - multiplication before addition', () => {
  assert.ok(Tendril('$x=(_number; $x * 2 + 3 == 13)').match(5).hasMatch());
  // 5 * 2 + 3 = 13, not 5 * (2 + 3) = 25
});

test('guard: precedence - comparison before logical', () => {
  // $x > 5 && $x < 10 should be ($x > 5) && ($x < 10)
  assert.ok(Tendril('$x=(_number; $x > 5 && $x < 10)').match(7).hasMatch());
});

test('guard: precedence - && before ||', () => {
  // true || false && false should be true || (false && false) = true
  assert.ok(Tendril('$x=(_number; true || false && false)').match(1).hasMatch());
});

console.log('\n✓ All guard expression tests defined\n');
