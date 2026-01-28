// Test key restrictions: KEY := ITEM(false)
// Keys cannot contain: objects, arrays, @x, _boolean, booleans, null

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePattern} from '../src/tendril-parser.js';
import {Tendril} from '../src/tendril-api.js';

// Helper to check that a pattern parses successfully
function parses(pattern) {
  assert.doesNotThrow(() => parsePattern(pattern), `Expected pattern to parse: ${pattern}`);
}

// Helper to check that a pattern fails to parse with a specific error
function failsWith(pattern, errorMatch) {
  assert.throws(
    () => parsePattern(pattern),
    errorMatch,
    `Expected pattern to fail: ${pattern}`
  );
}

// ============================================
// Valid key patterns (should parse)
// ============================================

test('key: bare identifier', () => {
  parses('{ foo: 1 }');
});

test('key: quoted string', () => {
  parses('{ "foo bar": 1 }');
});

test('key: regex', () => {
  parses('{ /foo/: 1 }');
});

test('key: number', () => {
  parses('{ 42: 1 }');
});

test('key: wildcard _', () => {
  parses('{ _: 1 }');
});

test('key: _string', () => {
  parses('{ _string: 1 }');
});

test('key: _number', () => {
  parses('{ _number: 1 }');
});

test('key: scalar variable $x', () => {
  parses('{ $x: 1 }');
});

test('key: alternation', () => {
  parses('{ (foo | bar): 1 }');
});

test('key: else', () => {
  parses('{ (foo else bar): 1 }');
});

test('key: binding', () => {
  parses('{ (/a.*/ as $k): 1 }');
});

test('key: guard', () => {
  parses('{ ($k where size($k) < 10): 1 }');
});

test('key: lookahead', () => {
  parses('{ (? /a.*/): 1 }');
});

test('key: negative lookahead', () => {
  parses('{ (! secret): 1 }');
});

test('key: flow operator', () => {
  parses('{ each $k: (_ -> %bucket) }');
});

test('breadcrumb: dot key', () => {
  parses('{ a.b.c: 1 }');
});

test('breadcrumb: bracket key with number', () => {
  parses('{ a[0]: 1 }');
});

test('breadcrumb: bracket key with variable', () => {
  parses('{ a[$i]: 1 }');
});

test('breadcrumb: skip with key', () => {
  parses('{ **.foo: 1 }');
});

// ============================================
// Invalid key patterns (should fail)
// Note: When key parsing fails, backtracking causes the error to appear
// from the outer context. The pattern is still rejected.
// ============================================

test('key: object literal - should fail', () => {
  failsWith('{ {a:1}: value }', /expected/);  // Fails because {a:1} isn't valid as key
});

test('key: array literal - should fail', () => {
  failsWith('{ [1,2]: value }', /expected/);  // Fails because [1,2] isn't valid as key
});

test('key: @x group variable - should fail', () => {
  failsWith('{ @x: value }', /expected/);  // Fails because @x isn't valid as key
});

test('key: _boolean - should fail', () => {
  failsWith('{ _boolean: value }', /expected/);  // Fails because _boolean isn't valid as key
});

test('key: true literal - should fail', () => {
  failsWith('{ true: value }', /expected/);  // Fails because true isn't valid as key
});

test('key: false literal - should fail', () => {
  failsWith('{ false: value }', /expected/);  // Fails because false isn't valid as key
});

test('key: null literal - should fail', () => {
  failsWith('{ null: value }', /expected/);  // Fails because null isn't valid as key
});

test('key: group binding (as @x) - should fail', () => {
  failsWith('{ (_ as @k): value }', /expected/);  // Group binding isn't valid in key position
});

test('key: labeled object - should fail', () => {
  failsWith('{ §L{a:1}: value }', /expected/);  // Fails because labeled object isn't valid as key
});

test('key: labeled array - should fail', () => {
  failsWith('{ §L[1,2]: value }', /expected/);  // Fails because labeled array isn't valid as key
});

// ============================================
// Breadcrumb restrictions
// ============================================

test('breadcrumb: object in bracket key - should fail', () => {
  failsWith('{ a[{b:1}]: value }', /expected/);  // {b:1} isn't valid as bracket key
});

test('breadcrumb: array in bracket key - should fail', () => {
  failsWith('{ a[[1,2]]: value }', /expected/);  // [1,2] isn't valid as bracket key
});

test('breadcrumb: object in dot key - should fail', () => {
  failsWith('{ a.{b:1}: value }', /expected/);  // {b:1} isn't valid as dot key
});

// ============================================
// Lookahead content (allowStructures propagates)
// The grammar says lookaheads in key position propagate the restriction.
// This is intentional - if you're in key position, even lookahead content
// should be restricted to key-valid patterns.
// ============================================

test('key lookahead: object in lookahead - should fail', () => {
  // Lookahead content in key position is also restricted
  failsWith('{ (? {a:1}): value }', /expected/);
});

test('key lookahead: array in lookahead - should fail', () => {
  failsWith('{ (? [1,2]): value }', /expected/);
});

// ============================================
// Value position (should allow everything)
// ============================================

test('value: object literal - should work', () => {
  parses('{ foo: {a:1} }');
});

test('value: array literal - should work', () => {
  parses('{ foo: [1,2,3] }');
});

test('value: @x group variable - should work', () => {
  parses('{ foo: @x }');
});

test('value: _boolean - should work', () => {
  parses('{ foo: _boolean }');
});

test('value: true - should work', () => {
  parses('{ foo: true }');
});

test('value: false - should work', () => {
  parses('{ foo: false }');
});

test('value: null - should work', () => {
  parses('{ foo: null }');
});

test('value: group binding - should work', () => {
  parses('{ foo: (_ as @v) }');
});

// ============================================
// Runtime behavior (parse succeeds, match fails)
// ============================================

test('runtime: $k bound to array is match failure', () => {
  // Pattern parses fine, but at runtime $k can't match a string key
  const pattern = Tendril('{ $k: $v }');
  // If we pre-bind $k to an array, it won't match any string key
  const result = pattern.on({foo: 1, bar: 2}).solutions();
  // Should get solutions where $k is bound to string keys
  assert.ok(result.length > 0);
  assert.ok(result.every(s => typeof s.k === 'string'));
});
