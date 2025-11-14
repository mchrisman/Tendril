/**
 * Tendril Test Framework
 *
 * A lightweight test framework with:
 * - Exception handling for individual tests
 * - Success/failure reporting
 * - Test grouping and filtering
 * - Before/after hooks
 * - Async support
 */

class TestRunner {
  constructor() {
    this.tests = [];
    this.groups = new Map();
    this.results = {
      passed: [],
      failed: [],
      skipped: []
    };
    this.beforeAllHooks = [];
    this.afterAllHooks = [];
    this.beforeEachHooks = [];
    this.afterEachHooks = [];
    this.filterPattern = null;
    this.filterGroup = null;
    this.defaultSourceFile = null;
  }

  /**
   * Define a test
   */
  test(name, fn, options = {}) {
    const test = {
      name,
      fn,
      group: options.group || 'default',
      skip: options.skip || false,
      only: options.only || false,
      sourceFile: options.sourceFile || this.defaultSourceFile
    };

    this.tests.push(test);

    if (!this.groups.has(test.group)) {
      this.groups.set(test.group, []);
    }
    this.groups.get(test.group).push(test);
  }

  /**
   * Set default source file for subsequent tests
   */
  setSourceFile(fileName) {
    this.defaultSourceFile = fileName;
    return this;
  }

  /**
   * Define a skipped test
   */
  skip(name, fn, options = {}) {
    this.test(name, fn, { ...options, skip: true });
  }

  /**
   * Define a test that should run exclusively (with other .only tests)
   */
  only(name, fn, options = {}) {
    this.test(name, fn, { ...options, only: true });
  }

  /**
   * Define a test group
   */
  group(name, fn) {
    const previousGroup = this.currentGroup;
    this.currentGroup = name;
    fn();
    this.currentGroup = previousGroup;
  }

  /**
   * Hooks
   */
  beforeAll(fn) {
    this.beforeAllHooks.push(fn);
  }

  afterAll(fn) {
    this.afterAllHooks.push(fn);
  }

  beforeEach(fn) {
    this.beforeEachHooks.push(fn);
  }

  afterEach(fn) {
    this.afterEachHooks.push(fn);
  }

  /**
   * Set filter pattern for test names
   */
  filter(pattern) {
    if (typeof pattern === 'string') {
      this.filterPattern = new RegExp(pattern);
    } else if (pattern instanceof RegExp) {
      this.filterPattern = pattern;
    }
    return this;
  }

  /**
   * Set filter for test group
   */
  filterByGroup(groupName) {
    this.filterGroup = groupName;
    return this;
  }

  /**
   * Run all tests
   */
  async run() {
    console.log('\n🧪 Running Tendril Tests\n');
    console.log('='.repeat(60));

    const startTime = Date.now();

    // Run beforeAll hooks
    for (const hook of this.beforeAllHooks) {
      try {
        await hook();
      } catch (error) {
        console.error('❌ beforeAll hook failed:', error.message);
        return this.printSummary(startTime);
      }
    }

    // Filter tests
    let testsToRun = this.tests;

    // If any test has .only, run only those
    const onlyTests = testsToRun.filter(t => t.only);
    if (onlyTests.length > 0) {
      testsToRun = onlyTests;
    }

    // Apply name filter
    if (this.filterPattern) {
      testsToRun = testsToRun.filter(t => this.filterPattern.test(t.name));
    }

    // Apply group filter
    if (this.filterGroup) {
      testsToRun = testsToRun.filter(t => t.group === this.filterGroup);
    }

    // Run tests (grouped by source file)
    let currentFile = null;
    for (const test of testsToRun) {
      // Print file header when switching files
      if (test.sourceFile && test.sourceFile !== currentFile) {
        if (currentFile !== null) console.log(''); // blank line between files
        console.log(`\n📄 ${test.sourceFile}`);
        currentFile = test.sourceFile;
      }

      if (test.skip) {
        this.results.skipped.push(test);
        console.log(`⊘ ${test.name} (skipped)`);
        continue;
      }

      await this.runTest(test);
    }

    // Run afterAll hooks
    for (const hook of this.afterAllHooks) {
      try {
        await hook();
      } catch (error) {
        console.error('❌ afterAll hook failed:', error.message);
      }
    }

    this.printSummary(startTime);
    return this.results;
  }

  /**
   * Run a single test
   */
  async runTest(test) {
    const context = {};

    try {
      // Run beforeEach hooks
      for (const hook of this.beforeEachHooks) {
        await hook(context);
      }

      // Run the test
      await test.fn(context);

      // Run afterEach hooks
      for (const hook of this.afterEachHooks) {
        await hook(context);
      }

      this.results.passed.push(test);
      console.log(`✓ ${test.name}`);
    } catch (error) {
      this.results.failed.push({ test, error });
      console.log(`✗ ${test.name}`);
      console.log(`  ${error.message}`);
      if (error.stack) {
        const stackLines = error.stack.split('\n').group(1, 3);
        stackLines.forEach(line => console.log(`  ${line.trim()}`));
      }
    }
  }

