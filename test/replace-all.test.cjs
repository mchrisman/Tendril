/**
 * Unit tests for replaceAll() - replace all occurrences
 *
 * Run with: node test/replace-all.test.cjs
 */

const { test, group, assert, run, setSourceFile } = require('./framework.cjs');

// Import the V5 API (ESM, so we need dynamic import)
let Tendril, Slice;

async function loadAPI() {
  const api = await import('../src/tendril-api.js');
  Tendril = api.Tendril;
  Slice = api.Slice;
}

setSourceFile('replace-all.test.cjs');

group('replaceAll() - replace all occurrences', () => {
  test('replace all scalar values in array', async () => {
    await loadAPI();
    const data = [1, 2, 1, 3];

    const t = Tendril('1');
    const result = t.replaceAll(data, ($) => ({0: 99}));
    assert.deepEqual(result, [99, 2, 99, 3]);
  });

  test('replace all matching objects', async () => {
    await loadAPI();
    const data = [
      {type: 'A', val: 1},
      {type: 'B', val: 2},
      {type: 'A', val: 3}
    ];

    const t = Tendril('{type:"A"}');
    const result = t.replaceAll(data, ($) => ({0: {type: 'A', val: 0}}));

    assert.equal(result[0].val, 0);
    assert.equal(result[1].val, 2);
    assert.equal(result[2].val, 0);
  });
});

// Run all tests
run();
