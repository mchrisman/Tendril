/**
 * V5 Core Test Suite
 *
 * Tests for the rewritten V5 architecture covering:
 * - Basic literals and wildcards
 * - Arrays with quantifiers and spread
 * - Objects with K=V / K?=V
 * - Path patterns (breadcrumbs)
 * - Scalar binding ($x) and unification
 * - Alternation (|)
 * - Lookaheads (?= / ?!)
 *
 * Run with: node test/v5-core.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { find, replace } from '../src/tendril-api.js';

// Helper: check if pattern matches input
function matches(pattern, input) {
  const results = find(input, pattern);
  return results.length > 0;
}

// ==================== Literals & Wildcards ====================

test('literal number', () => {
  assert.ok(matches('=123', 123));
  assert.ok(!matches('=123', 456));
});

test('literal string', () => {
  assert.ok(matches('="foo"', 'foo'));
  assert.ok(!matches('="foo"', 'bar'));
});

test('literal bareword', () => {
  assert.ok(matches('=foo', 'foo'));
  assert.ok(!matches('=foo', 'bar'));
});

test('literal boolean', () => {
  assert.ok(matches('=true', true));
  assert.ok(matches('=false', false));
  assert.ok(!matches('=true', false));
});

test('wildcard matches anything', () => {
  assert.ok(matches('=_', 123));
  assert.ok(matches('=_', 'foo'));
  assert.ok(matches('=_', true));
  assert.ok(matches('=_', null));
  assert.ok(matches('=_', {a: 1}));
});

test('regex literal', () => {
  assert.ok(matches('=/fo+/', 'foo'));
  assert.ok(matches('=/fo+/', 'foooo'));
  assert.ok(!matches('=/fo+/', 'bar'));
});

// ==================== Arrays ====================

test('empty array', () => {
  assert.ok(matches('=[]', []));
  assert.ok(!matches('=[]', [1]));
});

test('single element array', () => {
  assert.ok(matches('=[1]', [1]));
  assert.ok(!matches('=[1]', []));
  assert.ok(!matches('=[1]', [1, 2]));
});

test('multiple element array', () => {
  assert.ok(matches('=[1 2 3]', [1, 2, 3]));
  assert.ok(!matches('=[1 2 3]', [1, 2]));
  assert.ok(!matches('=[1 2 3]', [1, 2, 3, 4]));
});

test('array with wildcards', () => {
  assert.ok(matches('=[_ _]', [1, 2]));
  assert.ok(matches('=[_ _]', ['a', 'b']));
  assert.ok(!matches('=[_ _]', [1]));
});

test('array spread - empty', () => {
  assert.ok(matches('=[..]', []));
  assert.ok(matches('=[..]', [1, 2, 3]));
});

test('array spread - prefix', () => {
  assert.ok(matches('=[1 ..]', [1]));
  assert.ok(matches('=[1 ..]', [1, 2, 3]));
  assert.ok(!matches('=[1 ..]', [2, 3]));
});

test('array spread - suffix', () => {
  assert.ok(matches('=[.. 3]', [3]));
  assert.ok(matches('=[.. 3]', [1, 2, 3]));
  assert.ok(!matches('=[.. 3]', [1, 2]));
});

test('array spread - middle', () => {
  assert.ok(matches('=[1 .. 3]', [1, 3]));
  assert.ok(matches('=[1 .. 3]', [1, 2, 3]));
  assert.ok(matches('=[1 .. 3]', [1, 2, 2, 3]));
  assert.ok(!matches('=[1 .. 3]', [1, 2]));
});

test('array quantifier - exact', () => {
  assert.ok(matches('=[1{2}]', [1, 1]));
  assert.ok(!matches('=[1{2}]', [1]));
  assert.ok(!matches('=[1{2}]', [1, 1, 1]));
});

test('array quantifier - range', () => {
  assert.ok(matches('=[1{2,3}]', [1, 1]));
  assert.ok(matches('=[1{2,3}]', [1, 1, 1]));
  assert.ok(!matches('=[1{2,3}]', [1]));
  assert.ok(!matches('=[1{2,3}]', [1, 1, 1, 1]));
});

test('array nested', () => {
  assert.ok(matches('=[[1 2]]', [[1, 2]]));
  assert.ok(matches('=[_ [1 2]]', [99, [1, 2]]));
});

// ==================== Objects ====================

test('empty object', () => {
  assert.ok(matches('={}', {}));
  assert.ok(matches('={}', {a: 1})); // no assertions = all assertions satisfied
  assert.ok(!matches('={..#{0}}', {a: 1})); // explicitly forbid keys with ..#{0}
});

test('object single property', () => {
  assert.ok(matches('={a=1}', {a: 1}));
  assert.ok(!matches('={a=1}', {}));
  assert.ok(!matches('={a=1}', {a: 2}));
  assert.ok(matches('={a=1}', {a: 1, b: 2})); // extra keys allowed without ..
  assert.ok(!matches('={a=1 ..#{0}}', {a: 1, b: 2})); // ..#{0} forbids extra keys
});

test('object multiple properties', () => {
  assert.ok(matches('={a=1 b=2}', {a: 1, b: 2}));
  assert.ok(!matches('={a=1 b=2}', {a: 1}));
  assert.ok(matches('={a=1 b=2}', {a: 1, b: 2, c: 3})); // extra keys allowed
  assert.ok(!matches('={a=1 b=2 ..#{0}}', {a: 1, b: 2, c: 3})); // ..#{0} forbids extras
});

test('object with spread', () => {
  assert.ok(matches('={a=1 ..}', {a: 1}));
  assert.ok(matches('={a=1 ..}', {a: 1, b: 2, c: 3}));
  assert.ok(!matches('={a=1 ..}', {b: 2}));
});

test('object wildcard key', () => {
  assert.ok(matches('={_=1}', {a: 1}));
  assert.ok(matches('={_=1}', {b: 1}));
  assert.ok(!matches('={_=1}', {a: 2}));
});

test('object regex key', () => {
  assert.ok(matches('={/foo.*/=1}', {foobar: 1}));
  assert.ok(matches('={/foo.*/=1}', {foo: 1}));
  assert.ok(!matches('={/foo.*/=1}', {bar: 1}));
});

