/**
 * Early Binding Optimization Tests
 *
 * Tests that verify the early binding optimization correctly prunes
 * backtracking when variables are already bound.
 *
 * Run with: node test/optimization.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

test('optimization - simple variable chain', () => {
  // Pattern: {a=$x $x=$y $y=$z}
  // This should be O(1) with optimization, O(n³) without
  const data = {
    a: 'b',
    b: 'c',
    c: 'd',
    d: 'end'
  };

  const result = Tendril('{a=$x $x=$y $y=$z}').all(data);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].bindings, {'0': data, x: 'b', y: 'c', z: 'd'});
});

test('optimization - complex organizational graph', () => {
  // Test graph navigation with early binding
  const data = {
    users: {
      u1: {
        contact: ['Alice', 'alice@example.com', '555-1234', '555-5678'],
        managerId: 'u2'
      },
      u2: {
        contact: ['Bob', 'bob@example.com', '555-9999', '555-0000'],
        managerId: 'u3'
      },
      u3: { phone: '555-1111' }
    },
    projects: {
      p1: { assigneeId: 'u1', name: 'Project Alpha' },
      p2: { assigneeId: 'u2', name: 'Project Beta' }
    }
  };

  const pattern = `{
    users.$userId.contact=[$userName _ _ $userPhone]
    users.$userId.managerId=$managerId
    users.$managerId.phone=$managerPhone
    projects.$projectId.assigneeId=$userId
    projects.$projectId.name=$projectName
  }`;

  const start = Date.now();
  const result = Tendril(pattern).all(data);
  const elapsed = Date.now() - start;

  assert.equal(result.length, 1);
  assert.equal(result[0].bindings.userName, 'Bob');
  assert.equal(result[0].bindings.userId, 'u2');
  assert.equal(result[0].bindings.managerId, 'u3');
  assert.equal(result[0].bindings.managerPhone, '555-1111');
  assert.equal(result[0].bindings.projectName, 'Project Beta');

  // Performance check: should complete quickly with optimization
  assert.ok(elapsed < 100, `Took ${elapsed}ms, expected < 100ms`);
});

test('optimization - performance stress test', () => {
  // Build a large dataset: 100 users × 100 projects
  const data = {
    users: {},
    projects: {}
  };

  for (let i = 0; i < 100; i++) {
    data.users[`u${i}`] = {
      contact: [`User${i}`, `user${i}@example.com`, `555-${i}`, `555-${i+1000}`],
      managerId: `u${i + 1}`
    };
  }
  data.users.u100 = { phone: '555-9999' };

  for (let i = 0; i < 100; i++) {
    data.projects[`p${i}`] = {
      assigneeId: `u${i}`,
      name: `Project ${i}`
    };
  }

  const pattern = `{
    users.$userId.contact=[$userName _ _ $userPhone]
    users.$userId.managerId=$managerId
    users.$managerId.phone=$managerPhone
    projects.$projectId.assigneeId=$userId
    projects.$projectId.name=$projectName
  }`;

  const start = Date.now();
  const result = Tendril(pattern).all(data);
  const elapsed = Date.now() - start;

  assert.ok(result.length > 0, 'Should find at least one solution');
  assert.ok(elapsed < 50, `Took ${elapsed}ms, expected < 50ms with optimization`);
});

console.log('\n✓ All optimization tests defined\n');
