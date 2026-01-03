/**
 * Label Parsing Tests (CW16)
 *
 * Tests for parsing label declarations (§label) and references (<^label>).
 * These tests only verify parsing - semantics are not yet implemented.
 *
 * Run with: node --test test/label-parsing.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePattern } from '../src/tendril-parser.js';

// ==================== Label Declarations ====================

test('labeled object - basic', () => {
  const ast = parsePattern('§foo { a: 1 }');
  assert.equal(ast.type, 'Obj');
  assert.equal(ast.label, 'foo');
});

test('labeled array - basic', () => {
  const ast = parsePattern('§bar [1, 2, 3]');
  assert.equal(ast.type, 'Arr');
  assert.equal(ast.label, 'bar');
});

test('unlabeled object has null label', () => {
  const ast = parsePattern('{ a: 1 }');
  assert.equal(ast.type, 'Obj');
  assert.equal(ast.label, null);
});

test('unlabeled array has null label', () => {
  const ast = parsePattern('[1, 2, 3]');
  assert.equal(ast.type, 'Arr');
  assert.equal(ast.label, null);
});

test('nested labeled objects', () => {
  const ast = parsePattern('§outer { k: §inner { a: 1 } }');
  assert.equal(ast.label, 'outer');
  const innerObj = ast.terms[0].val;
  assert.equal(innerObj.label, 'inner');
});

test('labeled array inside labeled object', () => {
  const ast = parsePattern('§obj { items: §arr [1, 2] }');
  assert.equal(ast.label, 'obj');
  const innerArr = ast.terms[0].val;
  assert.equal(innerArr.label, 'arr');
});

// ==================== Label References in Flow ====================

test('flow with label reference', () => {
  const ast = parsePattern('{ $k: ($v -> @bucket<^foo>) }');
  const flow = ast.terms[0].val;
  assert.equal(flow.type, 'Flow');
  assert.equal(flow.bucket, 'bucket');
  assert.equal(flow.labelRef, 'foo');
});

test('flow without label reference has null labelRef', () => {
  const ast = parsePattern('{ $k: ($v -> @bucket) }');
  const flow = ast.terms[0].val;
  assert.equal(flow.type, 'Flow');
  assert.equal(flow.bucket, 'bucket');
  assert.equal(flow.labelRef, null);
});

test('flow with label reference in alternation', () => {
  const ast = parsePattern('{ $k: (1 -> @ones<^L> else _ -> @rest) }');
  const alt = ast.terms[0].val;
  assert.equal(alt.type, 'Alt');

  const flow1 = alt.alts[0];
  assert.equal(flow1.type, 'Flow');
  assert.equal(flow1.bucket, 'ones');
  assert.equal(flow1.labelRef, 'L');

  const flow2 = alt.alts[1];
  assert.equal(flow2.type, 'Flow');
  assert.equal(flow2.bucket, 'rest');
  assert.equal(flow2.labelRef, null);
});

// ==================== Combined Usage ====================

test('labeled object with flow referencing same label', () => {
  const ast = parsePattern('§L { $k: ($v -> @bucket<^L>) }');
  assert.equal(ast.label, 'L');
  const flow = ast.terms[0].val;
  assert.equal(flow.labelRef, 'L');
});

test('nested structure with cross-scope flow', () => {
  const ast = parsePattern('§outer { row: { $k: ($v -> @vals<^outer>) } }');
  assert.equal(ast.label, 'outer');
  const innerObj = ast.terms[0].val;
  const flow = innerObj.terms[0].val;
  assert.equal(flow.bucket, 'vals');
  assert.equal(flow.labelRef, 'outer');
});

console.log('\n[label-parsing] Test suite defined\n');
