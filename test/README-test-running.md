# Running Tests

## Run All Tests

From the project root:

```bash
./run-all
```

Or with npm:

```bash
npm test
```

**Output:** JSON with aggregate statistics and list of failing tests.

### Verbose Output

For detailed test-by-test results:

```bash
./run-all -v
```

This adds a `detail` section with the status of every test.

## Run Individual Test Files

```bash
node test/v5-core.test.js
node test/residual-tracking.test.js
# ... etc
```

**Output:** Standard test runner output (not JSON).

## Filter Tests

Run tests matching a pattern:

```bash
./run-all --filter "pattern"
```

Run tests from a specific file:

```bash
./run-all --file "v5-core.test.js"
```

Run tests from a specific group:

```bash
./run-all --group "groupName"
```

## Output Format

The `./run-all` script outputs JSON:

```json
{
  "aggregate": {
    "totalFiles": 12,
    "passedFiles": 12,
    "failedFiles": 0,
    "totalTests": 134,
    "passedTests": 133,
    "failedTests": 0,
    "skippedTests": 1
  },
  "failingTests": []
}
```

With `-v` flag, includes a `detail` array with per-file and per-test results.
