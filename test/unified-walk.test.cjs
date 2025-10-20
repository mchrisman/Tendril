/**
 * Unit tests for unified walk implementation
 *
 * Run with: node test/unified-walk.test.js
 */

const { test, group, assert, run, setSourceFile } = require('./framework.cjs');

// Import the V5 API (ESM, so we need dynamic import)
let Tendril, extract, extractAll, matches;

async function loadAPI() {
  const api = await import('../src/tendril-api.js');
  Tendril = api.Tendril;
  extract = api.extract;
  extractAll = api.extractAll;
  matches = api.matches;
}

setSourceFile('unified-walk.test.js');

group('extract() - basic matching', () => {
  test('extract scalar at root', async () => {
    await loadAPI();
    const result = extract('=$x', 42);
    assert.deepEqual(result, {x: 42});
  });

  test('extract scalar in object', async () => {
    await loadAPI();
    const result = extract('b=$x', {a: 1, b: 2});
    assert.deepEqual(result, {x: 2});
  });

  test('extract multiple scalars', async () => {
    await loadAPI();
    const result = extract('a=$x b=$y', {a: 1, b: 2});
    assert.deepEqual(result, {x: 1, y: 2});
  });

  test('extract with breadcrumbs', async () => {
    await loadAPI();
    const result = extract('a.b=$x c[2]=$y', {a: {b: 1}, c: [1, 2, 3]});
    assert.deepEqual(result, {x: 1, y: 3});
  });

  test('returns null when no match', async () => {
    await loadAPI();
    const result = extract('c=$x', {a: 1, b: 2});
    assert.equal(result, null);
  });
});

group('Tendril class - solutions', () => {
  test('solutions returns iterable', async () => {
    await loadAPI();
    const t = Tendril('=$x');
    const sols = t.solutions(42);
    const first = sols.first();
    assert.ok(first);
    assert.deepEqual(first.bindings, {x: 42});
  });

  test('solutions tracks binding sites', async () => {
    await loadAPI();
    const t = Tendril('=$x');
    const sol = t.match(42);
    assert.ok(sol.at);
    assert.ok(sol.at.x);
    assert.ok(Array.isArray(sol.at.x));
  });

  test('all() returns array of solutions', async () => {
    await loadAPI();
    const t = Tendril('.a=$x');
    const sols = t.all({a: 1});
    assert.equal(sols.length, 1);
    assert.deepEqual(sols[0].bindings, {x: 1});
  });
});

group('Tendril.replace() - scalar replacement', () => {
  test('replace scalar at root', async () => {
    await loadAPI();
    const t = Tendril('=$x');
    const result = t.replace(42, () => ({x: 99}));
    assert.equal(result, 99);
  });

  test('replace scalar in object', async () => {
    await loadAPI();
    const t = Tendril('b=$x');
    const result = t.replace({a: 1, b: 2}, () => ({x: 99}));
    assert.deepEqual(result, {a: 1, b: 99});
  });

  test('swap values using function', async () => {
    await loadAPI();
    const t = Tendril('x=$a y=$b');
    const result = t.replace({x: 3, y: 4}, (v) => ({a: v.b, b: v.a}));
    assert.deepEqual(result, {x: 4, y: 3});
  });
});

group('extractAll() - multiple solutions', () => {
  test('extract all matches', async () => {
    await loadAPI();
    const results = extractAll('a=$x', {a: 1});
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {x: 1});
  });
});

group('matches() - boolean test', () => {
  test('returns true for match', async () => {
    await loadAPI();
    assert.ok(matches('=$x', 42));
  });

  test('returns false for no match', async () => {
    await loadAPI();
    assert.ok(!matches('c=$x', {a: 1}));
  });
});

// Run all tests
run();
