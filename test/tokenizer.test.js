/**
 * Tokenizer Tests
 *
 * Tests for microparser.js tokenization edge cases
 *
 * Run with: node test/tokenizer.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/microparser.js';

// ==================== Regex Literal Edge Cases ====================

test('regex with / inside character class', () => {
  const tokens = tokenize('/a[/]b/i');
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].k, 're');
  assert.equal(tokens[0].v.source, 'a[/]b');
  assert.equal(tokens[0].v.flags, 'i');
});

test('regex with escaped /', () => {
  const tokens = tokenize('/a\\/b/');
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].k, 're');
  assert.equal(tokens[0].v.source, 'a\\/b');
  assert.equal(tokens[0].v.flags, '');
});

test('regex with / in character range', () => {
  const tokens = tokenize('/[a-z/]+/i');
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].k, 're');
  assert.equal(tokens[0].v.source, '[a-z/]+');
  assert.equal(tokens[0].v.flags, 'i');
});

test('regex with multiple / in character class', () => {
  const tokens = tokenize('/[/\\/]+/');
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].k, 're');
  assert.equal(tokens[0].v.source, '[/\\/]+');
  assert.equal(tokens[0].v.flags, '');
});

test('regex with complex character class containing /', () => {
  const tokens = tokenize('/[a-z0-9/._-]+/i');
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].k, 're');
  assert.equal(tokens[0].v.source, '[a-z0-9/._-]+');
  assert.equal(tokens[0].v.flags, 'i');
});

test('regex with g flag should throw', () => {
  assert.throws(
    () => tokenize('/foo/g'),
    /flags 'g' and 'y' are not allowed/
  );
});

test('regex with y flag should throw', () => {
  assert.throws(
    () => tokenize('/foo/y'),
    /flags 'g' and 'y' are not allowed/
  );
});

test('regex with nested groups and /', () => {
  const tokens = tokenize('/^(http|https):\\/\\//');
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].k, 're');
  assert.equal(tokens[0].v.source, '^(http|https):\\/\\/');
  assert.equal(tokens[0].v.flags, '');
});

test('regex - unterminated should throw', () => {
  assert.throws(
    () => tokenize('/abc'),
    /unterminated regex literal/
  );
});

test('regex - invalid pattern should throw', () => {
  assert.throws(
    () => tokenize('/[/'),
    /unterminated regex literal/
  );
});

// ==================== Other Tokenizer Edge Cases ====================

test('string with escaped quotes', () => {
  const tokens = tokenize('"foo\\"bar"');
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].k, 'str');
  assert.equal(tokens[0].v, 'foo"bar');
});

test('comment should be ignored', () => {
  const tokens = tokenize('foo // comment\nbar');
  assert.equal(tokens.length, 2);
  assert.equal(tokens[0].v, 'foo');
  assert.equal(tokens[1].v, 'bar');
});

test('multi-character operators', () => {
  const tokens = tokenize('... ** ->  (? (!');
  assert.equal(tokens.length, 5);
  assert.equal(tokens[0].k, '...');
  assert.equal(tokens[1].k, '**');
  assert.equal(tokens[2].k, '->');  // flow operator
  assert.equal(tokens[3].k, '(?');
  assert.equal(tokens[4].k, '(!');
});

// ==================== Regex vs Division Ambiguity (td-0012) ====================
// These tests document the current heuristic behavior and known limitations.

test('regex after colon (object value context)', () => {
  // After ':', '/' should be regex - this is the common case
  const tokens = tokenize('{ a: /foo/ }');
  const kinds = tokens.map(t => t.k);
  assert.deepEqual(kinds, ['{', 'id', ':', 're', '}']);
});

test('regex as object key', () => {
  // At start of key position, '/' should be regex
  const tokens = tokenize('{ /foo/: 1 }');
  const kinds = tokens.map(t => t.k);
  assert.deepEqual(kinds, ['{', 're', ':', 'num', '}']);
});

test('division after value-like token in array - KNOWN LIMITATION', () => {
  // After a number, the heuristic treats '/' as division, not regex
  // This is a known limitation - see td-0012
  const tokens = tokenize('[1 2 3 /foo/ 4]');
  const kinds = tokens.map(t => t.k);
  // LIMITATION: /foo/ is tokenized as division operators, not regex
  assert.deepEqual(kinds, ['[', 'num', 'num', 'num', '/', 'id', '/', 'num', ']']);
});

test('regex at array start', () => {
  // At start of array, '/' should be regex
  const tokens = tokenize('[/foo/ 1 2]');
  const kinds = tokens.map(t => t.k);
  assert.deepEqual(kinds, ['[', 're', 'num', 'num', ']']);
});

test('regex after comma in array', () => {
  // After comma, '/' should be regex (not after value-like token)
  const tokens = tokenize('[1, /foo/, 2]');
  const kinds = tokens.map(t => t.k);
  assert.deepEqual(kinds, ['[', 'num', ',', 're', ',', 'num', ']']);
});

console.log('\n✓ All tokenizer tests defined\n');
