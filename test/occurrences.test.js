/**
 * Unit tests for find() scan mode (formerly occurrences())
 *
 * Run with: node test/occurrences.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

test('find scalar at multiple depths', () => {
  const data = {
    a: 42,
    b: {
      c: 42,
      d: {
        e: 42
      }
    }
  };

  const t = Tendril('42');
  const matches = t.find(data).toArray();
  assert.equal(matches.length, 3, 'Should find 3 occurrences');
});

test('find patterns in nested structures', () => {
  const data = {
    items: [
      {id: 1, tag: 'foo'},
      {id: 2, tag: 'bar'}
    ]
  };

  const t = Tendril('{tag:"foo"}');
  const matches = t.find(data).toArray();
  assert.equal(matches.length, 1, 'Should find nested object');
  assert.equal(matches[0].value().tag, 'foo');
});

test('find all matching objects', () => {
  const data = [
    {type: 'user', name: 'Alice'},
    {type: 'admin', name: 'Bob'},
    {type: 'user', name: 'Charlie'}
  ];

  const t = Tendril('{type:"user" name:$n}');
  const sols = t.find(data).solutions().toArray();
  assert.equal(sols.length, 2, 'Should find 2 users');
});

test('find vs match - different results', () => {
  const data = [1, 2, 3];

  const t = Tendril('$x');
  const solCount = t.match(data).solutions().count();
  const occCount = t.find(data).solutions().count();

  // match: matches root (the array [1,2,3])
  // find: matches root + each element (1, 2, 3)
  assert.equal(solCount, 1, 'match finds root only');
  assert.equal(occCount, 4, 'find finds root + 3 elements');
});

console.log('\n✓ All occurrences tests defined\n');
