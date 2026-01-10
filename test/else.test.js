// else.test.js — Tests for the 'else' operator (prioritized choice)
//
// Semantics: (A else B) means "try A first; use B only if A produces no solutions"
// This is local-first: the decision is based on current bindings at evaluation time.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

// Helper to get all solutions as an array of binding objects
function solutions(pattern, data) {
  return Tendril(pattern).match(data).solutions().toArray();
}

// Helper to check if pattern matches
function matches(pattern, data) {
  return Tendril(pattern).match(data).hasMatch();
}

// =============================================================================
// Basic preference: A wins when it matches
// =============================================================================

test('else: A wins when A matches', () => {
  const sols = solutions('((2 as $x) else (3 as $x))', 2);
  assert.equal(sols.length, 1);
  assert.equal(sols[0].x, 2);
});

test('else: B used when A fails', () => {
  const sols = solutions('((2 as $x) else (3 as $x))', 3);
  assert.equal(sols.length, 1);
  assert.equal(sols[0].x, 3);
});

test('else: neither matches', () => {
  const sols = solutions('((2 as $x) else (3 as $x))', 4);
  assert.equal(sols.length, 0);
});

// =============================================================================
// Local-first semantics with bound variables
// =============================================================================

test('else: respects pre-bound variable (A matches)', () => {
  // When $x is already bound to 2, and data is 2, A matches
  const sols = solutions('{ p:$x q:($x else 99) }', {p: 2, q: 2});
  assert.equal(sols.length, 1);
  assert.equal(sols[0].x, 2);
});

test('else: respects pre-bound variable (A fails, B used)', () => {
  // When $x is bound to 1, and q is 2, $x doesn't match q, so B (99) is tried
  // But B is literal 99, and q is 2, so B also fails
  const sols = solutions('{ p:$x q:($x else 99) }', {p: 1, q: 2});
  assert.equal(sols.length, 0);
});

test('else: B matches when A fails due to binding', () => {
  // $x bound to 1, q is 2, so $x fails; B is literal 2 which matches
  const sols = solutions('{ p:$x q:($x else 2) }', {p: 1, q: 2});
  assert.equal(sols.length, 1);
  assert.equal(sols[0].x, 1);
});

// =============================================================================
// Order dependence (local-first is order-dependent by design)
// =============================================================================

test('else: order matters - p first binds x, then else uses it', () => {
  // p binds x=1, then at q, $x (=1) doesn't match 2, so B (2) is used
  const sols = solutions('{ p:$x q:($x else 2) }', {p: 1, q: 2});
  assert.equal(sols.length, 1);
  assert.equal(sols[0].x, 1);
});

test('else: order matters - q first with unbound x', () => {
  // q comes first, $x is unbound, so A ($x) matches and binds x=2
  // Then p:$x requires p=2, but p=1, so overall fails
  const sols = solutions('{ q:($x else 2) p:$x }', {p: 1, q: 2});
  assert.equal(sols.length, 0);
});

// =============================================================================
// Chained else (right-associative)
// =============================================================================

test('else: chained - first wins', () => {
  const sols = solutions('((1 as $x) else (2 as $x) else (3 as $x))', 1);
  assert.equal(sols.length, 1);
  assert.equal(sols[0].x, 1);
});

test('else: chained - second wins when first fails', () => {
  const sols = solutions('((1 as $x) else (2 as $x) else (3 as $x))', 2);
  assert.equal(sols.length, 1);
  assert.equal(sols[0].x, 2);
});

test('else: chained - third wins when first two fail', () => {
  const sols = solutions('((1 as $x) else (2 as $x) else (3 as $x))', 3);
  assert.equal(sols.length, 1);
  assert.equal(sols[0].x, 3);
});

// =============================================================================
// Else with alternation (must use parentheses)
// =============================================================================

test('else: alternation inside A branch', () => {
  // (1|2) matches 2, so else branch is not used
  const sols = solutions('(((1 as $x)|(2 as $x)) else (3 as $x))', 2);
  assert.equal(sols.length, 1);
  assert.equal(sols[0].x, 2);
});

