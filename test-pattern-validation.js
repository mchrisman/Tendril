// Test that bound variables still validate against their patterns
import {Tendril} from './src/tendril-api.js';
import util from 'util';

console.log('=== Pattern Validation Tests ===\n');

// Test 1: Bound variable with regex pattern that doesn't match
console.log('Test 1: Bound variable with non-matching regex pattern');
const data1 = {
  a: 'xyz',
  xyz: 'found_it',
  abc123: 'also_found'
};

const pattern1 = '{a=$x $x:(/abc/)=$y}';
console.log('Pattern:', pattern1);
console.log('Data:', util.inspect(data1, {colors: true}));

const result1 = Tendril(pattern1).all(data1);
console.log('Solutions:', result1.length);
console.log('Expected: 0 (because "xyz" does not match /abc/)');
if (result1.length !== 0) {
  console.log('❌ FAIL: Should have found no solutions');
  console.log('Got:', result1);
} else {
  console.log('✅ PASS\n');
}

// Test 2: Bound variable with regex pattern that DOES match
console.log('Test 2: Bound variable with matching regex pattern');
const data2 = {
  a: 'abc123',
  abc123: 'found_it',
  xyz: 'not_found'
};

const pattern2 = '{a=$x $x:(/abc/)=$y}';
console.log('Pattern:', pattern2);
console.log('Data:', util.inspect(data2, {colors: true}));

const result2 = Tendril(pattern2).all(data2);
console.log('Solutions:', result2.length);
console.log('Expected: 1');
if (result2.length === 1) {
  console.log('Bindings:', result2[0].bindings);
  console.log('✅ PASS\n');
} else {
  console.log('❌ FAIL: Should have found 1 solution');
  console.log('Got:', result2);
}

// Test 3: Bound variable with literal pattern
console.log('Test 3: Bound variable with literal pattern');
const data3 = {
  a: 'b',
  b: 'value',
  c: 'wrong'
};

const pattern3 = '{a=$x $x:("b")=$y}';
console.log('Pattern:', pattern3);
console.log('Data:', util.inspect(data3, {colors: true}));

const result3 = Tendril(pattern3).all(data3);
console.log('Solutions:', result3.length);
console.log('Expected: 1');
if (result3.length === 1 && result3[0].bindings.y === 'value') {
  console.log('Bindings:', result3[0].bindings);
  console.log('✅ PASS\n');
} else {
  console.log('❌ FAIL');
  console.log('Got:', result3);
}

// Test 4: Bound variable that doesn't match literal pattern
console.log('Test 4: Bound variable that doesn\'t match literal pattern');
const data4 = {
  a: 'c',
  b: 'value',
  c: 'wrong'
};

const pattern4 = '{a=$x $x:("b")=$y}';
console.log('Pattern:', pattern4);
console.log('Data:', util.inspect(data4, {colors: true}));

const result4 = Tendril(pattern4).all(data4);
console.log('Solutions:', result4.length);
console.log('Expected: 0 (because "c" !== "b")');
if (result4.length === 0) {
  console.log('✅ PASS\n');
} else {
  console.log('❌ FAIL: Should have found no solutions');
  console.log('Got:', result4);
}

// Test 5: Array index with pattern constraint
console.log('Test 5: Array index pattern validation');
const data5 = {
  items: [
    ['a', 'b'],
    ['c', 'd'],
    ['e', 'f']
  ],
  idx: 1
};

const pattern5 = '{idx=$i items[$i:(1)][0]=$x}';
console.log('Pattern:', pattern5);
console.log('Data:', util.inspect(data5, {colors: true}));

const result5 = Tendril(pattern5).all(data5);
console.log('Solutions:', result5.length);
console.log('Expected: 1 (idx=1 matches pattern (1))');
if (result5.length === 1 && result5[0].bindings.x === 'c') {
  console.log('Bindings:', result5[0].bindings);
  console.log('✅ PASS\n');
} else {
  console.log('❌ FAIL');
  console.log('Got:', result5);
}

console.log('=== Tests Complete ===');
