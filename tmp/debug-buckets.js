import {Tendril} from '../src/tendril-api.js';

// Test 0: simple each without flow
console.log('=== Test 0: simple each without flow ===');
const data0 = {a: 1, b: 2, c: 3};
const pattern0 = '{ each /a/: $v1, each /b/: $v2 }';
console.log('Pattern:', pattern0);
console.log('Data:', JSON.stringify(data0));
try {
  const result = Tendril(pattern0).match(data0);
  console.log('hasMatch:', result.hasMatch());
  const sols = result.solutions().toArray();
  console.log('Solutions:', sols.length);
  if (sols.length > 0) {
    console.log('First:', sols[0].toObject());
  }
} catch (e) {
  console.log('Error:', e.message);
}

// Test 1: different bucket names in sibling each clauses
console.log('\n=== Test 1: different bucket names ===');
const data1 = {a: 1, b: 2, c: 3};
const pattern1 = '{ each /a/: $v ->%x, each /b/: $v ->%y }';
console.log('Pattern:', pattern1);
console.log('Data:', JSON.stringify(data1));
try {
  const result = Tendril(pattern1).match(data1);
  console.log('hasMatch:', result.hasMatch());
  const sols = result.solutions().toArray();
  console.log('Solutions:', sols.length);
  if (sols.length > 0) {
    console.log('First:', sols[0].toObject());
  }
} catch (e) {
  console.log('Error:', e.message);
}

// Test 2: labeled array with collecting (wrong pattern - only matches 1-element)
console.log('\n=== Test 2: labeled array with collecting (1-element pattern) ===');
const data2 = [1, 2, 3];
const pattern2 = '§L [$x <collecting $x in @items across ^L>]';
console.log('Pattern:', pattern2);
console.log('Data:', JSON.stringify(data2));
try {
  const result = Tendril(pattern2).match(data2);
  console.log('hasMatch:', result.hasMatch());
  const sols = result.solutions().toArray();
  console.log('Solutions:', sols.length);
  if (sols.length > 0) {
    console.log('First:', sols[0].toObject());
  }
} catch (e) {
  console.log('Error:', e.message);
}

// Test 2.1: labeled array with collecting and quantifier
console.log('\n=== Test 2.1: labeled array with quantifier ===');
const pattern2_1 = '§L [($x <collecting $x in @items across ^L>)+]';
console.log('Pattern:', pattern2_1);
console.log('Data:', JSON.stringify(data2));
try {
  const result = Tendril(pattern2_1).match(data2);
  console.log('hasMatch:', result.hasMatch());
  const sols = result.solutions().toArray();
  console.log('Solutions:', sols.length);
  if (sols.length > 0) {
    console.log('First:', sols[0].toObject());
  }
} catch (e) {
  console.log('Error:', e.message);
}

// Test 2.2: 1-element array with collecting
console.log('\n=== Test 2.2: 1-element array with collecting ===');
const pattern2_2 = '§L [$x <collecting $x in @items across ^L>]';
console.log('Pattern:', pattern2_2);
console.log('Data: [42]');
try {
  const result = Tendril(pattern2_2).match([42]);
  console.log('hasMatch:', result.hasMatch());
  const sols = result.solutions().toArray();
  console.log('Solutions:', sols.length);
  if (sols.length > 0) {
    console.log('First:', sols[0].toObject());
  }
} catch (e) {
  console.log('Error:', e.message);
}

// Test 2b: simple labeled array without collecting
console.log('\n=== Test 2b: simple labeled array (length 1) ===');
try {
  const result = Tendril('§L [$x]').match([1]);
  console.log('hasMatch:', result.hasMatch());
  const sols = result.solutions().toArray();
  console.log('Solutions:', sols.length);
  if (sols.length > 0) {
    console.log('First:', sols[0].toObject());
  }
} catch (e) {
  console.log('Error:', e.message);
}

// Test 2c: labeled array with spread
console.log('\n=== Test 2c: labeled array with spread ===');
try {
  const result = Tendril('§L [$x ...]').match([1, 2, 3]);
  console.log('hasMatch:', result.hasMatch());
  const sols = result.solutions().toArray();
  console.log('Solutions:', sols.length);
  if (sols.length > 0) {
    console.log('First:', sols[0].toObject());
  }
} catch (e) {
  console.log('Error:', e.message);
}

// Test 2d: unlabeled array with spread
console.log('\n=== Test 2d: unlabeled array with spread ===');
try {
  const result = Tendril('[$x ...]').match([1, 2, 3]);
  console.log('hasMatch:', result.hasMatch());
  const sols = result.solutions().toArray();
  console.log('Solutions:', sols.length);
  if (sols.length > 0) {
    console.log('First:', sols[0].toObject());
  }
} catch (e) {
  console.log('Error:', e.message);
}

// Test 3: simple each with ->
console.log('\n=== Test 3: simple each with -> ===');
const data3 = {ab: 1, ac: 2, xyz: 99};
const pattern3 = '{ each /a.*/: $v ->%matches }';
console.log('Pattern:', pattern3);
console.log('Data:', JSON.stringify(data3));
try {
  const result = Tendril(pattern3).match(data3);
  console.log('hasMatch:', result.hasMatch());
  const sols = result.solutions().toArray();
  console.log('Solutions:', sols.length);
  if (sols.length > 0) {
    console.log('First:', sols[0].toObject());
  }
} catch (e) {
  console.log('Error:', e.message);
}