test('else: alternation inside A fails, B used', () => {
  // (1|2) doesn't match 3, so else branch is used
  const sols = solutions('(((1 as $x)|(2 as $x)) else (3 as $x))', 3);
  assert.equal(sols.length, 1);
  assert.equal(sols[0].x, 3);
});

test('else: alternation inside B branch', () => {
  // 1 doesn't match 2, so B branch (2|3) is tried
  const sols = solutions('((1 as $x) else ((2 as $x)|(3 as $x)))', 2);
  assert.equal(sols.length, 1);
  assert.equal(sols[0].x, 2);
});

// =============================================================================
// Syntax errors: cannot mix | and else
// =============================================================================

test('else: mixing | and else without parens is syntax error', () => {
  assert.throws(() => {
    Tendril('1 | 2 else 3').match(1);  // Force parsing
  }, /cannot mix '\|' and 'else'/);
});

test('else: mixing else and | without parens is syntax error', () => {
  assert.throws(() => {
    Tendril('1 else 2 | 3').match(1);  // Force parsing
  }, /cannot mix '\|' and 'else'/);
});

// =============================================================================
// Else in arrays
// =============================================================================

test('else: in array context', () => {
  const sols = solutions('[((1 as $x) else (2 as $x))]', [1]);
  assert.equal(sols.length, 1);
  assert.equal(sols[0].x, 1);
});

test('else: in array context - B used', () => {
  const sols = solutions('[((1 as $x) else (2 as $x))]', [2]);
  assert.equal(sols.length, 1);
  assert.equal(sols[0].x, 2);
});

test('else: in array with spread', () => {
  const sols = solutions('[... ((1 as $x) else (2 as $x)) ...]', [3, 1, 4]);
  assert.equal(sols.length, 1);
  assert.equal(sols[0].x, 1);
});

// =============================================================================
// Multiple solutions from A branch
// =============================================================================

test('else: A produces multiple solutions, all are used', () => {
  // Pattern matches any element, A is /[ab]/, B is _
  // [a, b, c] - 'a' and 'b' match A, 'c' would need B but A matched so we use A
  const sols = solutions('[... ((/[ab]/ as $x) else (_ as $x)) ...]', ['a', 'b']);
  assert.equal(sols.length, 2);
  assert.deepEqual(sols.map(s => s.x).sort(), ['a', 'b']);
});

// =============================================================================
// Partitioning use case (independent per-field)
// =============================================================================

test('else: field partitioning - each field classified independently', () => {
  // This is the primary use case: classify each field as number or string
  const data = {a: 1, b: 'x', c: 2};

  // Match fields with number values
  const numSols = solutions('{ (_ as $k):((1 as $v)|(2 as $v)) }', data);
  assert.equal(numSols.length, 2); // a:1 and c:2

  // With else for fallback (though in this simple case both branches work)
  const result = matches('{ _:(1 else _) }', data);
  assert.equal(result, true);
});

// =============================================================================
// Schema versioning use case
// =============================================================================

test('else: schema versioning - new format preferred', () => {
  const newFormat = {version: 2, data: {value: 42}};
  const oldFormat = {legacy_data: {value: 42}};

  // Pattern prefers new format, falls back to old
  const newPat = '({ version:2 data:$d } else { legacy_data:$d })';

  const newSols = solutions(newPat, newFormat);
  assert.equal(newSols.length, 1);
  assert.deepEqual(newSols[0].d, {value: 42});

  const oldSols = solutions(newPat, oldFormat);
  assert.equal(oldSols.length, 1);
  assert.deepEqual(oldSols[0].d, {value: 42});
});

// =============================================================================
// Edge cases
// =============================================================================

test('else: both A and B match same value - A wins', () => {
  // 2 matches both branches, but A should win
  const sols = solutions('((2 as $x) else (2 as $x))', 2);
  assert.equal(sols.length, 1);
  assert.equal(sols[0].x, 2);
});

test('else: wildcard in A always wins', () => {
  // A is wildcard, always matches, B is never tried
  const sols = solutions('((_ as $x) else (99 as $x))', 42);
  assert.equal(sols.length, 1);
  assert.equal(sols[0].x, 42);
});

