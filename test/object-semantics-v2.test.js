/**
 * Object Semantics V2 Test Suite
 *
 * Tests for the new slice-based object matching model:
 * - K:V  = slice exists, bad entries allowed
 * - K:>V = slice exists, no bad entries (implication)
 * - K:V? = optional (no existence assertion)
 * - K:>V? = implication only (no existence, no bad entries)
 * - % = % (keys not covered by any key pattern)
 * - $ = closed object (short for %#{0})
 *
 * Run with: node --test test/object-semantics-v2.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

// Helper functions
function matches(pattern, data) {
  return Tendril(pattern).match(data).hasMatch();
}

function extract(pattern, data) {
  const sol = Tendril(pattern).match(data).solutions().first();
  return sol ? sol.toObject() : null;
}

function extractAll(pattern, data) {
  return Tendril(pattern).match(data).solutions().toArray().map(s => s.toObject());
}

// ==================== Basic K:V (slice exists, bad allowed) ====================

test('K:V with literal key - basic match', () => {
  assert.ok(matches('{a:1}', {a: 1}));
  assert.ok(!matches('{a:1}', {a: 2}));
  assert.ok(!matches('{a:1}', {}));
});

test('K:V with literal key - extra keys allowed', () => {
  // Extra keys are in the %, which has no constraint by default
  assert.ok(matches('{a:1}', {a: 1, b: 2}));
});

test('K:V with regex key - slice semantics', () => {
  // {/a.*/:1} should match if there exists at least one key matching /a.*/ with value 1
  // Bad entries (keys matching /a.*/ with value != 1) are allowed by default
  assert.ok(matches('{/a.*/:1}', {ab: 1}));
  assert.ok(matches('{/a.*/:1}', {ab: 1, ac: 1}));

  // This is the KEY CHANGE: bad entries are now allowed with ':'
  // {ab:1, ac:2} has slice={ab:1} (nonempty) and bad={ac:2} (allowed)
  assert.ok(matches('{/a.*/:1}', {ab: 1, ac: 2}),
    'K:V should allow bad entries (key matches but value differs)');
});

test('K:V with wildcard key - slice semantics', () => {
  // {_:1} means "exists at least one key with value 1"
  assert.ok(matches('{_:1}', {a: 1}));
  assert.ok(matches('{_:1}', {a: 1, b: 2}));
  assert.ok(!matches('{_:1}', {a: 2})); // No key has value 1
});

// ==================== K:>V (implication - no bad entries) ====================

test('K:>V with literal key - same as K:V for unique keys', () => {
  // For literal keys, there's at most one matching key, so no ambiguity
  assert.ok(matches('{a:>1}', {a: 1}));
  assert.ok(!matches('{a:>1}', {a: 2}));
  assert.ok(!matches('{a:>1}', {})); // Existence still required
  assert.ok(matches('{a:>1}', {a: 1, b: 2})); // Extra keys allowed (not covered by 'a')
});

test('K:>V with regex key - forbids bad entries', () => {
  // {/a.*/:>1} means "all keys matching /a.*/ must have value 1"
  assert.ok(matches('{/a.*/:>1}', {ab: 1}));
  assert.ok(matches('{/a.*/:>1}', {ab: 1, ac: 1}));

  // This should FAIL: ac:2 is a bad entry (key matches /a.*/ but value != 1)
  assert.ok(!matches('{/a.*/:>1}', {ab: 1, ac: 2}),
    'K:>V should forbid bad entries (key matches but value differs)');

  // Keys not matching /a.*/ are fine (they're in %, not bad)
  assert.ok(matches('{/a.*/:>1}', {ab: 1, xyz: 99}));
});

test('K:>V with wildcard key - all values must match', () => {
  // {_:>1} means "all keys must have value 1"
  assert.ok(matches('{_:>1}', {a: 1}));
  assert.ok(matches('{_:>1}', {a: 1, b: 1}));
  assert.ok(!matches('{_:>1}', {a: 1, b: 2})); // b:2 is bad
  assert.ok(!matches('{_:>1}', {})); // Existence still required
});

// ==================== K:V? (optional - no existence assertion) ====================

test('K:V? with literal key - optional existence', () => {
  // {a:1?} means "if 'a' exists with value 1, that's in the slice; no assertion"
  assert.ok(matches('{a:1?}', {}), 'K:V? should match empty object');
  assert.ok(matches('{a:1?}', {a: 1}), 'K:V? should match when key exists with right value');

  // Bad entries are allowed (no bad#{0} constraint)
  assert.ok(matches('{a:1?}', {a: 2}), 'K:V? should allow bad entries');
  assert.ok(matches('{a:1?}', {b: 99}), 'K:V? should match unrelated keys');
});

test('K:V? for binding without assertion', () => {
  // Common use case: optionally extract a value
  const result1 = extract('{a:$x?}', {a: 1});
  assert.deepEqual(result1, {x: 1});

  const result2 = extract('{a:$x?}', {});
  // When key doesn't exist, binding should not occur (or be undefined)
  assert.ok(result2 === null || result2.x === undefined);
});

// ==================== K:>V? (implication only - no bad, no existence) ====================

test('K:>V? - no existence required, but no bad entries allowed', () => {
  // {a:>1?} means "if any 'a' key exists, its value must be 1; but 'a' doesn't have to exist"
  assert.ok(matches('{a:>1?}', {}), 'K:>V? should match empty object');
  assert.ok(matches('{a:>1?}', {a: 1}), 'K:>V? should match when condition satisfied');
  assert.ok(!matches('{a:>1?}', {a: 2}), 'K:>V? should reject bad entries');
  assert.ok(matches('{a:>1?}', {b: 99}), 'K:>V? should allow unrelated keys');
});