test('object nested', () => {
  assert.ok(matches('={a={b=1}}', {a: {b: 1}}));
  assert.ok(!matches('={a={b=1}}', {a: {b: 2}}));
});

// ==================== Path Patterns (Breadcrumbs) ====================

test('path - single key', () => {
  assert.ok(matches('.a=1', {a: 1}));
  assert.ok(!matches('.a=1', {a: 2}));
  assert.ok(!matches('.a=1', {b: 1}));
});

test('path - nested keys', () => {
  assert.ok(matches('.a.b=1', {a: {b: 1}}));
  assert.ok(!matches('.a.b=1', {a: {b: 2}}));
  assert.ok(!matches('.a.b=1', {a: {c: 1}}));
});

test('path - deeper nesting', () => {
  assert.ok(matches('.a.b.c=1', {a: {b: {c: 1}}}));
  assert.ok(!matches('.a.b.c=1', {a: {b: {c: 2}}}));
});

test('path - array index literal', () => {
  assert.ok(matches('[0]=1', [1, 2, 3]));
  assert.ok(matches('[2]=3', [1, 2, 3]));
  assert.ok(!matches('[0]=2', [1, 2, 3]));
});

test('path - array index wildcard', () => {
  assert.ok(matches('[_]=1', [1]));
  assert.ok(matches('[_]=2', [1, 2, 3]));
  assert.ok(matches('[_]=3', [1, 2, 3]));
});

test('path - mixed key and index', () => {
  assert.ok(matches('.a[0]=1', {a: [1, 2]}));
  assert.ok(matches('.a[1].b=2', {a: [{b: 1}, {b: 2}]}));
});

// ==================== Scalar Binding ($x) ====================

test('binding - simple', () => {
  const result = find(42, '=$x');
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 42);
});

test('binding - in array', () => {
  const result = find([1, 2, 3], '=[$x $y $z]');
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 1);
  assert.equal(result[0].y, 2);
  assert.equal(result[0].z, 3);
});

test('binding - unification success', () => {
  const result = find([1, 1], '=[$x $x]');
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 1);
});

test('binding - unification failure', () => {
  const result = find([1, 2], '=[$x $x]');
  assert.equal(result.length, 0);
});

test('binding - with pattern constraint', () => {
  const result = find([1, 2], '=[$x:(1) $y]');
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 1);
  assert.equal(result[0].y, 2);
});

