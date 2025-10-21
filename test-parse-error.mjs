import {Tendril} from './dist/tendril.esm.js';

console.log('Testing if parser errors throw exceptions:\n');

console.log('Test 1: Unclosed brace');
try {
  const t = Tendril('{..');
  console.log('✗ Should have thrown an error');
  console.log('Pattern parsed as:', t);
} catch (e) {
  console.log('✓ Parser threw error:', e.message);
}

console.log('\nTest 2: Invalid operator');
try {
  const t = Tendril('{k===v}');
  console.log('✗ Should have thrown an error');
} catch (e) {
  console.log('✓ Parser threw error:', e.message);
}

console.log('\nTest 3: Test our spread restriction directly');
try {
  const t = Tendril('{.. k=$v}');
  console.log('Pattern created:', t._pattern);
  console.log('AST:', JSON.stringify(t._ast || 'not compiled yet', null, 2));
  // Try to use it
  const result = t.match({x: 1, k: 2});
  console.log('Match result:', result);
} catch (e) {
  console.log('✓ Parser threw error:', e.message);
}
