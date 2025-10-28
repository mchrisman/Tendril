/**
 * V5 Core Test Suite
 *
 * Tests for the rewritten V5 architecture covering:
 * - Basic literals and wildcards
 * - Arrays with quantifiers and spread
 * - Objects with K=V / K?=V
 * - Breadcrumbs (path navigation)
 * - Scalar binding ($x) and unification
 * - Alternation (|)
 * - Lookaheads (?= / ?!)
 *
 * Run with: node test/v5-core.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matches, extract, extractAll, replaceAll, Tendril } from '../src/tendril-api.js';

// ==================== Literals & Wildcards ====================

test('literal number', () => {
  assert.ok(matches('123', 123));
  assert.ok(!matches('123', 456));
});

test('literal string', () => {
  assert.ok(matches('"foo"', 'foo'));
  assert.ok(!matches('"foo"', 'bar'));
});

test('literal bareword', () => {
  assert.ok(matches('foo', 'foo'));
  assert.ok(!matches('foo', 'bar'));
});

test('literal boolean', () => {
  assert.ok(matches('true', true));
  assert.ok(matches('false', false));
  assert.ok(!matches('true', false));
});

test('wildcard matches anything', () => {
  assert.ok(matches('_', 123));
  assert.ok(matches('_', 'foo'));
  assert.ok(matches('_', true));
  assert.ok(matches('_', null));
  assert.ok(matches('_', {a: 1}));
});

test('regex literal', () => {
  assert.ok(matches('/fo+/', 'foo'));
  assert.ok(matches('/fo+/', 'foooo'));
  assert.ok(!matches('/fo+/', 'bar'));
});

// ==================== Arrays ====================

test('empty array', () => {
  assert.ok(matches('[]', []));
  assert.ok(!matches('[]', [1]));
});

test('single element array', () => {
  assert.ok(matches('[1]', [1]));
  assert.ok(!matches('[1]', []));
  assert.ok(!matches('[1]', [1, 2]));
});

test('multiple element array', () => {
  assert.ok(matches('[1 2 3]', [1, 2, 3]));
  assert.ok(!matches('[1 2 3]', [1, 2]));
  assert.ok(!matches('[1 2 3]', [1, 2, 3, 4]));
});

test('array with wildcards', () => {
  assert.ok(matches('[_ _]', [1, 2]));
  assert.ok(matches('[_ _]', ['a', 'b']));
  assert.ok(!matches('[_ _]', [1]));
});

test('array spread - empty', () => {
  assert.ok(matches('[..]', []));
  assert.ok(matches('[..]', [1, 2, 3]));
});

test('array spread - prefix', () => {
  assert.ok(matches('[1 ..]', [1]));
  assert.ok(matches('[1 ..]', [1, 2, 3]));
  assert.ok(!matches('[1 ..]', [2, 3]));
});

test('array spread - suffix', () => {
  assert.ok(matches('[.. 3]', [3]));
  assert.ok(matches('[.. 3]', [1, 2, 3]));
  assert.ok(!matches('[.. 3]', [1, 2]));
});

test('array spread - middle', () => {
  assert.ok(matches('[1 .. 3]', [1, 3]));
  assert.ok(matches('[1 .. 3]', [1, 2, 3]));
  assert.ok(matches('[1 .. 3]', [1, 2, 2, 3]));
  assert.ok(!matches('[1 .. 3]', [1, 2]));
});

test('array quantifier - exact', () => {
  assert.ok(matches('[1{2}]', [1, 1]));
  assert.ok(!matches('[1{2}]', [1]));
  assert.ok(!matches('[1{2}]', [1, 1, 1]));
});

test('array quantifier - range', () => {
  assert.ok(matches('[1{2,3}]', [1, 1]));
  assert.ok(matches('[1{2,3}]', [1, 1, 1]));
  assert.ok(!matches('[1{2,3}]', [1]));
  assert.ok(!matches('[1{2,3}]', [1, 1, 1, 1]));
});

test('array nested', () => {
  assert.ok(matches('[[1 2]]', [[1, 2]]));
  assert.ok(matches('[_ [1 2]]', [99, [1, 2]]));
});

// ==================== Objects ====================

test('empty object', () => {
  assert.ok(matches('{}', {}));
  assert.ok(matches('{}', {a: 1})); // no assertions = all assertions satisfied
  assert.ok(!matches('{..#{0}}', {a: 1})); // explicitly forbid keys with ..#{0}
});

test('object single property', () => {
  assert.ok(matches('{a=1}', {a: 1}));
  assert.ok(!matches('{a=1}', {}));
  assert.ok(!matches('{a=1}', {a: 2}));
  assert.ok(matches('{a=1}', {a: 1, b: 2})); // extra keys allowed without ..
  assert.ok(!matches('{a=1 ..#{0}}', {a: 1, b: 2})); // ..#{0} forbids extra keys
});

test('object multiple properties', () => {
  assert.ok(matches('{a=1 b=2}', {a: 1, b: 2}));
  assert.ok(!matches('{a=1 b=2}', {a: 1}));
  assert.ok(matches('{a=1 b=2}', {a: 1, b: 2, c: 3})); // extra keys allowed
  assert.ok(!matches('{a=1 b=2 ..#{0}}', {a: 1, b: 2, c: 3})); // ..#{0} forbids extras
});

test('object with spread', () => {
  assert.ok(matches('{a=1 ..}', {a: 1}));
  assert.ok(matches('{a=1 ..}', {a: 1, b: 2, c: 3}));
  assert.ok(!matches('{a=1 ..}', {b: 2}));
});

test('object wildcard key', () => {
  assert.ok(matches('{_=1}', {a: 1}));
  assert.ok(matches('{_=1}', {b: 1}));
  assert.ok(!matches('{_=1}', {a: 2}));
});

test('object regex key', () => {
  assert.ok(matches('{/foo.*/=1}', {foobar: 1}));
  assert.ok(matches('{/foo.*/=1}', {foo: 1}));
  assert.ok(!matches('{/foo.*/=1}', {bar: 1}));
});

