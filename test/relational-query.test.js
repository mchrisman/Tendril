/**
 * Relational Query Tests
 *
 * Tests for complex multi-binding patterns that express relational queries
 * across nested data structures. These tests verify that all valid solutions
 * are found when multiple bindings can match.
 *
 * Run with: node test/relational-query.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

test('relational query - single solution', () => {
  const data = {
    users: {
      u1: {
        contact: ['Alice', 'alice@example.com', '555-1234', '555-5678'],
        managerId: 'm1'
      }
    },
    managers: {
      m1: { phone: '555-9999' }
    },
    projects: {
      p1: { assigneeId: 'u1', name: 'Project Alpha' }
    }
  };

  const pattern = `{
    users.$userId.contact:[$userName _ _ $userPhone]
    users.$userId.managerId:$managerId
    managers.$managerId.phone:$managerPhone
    projects.$projectId.assigneeId:$userId
    projects.$projectId.name:$projectName
  }`;

  const result = Tendril(pattern).match(data).solutions().toArray();

  assert.equal(result.length, 1);
  const sol = result[0].toObject();
  assert.equal(sol.userId, 'u1');
  assert.equal(sol.userName, 'Alice');
  assert.equal(sol.userPhone, '555-5678');
  assert.equal(sol.managerId, 'm1');
  assert.equal(sol.managerPhone, '555-9999');
  assert.equal(sol.projectId, 'p1');
  assert.equal(sol.projectName, 'Project Alpha');
});

test('relational query - multiple users with projects', () => {
  const data = {
    users: {
      u1: {
        contact: ['Alice', 'alice@example.com', '555-1234', '555-1111'],
        managerId: 'm1'
      },
      u2: {
        contact: ['Bob', 'bob@example.com', '555-5678', '555-2222'],
        managerId: 'm1'
      },
      u3: {
        contact: ['Carol', 'carol@example.com', '555-9999', '555-3333'],
        managerId: 'm2'
      }
    },
    managers: {
      m1: { phone: '555-BOSS1' },
      m2: { phone: '555-BOSS2' }
    },
    projects: {
      p1: { assigneeId: 'u1', name: 'Project Alpha' },
      p2: { assigneeId: 'u2', name: 'Project Beta' },
      p3: { assigneeId: 'u3', name: 'Project Gamma' }
    }
  };

  const pattern = `{
    users.$userId.contact:[$userName _ _ $userPhone]
    users.$userId.managerId:$managerId
    managers.$managerId.phone:$managerPhone
    projects.$projectId.assigneeId:$userId
    projects.$projectId.name:$projectName
  }`;

  const result = Tendril(pattern).match(data).solutions().toArray();

  assert.equal(result.length, 3, 'Should find 3 solutions (one per user with a project)');

  const solutions = result.map(s => s.toObject());
  const names = solutions.map(s => s.userName).sort();
  const projects = solutions.map(s => s.projectName).sort();

  assert.deepEqual(names, ['Alice', 'Bob', 'Carol']);
  assert.deepEqual(projects, ['Project Alpha', 'Project Beta', 'Project Gamma']);

  // Verify relational integrity
  for (const sol of solutions) {
    if (sol.userName === 'Alice') {
      assert.equal(sol.userId, 'u1');
      assert.equal(sol.userPhone, '555-1111');
      assert.equal(sol.managerId, 'm1');
      assert.equal(sol.managerPhone, '555-BOSS1');
      assert.equal(sol.projectName, 'Project Alpha');
    } else if (sol.userName === 'Bob') {
      assert.equal(sol.userId, 'u2');
      assert.equal(sol.userPhone, '555-2222');
      assert.equal(sol.managerId, 'm1');
      assert.equal(sol.managerPhone, '555-BOSS1');
      assert.equal(sol.projectName, 'Project Beta');
    } else if (sol.userName === 'Carol') {
      assert.equal(sol.userId, 'u3');
      assert.equal(sol.userPhone, '555-3333');
      assert.equal(sol.managerId, 'm2');
      assert.equal(sol.managerPhone, '555-BOSS2');
      assert.equal(sol.projectName, 'Project Gamma');
    }
  }
});

test('relational query - user with multiple projects', () => {
  const data = {
    users: {
      u1: {
        contact: ['Alice', 'alice@example.com', '555-1234', '555-1111'],
        managerId: 'm1'
      }
    },
    managers: {
      m1: { phone: '555-BOSS' }
    },
    projects: {
      p1: { assigneeId: 'u1', name: 'Project Alpha' },
      p2: { assigneeId: 'u1', name: 'Project Beta' },
      p3: { assigneeId: 'u1', name: 'Project Gamma' }
    }
  };

  const pattern = `{
    users.$userId.contact:[$userName _ _ $userPhone]
    users.$userId.managerId:$managerId
    managers.$managerId.phone:$managerPhone
    projects.$projectId.assigneeId:$userId
    projects.$projectId.name:$projectName
  }`;

  const result = Tendril(pattern).match(data).solutions().toArray();

  assert.equal(result.length, 3, 'Should find 3 solutions (one per project)');

  const solutions = result.map(s => s.toObject());
  const projectNames = solutions.map(s => s.projectName).sort();

  assert.deepEqual(projectNames, ['Project Alpha', 'Project Beta', 'Project Gamma']);

  // All solutions should have the same user info
  for (const sol of solutions) {
    assert.equal(sol.userName, 'Alice');
    assert.equal(sol.userId, 'u1');
    assert.equal(sol.managerPhone, '555-BOSS');
  }
});

test('relational query - shared manager', () => {
  const data = {
    users: {
      u1: {
        contact: ['Alice', 'alice@example.com', '555-1234', '555-1111'],
        managerId: 'm1'
      },
      u2: {
        contact: ['Bob', 'bob@example.com', '555-5678', '555-2222'],
        managerId: 'm1'  // Same manager as Alice
      }
    },
    managers: {
      m1: { phone: '555-BOSS' }
    },
    projects: {
      p1: { assigneeId: 'u1', name: 'Project Alpha' },
      p2: { assigneeId: 'u2', name: 'Project Beta' }
    }
  };

  const pattern = `{
    users.$userId.contact:[$userName _ _ $userPhone]
    users.$userId.managerId:$managerId
    managers.$managerId.phone:$managerPhone
    projects.$projectId.assigneeId:$userId
    projects.$projectId.name:$projectName
  }`;

  const result = Tendril(pattern).match(data).solutions().toArray();

  assert.equal(result.length, 2, 'Should find 2 solutions');

  const solutions = result.map(s => s.toObject());

  // Both should have the same manager phone
  for (const sol of solutions) {
    assert.equal(sol.managerPhone, '555-BOSS');
    assert.equal(sol.managerId, 'm1');
  }

  const names = solutions.map(s => s.userName).sort();
  assert.deepEqual(names, ['Alice', 'Bob']);
});

test('relational query - user without project is excluded', () => {
  const data = {
    users: {
      u1: {
        contact: ['Alice', 'alice@example.com', '555-1234', '555-1111'],
        managerId: 'm1'
      },
      u2: {
        contact: ['Bob', 'bob@example.com', '555-5678', '555-2222'],
        managerId: 'm1'
      }
    },
    managers: {
      m1: { phone: '555-BOSS' }
    },
    projects: {
      p1: { assigneeId: 'u1', name: 'Project Alpha' }
      // Bob has no project
    }
  };

  const pattern = `{
    users.$userId.contact:[$userName _ _ $userPhone]
    users.$userId.managerId:$managerId
    managers.$managerId.phone:$managerPhone
    projects.$projectId.assigneeId:$userId
    projects.$projectId.name:$projectName
  }`;

  const result = Tendril(pattern).match(data).solutions().toArray();

  assert.equal(result.length, 1, 'Only Alice has a project');
  assert.equal(result[0].userName, 'Alice');
});

test('relational query - user without manager is excluded', () => {
  const data = {
    users: {
      u1: {
        contact: ['Alice', 'alice@example.com', '555-1234', '555-1111'],
        managerId: 'm1'
      },
      u2: {
        contact: ['Bob', 'bob@example.com', '555-5678', '555-2222']
        // Bob has no managerId
      }
    },
    managers: {
      m1: { phone: '555-BOSS' }
    },
    projects: {
      p1: { assigneeId: 'u1', name: 'Project Alpha' },
      p2: { assigneeId: 'u2', name: 'Project Beta' }
    }
  };

  const pattern = `{
    users.$userId.contact:[$userName _ _ $userPhone]
    users.$userId.managerId:$managerId
    managers.$managerId.phone:$managerPhone
    projects.$projectId.assigneeId:$userId
    projects.$projectId.name:$projectName
  }`;

  const result = Tendril(pattern).match(data).solutions().toArray();

  assert.equal(result.length, 1, 'Only Alice has a manager');
  assert.equal(result[0].userName, 'Alice');
});

test('relational query - manager without phone is excluded', () => {
  const data = {
    users: {
      u1: {
        contact: ['Alice', 'alice@example.com', '555-1234', '555-1111'],
        managerId: 'm1'
      },
      u2: {
        contact: ['Bob', 'bob@example.com', '555-5678', '555-2222'],
        managerId: 'm2'
      }
    },
    managers: {
      m1: { phone: '555-BOSS' },
      m2: { email: 'boss2@example.com' }  // No phone
    },
    projects: {
      p1: { assigneeId: 'u1', name: 'Project Alpha' },
      p2: { assigneeId: 'u2', name: 'Project Beta' }
    }
  };

  const pattern = `{
    users.$userId.contact:[$userName _ _ $userPhone]
    users.$userId.managerId:$managerId
    managers.$managerId.phone:$managerPhone
    projects.$projectId.assigneeId:$userId
    projects.$projectId.name:$projectName
  }`;

  const result = Tendril(pattern).match(data).solutions().toArray();

  assert.equal(result.length, 1, 'Only Alice has a manager with a phone');
  assert.equal(result[0].userName, 'Alice');
});

test('relational query - combinatorial explosion (multiple users × multiple projects)', () => {
  const data = {
    users: {
      u1: {
        contact: ['Alice', 'alice@example.com', '555-1234', '555-1111'],
        managerId: 'm1'
      },
      u2: {
        contact: ['Bob', 'bob@example.com', '555-5678', '555-2222'],
        managerId: 'm1'
      }
    },
    managers: {
      m1: { phone: '555-BOSS' }
    },
    projects: {
      p1: { assigneeId: 'u1', name: 'Alpha' },
      p2: { assigneeId: 'u1', name: 'Beta' },
      p3: { assigneeId: 'u2', name: 'Gamma' },
      p4: { assigneeId: 'u2', name: 'Delta' }
    }
  };

  const pattern = `{
    users.$userId.contact:[$userName _ _ $userPhone]
    users.$userId.managerId:$managerId
    managers.$managerId.phone:$managerPhone
    projects.$projectId.assigneeId:$userId
    projects.$projectId.name:$projectName
  }`;

  const result = Tendril(pattern).match(data).solutions().toArray();

  assert.equal(result.length, 4, 'Should find 4 solutions (2 users × 2 projects each)');

  const solutions = result.map(s => s.toObject());

  // Alice has 2 projects, Bob has 2 projects
  const aliceSolutions = solutions.filter(s => s.userName === 'Alice');
  const bobSolutions = solutions.filter(s => s.userName === 'Bob');

  assert.equal(aliceSolutions.length, 2);
  assert.equal(bobSolutions.length, 2);

  const aliceProjects = aliceSolutions.map(s => s.projectName).sort();
  const bobProjects = bobSolutions.map(s => s.projectName).sort();

  assert.deepEqual(aliceProjects, ['Alpha', 'Beta']);
  assert.deepEqual(bobProjects, ['Delta', 'Gamma']);
});

test('relational query - no solutions when constraints cannot be satisfied', () => {
  const data = {
    users: {
      u1: {
        contact: ['Alice', 'alice@example.com', '555-1234', '555-1111'],
        managerId: 'm1'
      }
    },
    managers: {
      m2: { phone: '555-BOSS' }  // Different manager ID than user references
    },
    projects: {
      p1: { assigneeId: 'u1', name: 'Project Alpha' }
    }
  };

  const pattern = `{
    users.$userId.contact:[$userName _ _ $userPhone]
    users.$userId.managerId:$managerId
    managers.$managerId.phone:$managerPhone
    projects.$projectId.assigneeId:$userId
    projects.$projectId.name:$projectName
  }`;

  const result = Tendril(pattern).match(data).solutions().toArray();

  assert.equal(result.length, 0, 'No solutions because manager m1 does not exist');
});

console.log('\n✓ All relational query tests defined\n');
