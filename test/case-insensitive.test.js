/**
 * Case-Insensitive String Matching Tests
 *
 * Tests for the /i suffix syntax on strings and barewords:
 * - foo/i matches "foo", "FOO", "Foo", etc.
 * - 'foo bar'/i matches "foo bar", "FOO BAR", "Foo Bar", etc.
 * - "foo bar"/i same as single-quoted
 *
 * Key properties:
 * - Must match entire string (not substring like regex)
 * - Only works on string values
 * - Works in all contexts: values, object keys, arrays
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';
import { tokenize } from '../src/microparser.js';

// ============ Tokenizer Tests ============

test('tokenizer - bareword/i', () => {
  const toks = tokenize('foo/i');
  assert.equal(toks.length, 1);
  assert.equal(toks[0].k, 'ci');
  assert.equal(toks[0].v.lower, 'foo');
  assert.equal(toks[0].v.desc, 'foo/i');
});

test('tokenizer - quoted string/i (single)', () => {
  const toks = tokenize("'Foo Bar'/i");
  assert.equal(toks.length, 1);
  assert.equal(toks[0].k, 'ci');
  assert.equal(toks[0].v.lower, 'foo bar');
  assert.equal(toks[0].v.desc, "'Foo Bar'/i");
});

test('tokenizer - quoted string/i (double)', () => {
  const toks = tokenize('"Foo Bar"/i');
  assert.equal(toks.length, 1);
  assert.equal(toks[0].k, 'ci');
  assert.equal(toks[0].v.lower, 'foo bar');
  assert.equal(toks[0].v.desc, '"Foo Bar"/i');
});

test('tokenizer - bareword without /i is normal id', () => {
  const toks = tokenize('foo');
  assert.equal(toks.length, 1);
  assert.equal(toks[0].k, 'id');
  assert.equal(toks[0].v, 'foo');
});

test('tokenizer - /i requires no space (with space, becomes division)', () => {
  // With a space, 'foo' is a normal id, and '/i' is now division by 'i' (not regex)
  // This is valid tokenization in expression context
  const toks = tokenize('foo /i');
  assert.equal(toks.length, 3);
  assert.equal(toks[0].k, 'id');
  assert.equal(toks[0].v, 'foo');
  assert.equal(toks[1].k, '/');
  assert.equal(toks[2].k, 'id');
  assert.equal(toks[2].v, 'i');
});

// ============ Matching Tests ============

test('case-insensitive bareword - exact match', () => {
  assert(Tendril('foo/i').match('foo').hasMatch());
});

test('case-insensitive bareword - uppercase match', () => {
  assert(Tendril('foo/i').match('FOO').hasMatch());
});

test('case-insensitive bareword - mixed case match', () => {
  assert(Tendril('foo/i').match('FoO').hasMatch());
});

test('case-insensitive bareword - no match different string', () => {
  assert(!Tendril('foo/i').match('bar').hasMatch());
});

test('case-insensitive bareword - no match non-string', () => {
  assert(!Tendril('foo/i').match(123).hasMatch());
  assert(!Tendril('foo/i').match(null).hasMatch());
  assert(!Tendril('foo/i').match(['foo']).hasMatch());
});

test('case-insensitive bareword - must match entire string', () => {
  // Unlike regex, /i literals require exact match
  assert(!Tendril('foo/i').match('foobar').hasMatch());
  assert(!Tendril('foo/i').match('afoo').hasMatch());
});

test('case-insensitive quoted string - with spaces', () => {
  assert(Tendril("'hello world'/i").match('HELLO WORLD').hasMatch());
  assert(Tendril("'hello world'/i").match('Hello World').hasMatch());
  assert(Tendril("'hello world'/i").match('hello world').hasMatch());
});

test('case-insensitive in array', () => {
  assert(Tendril('[foo/i bar/i]').match(['FOO', 'BAR']).hasMatch());
  assert(Tendril('[foo/i bar/i]').match(['foo', 'bar']).hasMatch());
  assert(!Tendril('[foo/i bar/i]').match(['FOO', 'baz']).hasMatch());
});

test('case-insensitive in object value', () => {
  assert(Tendril('{name: alice/i}').match({name: 'ALICE'}).hasMatch());
  assert(Tendril('{name: alice/i}').match({name: 'Alice'}).hasMatch());
  assert(!Tendril('{name: alice/i}').match({name: 'Bob'}).hasMatch());
});

test('case-insensitive in object key', () => {
  assert(Tendril('{Name/i: $v}').match({name: 'Alice'}).hasMatch());
  assert(Tendril('{Name/i: $v}').match({NAME: 'Alice'}).hasMatch());
  assert(Tendril('{Name/i: $v}').match({NaMe: 'Alice'}).hasMatch());
});

test('case-insensitive with binding', () => {
  const sol = Tendril('[(foo/i as $x)]').match(['FOO']).solutions().first();
  assert(sol);
  assert.equal(sol.x, 'FOO'); // Binding captures actual value, not pattern
});

test('case-insensitive with alternation', () => {
  assert(Tendril('(yes/i | no/i)').match('YES').hasMatch());
  assert(Tendril('(yes/i | no/i)').match('No').hasMatch());
  assert(!Tendril('(yes/i | no/i)').match('maybe').hasMatch());
});

test('case-insensitive in breadcrumb path', () => {
  const data = {Config: {Debug: true}};
  assert(Tendril('{config/i.debug/i: true}').match(data).hasMatch());
});

test('case-insensitive does not affect regex', () => {
  // Regular regex still works
  assert(Tendril('/foo/i').match('FOO').hasMatch());
  assert(Tendril('/foo/i').match('seafood').hasMatch()); // Regex matches substring

  // Case-insensitive literal requires exact match
  assert(!Tendril('foo/i').match('seafood').hasMatch());
});

test('case-insensitive with special characters in quoted string', () => {
  assert(Tendril("'hello, world!'/i").match('HELLO, WORLD!').hasMatch());
  assert(Tendril('"c:\\\\path"/i').match('C:\\PATH').hasMatch());
});

// ============ Edge Cases ============

test('empty string case-insensitive', () => {
  assert(Tendril("''/i").match('').hasMatch());
  assert(!Tendril("''/i").match('x').hasMatch());
});

test('case-insensitive preserves unicode', () => {
  // Basic ASCII case folding
  assert(Tendril('cafe/i').match('CAFE').hasMatch());
});
