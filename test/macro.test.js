/**
 * Test Tendril patterns for AppDown macro transformations
 *
 * Run with: node test/macro.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril, Group } from '../src/tendril-api.js';

test('match When+Else pair with specific key binding', () => {
  const data = [
    {tag: 'When', attrs: {'a:test': '{x > 5}'}, children: ['Yes'], srcId: 'w1'},
    {tag: 'Else', children: ['No'], srcId: 'e1'}
  ];

  const pattern = Tendril(`[
    {tag: "When", attrs: {$testKey: $testAttr, remainder}, children: $then, srcId: $id, remainder}
    {tag: "Else", children: $else, remainder}?
  ]`);

  const sol = pattern.solutions(data).first();
  assert.ok(sol, 'Should match When+Else pair');
  assert.equal(sol.bindings.testKey, 'a:test');
  assert.equal(sol.bindings.testAttr, '{x > 5}');
  assert.deepEqual(sol.bindings.then, ['Yes']);
  assert.equal(sol.bindings.id, 'w1');
  assert.deepEqual(sol.bindings.else, ['No']);
});

test('match When+Else with case-insensitive tag and attrs binding', () => {
  const data = [
    {tag: 'When', attrs: {'a:test': '{x > 5}'}, children: ['Yes'], srcId: 'w1'},
    {tag: 'Else', children: ['No'], srcId: 'e1'}
  ];

  const pattern = Tendril(`[
    {tag: /^[Ww]hen$/, attrs: $attrs, children: $then, srcId: $id, remainder}
    {tag: /^[Ee]lse$/, children: $else, remainder}?
  ]`);

  const sol = pattern.solutions(data).first();
  assert.ok(sol, 'Should match with case-insensitive tag');
  assert.deepEqual(sol.bindings.attrs, {'a:test': '{x > 5}'});
  assert.deepEqual(sol.bindings.then, ['Yes']);
  assert.equal(sol.bindings.id, 'w1');
  assert.deepEqual(sol.bindings.else, ['No']);

  // Verify we can extract test attribute
  const testAttr = sol.bindings.attrs['a:test'] || sol.bindings.attrs['test'];
  assert.equal(testAttr, '{x > 5}');
});

test('match When+Else with surrounding nodes using group bindings', () => {
  const data = [
    {tag: 'div', children: ['before']},
    {tag: 'When', attrs: {'a:test': '{x}'}, children: ['A'], srcId: 'w1'},
    {tag: 'Else', children: ['B']},
    {tag: 'div', children: ['after']}
  ];

  const pattern = Tendril(`[
    ..
    @whenelse=(
      {tag: /^[Ww]hen$/, @attrs=(attrs:_), children: $then, @other=(remainder)}
      {tag: /^[Ee]lse$/, children: $else, remainder}?
    )
    ..
  ]`);

  const sol = pattern.solutions(data).first();
  assert.ok(sol, 'Should match with surrounding nodes');
  assert.ok(sol.bindings.whenelse, 'Should bind whenelse group');
  assert.ok(sol.bindings.attrs, 'Should bind attrs group');
  assert.deepEqual(sol.bindings.then, ['A']);
  assert.ok(sol.bindings.other, 'Should bind other group');
  assert.deepEqual(sol.bindings.else, ['B']);
});

test('replaceAll transforms When+Else to If node', () => {
  const data = [
    {tag: 'div', children: ['before']},
    {tag: 'When', attrs: {'a:test': '{x}'}, children: ['A'], srcId: 'w1'},
    {tag: 'Else', children: ['B']},
    {tag: 'div', children: ['after']}
  ];

  const pattern = Tendril(`[
    ..
    @whenelse=(
      {tag: /^[Ww]hen$/, @attrs=(attrs:_), children: $then, @other=(remainder)}
      {tag: /^[Ee]lse$/, children: $else, remainder}?
    )
    ..
  ]`);

  const result = pattern.replaceAll(data, $ => {
    return {
      whenelse: Group.array({
        tag: 'If',
        ...($.attrs||{}),
        ...($.other || {}),
        thenChildren: $.then,
        elseChildren: $.else || [],
        bindingName: null
      })
    };
  });

  const expected = [
    {tag: 'div', children: ['before']},
    {tag: 'If', attrs: {'a:test': '{x}'}, thenChildren: ['A'], srcId: 'w1', elseChildren: ['B'], bindingName: null},
    {tag: 'div', children: ['after']}
  ];

  assert.deepEqual(result, expected);
});

console.log('\n✓ All macro transformation tests defined\n');
