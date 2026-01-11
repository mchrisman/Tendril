/**
 * Edge Cases Probe Tests
 *
 * Tests designed to find gaps in test coverage and expose bugs.
 * These probe potential weak spots in the implementation.
 *
 * Run with: node --test test/edge-cases-probe.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

// ============================================================
// EMPTY COLLECTIONS
// ============================================================

test('empty array matches empty pattern', () => {
  assert.ok(Tendril('[]').match([]).hasMatch());
});

test('empty object matches empty pattern', () => {
  assert.ok(Tendril('{}').match({}).hasMatch());
});

test('spread in empty array', () => {
  // [...] should match empty array (spread can be 0 elements)
  assert.ok(Tendril('[...]').match([]).hasMatch());
});

test('remainder in empty object', () => {
  // % asserts nonempty remainder, so {%} should NOT match empty object
  assert.ok(!Tendril('{%}').match({}).hasMatch());
  // %? is optional remainder, should match empty object
  assert.ok(Tendril('{%?}').match({}).hasMatch());
  // (!%) asserts empty remainder (negated remainder)
  assert.ok(Tendril('{(!%)}').match({}).hasMatch());
});

test('(... as @x) on empty array captures empty', () => {
  const sol = Tendril('[(... as @x)]').match([]).solutions().first();
  assert.ok(sol);
  assert.deepEqual(sol.x, []);
});

test('(%? as %x) on empty object captures empty', () => {
  // Use %? for optional remainder to capture empty
  const sol = Tendril('{(%? as %rest)}').match({}).solutions().first();
  assert.ok(sol);
  assert.deepEqual(sol.rest, {});
});

// ============================================================
// OBJECT PATTERNS - ALTERNATION
// ============================================================

test('alternation in object value', () => {
  const pattern = Tendril('{a: (1 | 2)}');
  assert.ok(pattern.match({a: 1}).hasMatch());
  assert.ok(pattern.match({a: 2}).hasMatch());
  assert.ok(!pattern.match({a: 3}).hasMatch());
});

test('alternation in object key pattern', () => {
  // Match either key 'a' or 'b'
  const pattern = Tendril('{(a | b): $v}');
  const sol1 = pattern.match({a: 1}).solutions().first();
  assert.ok(sol1);
  assert.equal(sol1.v, 1);

  const sol2 = pattern.match({b: 2}).solutions().first();
  assert.ok(sol2);
  assert.equal(sol2.v, 2);
});

test('complex alternation in object', () => {
  // Alt where branches have different structures
  const pattern = Tendril('{type: (A | B), value: $v}');
  assert.ok(pattern.match({type: 'A', value: 1}).hasMatch());
  assert.ok(pattern.match({type: 'B', value: 2}).hasMatch());
});

// ============================================================
// NESTED PATTERNS
// ============================================================

test('deeply nested array patterns', () => {
  const data = [[[1, 2], [3, 4]], [[5, 6], [7, 8]]];
  const pattern = Tendril('[[[$a $b] [$c $d]] [[$e $f] [$g $h]]]');
  const sol = pattern.match(data).solutions().first();
  assert.ok(sol);
  assert.equal(sol.a, 1);
  assert.equal(sol.h, 8);
});

test('deeply nested object patterns', () => {
  const data = {a: {b: {c: {d: 42}}}};
  const pattern = Tendril('{a: {b: {c: {d: $x}}}}');
  const sol = pattern.match(data).solutions().first();
  assert.ok(sol);
  assert.equal(sol.x, 42);
});

test('mixed nested array and object', () => {
  const data = {items: [{name: 'a', values: [1, 2]}, {name: 'b', values: [3, 4]}]};
  const pattern = Tendril('{items: [{name: $n1, values: [$v1 ...]} ...]}');
  const sol = pattern.match(data).solutions().first();
  assert.ok(sol);
  assert.equal(sol.n1, 'a');
  assert.equal(sol.v1, 1);
});

// ============================================================
// QUANTIFIERS
// ============================================================

test('optional in object field', () => {
  const pattern = Tendril('{a: 1, b?: $b}');

  // With optional field present
  const sol1 = pattern.match({a: 1, b: 2}).solutions().first();
  assert.ok(sol1);
  assert.equal(sol1.b, 2);

  // With optional field absent
  const sol2 = pattern.match({a: 1}).solutions().first();
  assert.ok(sol2);
  assert.equal(sol2.b, undefined);
});

test('quantifier with binding: _+', () => {
  const pattern = Tendril('[(_+ as @items)]');
  const sol = pattern.match([1, 2, 3]).solutions().first();
  assert.ok(sol);
  assert.deepEqual(sol.items, [1, 2, 3]);
});

test('quantifier with binding: _?', () => {
  const pattern = Tendril('[1 (_? as @opt) 3]');

  // With optional element
  const sol1 = pattern.match([1, 2, 3]).solutions().first();
  assert.ok(sol1);
  assert.deepEqual(sol1.opt, [2]);

  // Without optional element
  const sol2 = pattern.match([1, 3]).solutions().first();
  assert.ok(sol2);
  assert.deepEqual(sol2.opt, []);
});

test('possessive quantifier prevents backtracking', () => {
  // _++ should consume all elements and not backtrack
  // So [_++ 1] should NOT match [1, 2, 1] because _++ grabs everything
  const pattern = Tendril('[_++ 1]');
  assert.ok(!pattern.match([1, 2, 1]).hasMatch());
});

test('lazy quantifier prefers shorter match', () => {
  // With lazy quantifier, should prefer shorter captures
  // ... is already lazy, use _*? for explicit lazy
  const pattern = Tendril('[(_*? as @a) 1 ...]');
  const sol = pattern.match([0, 0, 1, 0, 1]).solutions().first();
  assert.ok(sol);
  // Lazy should capture minimal [0, 0] to reach first 1
  assert.deepEqual(sol.a, [0, 0]);
});

// ============================================================
// GUARDS AND WHERE CLAUSES
// ============================================================

test('guard with multiple variables', () => {
  const pattern = Tendril('{a: $x, b: $y, c: ($z where $z == $x + $y)}');
  assert.ok(pattern.match({a: 1, b: 2, c: 3}).hasMatch());
  assert.ok(!pattern.match({a: 1, b: 2, c: 4}).hasMatch());
});

test('guard on group binding', { skip: true }, () => {
  // SKIP: Guards on group bindings (@var where ...) are not supported
  const pattern = Tendril('[(@items where @items.length > 2)]');
  assert.ok(pattern.match([1, 2, 3]).hasMatch());
  assert.ok(!pattern.match([1, 2]).hasMatch());
});

test('nested guards', () => {
  const pattern = Tendril('{items: [($x where $x > 0)+ as @pos]}');
  const sol = pattern.match({items: [1, 2, 3]}).solutions().first();
  assert.ok(sol);
  assert.deepEqual(sol.pos, [1, 2, 3]);
});

// ============================================================
// LOOKAHEAD
// ============================================================

test('positive lookahead in array', () => {
  // Match if followed by 2, but don't consume it
  const pattern = Tendril('[1 (?2) $x]');
  const sol = pattern.match([1, 2]).solutions().first();
  assert.ok(sol);
  assert.equal(sol.x, 2);
});

test('negative lookahead in array', () => {
  // Match if NOT followed by 2
  const pattern = Tendril('[1 (!2) $x]');
  assert.ok(pattern.match([1, 3]).hasMatch());
  assert.ok(!pattern.match([1, 2]).hasMatch());
});

test('lookahead with binding', () => {
  // Lookahead with binding should capture but not consume
  const pattern = Tendril('[(?$peek) $actual ...]');
  const sol = pattern.match([1, 2, 3]).solutions().first();
  assert.ok(sol);
  assert.equal(sol.peek, 1);
  assert.equal(sol.actual, 1);
});

// ============================================================
// SCALAR VS GROUP BINDING
// ============================================================

test('$x captures single value, @x captures array', () => {
  const data = [1, 2, 3];

  // $x should capture single element
  const sol1 = Tendril('[$x ...]').match(data).solutions().first();
  assert.ok(sol1);
  assert.equal(sol1.x, 1);

  // @x should capture as array
  const sol2 = Tendril('[(@x) ...]').match(data).solutions().first();
  assert.ok(sol2);
  assert.deepEqual(sol2.x, [1]);
});

test('$x with sequence pattern must match exactly 1 element', () => {
  // (1? 2? as $x) should only match if the seq matches exactly 1 element
  const pattern = Tendril('[((1? 2?) as $x)]');

  // Should match [1] -> seq matches with just 1
  assert.ok(pattern.match([1]).hasMatch());

  // Should match [2] -> seq matches with just 2
  assert.ok(pattern.match([2]).hasMatch());

  // Should NOT match [1, 2] -> seq matches but 2 elements
  assert.ok(!pattern.match([1, 2]).hasMatch());

  // Should NOT match [] -> seq matches empty but 0 elements
  assert.ok(!pattern.match([]).hasMatch());
});

// ============================================================
// OBJECT REMAINDER
// ============================================================

test('object remainder captures unmatched fields', () => {
  const pattern = Tendril('{a: $a, (% as %rest)}');
  const sol = pattern.match({a: 1, b: 2, c: 3}).solutions().first();
  assert.ok(sol);
  assert.equal(sol.a, 1);
  assert.deepEqual(sol.rest, {b: 2, c: 3});
});

test('object remainder with no extra fields', () => {
  const pattern = Tendril('{a: $a, (% as %rest)}');
  const sol = pattern.match({a: 1}).solutions().first();
  assert.ok(sol);
  assert.equal(sol.a, 1);
  assert.deepEqual(sol.rest, {});
});

test('multiple object patterns with remainder', () => {
  // Two objects, each with their own remainder
  const data = {x: {a: 1, b: 2}, y: {c: 3, d: 4}};
  const pattern = Tendril('{x: {a: $a, (% as %rx)}, y: {c: $c, (% as %ry)}}');
  const sol = pattern.match(data).solutions().first();
  assert.ok(sol);
  assert.deepEqual(sol.rx, {b: 2});
  assert.deepEqual(sol.ry, {d: 4});
});

// ============================================================
// FIND VS MATCH
// ============================================================

test('find locates pattern anywhere in structure', () => {
  const data = {a: {b: {target: 42}}};
  const matches = Tendril('{target: $x}').find(data).solutions().toArray();
  assert.equal(matches.length, 1);
  assert.equal(matches[0].x, 42);
});

test('find returns multiple matches', () => {
  const data = {items: [{v: 1}, {v: 2}, {v: 3}]};
  const matches = Tendril('{v: $x}').find(data).solutions().toArray();
  assert.equal(matches.length, 3);
});

test('match requires pattern at root', () => {
  const data = {a: {target: 42}};
  // match at root should fail - {target: $x} doesn't match {a: ...}
  assert.ok(!Tendril('{target: $x}').match(data).hasMatch());
});

// ============================================================
// REPLACE OPERATIONS
// ============================================================

test('replaceFirst only replaces first match', () => {
  const data = [1, 2, 1, 2];
  const result = Tendril('1').find(data).replaceFirst(() => 99);
  assert.deepEqual(result, [99, 2, 1, 2]);
});

test('replaceAll replaces all matches', () => {
  const data = [1, 2, 1, 2];
  const result = Tendril('1').find(data).replaceAll(() => 99);
  assert.deepEqual(result, [99, 2, 99, 2]);
});

test('replace with captured values', () => {
  const data = [{a: 1}, {a: 2}, {a: 3}];
  const result = Tendril('{a: $x}').find(data).replaceAll($ => ({a: $.x * 10}));
  assert.deepEqual(result, [{a: 10}, {a: 20}, {a: 30}]);
});

test('replace preserves non-matching parts', () => {
  const data = {keep: 'this', change: {target: 1}};
  const result = Tendril('{target: $x}').find(data).replaceAll($ => ({target: $.x + 1}));
  assert.equal(result.keep, 'this');
  assert.equal(result.change.target, 2);
});

// ============================================================
// TYPED WILDCARDS
// ============================================================

test('_string matches only strings', () => {
  assert.ok(Tendril('_string').match('hello').hasMatch());
  assert.ok(!Tendril('_string').match(42).hasMatch());
  assert.ok(!Tendril('_string').match(null).hasMatch());
});

test('_number matches only numbers', () => {
  assert.ok(Tendril('_number').match(42).hasMatch());
  assert.ok(Tendril('_number').match(3.14).hasMatch());
  assert.ok(!Tendril('_number').match('42').hasMatch());
});

test('_boolean matches only booleans', () => {
  assert.ok(Tendril('_boolean').match(true).hasMatch());
  assert.ok(Tendril('_boolean').match(false).hasMatch());
  assert.ok(!Tendril('_boolean').match(1).hasMatch());
  assert.ok(!Tendril('_boolean').match('true').hasMatch());
});

test('null matches null', () => {
  assert.ok(Tendril('null').match(null).hasMatch());
  assert.ok(!Tendril('null').match(undefined).hasMatch());
  assert.ok(!Tendril('null').match(0).hasMatch());
});

// ============================================================
// REGEX PATTERNS
// ============================================================

test('regex pattern matches strings', () => {
  const pattern = Tendril('/^hello/');
  assert.ok(pattern.match('hello world').hasMatch());
  assert.ok(!pattern.match('say hello').hasMatch());
});

test('regex with capture groups', () => {
  const pattern = Tendril('(/\\d+-\\d+/ as $range)');
  const sol = pattern.match('10-20').solutions().first();
  assert.ok(sol);
  assert.equal(sol.range, '10-20');
});

test('case-insensitive string', () => {
  const pattern = Tendril('hello/i');
  assert.ok(pattern.match('HELLO').hasMatch());
  assert.ok(pattern.match('Hello').hasMatch());
  assert.ok(pattern.match('hello').hasMatch());
});

// ============================================================
// LABELS AND REFERENCES
// ============================================================

test('label captures current node', () => {
  const pattern = Tendril('{§node a: $x}');
  const sol = pattern.match({a: 1, b: 2}).solutions().first();
  assert.ok(sol);
  assert.equal(sol.x, 1);
  // The label should reference the whole object
});

test('label reference in nested pattern', () => {
  // Use label to reference parent from child
  const pattern = Tendril('{§parent items: [{value: ($v where $v == ^parent.expected)}]}');
  assert.ok(pattern.match({expected: 42, items: [{value: 42}]}).hasMatch());
  assert.ok(!pattern.match({expected: 42, items: [{value: 99}]}).hasMatch());
});

// ============================================================
// EACH CLAUSE
// ============================================================

test('each with all matching', () => {
  const pattern = Tendril('{each _: (_ where _ > 0)}');
  assert.ok(pattern.match({a: 1, b: 2, c: 3}).hasMatch());
  assert.ok(!pattern.match({a: 1, b: -1, c: 3}).hasMatch());
});

test('each with key pattern', () => {
  const pattern = Tendril('{each (/^x/ as $k): $v}');
  // Should match only keys starting with 'x'
  const sol = pattern.match({xa: 1, xb: 2, y: 3}).solutions().first();
  assert.ok(sol);
});

test('each on array elements', () => {
  const pattern = Tendril('[(each $x where $x > 0)]');
  assert.ok(pattern.match([1, 2, 3]).hasMatch());
  assert.ok(!pattern.match([1, -2, 3]).hasMatch());
});

// ============================================================
// FLOW OPERATOR AND BUCKETS
// ============================================================

test('flow operator collects into bucket', () => {
  const pattern = Tendril('{each _: $v -> %vals}');
  const sol = pattern.match({a: 1, b: 2}).solutions().first();
  assert.ok(sol);
  // vals should contain {a: 1, b: 2} or similar
});

test('array bucket collects values', () => {
  const pattern = Tendril('[each $x -> @arr]');
  const sol = pattern.match([1, 2, 3]).solutions().first();
  assert.ok(sol);
  assert.deepEqual(sol.arr, [1, 2, 3]);
});

test('bucket with label scope', () => {
  const pattern = Tendril('{§L items: [each $x -> @bucket across ^L]}');
  const sol = pattern.match({items: [1, 2, 3]}).solutions().first();
  assert.ok(sol);
});

// ============================================================
// COMPLEX COMBINATIONS
// ============================================================

test('spread with guard', () => {
  const pattern = Tendril('[(... as @items where @items.length == 3)]');
  assert.ok(pattern.match([1, 2, 3]).hasMatch());
  assert.ok(!pattern.match([1, 2]).hasMatch());
});

test('optional field with complex pattern', () => {
  const pattern = Tendril('{a: 1, b?: {c: $c}}');
  const sol = pattern.match({a: 1, b: {c: 42}}).solutions().first();
  assert.ok(sol);
  assert.equal(sol.c, 42);
});

test('alternation with different binding shapes', () => {
  // Alt branches bind different variables
  const pattern = Tendril('({a: $x} | {b: $y})');

  const sol1 = pattern.match({a: 1}).solutions().first();
  assert.ok(sol1);
  assert.equal(sol1.x, 1);

  const sol2 = pattern.match({b: 2}).solutions().first();
  assert.ok(sol2);
  assert.equal(sol2.y, 2);
});

test('nested quantifiers', () => {
  // Array of arrays, each inner array has 1+ numbers
  const pattern = Tendril('[[(_number)+ as @nums]*]');
  const sol = pattern.match([[1, 2], [3], [4, 5, 6]]).solutions().first();
  assert.ok(sol);
});

test('guard referencing group binding', () => {
  const pattern = Tendril('[(@first) ... (@last where @last[0] > @first[0])]');
  assert.ok(pattern.match([1, 2, 3]).hasMatch());  // 3 > 1
  assert.ok(!pattern.match([3, 2, 1]).hasMatch()); // 1 > 3 is false
});

console.log('\n[edge-cases-probe] Test suite defined\n');
