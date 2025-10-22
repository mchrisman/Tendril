/**
 * Unit tests for occurrences() scan mode
 *
 * Run with: node test/occurrences.test.cjs
 */

const { test, group, assert, run, setSourceFile } = require('./framework.cjs');

// Import the V5 API (ESM, so we need dynamic import)
let Tendril;

async function loadAPI() {
  const api = await import('../src/tendril-api.js');
  Tendril = api.Tendril;
}

setSourceFile('occurrences.test.cjs');

group('occurrences() - find all matches at any depth', () => {
  test('find scalar at multiple depths', async () => {
    await loadAPI();
    const data = {
      a: 42,
      b: {
        c: 42,
        d: {
          e: 42
        }
      }
    };

    const t = Tendril('42');
    const sols = t.occurrences(data).toArray();
    assert.equal(sols.length, 3, 'Should find 3 occurrences');
  });

  test('find patterns in nested structures', async () => {
    await loadAPI();
    const data = {
      items: [
        {id: 1, tag: 'foo'},
        {id: 2, tag: 'bar'}
      ]
    };

    const t = Tendril('{tag="foo"}');
    const sols = t.occurrences(data).toArray();
    assert.equal(sols.length, 1, 'Should find nested object');
    assert.equal(sols[0].bindings['0'].tag, 'foo');
  });

  test('find all matching objects', async () => {
    await loadAPI();
    const data = [
      {type: 'user', name: 'Alice'},
      {type: 'admin', name: 'Bob'},
      {type: 'user', name: 'Charlie'}
    ];

    const t = Tendril('{type="user" name=$n}');
    const sols = t.occurrences(data).toArray();
    assert.equal(sols.length, 2, 'Should find 2 users');
  });

  test('occurrences vs solutions - different results', async () => {
    await loadAPI();
    const data = [1, 2, 3];

    const t = Tendril('$x');
    const solCount = t.solutions(data).count();
    const occCount = t.occurrences(data).count();

    // solutions: matches root (the array [1,2,3])
    // occurrences: matches root + each element (1, 2, 3)
    assert.equal(solCount, 1, 'Solutions finds root only');
    assert.equal(occCount, 4, 'Occurrences finds root + 3 elements');
  });
});

// Run all tests
run();
