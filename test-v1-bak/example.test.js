/**
 * Example test file demonstrating the Tendril test framework
 *
 * Run with: node test/example.test.js
 * Run specific tests: node test/example.test.js --filter "addition"
 * Run specific group: node test/example.test.js --group "math"
 */

const { test, skip, only, group, beforeAll, afterAll, beforeEach, afterEach, assert, run, runner, setSourceFile } = require('./framework.js');

setSourceFile('example.test.js');

// Parse command line arguments
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--filter' && args[i + 1]) {
    runner.filter(args[i + 1]);
    i++;
  } else if (args[i] === '--group' && args[i + 1]) {
    runner.filterByGroup(args[i + 1]);
    i++;
  }
}

// Setup/teardown hooks
beforeAll(() => {
  console.log('Setting up test suite...');
});

afterAll(() => {
  console.log('Cleaning up after tests...');
});

beforeEach((context) => {
  context.timestamp = Date.now();
});

afterEach((context) => {
  // Can clean up test-specific resources here
});

// Basic tests
test('simple passing test', () => {
  assert.equal(2 + 2, 4);
});

test('assertion with custom message', () => {
  assert.equal(true, true, 'Boolean equality should work');
});

test('deep equality', () => {
  const obj1 = { a: 1, b: { c: 2 } };
  const obj2 = { a: 1, b: { c: 2 } };
  assert.deepEqual(obj1, obj2);
});

test('ok assertion', () => {
  assert.ok(true);
  assert.ok(1);
  assert.ok('non-empty string');
});

test('notOk assertion', () => {
  assert.notOk(false);
  assert.notOk(0);
  assert.notOk('');
});

test('throws assertion', () => {
  assert.throws(() => {
    throw new Error('Expected error');
  });
});

test('throws with error type check', () => {
  assert.throws(() => {
    throw new TypeError('Type error');
  }, TypeError);
});

test('throws with error message pattern', () => {
  assert.throws(() => {
    throw new Error('Something went wrong');
  }, /went wrong/);
});

// Async test
test('async test example', async () => {
  const result = await Promise.resolve(42);
  assert.equal(result, 42);
});

test('async throws', async () => {
  await assert.throwsAsync(async () => {
    throw new Error('Async error');
  });
});

// Test that demonstrates failure (intentionally commented out)
// test('example of failing test', () => {
//   assert.equal(2 + 2, 5, 'This will fail');
// });

// Skipped test example (commented out to avoid false alarm in test output)
// skip('skipped test example', () => {
//   // This won't run
//   assert.equal(1, 2);
// });

// Grouped tests
group('math operations', () => {
  test('addition', () => {
    assert.equal(5 + 3, 8);
  }, { group: 'math' });

  test('subtraction', () => {
    assert.equal(10 - 4, 6);
  }, { group: 'math' });

  test('multiplication', () => {
    assert.equal(3 * 4, 12);
  }, { group: 'math' });

  test('division', () => {
    assert.equal(20 / 4, 5);
  }, { group: 'math' });
});

group('string operations', () => {
  test('concatenation', () => {
    assert.equal('hello' + ' ' + 'world', 'hello world');
  }, { group: 'strings' });

  test('length', () => {
    assert.equal('test'.length, 4);
  }, { group: 'strings' });

  test('uppercase', () => {
    assert.equal('hello'.toUpperCase(), 'HELLO');
  }, { group: 'strings' });
});

// Context example
test('using test context', (context) => {
  assert.ok(context.timestamp);
  assert.ok(Date.now() >= context.timestamp);
});

// Only run tests if this is the main module
if (require.main === module) {
  run().then((results) => {
    // Exit with error code if tests failed
    process.exit(results.failed.length > 0 ? 1 : 0);
  });
}

module.exports = { test, assert };
