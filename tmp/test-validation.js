import {Tendril} from '../src/tendril-api.js';
import {parsePattern} from '../src/tendril-parser.js';

console.log('=== Test via Tendril (like the test does) ===');
try {
  Tendril('{ each _:/a/->%x, each _:/b/->%x }');
  console.log('No error thrown via Tendril');
} catch (e) {
  console.log('Error via Tendril:', e.message);
}

console.log('\n=== Test via parsePattern ===');
try {
  const ast = parsePattern('{ each _:/a/->%x, each _:/b/->%x }');
  console.log('No error thrown via parsePattern');
} catch (e) {
  console.log('Error via parsePattern:', e.message);
}

console.log('\n=== Test 2: -> without each ===');
try {
  Tendril('{ $k:$v ->%items }');
  console.log('No error thrown');
} catch (e) {
  console.log('Error:', e.message);
}

console.log('\n=== Test 3: -> inside each ===');
try {
  const t = Tendril('{ each _:/a/->%x }');
  console.log('Parsed successfully');
} catch (e) {
  console.log('Error:', e.message);
}
