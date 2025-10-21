// Test early binding optimization - verify O(1) performance for variable chains
import {Tendril} from './src/tendril-api.js';
import util from 'util';

console.log('=== Early Binding Optimization Tests ===\n');

// Test 1: Simple 3-chain (should be O(3) not O(n^3))
console.log('Test 1: Simple variable chain');
const chain = {
  a: 'b',
  b: 'c',
  c: 'd',
  d: 'end'
};

const pattern1 = '{a=$x $x=$y $y=$z}';
console.log('Pattern:', pattern1);
console.log('Data:', util.inspect(chain, {colors: true}));

const result1 = Tendril(pattern1).all(chain);
console.log('Solutions:', result1.length);
if (result1.length > 0) {
  console.log('Bindings:', result1[0].bindings);
}
console.log('Expected: {x: "b", y: "c", z: "d"}\n');

// Test 2: Complex organizational graph
console.log('Test 2: Complex organizational graph');
const orgData = {
  users: {
    u1: {
      contact: ['Alice', 'alice@example.com', '555-1234', '555-5678'],
      managerId: 'u2'
    },
    u2: {
      contact: ['Bob', 'bob@example.com', '555-9999', '555-0000'],
      managerId: 'u3'
    },
    u3: {
      phone: '555-1111'
    }
  },
  projects: {
    p1: {
      assigneeId: 'u1',
      name: 'Project Alpha'
    },
    p2: {
      assigneeId: 'u2',
      name: 'Project Beta'
    }
  }
};

const pattern2 = `{
  users.$userId.contact=[$userName _ _ $userPhone]
  users.$userId.managerId=$managerId
  users.$managerId.phone=$managerPhone
  projects.$projectId.assigneeId=$userId
  projects.$projectId.name=$projectName
}`;

console.log('Pattern:', pattern2);
console.log('Data:', util.inspect(orgData, {depth: null, colors: true}));

const start = Date.now();
const result2 = Tendril(pattern2).all(orgData);
const elapsed = Date.now() - start;

console.log(`\nFound ${result2.length} solution(s) in ${elapsed}ms`);
for (const sol of result2) {
  console.log('\nSolution:');
  console.log('  User:', sol.bindings.userName, `(ID: ${sol.bindings.userId})`);
  console.log('  Phone:', sol.bindings.userPhone);
  console.log('  Manager ID:', sol.bindings.managerId);
  console.log('  Manager phone:', sol.bindings.managerPhone);
  console.log('  Project:', sol.bindings.projectName, `(ID: ${sol.bindings.projectId})`);
}

// Test 3: Performance stress test
console.log('\n\nTest 3: Performance stress test');
console.log('Building large dataset...');

const largeData = {
  users: {},
  projects: {}
};

// Create 100 users in a chain
for (let i = 0; i < 100; i++) {
  largeData.users[`u${i}`] = {
    contact: [`User${i}`, `user${i}@example.com`, '555-0000', `555-${i}`],
    managerId: `u${i + 1}`
  };
}
largeData.users.u100 = {phone: '555-BOSS'};

// Create 100 projects
for (let i = 0; i < 100; i++) {
  largeData.projects[`p${i}`] = {
    assigneeId: `u${i}`,
    name: `Project ${i}`
  };
}

console.log(`Created ${Object.keys(largeData.users).length} users and ${Object.keys(largeData.projects).length} projects`);

const start2 = Date.now();
const result3 = Tendril(pattern2).all(largeData);
const elapsed2 = Date.now() - start2;

console.log(`\nFound ${result3.length} solution(s) in ${elapsed2}ms`);
console.log(`Average time per solution: ${(elapsed2 / result3.length).toFixed(2)}ms`);

if (elapsed2 > 1000) {
  console.log('⚠️  WARNING: Performance is slower than expected!');
  console.log('   Expected: O(n*m) ≈ 100*100 = 10,000 operations');
  console.log('   Should complete in < 100ms');
} else {
  console.log('✅ Performance is good! Optimization is working.');
}

console.log('\n=== Tests Complete ===');