  /**
   * Print summary
   */
  printSummary(startTime) {
    const duration = Date.now() - startTime;

    console.log('='.repeat(60));
    console.log('\n📊 Test Summary\n');

    const total = this.results.passed.length + this.results.failed.length + this.results.skipped.length;
    console.log(`Total:   ${total}`);
    console.log(`✓ Passed:  ${this.results.passed.length}`);
    console.log(`✗ Failed:  ${this.results.failed.length}`);
    console.log(`⊘ Skipped: ${this.results.skipped.length}`);
    console.log(`⏱ Duration: ${duration}ms\n`);

    if (this.results.failed.length > 0) {
      console.log('Failed tests:');
      this.results.failed.forEach(({ test, error }) => {
        console.log(`  - ${test.name}: ${error.message}`);
      });
      console.log();
    }

    const success = this.results.failed.length === 0;
    if (success) {
      console.log('✨ All tests passed!\n');
    } else {
      console.log('💥 Some tests failed.\n');
    }

    return success;
  }

  /**
   * Reset the runner
   */
  reset() {
    this.tests = [];
    this.groups.clear();
    this.results = {
      passed: [],
      failed: [],
      skipped: []
    };
    this.beforeAllHooks = [];
    this.afterAllHooks = [];
    this.beforeEachHooks = [];
    this.afterEachHooks = [];
    this.filterPattern = null;
    this.filterGroup = null;
  }
}

/**
 * Assertion helpers
 */
class Assert {
  static equal(actual, expected, message) {
    if (actual !== expected) {
      throw new AssertionError(
        message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      );
    }
  }

  static notEqual(actual, expected, message) {
    if (actual === expected) {
      throw new AssertionError(
        message || `Expected values to be different, but both are ${JSON.stringify(actual)}`
      );
    }
  }

  static deepEqual(actual, expected, message) {
    if (!this.isDeepEqual(actual, expected)) {
      throw new AssertionError(
        message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      );
    }
  }

  static isDeepEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!this.isDeepEqual(a[key], b[key])) return false;
    }

    return true;
  }

  static ok(value, message) {
    if (!value) {
      throw new AssertionError(message || `Expected truthy value, got ${JSON.stringify(value)}`);
    }
  }

  static notOk(value, message) {
    if (value) {
      throw new AssertionError(message || `Expected falsy value, got ${JSON.stringify(value)}`);
    }
  }

  static throws(fn, expectedError, message) {
    let threw = false;
    let actualError = null;

    try {
      fn();
    } catch (error) {
      threw = true;
      actualError = error;
    }

    if (!threw) {
      throw new AssertionError(message || 'Expected function to throw');
    }

    if (expectedError) {
      if (typeof expectedError === 'function') {
        if (!(actualError instanceof expectedError)) {
          throw new AssertionError(
            message || `Expected error of type ${expectedError.name}, got ${actualError.constructor.name}`
          );
        }
      } else if (expectedError instanceof RegExp) {
        if (!expectedError.test(actualError.message)) {
          throw new AssertionError(
            message || `Expected error message to match ${expectedError}, got "${actualError.message}"`
          );
        }
      }
    }
  }

  static async throwsAsync(fn, expectedError, message) {
    let threw = false;
    let actualError = null;

    try {
      await fn();
    } catch (error) {
      threw = true;
      actualError = error;
    }

    if (!threw) {
      throw new AssertionError(message || 'Expected function to throw');
    }

    if (expectedError) {
      if (typeof expectedError === 'function') {
        if (!(actualError instanceof expectedError)) {
          throw new AssertionError(
            message || `Expected error of type ${expectedError.name}, got ${actualError.constructor.name}`
          );
        }
      } else if (expectedError instanceof RegExp) {
        if (!expectedError.test(actualError.message)) {
          throw new AssertionError(
            message || `Expected error message to match ${expectedError}, got "${actualError.message}"`
          );
        }
      }
    }
  }
}

class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
  }
}

// Create global runner instance
const runner = new TestRunner();

// Export API
module.exports = {
  TestRunner,
  Assert,
  AssertionError,

  // Convenience exports for the global runner
  test: (name, fn, options) => runner.test(name, fn, options),
  skip: (name, fn, options) => runner.skip(name, fn, options),
  only: (name, fn, options) => runner.only(name, fn, options),
  group: (name, fn) => runner.group(name, fn),
  beforeAll: (fn) => runner.beforeAll(fn),
  afterAll: (fn) => runner.afterAll(fn),
  beforeEach: (fn) => runner.beforeEach(fn),
  afterEach: (fn) => runner.afterEach(fn),
  run: () => runner.run(),
  filter: (pattern) => runner.filter(pattern),
  filterByGroup: (group) => runner.filterByGroup(group),
  setSourceFile: (fileName) => runner.setSourceFile(fileName),
  assert: Assert,
  runner
};