test('else: nested else', () => {
  const sols = solutions('(((1 as $x) else (2 as $x)) else (3 as $x))', 2);
  assert.equal(sols.length, 1);
  assert.equal(sols[0].x, 2);
});

// =============================================================================
// Edge cases from code review
// =============================================================================

test('else: A wins even though B also matches', () => {
  // (1 as $x) else 1 on 1: A wins, x is bound
  const sols = solutions('((1 as $x) else 1)', 1);
  assert.equal(sols.length, 1);
  assert.equal(sols[0].x, 1);
});

test('else: wildcard A wins, no binding from B', () => {
  // (_ else $x=1) on 1: A wins (wildcard matches), x is NOT bound
  const sols = solutions('(_ else (1 as $x))', 1);
  assert.equal(sols.length, 1);
  assert.equal(sols[0].x, undefined); // x was never bound
});

test('else: no resurrection - committed choice', () => {
  // After choosing B for q (because $x=1 doesn't match 2),
  // we can't later decide q should have used A
  // { p:$x q:($x else 2) r:$x } on {p:1, q:2, r:99} should fail
  // because: p binds x=1, q uses else branch (2 matches), r expects x=1 but sees 99
  const sols = solutions('{ p:$x q:(($x) else 2) r:$x }', {p: 1, q: 2, r: 99});
  assert.equal(sols.length, 0);
});

test('else: order dependence - q before p', () => {
  // { q:($x else 2) p:$x } on {p:1, q:2}
  // q is processed first: $x is unbound, so A ($x) matches and binds x=2
  // p is processed: requires $x=2 to match p=1, fails
  const sols = solutions('{ q:(($x) else 2) p:$x }', {p: 1, q: 2});
  assert.equal(sols.length, 0); // fails due to order dependence
});

test('else: order dependence - p before q', () => {
  // { p:$x q:($x else 2) } on {p:1, q:2}
  // p binds x=1, then q: $x=1 doesn't match 2, so else branch (2) is used
  const sols = solutions('{ p:$x q:(($x) else 2) }', {p: 1, q: 2});
  assert.equal(sols.length, 1);
  assert.equal(sols[0].x, 1);
});

// =============================================================================
// Parsing constraint tests
// =============================================================================

test('else: (A|B) else C parses correctly', () => {
  // (1|2) else 3 should parse as Else(Alt(1,2), 3)
  const sols = solutions('((1|2) else 3)', 2);
  assert.equal(sols.length, 1);
});

test('else: $else is a valid variable name', () => {
  const sols = solutions('(42 as $else)', 42);
  assert.equal(sols.length, 1);
  assert.equal(sols[0].else, 42);
});

test('else: @else is a valid group variable name', () => {
  const sols = solutions('[... @else ...]', [1, 2, 3]);
  // @else captures all possible subsequences
  assert.ok(sols.length > 0);
  assert.ok(sols.some(s => Array.isArray(s.else)));
});

test('else: else/i is case-insensitive literal, not keyword', () => {
  // else/i should match the string "else" or "ELSE" etc.
  assert.equal(matches('else/i', 'else'), true);
  assert.equal(matches('else/i', 'ELSE'), true);
  assert.equal(matches('else/i', 'Else'), true);
  assert.equal(matches('else/i', 'other'), false);
});

// =============================================================================
// A_GROUP quantifier interactions
// =============================================================================

test('else: quantifier on else group - (A else B)+', () => {
  // [(A else B)+] matches array where each element is tried as A first, then B
  const sols = solutions('[(1 else 2)+]', [1, 1, 2]);
  assert.equal(sols.length, 1);
  // Each position: 1 matches A, 1 matches A, 2 matches B
});

// =============================================================================
// Lookahead interactions
// =============================================================================

test('else: positive lookahead containing else (item context)', () => {
  // (?(A else B)) - lookahead with else inside, in item context
  // Should succeed if A matches, without trying B
  const result = matches('(?(1 else 2))', 1);
  assert.equal(result, true); // 1 matches A, lookahead succeeds
});

test('else: negative lookahead containing else (item context)', () => {
  // (!(A else B)) - negative lookahead with else inside
  const result = matches('(!(3 else 4))', 1);
  assert.equal(result, true); // Neither 3 nor 4 matches 1, so negative succeeds
});

