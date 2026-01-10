# Running Tests

Tests use Node's built-in test runner (`node:test`).

## Run All Tests

```bash
npm test
```

## Run a Specific Test File

```bash
node --test test/engine.test.js
node --test test/else.test.js
```

## Filter by Test Name

```bash
npm test -- --test-name-pattern="else:"
node --test --test-name-pattern="Golden" test/golden-tests.test.js
```

## Run Multiple Specific Files

```bash
node --test test/engine.test.js test/else.test.js
```

## Verbose Output

Node's test runner shows pass/fail for each test by default. For more detail on failures, the error messages include stack traces.

## Adding New Tests

Create `test/foo.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

test('description', () => {
  // assertions
});
```

The file will be picked up automatically by `npm test`.
