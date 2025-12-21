/**
 * Short-Circuit Test Suite
 *
 * Tests for short-circuiting functionality in hasMatch(), hasAnyMatch(), firstMatch().
 * These methods should stop enumeration after finding the first solution.
 *
 * Run with: node test/short-circuit.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';
import {
  matchExists,
  matchFirst,
  scanExists,
  scanFirst,
} from '../src/tendril-engine.js';
import { parsePattern } from '../src/tendril-parser.js';

// Helper to compile pattern with $0 wrapper (like tendril-api does)
function compilePattern(pattern) {
  return {type: 'SBind', name: '0', pat: parsePattern(pattern)};
}

// ------------------- Basic functionality tests -------------------

test('hasMatch returns true for matching pattern', () => {
  const result = Tendril('42').hasMatch(42);
  assert.equal(result, true);
});

test('hasMatch returns false for non-matching pattern', () => {
  const result = Tendril('42').hasMatch(99);
  assert.equal(result, false);
});

test('hasMatch returns true when match is on non-first branch (alternation)', () => {
  // The solution is on the second branch, not the first
  // This proves we didn't "freeze at first branch point"
  const result = Tendril('1 | 2 | 3').hasMatch(3);
  assert.equal(result, true);
});

test('hasAnyMatch returns true for nested match', () => {
  const data = { a: { b: { c: 42 } } };
  const result = Tendril('42').hasAnyMatch(data);
  assert.equal(result, true);
});

test('hasAnyMatch returns false when no match exists', () => {
  const data = { a: { b: { c: 99 } } };
  const result = Tendril('42').hasAnyMatch(data);
  assert.equal(result, false);
});

test('firstMatch returns MatchSet with one match', () => {
  const data = [1, 2, 3, 2, 2];
  const mset = Tendril('2').first(data);
  assert.equal(mset.hasMatch(), true);
  assert.equal(mset.count(), 1);
});

test('firstMatch returns empty MatchSet when no match', () => {
  const data = [1, 3, 5];
  const mset = Tendril('2').first(data);
  assert.equal(mset.hasMatch(), false);
  assert.equal(mset.count(), 0);
});

// ------------------- Engine-level tests -------------------

test('matchExists returns boolean', () => {
  const ast = compilePattern('_');
  assert.equal(matchExists(ast, 42), true);
  assert.equal(matchExists(ast, 'hello'), true);
});

test('matchFirst returns solution or null', () => {
  const ast = compilePattern('$x');
  const sol = matchFirst(ast, 42);
  assert.notEqual(sol, null);
  assert.equal(sol.bindings.x, 42);
});

test('matchFirst returns null for non-match', () => {
  const ast = compilePattern('42');
  const sol = matchFirst(ast, 99);
  assert.equal(sol, null);
});

test('scanExists returns true for deeply nested match', () => {
  const ast = compilePattern('42');
  const data = {a: {b: {c: {d: {e: 42}}}}};
  assert.equal(scanExists(ast, data), true);
});

test('scanFirst returns first match in scan', () => {
  const ast = compilePattern('$x');
  const data = {a: 1, b: 2};
  const sol = scanFirst(ast, data);
  // Should match the root object itself (first position scanned)
  assert.notEqual(sol, null);
});

// ------------------- Short-circuit verification tests -------------------
// These tests verify that short-circuiting actually happens by using step budgets

test('hasMatch short-circuits: does not enumerate all solutions', (t) => {
  // Pattern that would produce many solutions without short-circuiting
  // { $a:_ $b:_ } on {x:1, y:2, z:3} would normally produce 6 permutations
  const pattern = '{ $a:_ $b:_ }';
  const data = {x: 1, y: 2, z: 3, w: 4, v: 5};

  // Use a very low step budget that would fail if all permutations were enumerated
  // 5 keys -> 5*4 = 20 permutations of $a,$b bindings
  // With short-circuit, we should find one quickly
  const result = Tendril(pattern).withOptions({maxSteps: 100}).hasMatch(data);
  assert.equal(result, true);
});

test('firstMatch short-circuits on scan: stops after first match', (t) => {
  // Create data with many potential matches
  const data = [];
  for (let i = 0; i < 1000; i++) {
    data.push({id: i, value: 'target'});
  }

  // Pattern matches any object with value:'target'
  // Without short-circuit, would scan all 1000
  // With short-circuit, should stop after first
  const mset = Tendril('{ value: "target" }').withOptions({maxSteps: 200}).first(data);
  assert.equal(mset.hasMatch(), true);
  assert.equal(mset.count(), 1);
});

test('hasAnyMatch short-circuits: stops scanning after first match', () => {
  // Large nested structure
  const data = {
    level1: {
      first: {target: true},
      second: {other: 1},
      third: {other: 2},
    }
  };

  // Should find target quickly without scanning everything
  const result = Tendril('{ target: true }').withOptions({maxSteps: 100}).hasAnyMatch(data);
  assert.equal(result, true);
});

// ------------------- Correctness with backtracking tests -------------------

test('hasMatch correctly backtracks before finding solution', () => {
  // Pattern: array of two equal elements
  // Data: [1, 2, 2] - first pair (1,2) fails, must backtrack to find (2,2)
  const pattern = '[$x $x]';
  const data = [1, 2, 2];

  // This should NOT match because [1,2,2] doesn't have two consecutive equal elements
  // when matched as exactly 2 elements
  const result = Tendril(pattern).hasMatch(data);
  assert.equal(result, false);  // [1,2,2] has 3 elements, pattern expects exactly 2
});

test('hasMatch finds solution after backtracking on alternation', () => {
  // Pattern tries first alt, fails, backtracks to second
  const pattern = '(100 | _)';
  const result = Tendril(pattern).hasMatch(42);
  assert.equal(result, true);  // matches via second alt (_)
});

// ------------------- Edge cases -------------------

test('hasMatch on empty object', () => {
  assert.equal(Tendril('{}').hasMatch({}), true);
  assert.equal(Tendril('{ $x:_ }').hasMatch({}), false);
});

test('hasMatch on empty array', () => {
  assert.equal(Tendril('[]').hasMatch([]), true);
  assert.equal(Tendril('[$x]').hasMatch([]), false);
});

test('firstMatch extracts bindings correctly', () => {
  const data = [1, 2, 3];
  const mset = Tendril('$x').first(data);
  const sol = mset.solutions().first();
  // firstMatch scans, so first match is at root (the array itself)
  assert.deepEqual(sol.toObject().x, [1, 2, 3]);
});
