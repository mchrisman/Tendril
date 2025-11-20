/**
 * Unit tests for unified walk implementation
 *
 * Run with: node test/unified-walk.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril, extract, extractAll, matches, Group } from '../src/tendril-api.js';

// ==================== extract() - basic matching ====================

test('extract scalar at root', () => {
  const result = extract('$x', 42);
  assert.deepEqual(result, {x: 42});
});

test('extract scalar in object', () => {
  const result = extract('{b:$x}', {a: 1, b: 2});
  assert.deepEqual(result, {x: 2});
});

test('extract multiple scalars', () => {
  const result = extract('{a:$x b:$y}', {a: 1, b: 2});
  assert.deepEqual(result, {x: 1, y: 2});
});

test('extract with breadcrumbs', () => {
  const result = extract('{a.b:$x c[2]:$y}', {a: {b: 1}, c: [1, 2, 3]});
  assert.deepEqual(result, {x: 1, y: 3});
});

test('returns null when no match', () => {
  const result = extract('{c:$x}', {a: 1, b: 2});
  assert.equal(result, null);
});

// ==================== Tendril class - solutions ====================

test('solutions returns iterable', () => {
  const t = Tendril('$x');
  const sols = t.solutions(42);
  const first = sols.first();
  assert.ok(first);
  assert.deepEqual(first.bindings, {0: 42, x: 42});
});

test('solutions tracks binding sites', () => {
  const t = Tendril('$x');
  const sol = t.match(42);
  assert.ok(sol.at);
  assert.ok(sol.at.x);
  assert.ok(Array.isArray(sol.at.x));
});

test('all() returns array of solutions', () => {
  const t = Tendril('{a:$x}');
  const sols = t.all({a: 1});
  assert.equal(sols.length, 1);
  assert.deepEqual(sols[0].bindings, {0: {a: 1}, x: 1});
});

// ==================== Tendril.replace() - scalar replacement ====================

test('replace $0 (entire match) using function', () => {
  const t = Tendril('[$x $y]');
  const result = t.replace([3, 4], (v) => ({0: [v.y, v.x]}));
  assert.deepEqual(result, [4, 3]);
});

test('replace using value overload', () => {
  const t = Tendril('[$x $y]');
  const result = t.replace([3, 4], [99, 100]);
  assert.deepEqual(result, [99, 100]);
});

test('replace scalar at root', () => {
  const t = Tendril('$x');
  const result = t.replace(42, () => ({x: 99}));
  assert.equal(result, 99);
});

test('replace scalar in object', () => {
  const t = Tendril('{b:$x}');
  const result = t.replace({a: 1, b: 2}, () => ({x: 99}));
  assert.deepEqual(result, {a: 1, b: 99});
});

test('swap values using function', () => {
  const t = Tendril('{x:$a y:$b}');
  const result = t.replace({x: 3, y: 4}, (v) => ({a: v.b, b: v.a}));
  assert.deepEqual(result, {x: 4, y: 3});
});

// ==================== extractAll() - multiple solutions ====================

test('extract all matches', () => {
  const results = extractAll('{a:$x}', {a: 1});
  assert.equal(results.length, 1);
  assert.deepEqual(results[0], {x: 1});
});

// ==================== matches() - boolean test ====================

test('returns true for match', () => {
  assert.ok(matches('$x', 42));
});

test('returns false for no match', () => {
  assert.ok(!matches('{c:$x}', {a: 1}));
});

// ==================== Complex patterns - When/Else matching ====================

test('match When/Else control flow pattern', () => {
  const test3 = [
    {tag: 'div', children: ['before']},
    {tag: 'When', attrs: {'a:test': '{x}'}, children: ['A'], srcId: 'w1'},
    {tag: 'Else', children: ['B']},
    {tag: 'div', children: ['after']}
  ];

  const pattern3 = Tendril(`[
    ..
    @whenelse=(
      {tag: /^[Ww]hen$/, attrs: $attrs, children: $then, srcId: $id, remainder}
      {tag: /^[Ee]lse$/, children: $else, remainder}?
    )
    ..
  ]`);

  const sol3 = pattern3.solutions(test3).first();

  assert.ok(sol3, 'Should find a solution');
  assert.ok(sol3.bindings.whenelse, 'Should bind whenelse');
  assert.ok(sol3.bindings.attrs, 'Should bind attrs');
  assert.ok(sol3.bindings.then, 'Should bind then');
  assert.ok(sol3.bindings.id, 'Should bind id');
  assert.ok(sol3.bindings.else, 'Should bind else');
});

test('scalar binding with sequence should not match', () => {
  const data = [1, 2, 3];

  // $x is scalar, so $x=(1 2) is invalid - should not match
  const pattern = Tendril('[$x=(1 2)]');
  const sol = pattern.solutions(data).first();

  assert.equal(sol, null, 'Scalar binding with sequence should not match');
});

test('replace group binding', () => {
  const test4 = [
    {tag: 'div', children: ['before']},
    {tag: 'When', attrs: {'a:test': '{x}'}, children: ['A'], srcId: 'w1'},
    {tag: 'Else', children: ['B']},
    {tag: 'div', children: ['after']}
  ];

  const pattern4 = Tendril(`[
    ..
    @whenelse=(
      {tag: /^[Ww]hen$/, attrs: $attrs, children: $then, srcId: $id, remainder}
      {tag: /^[Ee]lse$/, children: $else, remainder}?
    )
    ..
  ]`);

  const result = pattern4.replace(test4, ($) => {
    return {
      whenelse: Group.array({
        tag: 'If',
        attrs: $.attrs || {},
        thenChildren: $.then,
        elseChildren: $.else || []
      })
    };
  });

  const expected = [
    {tag: 'div', children: ['before']},
    {tag: 'If', attrs: {'a:test': '{x}'}, thenChildren: ['A'], elseChildren: ['B']},
    {tag: 'div', children: ['after']}
  ];

  assert.deepEqual(result, expected);
});

console.log('\n✓ All unified walk tests defined\n');