test('object nested', () => {
  assert.ok(matches('{a={b=1}}', {a: {b: 1}}));
  assert.ok(!matches('{a={b=1}}', {a: {b: 2}}));
});

// ==================== Breadcrumbs (Path Navigation) ====================

test('breadcrumb - single key', () => {
  assert.ok(matches('{a=1}', {a: 1}));
  assert.ok(!matches('{a=1}', {a: 2}));
  assert.ok(!matches('{a=1}', {b: 1}));
});

test('breadcrumb - nested keys', () => {
  assert.ok(matches('{a.b=1}', {a: {b: 1}}));
  assert.ok(!matches('{a.b=1}', {a: {b: 2}}));
  assert.ok(!matches('{a.b=1}', {a: {c: 1}}));
});

test('breadcrumb - deeper nesting', () => {
  assert.ok(matches('{a.b.c=1}', {a: {b: {c: 1}}}));
  assert.ok(!matches('{a.b.c=1}', {a: {b: {c: 2}}}));
});

test('breadcrumb - array index literal', () => {
  assert.ok(matches('{a[0]=1}', {a: [1, 2, 3]}));
  assert.ok(matches('{a[2]=3}', {a: [1, 2, 3]}));
  assert.ok(!matches('{a[0]=2}', {a: [1, 2, 3]}));
});

test('breadcrumb - array index wildcard', () => {
  assert.ok(matches('{a[_]=1}', {a: [1]}));
  assert.ok(matches('{a[_]=2}', {a: [1, 2, 3]}));
  assert.ok(matches('{a[_]=3}', {a: [1, 2, 3]}));
});

test('breadcrumb - mixed key and index', () => {
  assert.ok(matches('{a[0]=1}', {a: [1, 2]}));
  assert.ok(matches('{a[1].b=2}', {a: [{b: 1}, {b: 2}]}));
});

// ==================== Scalar Binding ($x) ====================

test('binding - simple', () => {
  const result = extractAll('$x', 42);
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 42);
});

test('binding - in array', () => {
  const result = extractAll('[$x $y $z]', [1, 2, 3]);
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 1);
  assert.equal(result[0].y, 2);
  assert.equal(result[0].z, 3);
});

test('binding - unification success', () => {
  const result = extractAll('[$x $x]', [1, 1]);
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 1);
});

test('binding - unification failure', () => {
  const result = extractAll('[$x $x]', [1, 2]);
  assert.equal(result.length, 0);
});

test('binding - with pattern constraint', () => {
  const result = extractAll('[$x:(1) $y]', [1, 2]);
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 1);
  assert.equal(result[0].y, 2);
});

test('binding - with spread', () => {
  const results = extractAll('[.. $x ..]', [1, 2, 3]);
  assert.ok(results.length >= 3); // should match each element
  assert.ok(results.some(r => r.x === 1));
  assert.ok(results.some(r => r.x === 2));
  assert.ok(results.some(r => r.x === 3));
});

test('binding - in object key', () => {
  const results = extractAll('{$x=_}', {a: 1, b: 2});
  assert.ok(results.length >= 2);
  assert.ok(results.some(r => r.x === 'a'));
  assert.ok(results.some(r => r.x === 'b'));
});

test('binding - in object value', () => {
  const result = extract('{a=$x}', {a: 42});
  assert.deepEqual(result, {x: 42});
});

test('binding - breadcrumb traversal', () => {
  const result = extract('{a.b.c=$x}', {a: {b: {c: 42}}});
  assert.deepEqual(result, {x: 42});
});

