/**
 * Else operator tests
 *
 * Run with: node test/else.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

function extractAll(pattern, data) {
  return Tendril(pattern).match(data).solutions().toArray().map(s => s.toObject());
}

function matches(pattern, data) {
  return Tendril(pattern).match(data).hasMatch();
}

test('else picks fallback when A has no interface match, regardless of order', () => {
  const data = {p: 1, q: 2};
  assert.deepEqual(extractAll('{ p:$x q:($x else 2) }', data), [{x: 1}]);
  assert.deepEqual(extractAll('{ q:($x else 2) p:$x }', data), [{x: 1}]);
});

test('else excludes B when A matches the same interface projection', () => {
  const data = {p: 1, q: 1};
  assert.deepEqual(extractAll('{ p:$x q:($x else 1) }', data), [{x: 1}]);
});

test('else works in arrays', () => {
  assert.ok(matches('[1 else 2]', [2]));
  assert.ok(matches('[1 else 2]', [1]));
  assert.ok(!matches('[1 else 2]', [3]));
});

console.log('\n✓ All else tests defined\n');
