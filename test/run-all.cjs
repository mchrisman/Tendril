#!/usr/bin/env node

/**
 * Test runner that executes all test files in the test directory
 *
 * Usage:
 *   node test/run-all.js
 *   node test/run-all.js --filter "pattern"
 *   node test/run-all.js --group "groupName"
 *   node test/run-all.js --file "example.test.js"
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const testDir = __dirname;

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  filter: null,
  group: null,
  file: null
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

// Run a single test file
function runTestFile(filePath, opts) {
  return new Promise((resolve, reject) => {
    const args = [];
    if (opts.filter) {
      args.push('--filter', opts.filter);
    }
    if (opts.group) {
      args.push('--group', opts.group);
    }

    const proc = spawn('node', [filePath, ...args], {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    proc.on('close', (code) => {
      resolve({ file: filePath, exitCode: code });
    });

    proc.on('error', (error) => {
      reject({ file: filePath, error });
    });
  });
}

// Main
async function main() {
  console.log('🚀 Tendril Test Suite\n');

  let testFiles = findTestFiles(testDir);

  // Exclude framework and runner files
  testFiles = testFiles.filter(f => {
    const basename = path.basename(f);
    return basename !== 'framework.js' && basename !== 'run-all.js';
  });

  // Filter by file if specified
  if (options.file) {
    testFiles = testFiles.filter(f => path.basename(f) === options.file);
  }

  if (testFiles.length === 0) {
    console.log('No test files found.');
    process.exit(0);
  }

  console.log(`Found ${testFiles.length} test file(s):\n`);
  testFiles.forEach(f => console.log(`  - ${path.relative(testDir, f)}`));
  console.log();

  const results = [];
  let allPassed = true;

  for (const testFile of testFiles) {
    const result = await runTestFile(testFile, options);
    results.push(result);

    if (result.exitCode !== 0) {
      allPassed = false;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Overall Summary\n');
  console.log(`Total test files: ${testFiles.length}`);
  console.log(`✓ Passed: ${results.filter(r => r.exitCode === 0).length}`);
  console.log(`✗ Failed: ${results.filter(r => r.exitCode !== 0).length}\n`);

  if (allPassed) {
    console.log('✨ All test files passed!\n');
    process.exit(0);
  } else {
    console.log('💥 Some test files failed:\n');
    results
      .filter(r => r.exitCode !== 0)
      .forEach(r => console.log(`  - ${path.relative(testDir, r.file)}`));
    console.log();
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Error running tests:', error);
  process.exit(1);
});
