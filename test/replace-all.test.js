/**
 * Unit tests for replaceAll() - replace all occurrences
 *
 * Run with: node test/replace-all.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

test('replace all scalar values in array', () => {
  const data = [1, 2, 1, 3];

  const t = Tendril('1');
  const result = t.find(data).replaceAll(() => 99);
  assert.deepEqual(result, [99, 2, 99, 3]);
});

test('replace all matching objects', () => {
  const data = [
    {type: 'A', val: 1},
    {type: 'B', val: 2},
    {type: 'A', val: 3}
  ];

  const t = Tendril('{type:"A"}');
  const result = t.find(data).replaceAll(() => ({type: 'A', val: 0}));

  assert.equal(result[0].val, 0);
  assert.equal(result[1].val, 2);
  assert.equal(result[2].val, 0);
});

console.log('\n✓ All replaceAll tests defined\n');
