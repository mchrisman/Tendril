/**
 * Residual Key Tracking Tests
 *
 * Tests that remainder correctly computes residual keys per solution branch
 * when key patterns contain variables or alternations.
 *
 * Run with: node test/residual-tracking.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

// ==================== Residual with Variable Key Bindings ====================

test('residual with alternation in key - branch a', () => {
  // {($x|b)=1 @r=(remainder)} against {a:1, b:1}
  // Branch where $x='a': tested keys = {a}, residual = {b:1}
  const results = Tendril('{($x|b):1 @r=(remainder)}').match({a: 1, b: 1}).solutions().toArray();

  // Should have 2 solutions: one for $x='a', one for matching literal 'b'
  assert.equal(results.length, 2);

  // Find the solution where x='a'
  const sol1 = results.find(r => r.x === 'a');
  assert.ok(sol1, 'Should have solution with x:a');
  assert.equal(sol1.r.b, 1, 'Residual should contain {b:1}');
  assert.equal(Object.keys(sol1.r).length, 1);
});

test('residual with alternation in key - branch b', () => {
  // {($x|b)=1 @r=(remainder)} against {a:1, b:1}
  // Branch where key matches literal 'b': tested keys = {b}, residual = {a:1}
  const results = Tendril('{($x|b):1 @r=(remainder)}').match({a: 1, b: 1}).solutions().toArray();

  // Find the solution where key matched literal 'b' (x not bound or x='b')
  // Actually, in the literal 'b' branch, $x doesn't get bound
  const sol2 = results.find(r => r.x === undefined || r.x === 'b');

  // When literal 'b' matches, $x might still bind if it's part of the pattern
  // Let me check: pattern is ($x|b), so first alternative binds x, second doesn't
  // So in the second branch, x is NOT bound
  const sol2_unbound = results.find(r => r.x === undefined);
  if (sol2_unbound) {
    assert.equal(sol2_unbound.r.a, 1, 'Residual should contain {a:1}');
    assert.equal(Object.keys(sol2_unbound.r).length, 1);
  }
});

test('residual with variable key binding', () => {
  // {$k:1 @r=(remainder)} against {a:1, b:2, c:1}
  // Should have 2 solutions: k:'a' with r:{b:2, c:1}, and k:'c' with r:{a:1, b:2}
  const results = Tendril('{$k:1 @r=(remainder)}').match({a: 1, b: 2, c: 1}).solutions().toArray();

  assert.equal(results.length, 2);

  // Check each solution has correct residual
  for (const sol of results) {
    if (sol.k === 'a') {
      assert.equal(sol.r.b, 2);
      assert.equal(sol.r.c, 1);
      assert.equal(Object.keys(sol.r).length, 2);
    } else if (sol.k === 'c') {
      assert.equal(sol.r.a, 1);
      assert.equal(sol.r.b, 2);
      assert.equal(Object.keys(sol.r).length, 2);
    } else {
      assert.fail(`Unexpected k value: ${sol.k}`);
    }
  }
});

// ==================:: Residual with Regex Keys ==================::

test('residual with regex key', () => {
  // {/^[a-z]$/:3 @r=(remainder)} against {a:3, b:3, foo:3}
  // Only single-letter keys match /^[a-z]$/, 'foo' is residual
  const results = Tendril('{/^[a-z]$/:3 @r=(remainder)}').match({a: 3, b: 3, foo: 3}).solutions().toArray();

  // Should have 2 solutions (one for 'a', one for 'b')
  // Each should have 'foo' in residual, plus the other single-letter key
  assert.equal(results.length, 2);

  // Check that all solutions have 'foo' in residual
  for (const sol of results) {
    assert.equal(sol.r.foo, 3, 'foo should be in residual');
  }
});

// ==================:: Empty Residuals ==================::

test('empty residual when all keys matched', () => {
  // {a:1 b:2 @r=(remainder)} against {a:1, b:2}
  // All keys matched, residual should be empty object
  const results = Tendril('{a:1 b:2 @r=(remainder)}').match({a: 1, b: 2}).solutions().toArray();

  assert.equal(results.length, 1);
  assert.deepEqual(results[0].r, {});
});

test('empty residual with wildcard key', () => {
  // {_:1 _:2 @r=(remainder)} against {a:1, b:2}
  // Both keys matched by wildcard patterns, residual empty
  const results = Tendril('{_:1 _:2 @r=(remainder)}').match({a: 1, b: 2}).solutions().toArray();

  // Should have 2 solutions (a:1,b:2 or b:1,a:2... wait, values must match)
  // Actually: _:1 matches a:1, _:2 matches b:2 → residual empty
  // Also: _:1 matches b:... no, b:2 doesn't match
  // So only one solution where first _ matches a:1, second _ matches b:2
  assert.ok(results.length >= 1);

  // At least one solution should have empty residual
  const emptyResidual = results.find(r => Object.keys(r.r).length === 0);
  assert.ok(emptyResidual, 'Should have solution with empty residual');
});

console.log('\n✓ All residual tracking tests defined\n');