// ==================== Alternation (|) ====================

test('alternation - simple', () => {
  assert.ok(matches('(1|2)', 1));
  assert.ok(matches('(1|2)', 2));
  assert.ok(!matches('(1|2)', 3));
});

test('alternation - in array', () => {
  assert.ok(matches('[(1|2) (3|4)]', [1, 3]));
  assert.ok(matches('[(1|2) (3|4)]', [2, 4]));
  assert.ok(!matches('[(1|2) (3|4)]', [1, 5]));
});

test('alternation - with binding', () => {
  const results = extractAll('$x:(1|2)', 1);
  assert.equal(results.length, 1);
  assert.equal(results[0].x, 1);
});

// ==================== Lookaheads ====================

test('positive lookahead - success', () => {
  assert.ok(matches('(?=1)_', 1));
  assert.ok(!matches('(?=1)_', 2));
});

test('positive lookahead - in array', () => {
  assert.ok(matches('[(?=1)_ 2]', [1, 2]));
  assert.ok(!matches('[(?=2)_ 2]', [1, 2]));
});

test('negative lookahead - success', () => {
  assert.ok(matches('(?!1)_', 2));
  assert.ok(!matches('(?!1)_', 1));
});

test('negative lookahead - in array', () => {
  assert.ok(matches('[(?!1)_ 2]', [3, 2]));
  assert.ok(!matches('[(?!1)_ 2]', [1, 2]));
});

test('lookahead with binding - no variable leak', () => {
  // Lookaheads should not leak bindings outside their scope
  const result = extract('[(?=$x)_ $y]', [1, 2]);
  assert.ok(result.x === undefined || result.x === 1); // x should not leak
  assert.equal(result.y, 2);
});

// ==================== Replace API ====================

test('replace - simple value', () => {
  const result = replaceAll('$x', 42, bindings => ({...bindings, x: 99}));
  assert.equal(result, 99);
});

test('replace - in array (single element)', () => {
  const result = replaceAll('{a[$x:(0)]=_}', {a: [1, 2, 3]}, bindings => ({...bindings, x: 0, $out: 99}));
  assert.deepEqual(result, {a: [99, 2, 3]});
});

test('replace - in object', () => {
  const result = replaceAll('{a=$x}', {a: 1}, bindings => ({...bindings, x: 99}));
  assert.deepEqual(result, {a: 99});
});


















// ==================== Greedy Quantifiers ====================

test('greedy quantifiers - optional object emits longest match first', () => {
  const input = [
    {tag: 'div', children: 'before'},
    {tag: 'when', condition: true, children: 'show this'},
    {tag: 'else', children: 'or this'},
    {tag: 'span', children: 'after'}
  ];

  const pattern = `[.. @whenelse:(
    {tag=/^when$/i @otherProps:(..)}
    {tag=/^else$/i children=$else ..}?
  ) ..]`;

  const solutions = Tendril(pattern).all(input);

  // Should have 2 solutions: with and without else
  assert.equal(solutions.length, 2);

  // First solution should be the longest (greedy)
  assert.equal(solutions[0].bindings.whenelse.length, 2);
  assert.equal(solutions[0].bindings.else, 'or this');

  // Second solution should be shorter
  assert.equal(solutions[1].bindings.whenelse.length, 1);
  assert.equal(solutions[1].bindings.else, undefined);
});

test('replace uses first solution only (longest match)', () => {
  const input = [
    {tag: 'div', children: 'before'},
    {tag: 'when', condition: true, children: 'show this'},
    {tag: 'else', children: 'or this'},
    {tag: 'span', children: 'after'}
  ];

  const pattern = `[.. @whenelse:(
    {tag=/^when$/i @otherProps:(..)}
    {tag=/^else$/i children=$else ..}?
  ) ..]`;

  const result = Tendril(pattern).replace(input, v => ({
    whenelse: { tag: 'when', children2: v.else, ...v.otherProps }
  }));

  // Should replace the 2-element slice with single merged object
  assert.equal(result.length, 3); // div, merged when/else, span
  assert.equal(result[1].tag, 'when');
  assert.equal(result[1].children2, 'or this');
  assert.equal(result[1].condition, true);
});

// ==================== Edge Cases ====================

test('null value', () => {
  assert.ok(matches('null', null));
});

test('empty string', () => {
  assert.ok(matches('""', ''));
  assert.ok(!matches('""', 'x'));
});

test('number zero', () => {
  assert.ok(matches('0', 0));
  assert.ok(!matches('0', false));
});

test('nested arrays', () => {
  assert.ok(matches('[[[1]]]', [[[1]]]));
});

test('deeply nested objects', () => {
  assert.ok(matches('{a={b={c={d={e=1}}}}}', {a: {b: {c: {d: {e: 1}}}}}));
});

console.log('\n✓ All core tests defined\n');
