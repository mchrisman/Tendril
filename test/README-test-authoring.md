# Writing Tests for Tendril

Tests use Node's built-in test runner (`node:test`) and assertion library (`node:assert/strict`).

## Basic Structure

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

test('description of what is being tested', () => {
  const pattern = Tendril('{ name: $x }');
  const result = pattern.match({ name: 'Alice' });

  assert.equal(result.hasMatch(), true);
  assert.deepEqual(result.solutions().first().toObject(), { x: 'Alice' });
});
```

## File Naming

Test files must be named `*.test.js` to be picked up by `npm test`.

```
test/
  engine.test.js       # picked up
  else.test.js         # picked up
  manual.js            # NOT picked up (no .test.js suffix)
```

## Common Assertions

```javascript
// Equality
assert.equal(actual, expected);           // strict ===
assert.notEqual(actual, unexpected);      // strict !==
assert.deepEqual(actual, expected);       // deep equality for objects/arrays

// Truthiness
assert.ok(value);                         // truthy
assert.ok(!value);                        // falsy (no assert.notOk)

// Errors
assert.throws(() => { throw new Error(); });
assert.throws(() => { ... }, /pattern/);  // error message matches regex
assert.throws(() => { ... }, TypeError);  // specific error type

// Async errors
await assert.rejects(async () => { ... });
```

## Async Tests

```javascript
test('async operation', async () => {
  const result = await someAsyncFunction();
  assert.equal(result, expected);
});
```

## Subtests

Group related tests:

```javascript
test('pattern matching', async (t) => {
  await t.test('matches objects', () => {
    assert.ok(Tendril('{}').hasMatch({}));
  });

  await t.test('matches arrays', () => {
    assert.ok(Tendril('[]').hasMatch([]));
  });
});
```

## Skipping Tests

```javascript
test.skip('not yet implemented', () => {
  // won't run
});

test('conditionally skip', { skip: process.platform === 'win32' }, () => {
  // skipped on Windows
});
```

## Running Specific Tests

```bash
# By file
node --test test/engine.test.js

# By name pattern
npm test -- --test-name-pattern="else:"

# Multiple patterns
node --test --test-name-pattern="Golden" test/golden-tests.test.js
```

## Tips

1. **One concept per test** - Keep tests focused on a single behavior
2. **Descriptive names** - Test names should describe what's being verified
3. **Use subtests for variants** - Group related cases with `t.test()`
4. **Test edge cases** - Empty arrays, null values, missing keys, etc.
5. **Check both positive and negative** - Verify matches AND non-matches
