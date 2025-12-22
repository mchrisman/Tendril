/**
 * Test Tendril patterns for AppDown macro transformations
 *
 * Run with: node test/macro.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

test('match When+Else pair with specific key binding', () => {
  const data = [
    {tag: 'When', attrs: {'a:test': '{x > 5}'}, children: ['Yes'], srcId: 'w1'},
    {tag: 'Else', children: ['No'], srcId: 'e1'}
  ];

  // Use remainder? to allow empty residual (bare remainder requires nonempty)
  const pattern = Tendril(`[
    {tag: "When", attrs: {$testKey: $testAttr, remainder?}, children: $then, srcId: $id, remainder?}
    {tag: "Else", children: $else, remainder?}?
  ]`);

  const sol = pattern.match(data).solutions().first();
  assert.ok(sol, 'Should match When+Else pair');
  assert.equal(sol.testKey, 'a:test');
  assert.equal(sol.testAttr, '{x > 5}');
  assert.deepEqual(sol.then, ['Yes']);
  assert.equal(sol.id, 'w1');
  assert.deepEqual(sol.else, ['No']);
});

test('match When+Else with case-insensitive tag and attrs binding', () => {
  const data = [
    {tag: 'When', attrs: {'a:test': '{x > 5}'}, children: ['Yes'], srcId: 'w1'},
    {tag: 'Else', children: ['No'], srcId: 'e1'}
  ];

  // Use remainder? to allow empty residual (bare remainder requires nonempty)
  const pattern = Tendril(`[
    {tag: /^[Ww]hen$/, attrs: $attrs, children: $then, srcId: $id, remainder?}
    {tag: /^[Ee]lse$/, children: $else, remainder?}?
  ]`);

  const sol = pattern.match(data).solutions().first();
  assert.ok(sol, 'Should match with case-insensitive tag');
  assert.deepEqual(sol.attrs, {'a:test': '{x > 5}'});
  assert.deepEqual(sol.then, ['Yes']);
  assert.equal(sol.id, 'w1');
  assert.deepEqual(sol.else, ['No']);

  // Verify we can extract test attribute
  const testAttr = sol.attrs['a:test'] || sol.attrs['test'];
  assert.equal(testAttr, '{x > 5}');
});

test('match When+Else with surrounding nodes using group bindings', () => {
  const data = [
    {tag: 'div', children: ['before']},
    {tag: 'When', attrs: {'a:test': '{x}'}, children: ['A'], srcId: 'w1'},
    {tag: 'Else', children: ['B']},
    {tag: 'div', children: ['after']}
  ];

  // Use remainder? to allow empty residual (bare remainder requires nonempty)
  const pattern = Tendril(`[
    ..
    (@whenelse=
      {tag: /^[Ww]hen$/, (@attrs=attrs:_), children: $then, (@other=remainder?)}
      {tag: /^[Ee]lse$/, children: $else, remainder?}?
    )
    ..
  ]`);

  const sol = pattern.match(data).solutions().first();
  assert.ok(sol, 'Should match with surrounding nodes');
  assert.ok(sol.whenelse, 'Should bind whenelse group');
  assert.ok(sol.attrs, 'Should bind attrs group');
  assert.deepEqual(sol.then, ['A']);
  assert.ok(sol.other, 'Should bind other group');
  assert.deepEqual(sol.else, ['B']);
});

test('replaceAll transforms When+Else to If node', () => {
  const data = [
    {tag: 'div', children: ['before']},
    {tag: 'When', attrs: {'a:test': '{x}'}, children: ['A'], srcId: 'w1'},
    {tag: 'Else', children: ['B']},
    {tag: 'div', children: ['after']}
  ];

  // Use remainder? to allow empty residual (bare remainder requires nonempty)
  const pattern = Tendril(`[
    ..
    (@whenelse=
      {tag: /^[Ww]hen$/, (@attrs=attrs:_), children: $then, (@other=remainder?)}
      {tag: /^[Ee]lse$/, children: $else, remainder?}?
    )
    ..
  ]`);

  // editAll is now PURE (returns copy)
  const result = pattern.find(data).editAll($ => {
    return {
      whenelse: [{
        tag: 'If',
        ...($.attrs||{}),
        ...($.other || {}),
        thenChildren: $.then,
        elseChildren: $.else || [],
        bindingName: null
      }]
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
