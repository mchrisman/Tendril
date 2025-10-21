// Integration test for v5-A parser + engine + API
import {Tendril, matches, extract} from './src/tendril-api.js';
import util from 'util';

console.log('=== v5-A Integration Tests ===\n');

let passed = 0, failed = 0;

function test(name, pattern, data, expected) {
  console.log(`Test: ${name}`);
  console.log(`Pattern: ${pattern}`);
  console.log(`Data: ${util.inspect(data, {depth: null, colors: true})}`);

  try {
    const result = matches(pattern, data);
    if (result === expected) {
      console.log(`✅ PASS (${result})\n`);
      passed++;
    } else {
      console.log(`❌ FAIL: expected ${expected}, got ${result}\n`);
      failed++;
    }
  } catch (e) {
    console.log(`❌ ERROR: ${e.message}\n`);
    failed++;
  }
}

function testExtract(name, pattern, data, expectedBindings) {
  console.log(`Test: ${name}`);
  console.log(`Pattern: ${pattern}`);
  console.log(`Data: ${util.inspect(data, {depth: null, colors: true})}`);

  try {
    const result = extract(pattern, data);
    const match = JSON.stringify(result) === JSON.stringify(expectedBindings);

    if (match) {
      console.log(`✅ PASS`);
      console.log(`Bindings: ${util.inspect(result, {depth: null, colors: true})}\n`);
      passed++;
    } else {
      console.log(`❌ FAIL`);
      console.log(`Expected: ${util.inspect(expectedBindings, {depth: null, colors: true})}`);
      console.log(`Got: ${util.inspect(result, {depth: null, colors: true})}\n`);
      failed++;
    }
  } catch (e) {
    console.log(`❌ ERROR: ${e.message}`);
    console.error(e.stack);
    console.log('');
    failed++;
  }
}

// Basic literals
test('Number literal', '42', 42, true);
test('String literal', '"hello"', 'hello', true);
test('Boolean true', 'true', true, true);
test('Boolean false', 'false', false, true);
test('Null', 'null', null, true);
test('Wildcard', '_', 'anything', true);

// Arrays
test('Empty array', '[]', [], true);
test('Simple array', '[1 2 3]', [1, 2, 3], true);
test('Array with spread', '[1 .. 3]', [1, 2, 3], true);
test('Array mismatch', '[1 2]', [1, 2, 3], false);

// Objects
test('Empty object', '{}', {}, true);
test('Simple object', '{a=1}', {a: 1}, true);
test('Object with extra keys', '{a=1}', {a: 1, b: 2}, true);
test('Object missing key', '{a=1}', {b: 2}, false);

// Breadcrumbs
testExtract(
  'Simple breadcrumb',
  '{a.b=1}',
  {a: {b: 1}},
  {}
);

testExtract(
  'Breadcrumb with binding',
  '{a.b=$x}',
  {a: {b: 42}},
  {x: 42}
);

testExtract(
  'Array breadcrumb',
  '{a[0]=$x}',
  {a: [10, 20]},
  {x: 10}
);

testExtract(
  'Wildcard key breadcrumb',
  '{_.size=$x}',
  {earth: {size: 1}, mars: {size: 1}},  // Both must have same size for unification
  {x: 1}
);

// v5-A opening example
const solarData = {
  planets: {
    earth: {size: 1},
    mars: {size: 2}
  },
  aka: [
    ['Terra', 'Blue Planet'],
    ['Red Planet']
  ]
};

testExtract(
  'v5-A opening example - planets',
  '{planets.$name.size=$size}',
  solarData,
  {name: 'earth', size: 1}  // First match
);

testExtract(
  'v5-A opening example - aka alias',
  '{aka[$idx][_]=$alias}',
  solarData,
  {idx: 0, alias: 'Terra'}  // First match
);

testExtract(
  'v5-A opening example - aka name',
  '{aka[$idx][0]=$name}',
  solarData,
  {idx: 0, name: 'Terra'}
);

// Scalar bindings
testExtract(
  'Scalar binding $x',
  '$x',
  42,
  {x: 42}
);

testExtract(
  'Scalar binding with pattern',
  '$x:(_)',
  'anything',
  {x: 'anything'}
);

// Array quantifiers
test('Array quantifier +', '[_+]', [1, 2, 3], true);
test('Array quantifier + (empty)', '[_+]', [], false);
test('Array quantifier *', '[_*]', [], true);
test('Array quantifier ?', '[_?]', [], true);
test('Array quantifier ? (one)', '[_?]', [1], true);

// Slice bindings
testExtract(
  'Slice binding @x',
  '[@x]',
  [1, 2, 3],
  {x: [1, 2, 3]}  // Greedy match all
);

testExtract(
  'Slice binding @x with items',
  '[1 @x 3]',
  [1, 2, 3],
  {x: [2]}
);

// Alternation
test('Alternation (first)', '1 | 2', 1, true);
test('Alternation (second)', '1 | 2', 2, true);
test('Alternation (neither)', '1 | 2', 3, false);

console.log('=================');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed === 0) {
  console.log('\n🎉 All tests passed!');
} else {
  console.log(`\n❌ ${failed} test(s) failed`);
  process.exit(1);
}
