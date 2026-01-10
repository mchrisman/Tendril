/**
 * Object Semantics V2 Test Suite
 *
 * Tests for the new slice-based object matching model:
 * - K:V        = slice exists, bad entries allowed
 * - each K:V   = slice exists, no bad entries (strong semantics)
 * - K:V?       = optional (no existence assertion)
 * - each K:V ? = strong + optional (no existence, no bad entries)
 * - %          = remainder (keys not covered by any key pattern)
 * - %#{0}      = closed object (no remainder allowed)
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

// ==================== each K:V (strong semantics - no bad entries) ====================

test('each K:V with literal key - same as K:V for unique keys', () => {
  // For literal keys, there's at most one matching key, so no ambiguity
  assert.ok(matches('{each a:1}', {a: 1}));
  assert.ok(!matches('{each a:1}', {a: 2}));
  assert.ok(!matches('{each a:1}', {})); // Existence still required
  assert.ok(matches('{each a:1}', {a: 1, b: 2})); // Extra keys allowed (not covered by 'a')
});

test('each K:V with regex key - forbids bad entries', () => {
  // {each /a.*/:1} means "all keys matching /a.*/ must have value 1"
  assert.ok(matches('{each /a.*/:1}', {ab: 1}));
  assert.ok(matches('{each /a.*/:1}', {ab: 1, ac: 1}));

  // This should FAIL: ac:2 is a bad entry (key matches /a.*/ but value != 1)
  assert.ok(!matches('{each /a.*/:1}', {ab: 1, ac: 2}),
    'each K:V should forbid bad entries (key matches but value differs)');

  // Keys not matching /a.*/ are fine (they're in %, not bad)
  assert.ok(matches('{each /a.*/:1}', {ab: 1, xyz: 99}));
});

test('each K:V with wildcard key - all values must match', () => {
  // {each _:1} means "all keys must have value 1"
  assert.ok(matches('{each _:1}', {a: 1}));
  assert.ok(matches('{each _:1}', {a: 1, b: 1}));
  assert.ok(!matches('{each _:1}', {a: 1, b: 2})); // b:2 is bad
  assert.ok(!matches('{each _:1}', {})); // Existence still required
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

// ==================== each K:V ? (strong + optional - no bad, no existence) ====================

test('each K:V ? - no existence required, but no bad entries allowed', () => {
  // {each a:1 ?} means "if any 'a' key exists, its value must be 1; but 'a' doesn't have to exist"
  assert.ok(matches('{each a:1 ?}', {}), 'each K:V ? should match empty object');
  assert.ok(matches('{each a:1 ?}', {a: 1}), 'each K:V ? should match when condition satisfied');
  assert.ok(!matches('{each a:1 ?}', {a: 2}), 'each K:V ? should reject bad entries');
  assert.ok(matches('{each a:1 ?}', {b: 99}), 'each K:V ? should allow unrelated keys');
});

test('each K:V ? with regex key - validate without requiring existence', () => {
  // "If any keys match /secret/, their values must match /^\\*+$/"
  // This is useful for validation: "no plaintext secrets allowed"
  assert.ok(matches('{each /secret/:/^\\*+$/ ?}', {}));
  assert.ok(matches('{each /secret/:/^\\*+$/ ?}', {name: 'Alice'}));
  assert.ok(matches('{each /secret/:/^\\*+$/ ?}', {secret: '***'}));
  assert.ok(!matches('{each /secret/:/^\\*+$/ ?}', {secret: 'plaintext'}));
  assert.ok(!matches('{each /secret/:/^\\*+$/ ?}', {api_secret: 'exposed'}));
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

test('(% as %rest) - bind %', () => {
  const result = extract('{a:1 (% as %rest)}', {a: 1, b: 2, c: 3});
  assert.ok(result);
  assert.deepEqual(result.rest, {b: 2, c: 3});
});

// ==================== %#{0} (closed object) ====================

test('%#{0} - closed object (no remainder allowed)', () => {
  assert.ok(matches('{a:1 %#{0}}', {a: 1}));
  assert.ok(!matches('{a:1 %#{0}}', {a: 1, b: 2}));
  assert.ok(!matches('{a:1 %#{0}}', {})); // Still need a:1
});

test('%#{0} alone - empty object', () => {
  assert.ok(matches('{%#{0}}', {}));
  assert.ok(!matches('{%#{0}}', {a: 1}));
});

// ==================== Remainder is coverage-based ====================

test('% excludes keys covered by key patterns', () => {
  // With {/a.*/:1}, all keys matching /a.*/ are "covered", regardless of value
  // So % = keys NOT matching /a.*/

  // {ab:1, xyz:99} - 'ab' covered by /a.*/, 'xyz' is %
  const result = extract('{/a.*/:1 (% as %rest)}', {ab: 1, xyz: 99});
  assert.ok(result);
  assert.deepEqual(result.rest, {xyz: 99}, 'xyz should be in %');
});

test('bad entries are covered (not in %)', () => {
  // {ab:1, ac:2} with pattern {/a.*/:1}
  // Both ab and ac match /a.*/, so both are covered
  // ab:1 is in slice, ac:2 is in bad set
  // Neither is in %

  const result = extract('{/a.*/:1 (%? as %rest)}', {ab: 1, ac: 2});
  assert.ok(result);
  assert.deepEqual(result.rest, {}, 'ac:2 should be covered, not %');
});

// ==================== Multiple K:V terms ====================

test('multiple terms - each defines its coverage', () => {
  // {a:1 b:2} - 'a' covered by first, 'b' covered by second
  // Remainder = everything else
  const result = extract('{a:1 b:2 (%? as %rest)}', {a: 1, b: 2, c: 3});
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

test('binding with each still works', () => {
  const result = extract('{each $k:$v}', {foo: 42});
  assert.ok(result);
  assert.equal(result.k, 'foo');
  assert.equal(result.v, 42);
});

// ==================== K?:V optional field syntax ====================

test('K?:V syntax for optional fields (preferred)', () => {
  // K?:V is the preferred syntax for optional fields
  // Matches when field is present
  const sol1 = Tendril('{a: 1, b?: $x}').match({a: 1, b: 2}).solutions().first();
  assert.ok(sol1);
  assert.equal(sol1.x, 2);

  // Also matches when field is absent
  const sol2 = Tendril('{a: 1, b?: $x}').match({a: 1}).solutions().first();
  assert.ok(sol2);
  assert.equal(sol2.x, undefined);
});

test('K:V ? syntax also supported for optional fields', () => {
  // K:V ? is the alternative syntax (space before ?)
  const sol1 = Tendril('{a: 1, b: $x ?}').match({a: 1, b: 2}).solutions().first();
  assert.ok(sol1);
  assert.equal(sol1.x, 2);

  const sol2 = Tendril('{a: 1, b: $x ?}').match({a: 1}).solutions().first();
  assert.ok(sol2);
  assert.equal(sol2.x, undefined);
});

console.log('\n[object-semantics-v2] Test suite defined\n');
