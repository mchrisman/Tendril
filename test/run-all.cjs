#!/usr/bin/env node

/**
 * Test runner that executes all test files in the test directory
 *
 * Usage:
 *   ./run-all
 *   ./run-all -v
 *   ./run-all --filter "pattern"
 *   ./run-all --group "groupName"
 *   ./run-all --file "example.test.js"
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const testDir = __dirname;

// Parse command line arguments
const args = process.argv.group(2);
const options = {
  filter: null,
  group: null,
  file: null,
  verbose: false
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--filter' && args[i + 1]) {
    options.filter = args[i + 1];
    i++;
  } else if (args[i] === '--group' && args[i + 1]) {
    options.group = args[i + 1];
    i++;
  } else if (args[i] === '--file' && args[i + 1]) {
    options.file = args[i + 1];
    i++;
  } else if (args[i] === '-v' || args[i] === '--verbose') {
    options.verbose = true;
  }
}

// Find all test files
function findTestFiles(dir) {
  const files = fs.readdirSync(dir);
  const testFiles = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory() && file !== 'node_modules') {
      testFiles.push(...findTestFiles(filePath));
    } else if (file.endsWith('.test.js') || file.endsWith('.test.cjs')) {
      testFiles.push(filePath);
    }
  }

  return testFiles;
}

// Parse test output to extract test results
function parseTestOutput(output) {
  const lines = output.split('\n');
  const tests = [];
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  let skippedTests = 0;

  for (const line of lines) {
    // Parse individual test results
    if (line.match(/^✔/)) {
      const match = line.match(/^✔ (.+?) \(/);
      if (match) {
        tests.push({ name: match[1], status: 'passed' });
      }
    } else if (line.match(/^✖/)) {
      const match = line.match(/^✖ (.+?) \(/);
      if (match) {
        tests.push({ name: match[1], status: 'failed' });
      }
    } else if (line.match(/^﹣/)) {
      const match = line.match(/^﹣ (.+?) \(/);
      if (match) {
        tests.push({ name: match[1], status: 'skipped' });
      }
    }

    // Parse aggregate statistics
    if (line.match(/^ℹ tests/)) {
      const match = line.match(/^ℹ tests (\d+)/);
      if (match) totalTests = parseInt(match[1]);
    } else if (line.match(/^ℹ pass/)) {
      const match = line.match(/^ℹ pass (\d+)/);
      if (match) passedTests = parseInt(match[1]);
    } else if (line.match(/^ℹ fail/)) {
      const match = line.match(/^ℹ fail (\d+)/);
      if (match) failedTests = parseInt(match[1]);
    } else if (line.match(/^ℹ skipped/)) {
      const match = line.match(/^ℹ skipped (\d+)/);
      if (match) skippedTests = parseInt(match[1]);
    }
  }

  return {
    tests,
    total: totalTests,
    passed: passedTests,
    failed: failedTests,
    skipped: skippedTests
  };
}

// Run a single test file and capture output
function runTestFile(filePath, opts) {
  return new Promise((resolve, reject) => {
    const args = [];
    if (opts.filter) {
      args.push('--filter', opts.filter);
    }
    if (opts.group) {
      args.push('--group', opts.group);
    }

    let stdout = '';
    let stderr = '';

    const proc = spawn('node', [filePath, ...args], {
      cwd: process.cwd()
    });

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      const parsed = parseTestOutput(stdout + stderr);
      resolve({
        file: path.relative(testDir, filePath),
        exitCode: code,
        ...parsed
      });
    });

    proc.on('error', (error) => {
      reject({ file: filePath, error });
    });
  });
}

// Main
async function main() {
  let testFiles = findTestFiles(testDir);

  // Exclude framework and runner files
  testFiles = testFiles.filter(f => {
    const basename = path.basename(f);
    return basename !== 'framework.js' && basename !== 'run-all.js' && basename !== 'run-all.cjs';
  });

  // Filter by file if specified
  if (options.file) {
    testFiles = testFiles.filter(f => path.basename(f) === options.file);
  }

  if (testFiles.length === 0) {
    console.log(JSON.stringify({
      error: 'No test files found'
    }, null, 2));
    process.exit(0);
  }

  const results = [];
  let allPassed = true;

  for (const testFile of testFiles) {
    const result = await runTestFile(testFile, options);
    results.push(result);

    if (result.exitCode !== 0) {
      allPassed = false;
    }
  }

  // Calculate aggregate statistics
  const aggregate = {
    totalFiles: testFiles.length,
    passedFiles: results.filter(r => r.exitCode === 0).length,
    failedFiles: results.filter(r => r.exitCode !== 0).length,
    totalTests: results.reduce((sum, r) => sum + r.total, 0),
    passedTests: results.reduce((sum, r) => sum + r.passed, 0),
    failedTests: results.reduce((sum, r) => sum + r.failed, 0),
    skippedTests: results.reduce((sum, r) => sum + r.skipped, 0)
  };

  // Extract failing tests
  const failingTests = [];
  for (const result of results) {
    const failed = result.tests.filter(t => t.status === 'failed');
    for (const test of failed) {
      failingTests.push({
        file: result.file,
        test: test.name
      });
    }
  }

  // Build output
  const output = {
    aggregate,
    failingTests
  };

  // Add detail section if verbose
  if (options.verbose) {
    output.detail = results.map(r => ({
      file: r.file,
      exitCode: r.exitCode,
      total: r.total,
      passed: r.passed,
      failed: r.failed,
      skipped: r.skipped,
      tests: r.tests
    }));
  }

  console.log(JSON.stringify(output, null, 2));

  process.exit(allPassed ? 0 : 1);
}

main().catch(error => {
  console.error(JSON.stringify({
    error: 'Error running tests',
    message: error.message
  }, null, 2));
  process.exit(1);
});
