import {Tendril} from '../src/tendril-api.js';

// Test: With matching keys, does the bucket appear?
console.log('=== each with matches ===');
try {
  const result = Tendril('{ each /a/:$v ->%aKeys ? }').match({a1: 1, a2: 2, b: 99});
  console.log('hasMatch:', result.hasMatch());
  const sol = result.solutions().first();
  console.log('result:', sol ? sol.toObject() : null);
} catch (e) {
  console.log('Error:', e.message.split('\n')[0]);
}

// Test: What's in the solution for empty bucket case?
console.log('\n=== empty bucket - raw solution ===');
try {
  const result = Tendril('{ each /z/:$v ->%zKeys ? }').match({a: 1, b: 2});
  console.log('hasMatch:', result.hasMatch());
  const sol = result.solutions().first();
  if (sol) {
    console.log('toObject:', sol.toObject());
    console.log('has zKeys?', 'zKeys' in sol.toObject());
  }
} catch (e) {
  console.log('Error:', e.message.split('\n')[0]);
}

// Test: Does an empty bucket result in {} in the slice?
console.log('\n=== does the bucket exist but empty? ===');
try {
  // Try explicit binding alongside the empty bucket
  const result = Tendril('{ each /z/:$v ->%zKeys ?, $rest }').match({a: 1, b: 2});
  console.log('hasMatch:', result.hasMatch());
  const sol = result.solutions().first();
  console.log('result:', sol ? sol.toObject() : null);
} catch (e) {
  console.log('Error:', e.message.split('\n')[0]);
}