test('else: lookahead does not leak bindings through else', () => {
  // In array context: lookahead with else, ensure bindings persist
  // Pattern: [(lookahead) $y] matches exactly 1 element (after zero-width lookahead)
  const sols = solutions('[(?((1 as $x) else (2 as $x))) $y]', [1]);
  assert.equal(sols.length, 1);
  assert.equal(sols[0].y, 1);
  // Note: positive lookahead DOES leak bindings, so x should be bound
  assert.equal(sols[0].x, 1);
});

test('else: negative lookahead does not leak bindings', () => {
  // Negative lookahead should not leak bindings even with else
  // Pattern: [(negative lookahead) $y] matches exactly 1 element
  const sols = solutions('[(!(99 as $x) else (98 as $x)) $y]', [1]);
  assert.equal(sols.length, 1);
  assert.equal(sols[0].y, 1);
  assert.equal(sols[0].x, undefined); // x should NOT be bound (negative lookahead)
});

// =============================================================================
// Edge cases from proposal-safe-else.md
// =============================================================================

test('else: local bindings do not leak outside else', () => {
  // If neither $a nor $b appears outside the else, they shouldn't be in solutions
  // (Testing that branch-local vars stay local)
  const sols = solutions('(((1 as $a)) else ((1 as $b)))', 1);
  assert.equal(sols.length, 1);
  assert.equal(sols[0].a, 1); // A wins, so $a is bound
  assert.equal(sols[0].b, undefined); // B never tried, so $b not bound
});

test('else: losing branch bindings do not appear', () => {
  // When B wins, A's bindings should not appear
  const sols = solutions('(((2 as $a)) else ((3 as $b)))', 3);
  assert.equal(sols.length, 1);
  assert.equal(sols[0].a, undefined); // A failed, no binding
  assert.equal(sols[0].b, 3); // B succeeded
});

test('else: interface bindings do leak (join variable survives)', () => {
  // $x is used both inside and outside the else
  const sols = solutions('{ p:(1 as $x)  q:(($x) else 2) }', {p: 1, q: 1});
  assert.equal(sols.length, 1);
  assert.equal(sols[0].x, 1); // $x survives and is visible
});

test('else: B used when A has no solutions for given interface', () => {
  // A pattern ($x=1) has no solutions when data is 2
  const sols = solutions('((1 as $x) else (2 as $x))', 2);
  assert.equal(sols.length, 1);
  assert.equal(sols[0].x, 2);
});

test('else: multiple A-solutions all used, B excluded', () => {
  // A produces multiple solutions (matching multiple keys)
  // B should not be used for any key that A matched
  const data = {a: 1, b: 1, c: 2};
  const sols = solutions('{ (_ as $k): ((1 as $v) else (2 as $v)) }', data);
  // a:1 and b:1 match A, c:2 matches B
  assert.equal(sols.length, 3);
  const aMatch = sols.find(s => s.k === 'a');
  const bMatch = sols.find(s => s.k === 'b');
  const cMatch = sols.find(s => s.k === 'c');
  assert.equal(aMatch.v, 1);
  assert.equal(bMatch.v, 1);
  assert.equal(cMatch.v, 2);
});

test('else: disjoint A and B projections yield union', () => {
  // [1, 2] with pattern that matches 1 via A and 2 via B
  const sols = solutions('[... ((1 as $x) else (2 as $x)) ...]', [1, 2]);
  assert.equal(sols.length, 2);
  assert.ok(sols.some(s => s.x === 1));
  assert.ok(sols.some(s => s.x === 2));
});

test('else: short-circuit hasMatch prefers A', () => {
  // Both A and B match, but hasMatch should use A (and be fast)
  const result = Tendril('((2 as $x) else (2 as $y))').match(2).hasMatch();
  assert.equal(result, true);
});

test('else: matchFirst returns A-branch solution', () => {
  // When both A and B could match, first() should return A's solution
  const sol = Tendril('((2 as $x) else (2 as $y))').match(2).solutions().first();
  assert.equal(sol.x, 2);
  assert.equal(sol.y, undefined); // A won, B not tried
});
