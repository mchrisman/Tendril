import {Tendril} from '../src/tendril-api.js';

// Test: each with optional - does ? make zero matches ok?
console.log('=== each with ?, no matches ===');
try {
  const result = Tendril('{each $k: 1 ?}').match({a: 2, b: 3});
  console.log('hasMatch:', result.hasMatch());
  console.log('solutions:', result.solutions().toArray().length);
} catch (e) {
  console.log('Error:', e.message);
}

// Test: each with optional, some matches
console.log('\n=== each with ?, some matches ===');
try {
  const result = Tendril('{each $k: 1 ?}').match({a: 1, b: 3});
  console.log('hasMatch:', result.hasMatch());
  const sol = result.solutions().first();
  console.log('result:', sol ? sol.toObject() : null);
} catch (e) {
  console.log('Error:', e.message);
}

// Test: What does "each" really mean?
// According to design: each K:V iterates over matching keys
// If K is $k (any key), it iterates ALL keys
// Strong semantics = all must match V pattern
console.log('\n=== each with specific key pattern /a/: ===');
try {
  const result = Tendril('{each /a/: $v}').match({a: 1, b: 2});
  console.log('hasMatch:', result.hasMatch());
  const sol = result.solutions().first();
  console.log('result:', sol ? sol.toObject() : null);
} catch (e) {
  console.log('Error:', e.message);
}

// Test: each /a/: $v with flow
console.log('\n=== each /a/: $v ->%bucket ===');
try {
  const result = Tendril('{each /a/: $v ->%bucket}').match({a1: 1, a2: 2, b: 99});
  console.log('hasMatch:', result.hasMatch());
  const sol = result.solutions().first();
  console.log('result:', sol ? sol.toObject() : null);
} catch (e) {
  console.log('Error:', e.message);
}

// Test: The key pattern $k with value 1 should only succeed if ALL values are 1
console.log('\n=== each $k: 1 where all values are 1 ===');
try {
  const result = Tendril('{each $k: 1}').match({a: 1, b: 1});
  console.log('hasMatch:', result.hasMatch());
  const sol = result.solutions().first();
  console.log('result:', sol ? sol.toObject() : null);
} catch (e) {
  console.log('Error:', e.message);
}

// Test: each $k: 1 -> %ones where all values are 1
console.log('\n=== each $k: 1 -> %ones where all values are 1 ===');
try {
  const result = Tendril('{each $k: 1 -> %ones}').match({a: 1, b: 1});
  console.log('hasMatch:', result.hasMatch());
  const sol = result.solutions().first();
  console.log('result:', sol ? sol.toObject() : null);
} catch (e) {
  console.log('Error:', e.message);
}
