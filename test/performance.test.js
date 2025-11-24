/**
 * Performance Test - Large Random Trees
 *
 * Tests pattern matching performance on large randomly-generated data structures
 * to avoid JIT branch prediction optimizations.
 *
 * Run with: node test/performance.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

// Generate random tree with specified number of nodes (non-recursive)
function generateRandomTree(numNodes) {
  const chars = ['a', 'b', 'c', 'd', 'e', 'f'];
  let nodesCreated = 0;

  function randomChar() {
    return chars[Math.floor(Math.random() * chars.length)];
  }

  function randomInt(max) {
    return Math.floor(Math.random() * max);
  }

  // Create root
  const root = Math.random() < 0.5 ? [] : {};
  nodesCreated++;

  // Queue of [container, remainingSlots]
  // For arrays: remainingSlots is how many more elements to add
  // For objects: remainingSlots is how many more properties to add
  const queue = [];

  if (Array.isArray(root)) {
    queue.push([root, 1 + randomInt(8)]);
  } else {
    queue.push([root, 1 + randomInt(8)]);
  }

  while (queue.length > 0 && nodesCreated < numNodes) {
    const [container, remainingSlots] = queue.shift();

    for (let i = 0; i < remainingSlots && nodesCreated < numNodes; i++) {
      nodesCreated++;

      // Decide if this should be a leaf (40% chance) or container (60% chance)
      if (Math.random() < 0.4) {
        // Create leaf
        const leaf = randomChar();
        if (Array.isArray(container)) {
          container.push(leaf);
        } else {
          container[randomChar()] = leaf;
        }
      } else {
        // Create container (array or object)
        const isArray = Math.random() < 0.5;
        const newContainer = isArray ? [] : {};
        const newSlots = 1 + randomInt(8);

        if (Array.isArray(container)) {
          container.push(newContainer);
        } else {
          container[randomChar()] = newContainer;
        }

        // Add to queue for later processing
        queue.push([newContainer, newSlots]);
      }
    }
  }

  return root;
}

test('performance - large random tree basic scan', () => {
  console.log('Generating 10,000 node tree...');
  const data = generateRandomTree(10000);
  console.log('Tree generated');

  // Simple scan: find all arrays
  const start = Date.now();
  const matches = Tendril('[..]').find(data).toArray();
  const elapsed = Date.now() - start;

  console.log(`Found ${matches.length} arrays in ${elapsed}ms`);
  assert.ok(matches.length > 0, 'Should find at least some arrays');
  assert.ok(elapsed < 1000, `Expected < 1000ms, got ${elapsed}ms`);
});

test('performance - find specific patterns in large tree', () => {
  const data = generateRandomTree(10000);

  // Find all objects with key 'a'
  const start = Date.now();
  const matches = Tendril('{a:_}').find(data).toArray();
  const elapsed = Date.now() - start;

  console.log(`Found ${matches.length} objects with key 'a' in ${elapsed}ms`);
  assert.ok(elapsed < 1000, `Expected < 1000ms, got ${elapsed}ms`);
});

test('performance - complex pattern on large tree', () => {
  const data = generateRandomTree(10000);

  // Find nested patterns: arrays containing objects with 'a' key
  const start = Date.now();
  const matches = Tendril('[.. {a:$x} ..]').find(data).toArray();
  const elapsed = Date.now() - start;

  console.log(`Found ${matches.length} matching arrays in ${elapsed}ms`);
  assert.ok(elapsed < 2000, `Expected < 2000ms, got ${elapsed}ms`);
});

test('collapse adjacent equal arrays - simple case', () => {
  // Simple hand-coded test case
  const data = [
    [1, 2],
    [1, 2],  // duplicate - should collapse
    [3, 4],
    ['a', 'b'],
    ['a', 'b'],  // duplicate - should collapse
    ['a', 'b'],  // another duplicate - should collapse
    [5, 6]
  ];

  console.log('Original data:', JSON.stringify(data));

  // Pattern: [.. @x=($y=([..]){2,}) ..]
  // - Matches runs of 2+ adjacent equal arrays
  // - $y must unify across all occurrences (enforces equality via unification!)
  // - Binds the entire run to @x (group binding for the slice)
  const pattern = '[.. @x=($y=([..]){2,}) ..]';

  // First, let's just find matches to verify the pattern works
  const matches = Tendril(pattern).find(data).toArray();
  console.log(`Found ${matches.length} runs of adjacent equal arrays`);

  if (matches.length > 0) {
    matches.forEach((match, i) => {
      console.log(`  Match ${i} at path ${JSON.stringify(match.path())}`);
      // Match doesn't have solutions() - use the match set's solutions
    });

    // Get all solutions
    const allSolutions = Tendril(pattern).find(data).solutions().toArray();
    console.log(`  Total solutions: ${allSolutions.length}`);
    allSolutions.forEach((sol, j) => {
      console.log(`    Solution ${j}: x=${JSON.stringify(sol.x)}, y=${JSON.stringify(sol.y)}`);
    });
  }

  // Now try the edit
  const cloned = JSON.parse(JSON.stringify(data));
  try {
    // Try the plan object form
    Tendril(pattern).find(cloned).editAll($ => ({x: [$.y]}));

    console.log('After collapse:', JSON.stringify(cloned));
    console.log(`  Original length: ${data.length}, After: ${cloned.length}`);

    // Should have collapsed [1,2], [1,2] -> [1,2] (saves 1)
    // and ['a','b'], ['a','b'], ['a','b'] -> ['a','b'] (saves 2)
    // Original 7 - 3 = 4 elements
    assert.equal(cloned.length, 4, 'Should collapse to 4 elements total');
  } catch (e) {
    console.log('Edit failed:', e.message);
    throw e;
  }
});

console.log('\n✓ All performance tests defined\n');
