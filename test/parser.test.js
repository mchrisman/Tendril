/**
 * Parser Tests
 *
 * Tests for tendril-parser.js parsing validation
 *
 * Run with: node test/parser.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePattern } from '../src/tendril-parser.js';

// ==================== Quantifier Validation ====================

test('array quantifier - valid integer', () => {
  const ast = parsePattern('[a{2}]');
  assert.equal(ast.type, 'Arr');
});

test('array quantifier - valid range', () => {
  const ast = parsePattern('[a{2,5}]');
  assert.equal(ast.type, 'Arr');
});

test('array quantifier - decimal should throw', () => {
  // May fail as quantifier validation or as invalid object syntax
  assert.throws(() => parsePattern('[a{1.5}]'));
});

test('array quantifier - negative should throw', () => {
  // May fail as quantifier validation or as invalid object syntax
  assert.throws(() => parsePattern('[a{-2}]'));
});

test('array quantifier - decimal in max should throw', () => {
  // May fail as quantifier validation or as invalid object syntax
  assert.throws(() => parsePattern('[a{1,2.5}]'));
});

test('object quantifier - valid integer', () => {
  const ast = parsePattern('{ a:b #{2} }');
  assert.equal(ast.type, 'Obj');
});

test('object quantifier - valid range', () => {
  const ast = parsePattern('{ a:b #{2,5} }');
  assert.equal(ast.type, 'Obj');
});

test('object quantifier - decimal should throw', () => {
  assert.throws(() => parsePattern('{ a:b #{1.5} }'));
});

test('object quantifier - negative should throw', () => {
  assert.throws(() => parsePattern('{ a:b #{-2} }'));
});

test('% quantifier - valid integer', () => {
  const ast = parsePattern('{ a:b %#{2} }');
  assert.equal(ast.type, 'Obj');
});

test('% quantifier - decimal should throw', () => {
  assert.throws(() => parsePattern('{ a:b %#{1.5} }'));
});

test('% quantifier - negative should throw', () => {
  assert.throws(() => parsePattern('{ a:b %#{-2} }'));
});

console.log('\n✓ All parser tests defined\n');
