import {Tendril} from '../src/tendril-api.js';

// Test 1: basic flow - multiple keys
console.log('=== Test 1: {each $k: 1 -> %ones} ===');
const data1 = {a: 1, b: 1, c: 2};
try {
  const result = Tendril('{each $k: 1 -> %ones}').match(data1);
  console.log('hasMatch:', result.hasMatch());
  const sol = result.solutions().first();
  console.log('result:', sol ? sol.toObject() : null);
} catch (e) {
  console.log('Error:', e.message);
}

// Test 2: basic flow with optional - no matches
console.log('\n=== Test 2: {each $k: 1 -> %ones ?} ===');
const data2 = {a: 2, b: 3};
try {
  const result = Tendril('{each $k: 1 -> %ones ?}').match(data2);
  console.log('hasMatch:', result.hasMatch());
  const sol = result.solutions().first();
  console.log('result:', sol ? sol.toObject() : null);
} catch (e) {
  console.log('Error:', e.message);
}

// Test 3: single key match
console.log('\n=== Test 3: single key {each a: 1 -> %bucket} ===');
const data3 = {a: 1};
try {
  const result = Tendril('{each a: 1 -> %bucket}').match(data3);
  console.log('hasMatch:', result.hasMatch());
  const sol = result.solutions().first();
  console.log('result:', sol ? sol.toObject() : null);
} catch (e) {
  console.log('Error:', e.message);
}

// Test 4: each without flow
console.log('\n=== Test 4: each without flow {each $k: 1} ===');
const data4 = {a: 1, b: 1, c: 2};
try {
  const result = Tendril('{each $k: 1}').match(data4);
  console.log('hasMatch:', result.hasMatch());
  const sol = result.solutions().first();
  console.log('result:', sol ? sol.toObject() : null);
} catch (e) {
  console.log('Error:', e.message);
}

// Test 5: array bucket with multiple values
console.log('\n=== Test 5: {each $k: 1 -> @ones} ===');
try {
  const result = Tendril('{each $k: 1 -> @ones}').match({a: 1, b: 1, c: 2});
  console.log('hasMatch:', result.hasMatch());
  const sol = result.solutions().first();
  console.log('result:', sol ? sol.toObject() : null);
} catch (e) {
  console.log('Error:', e.message);
}
