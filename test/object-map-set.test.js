/**
 * Tests for Object/Map/Set distinction
 * Verifies that:
 * - { k=v } matches ONLY plain objects (not Maps)
 * - { k=v } as Map matches ONLY Maps (not plain objects)
 * - {{ k v }} matches ONLY Sets
 */

const { test, skip, assert, run, runner, group, setSourceFile } = require('./framework.js');

setSourceFile('object-map-set.test.js');

// Import Pattern (using dynamic import for ES modules)
let Pattern;

// Load the modules
async function loadModules() {
  const module = await import('../src/objects-sets-paths-replace.js');
  Pattern = module.Pattern;
}

// Test data
const plainObj = { a: 1, b: 2 };
const mapObj = new Map([['a', 1], ['b', 2]]);
const setObj = new Set(['a', 'b']);

group('Object pattern (no type guard)', () => {
  test('matches plain object', async () => {
    const p = new Pattern('{ a=_ b=_ }');
    assert.ok(p.matches(plainObj));
  }, { group: 'object-map-set' });

  test('rejects Map', async () => {
    const p = new Pattern('{ a=_ b=_ }');
    assert.notOk(p.matches(mapObj));
  }, { group: 'object-map-set' });

  test('rejects Set', async () => {
    const p = new Pattern('{ a=_ b=_ }');
    assert.notOk(p.matches(setObj));
  }, { group: 'object-map-set' });
});

group('Map pattern (as Map)', () => {
  test('matches Map', async () => {
    const p = new Pattern('{ a=_ b=_ } as Map');
    assert.ok(p.matches(mapObj));
  }, { group: 'object-map-set' });

  test('rejects plain object', async () => {
    const p = new Pattern('{ a=_ b=_ } as Map');
    assert.notOk(p.matches(plainObj));
  }, { group: 'object-map-set' });

  test('rejects Set', async () => {
    const p = new Pattern('{ a=_ b=_ } as Map');
    assert.notOk(p.matches(setObj));
  }, { group: 'object-map-set' });
});

group('Set pattern ({{ }})', () => {
  test('matches Set', async () => {
    const p = new Pattern('{{ a b }}');
    assert.ok(p.matches(setObj));
  }, { group: 'object-map-set' });

  test('rejects plain object', async () => {
    const p = new Pattern('{{ a b }}');
    assert.notOk(p.matches(plainObj));
  }, { group: 'object-map-set' });

  test('rejects Map', async () => {
    const p = new Pattern('{{ a b }}');
    assert.notOk(p.matches(mapObj));
  }, { group: 'object-map-set' });
});

group('Wildcard spread', () => {
  test('Object with spread matches object with extra keys', async () => {
    const p = new Pattern('{ a=_ .. }');
    assert.ok(p.matches({ a: 1, b: 2, c: 3 }));
  }, { group: 'object-map-set' });

  test('Map with spread matches Map with extra keys', async () => {
    const p = new Pattern('{ a=_ .. } as Map');
    const m = new Map([['a', 1], ['b', 2], ['c', 3]]);
    assert.ok(p.matches(m));
  }, { group: 'object-map-set' });

  test('Set with spread matches Set with extra members', async () => {
    const p = new Pattern('{{ a .. }}');
    assert.ok(p.matches(new Set(['a', 'b', 'c'])));
  }, { group: 'object-map-set' });
});

group('Variable binding', () => {
  test('Object pattern binds values', async () => {
    const p = new Pattern('{ a=$x b=$y }');
    const matches = [...p.find(plainObj)];
    assert.equal(matches.length, 1);
    assert.equal(matches[0].scope.x, 1);
    assert.equal(matches[0].scope.y, 2);
  }, { group: 'object-map-set' });

  test('Map pattern binds values', async () => {
    const p = new Pattern('{ a=$x b=$y } as Map');
    const matches = [...p.find(mapObj)];
    assert.equal(matches.length, 1);
    assert.equal(matches[0].scope.x, 1);
    assert.equal(matches[0].scope.y, 2);
  }, { group: 'object-map-set' });

  test('Set pattern binds elements', async () => {
    const p = new Pattern('{{ $x $y }}');
    const matches = [...p.find(setObj)];
    // Sets are unordered, so we should get multiple solutions for different orderings
    assert.ok(matches.length >= 1);
    // Verify that both variables are bound to set members
    const scope = matches[0].scope;
    assert.ok(setObj.has(scope.x));
    assert.ok(setObj.has(scope.y));
  }, { group: 'object-map-set' });
});

group('Error cases', () => {
  test('as Set on {{ }} should error', async () => {
    assert.throws(() => {
      new Pattern('{{ a b }} as Set');
    }, /unexpected|syntax|not allowed/i);
  }, { group: 'object-map-set' });

  test('as Set on { } should error', async () => {
    assert.throws(() => {
      new Pattern('{ a=_ } as Set');
    }, /unexpected|syntax|not allowed/i);
  }, { group: 'object-map-set' });
});

// Run tests if this is the main module
if (require.main === module) {
  loadModules().then(() => {
    return run();
  }).then((results) => {
    process.exit(results.failed.length > 0 ? 1 : 0);
  }).catch(error => {
    console.error('Failed to load modules:', error);
    process.exit(1);
  });
}
