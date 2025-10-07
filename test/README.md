# Tendril Test Framework

A lightweight, feature-rich test framework for the Tendril project.

## Features

- ✅ Simple, intuitive API
- 🎯 Exception handling for individual tests
- 📊 Detailed success/failure reporting
- 🏷️ Test grouping and filtering
- 🪝 Before/after hooks (all, each)
- ⏭️ Skip and .only support
- 🔄 Async/await support
- 💪 Rich assertion library

## Quick Start

```javascript
const { test, assert, run } = require('./framework.js');

test('my first test', () => {
  assert.equal(2 + 2, 4);
});

run();
```

## API

### Defining Tests

#### `test(name, fn, options)`

Define a test.

```javascript
test('basic test', () => {
  assert.equal(true, true);
});

// With options
test('grouped test', () => {
  assert.ok(1);
}, { group: 'math' });

// Async test
test('async test', async () => {
  const result = await someAsyncFunction();
  assert.equal(result, expected);
});
```

#### `skip(name, fn, options)`

Define a test that will be skipped.

```javascript
skip('work in progress', () => {
  // This won't run
  assert.equal(1, 2);
});
```

#### `only(name, fn, options)`

Run only this test (and other .only tests).

```javascript
only('focus on this', () => {
  assert.equal(1, 1);
});
```

### Grouping Tests

#### `group(name, fn)`

Group related tests together.

```javascript
group('array operations', () => {
  test('push', () => {
    const arr = [];
    arr.push(1);
    assert.equal(arr.length, 1);
  }, { group: 'arrays' });

  test('pop', () => {
    const arr = [1];
    arr.pop();
    assert.equal(arr.length, 0);
  }, { group: 'arrays' });
});
```

### Hooks

#### `beforeAll(fn)`, `afterAll(fn)`

Run once before/after all tests.

```javascript
beforeAll(() => {
  console.log('Setup');
});

afterAll(() => {
  console.log('Cleanup');
});
```

#### `beforeEach(fn)`, `afterEach(fn)`

Run before/after each test. Receives test context.

```javascript
beforeEach((context) => {
  context.data = createTestData();
});

afterEach((context) => {
  cleanup(context.data);
});

test('uses context', (context) => {
  assert.ok(context.data);
});
```

### Assertions

#### `assert.equal(actual, expected, message?)`

Strict equality (`===`).

```javascript
assert.equal(2 + 2, 4);
assert.equal(result, 'expected', 'Custom error message');
```

#### `assert.notEqual(actual, expected, message?)`

Strict inequality (`!==`).

```javascript
assert.notEqual(1, 2);
```

#### `assert.deepEqual(actual, expected, message?)`

Deep equality for objects and arrays.

```javascript
assert.deepEqual({ a: 1 }, { a: 1 });
assert.deepEqual([1, 2, 3], [1, 2, 3]);
```

#### `assert.ok(value, message?)`

Assert truthy value.

```javascript
assert.ok(true);
assert.ok(1);
assert.ok('non-empty');
```

#### `assert.notOk(value, message?)`

Assert falsy value.

```javascript
assert.notOk(false);
assert.notOk(0);
assert.notOk('');
```

#### `assert.throws(fn, expectedError?, message?)`

Assert function throws an error.

```javascript
// Any error
assert.throws(() => {
  throw new Error('Oops');
});

// Specific error type
assert.throws(() => {
  throw new TypeError('Bad type');
}, TypeError);

// Error message pattern
assert.throws(() => {
  throw new Error('Something went wrong');
}, /went wrong/);
```

#### `assert.throwsAsync(fn, expectedError?, message?)`

Async version of `throws`.

```javascript
await assert.throwsAsync(async () => {
  throw new Error('Async error');
});
```

### Running Tests

#### `run()`

Run all tests and return results.

```javascript
run().then((results) => {
  console.log(results.passed.length, 'passed');
  console.log(results.failed.length, 'failed');
});
```

### Filtering

#### `filter(pattern)`

Filter tests by name pattern.

```javascript
// String pattern (converted to regex)
runner.filter('addition');

// Regex pattern
runner.filter(/addition|subtraction/);

run();
```

#### `filterByGroup(groupName)`

Filter tests by group.

```javascript
runner.filterByGroup('math');
run();
```

## Command Line Usage

Run a test file:

```bash
node test/example.test.js
```

Run specific tests:

```bash
node test/example.test.js --filter "addition"
```

Run specific group:

```bash
node test/example.test.js --group "math"
```

## Creating a Test File

Create a file in the `test/` directory:

```javascript
const { test, assert, run } = require('./framework.js');

test('my test', () => {
  assert.equal(1 + 1, 2);
});

// Only run if this is the main module
if (require.main === module) {
  run().then((results) => {
    process.exit(results.failed.length > 0 ? 1 : 0);
  });
}
```

## Example Output

```
🧪 Running Tendril Tests

============================================================
✓ simple passing test
✓ deep equality
✓ ok assertion
✓ async test example
⊘ skipped test example (skipped)
✓ addition
✓ subtraction
✗ example of failing test
  Expected 5, got 4
  at Object.<anonymous> (test/example.test.js:42:10)
============================================================

📊 Test Summary

Total:   8
✓ Passed:  6
✗ Failed:  1
⊘ Skipped: 1
⏱ Duration: 12ms

Failed tests:
  - example of failing test: Expected 5, got 4

💥 Some tests failed.
```

## Advanced Usage

### Custom Test Runner

Create your own runner instance for more control:

```javascript
const { TestRunner, Assert } = require('./framework.js');

const myRunner = new TestRunner();

myRunner.test('custom test', () => {
  Assert.equal(1, 1);
});

myRunner.filter('custom').run();
```

### Extending Assertions

```javascript
const { Assert } = require('./framework.js');

Assert.isArray = function(value, message) {
  if (!Array.isArray(value)) {
    throw new this.AssertionError(
      message || `Expected array, got ${typeof value}`
    );
  }
};
```

## Best Practices

1. **One test file per module** - Keep tests organized alongside source files
2. **Descriptive test names** - Use clear, descriptive names for tests
3. **Group related tests** - Use the `group()` function to organize tests
4. **Use hooks wisely** - Don't overuse beforeEach/afterEach; prefer explicit setup in tests
5. **Test one thing** - Each test should verify a single behavior
6. **Async tests** - Always use `async/await` for asynchronous code
7. **Custom messages** - Add custom messages to assertions for better debugging

## Integration with CI/CD

The test runner exits with code 1 on failure, making it easy to integrate with CI systems:

```bash
# In package.json
{
  "scripts": {
    "test": "node test/run-all.js"
  }
}

# In CI
npm test
```