test('K:>V? with regex key - validate without requiring existence', () => {
  // "If any keys match /secret/, their values must match /^\\*+$/"
  // This is useful for validation: "no plaintext secrets allowed"
  assert.ok(matches('{/secret/:>/^\\*+$/?}', {}));
  assert.ok(matches('{/secret/:>/^\\*+$/?}', {name: 'Alice'}));
  assert.ok(matches('{/secret/:>/^\\*+$/?}', {secret: '***'}));
  assert.ok(!matches('{/secret/:>/^\\*+$/?}', {secret: 'plaintext'}));
  assert.ok(!matches('{/secret/:>/^\\*+$/?}', {api_secret: 'exposed'}));
});

// ==================== % (%) ====================

test('% alone - asserts nonempty %', () => {
  // {% } means "% must be nonempty"
  assert.ok(matches('{%}', {a: 1}));
  assert.ok(matches('{%}', {a: 1, b: 2}));
  assert.ok(!matches('{%}', {}), '% should require nonempty %');
});

test('% with assertions - % is uncovered keys', () => {
  // {a:1 %} means "a:1 must match AND there must be other keys"
  assert.ok(matches('{a:1 %}', {a: 1, b: 2}));
  assert.ok(!matches('{a:1 %}', {a: 1}), 'No % when only a exists');
});

test('%#{n} - count constraint on %', () => {
  assert.ok(matches('{a:1 %#{1}}', {a: 1, b: 2}));
  assert.ok(!matches('{a:1 %#{1}}', {a: 1, b: 2, c: 3}));
  assert.ok(matches('{a:1 %#{2}}', {a: 1, b: 2, c: 3}));
});

test('%#{0} - empty % (explicit closed object)', () => {
  assert.ok(matches('{a:1 %#{0}}', {a: 1}));
  assert.ok(!matches('{a:1 %#{0}}', {a: 1, b: 2}));
});

test('@rest=(%) - bind %', () => {
  const result = extract('{a:1 @rest=(%)}', {a: 1, b: 2, c: 3});
  assert.ok(result);
  assert.deepEqual(result.rest, {b: 2, c: 3});
});

// ==================== $ (closed object shortcut) ====================

test('$ - closed object (short for %#{0})', () => {
  assert.ok(matches('{a:1 $}', {a: 1}));
  assert.ok(!matches('{a:1 $}', {a: 1, b: 2}));
  assert.ok(!matches('{a:1 $}', {})); // Still need a:1
});

test('$ vs %#{0} - equivalent behavior', () => {
  const data1 = {a: 1};
  const data2 = {a: 1, b: 2};

  // These should behave identically
  assert.equal(matches('{a:1 $}', data1), matches('{a:1 %#{0}}', data1));
  assert.equal(matches('{a:1 $}', data2), matches('{a:1 %#{0}}', data2));
});

test('$ alone - empty object', () => {
  assert.ok(matches('{$}', {}));
  assert.ok(!matches('{$}', {a: 1}));
});

// ==================== Remainder is coverage-based ====================

test('% excludes keys covered by key patterns', () => {
  // With {/a.*/:1}, all keys matching /a.*/ are "covered", regardless of value
  // So % = keys NOT matching /a.*/

  // {ab:1, xyz:99} - 'ab' covered by /a.*/, 'xyz' is %
  const result = extract('{/a.*/:1 @rest=(%)}', {ab: 1, xyz: 99});
  assert.ok(result);
  assert.deepEqual(result.rest, {xyz: 99}, 'xyz should be in %');
});

test('bad entries are covered (not in %)', () => {
  // {ab:1, ac:2} with pattern {/a.*/:1}
  // Both ab and ac match /a.*/, so both are covered
  // ab:1 is in slice, ac:2 is in bad set
  // Neither is in %

  const result = extract('{/a.*/:1 @rest=(%?)}', {ab: 1, ac: 2});
  assert.ok(result);
  assert.deepEqual(result.rest, {}, 'ac:2 should be covered, not %');
});

// ==================== Multiple K:V terms ====================

test('multiple terms - each defines its coverage', () => {
  // {a:1 b:2} - 'a' covered by first, 'b' covered by second
  // Remainder = everything else
  const result = extract('{a:1 b:2 @rest=(%?)}', {a: 1, b: 2, c: 3});
  assert.ok(result);
  assert.deepEqual(result.rest, {c: 3});
});

test('overlapping key patterns', () => {
  // {/a/:1 /ab/:2} - 'a' matches /a/, 'ab' matches both /a/ and /ab/
  // For data {a:1, ab:2}:
  // - 'a' covered by /a/, value 1 matches -> in first slice
  // - 'ab' covered by both, value 2 matches /ab/'s constraint
  //   But 'ab' also matches /a/ and value 2 != 1, so it's "bad" for first term
  //
  // With ':' (allows bad), this should still match
  assert.ok(matches('{/a/:1 /ab/:2}', {a: 1, ab: 2}));
});

// ==================== Binding with new syntax ====================

test('binding key and value together', () => {
  const result = extract('{$k:$v}', {foo: 42});
  assert.ok(result);
  assert.equal(result.k, 'foo');
  assert.equal(result.v, 42);
});

test('binding with :> still works', () => {
  const result = extract('{$k:>$v}', {foo: 42});
  assert.ok(result);
  assert.equal(result.k, 'foo');
  assert.equal(result.v, 42);
});

// ==================== ?: removed (should error) ====================

test('?: syntax is removed', () => {
  // Old syntax {a?:1} should no longer parse
  assert.throws(() => {
    Tendril('{a?:1}').match({});
  }, /unexpected|expected|invalid/i, '?: should no longer be valid syntax');
});

console.log('\n[object-semantics-v2] Test suite defined\n');
