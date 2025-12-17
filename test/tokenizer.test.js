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
  const tokens = tokenize('/a\\/b/g');
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].k, 're');
  assert.equal(tokens[0].v.source, 'a\\/b');
  assert.equal(tokens[0].v.flags, 'g');
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
  const tokens = tokenize('/[a-z0-9/._-]+/gi');
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].k, 're');
  assert.equal(tokens[0].v.source, '[a-z0-9/._-]+');
  assert.equal(tokens[0].v.flags, 'gi');
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
    /unterminated or invalid regex/
  );
});

test('regex - invalid pattern should throw', () => {
  assert.throws(
    () => tokenize('/[/'),
    /unterminated or invalid regex/
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
  const tokens = tokenize('.. :>  (?= (?!');
  assert.equal(tokens.length, 4);
  assert.equal(tokens[0].k, '..');
  assert.equal(tokens[1].k, ':>');
  assert.equal(tokens[2].k, '(?=');
  assert.equal(tokens[3].k, '(?!');
});

console.log('\n✓ All tokenizer tests defined\n');
