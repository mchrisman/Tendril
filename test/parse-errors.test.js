/**
 * Parse Error Tests
 *
 * Tests that the parser throws appropriate errors for invalid patterns.
 *
 * Run with: node --test test/parse-errors.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

test('unclosed brace throws error', () => {
  assert.throws(
    () => Tendril('{..').match({}),
    /expected|unclosed/i
  );
});

test('invalid operator throws error', () => {
  assert.throws(
    () => Tendril('{k===v}').match({}),
    /expected/i
  );
});

test('bare spread (..) in object throws error', () => {
  assert.throws(
    () => Tendril('{.. k:$v}').match({}),
    /bare.*not allowed|expected/i
  );
});

test('empty pattern throws error', () => {
  assert.throws(
    () => Tendril('').match({}),
    /expected/i
  );
});

test('unmatched closing brace throws error', () => {
  assert.throws(
    () => Tendril('}').match({}),
    /expected/i
  );
});

test('unmatched closing bracket throws error', () => {
  assert.throws(
    () => Tendril(']').match([]),
    /expected/i
  );
});

console.log('\n[parse-errors] Test suite defined\n');
