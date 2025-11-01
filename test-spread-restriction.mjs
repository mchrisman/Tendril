import {Tendril} from './dist/tendril.esm.js';

console.log('Test 1: Valid - exact match {k=$v}\n');
try {
  const t1 = Tendril('{k=$v}');
  const r1 = t1.match({k: 1});
  console.log('✓ Parsed successfully');
  console.log('Match {k:1}:', r1 ? 'matched' : 'no match');
  const r2 = t1.match({k: 1, extra: 2});
  console.log('Match {k:1, extra:2}:', r2 ? 'matched' : 'no match (expected)');
} catch (e) {
  console.log('✗ Error:', e.message);
}

console.log('\nTest 2: Valid - remainder assertion {k=$v remainder}\n');
try {
  const t2 = Tendril('{k=$v remainder}');
  const r = t2.match({k: 1, extra: 2});
  console.log('✓ Parsed successfully');
  console.log('Match {k:1, extra:2}:', r ? 'matched' : 'no match');
} catch (e) {
  console.log('✗ Error:', e.message);
}

console.log('\nTest 3: Valid - slice binding {k=$v @rest:(remainder)}\n');
try {
  const t3 = Tendril('{k=$v @rest:(remainder)}');
  const r = t3.match({k: 1, extra: 2});
  console.log('✓ Parsed successfully');
  console.log('Match {k:1, extra:2}:', r ? 'matched' : 'no match');
  if (r) {
    console.log('Bindings:', r.bindings);
  }
} catch (e) {
  console.log('✗ Error:', e.message);
}

console.log('\nTest 4: Invalid - remainder at beginning {remainder k=$v}\n');
try {
  const t4 = Tendril('{remainder k=$v}');
  t4.match({});  // Trigger compilation
  console.log('✗ Should have failed to parse');
} catch (e) {
  console.log('✓ Got expected error:', e.message);
}

console.log('\nTest 5: Invalid - remainder in middle {k=$v remainder m=$n}\n');
try {
  const t5 = Tendril('{k=$v remainder m=$n}');
  t5.match({});  // Trigger compilation
  console.log('✗ Should have failed to parse');
} catch (e) {
  console.log('✓ Got expected error:', e.message);
}