test('binding - with spread', () => {
  const results = find([1, 2, 3], '=[.. $x ..]');
  assert.ok(results.length >= 3); // should match each element
  assert.ok(results.some(r => r.x === 1));
  assert.ok(results.some(r => r.x === 2));
  assert.ok(results.some(r => r.x === 3));
});

test('binding - in object key', () => {
  const results = find({a: 1, b: 2}, '.$x=_');
  assert.ok(results.length >= 2);
  assert.ok(results.some(r => r.x === 'a'));
  assert.ok(results.some(r => r.x === 'b'));
});

test('binding - in object value', () => {
  const result = find({a: 42}, '.a=$x');
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 42);
});

test('binding - path traversal', () => {
  const result = find({a: {b: {c: 42}}}, '.a.b.c=$x');
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 42);
});

// ==================== Alternation (|) ====================

test('alternation - simple', () => {
  assert.ok(matches('=(1|2)', 1));
  assert.ok(matches('=(1|2)', 2));
  assert.ok(!matches('=(1|2)', 3));
});

test('alternation - in array', () => {
  assert.ok(matches('=[(1|2) (3|4)]', [1, 3]));
  assert.ok(matches('=[(1|2) (3|4)]', [2, 4]));
  assert.ok(!matches('=[(1|2) (3|4)]', [1, 5]));
});

test('alternation - with binding', () => {
  const results = find(1, '=$x:(1|2)');
  assert.equal(results.length, 1);
  assert.equal(results[0].x, 1);
});

// ==================== Lookaheads ====================

test('positive lookahead - success', () => {
  assert.ok(matches('=(?=1)_', 1));
  assert.ok(!matches('=(?=1)_', 2));
});

test('positive lookahead - in array', () => {
  assert.ok(matches('=[(?=1)_ 2]', [1, 2]));
  assert.ok(!matches('=[(?=2)_ 2]', [1, 2]));
});

test('negative lookahead - success', () => {
  assert.ok(matches('=(?!1)_', 2));
  assert.ok(!matches('=(?!1)_', 1));
});

test('negative lookahead - in array', () => {
  assert.ok(matches('=[(?!1)_ 2]', [3, 2]));
  assert.ok(!matches('=[(?!1)_ 2]', [1, 2]));
});

test('lookahead with binding persistence', () => {
  const result = find([1, 1], '=[(?=$x:1)_ $x]');
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 1);
});

// ==================== Replace API ====================

test('replace - simple value', () => {
  const result = replace(42, '=$x', {x: 99});
  assert.equal(result, 99);
});

test('replace - in array', () => {
  const result = replace([1, 2, 3], '=[0]=$x', {x: 99});
  assert.deepEqual(result, [99, 2, 3]);
});

test('replace - in object', () => {
  const result = replace({a: 1}, '.a=$x', {x: 99});
  assert.deepEqual(result, {a: 99});
});

test('replace - with function', () => {
  const result = replace([1, 2, 3], '=[_]=$x', {x: env => env.x * 2});
  assert.deepEqual(result, [2, 4, 6]);
});

test('replace - key rename', () => {
  const result = replace({a: 1}, '.$x=_', {x: 'b'});
  assert.deepEqual(result, {b: 1});
});

// ==================== Multi-rule patterns (AND) ====================

test('multiple paths - relational join', () => {
  const data = {
    users: {u1: {name: 'Alice'}, u2: {name: 'Bob'}},
    posts: {p1: {author: 'u1', title: 'Hello'}}
  };

  const pattern = `
    .users.$uid.name = $name
    AND .posts.$pid.author = $uid
  `;

  const results = find(data, pattern);
  assert.ok(results.length > 0);
  assert.ok(results.some(r => r.name === 'Alice' && r.uid === 'u1'));
});

// ==================== Edge Cases ====================

test('null value', () => {
  assert.ok(matches('=null', null));
  assert.ok(!matches('=null', undefined));
});

test('empty string', () => {
  assert.ok(matches('=""', ''));
  assert.ok(!matches('=""', 'x'));
});

test('number zero', () => {
  assert.ok(matches('=0', 0));
  assert.ok(!matches('=0', false));
});

test('nested arrays', () => {
  assert.ok(matches('=[[[1]]]', [[[1]]]));
});

test('deeply nested objects', () => {
  assert.ok(matches('.a.b.c.d.e=1', {a: {b: {c: {d: {e: 1}}}}}));
});

console.log('\n✓ All core tests defined\n');
