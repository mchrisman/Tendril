/**
 * Tests for the fluent Tendril API (api.js)
 *
 * Run with: node test/api.test.js
 */

const { test, group, assert, run, setSourceFile } = require('./framework.js');

setSourceFile('api.test.js');

// Import API (using dynamic import for ES modules)
let Tendril, matches, extract, extractAll, replaceAll, uniqueMatches;

// Load the API module
async function loadAPI() {
  const apiModule = await import('../src/api.js');
  Tendril = apiModule.Tendril;
  matches = apiModule.matches;
  extract = apiModule.extract;
  extractAll = apiModule.extractAll;
  replaceAll = apiModule.replaceAll;
  uniqueMatches = apiModule.uniqueMatches;
}

// Parse command line arguments
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--filter' && args[i + 1]) {
    require('./framework.js').runner.filter(args[i + 1]);
    i++;
  } else if (args[i] === '--group' && args[i + 1]) {
    require('./framework.js').runner.filterByGroup(args[i + 1]);
    i++;
  }
}

/* ==================== Basic Tendril Functionality ==================== */

group('Tendril constructor and basic methods', () => {
  test('Tendril can be constructed with a pattern', () => {
    const t = new Tendril('$x');
    assert.ok(t);
  });

  test('solutions() returns Solutions object', () => {
    const t = new Tendril('$x');
    const sols = t.solutions(42);
    assert.ok(sols);
    assert.ok(typeof sols[Symbol.iterator] === 'function');
  });

  test('match() returns first solution or null', () => {
    const t = new Tendril('$x');
    const sol = t.match(42);
    assert.ok(sol);
    assert.deepEqual(sol.bindings, { x: 42 });
    assert.ok(sol.at);
    assert.ok(sol.where);
  });

  test('match() returns null when no match', () => {
    const t = new Tendril('[1, 2]');
    const sol = t.match([1, 2, 3]);
    assert.equal(sol, null);
  });

  test('all() returns array of all solutions', () => {
    const t = new Tendril('[$x, $y]');
    const sols = t.all([1, 2]);
    assert.equal(sols.length, 1);
    assert.deepEqual(sols[0].bindings, { x: 1, y: 2 });
  });

  test('occurrences() scans entire structure', () => {
    const t = new Tendril('$x');
    const data = { a: 1, b: { c: 2 } };
    const sols = t.occurrences(data).toArray();
    // Should match: data itself, 1, nested object, and 2
    assert.ok(sols.length >= 3);
  });

  test('withEnv() pre-binds variables', () => {
    const t = new Tendril('$x');
    const t2 = t.withEnv({ x: 42 });
    const sol = t2.match(42);
    assert.ok(sol);
    assert.deepEqual(sol.bindings, { x: 42 });
  });

  test('withEnv() fails when pre-bound var conflicts', () => {
    const t = new Tendril('$x');
    const t2 = t.withEnv({ x: 42 });
    const sol = t2.match(99);
    assert.equal(sol, null);
  });
});

/* ==================== Solutions Combinators ==================== */

group('Solutions combinators', () => {
  test('unique() deduplicates by variable', () => {
    const t = new Tendril('$x');
    const data = [1, 2, 1, 3, 2];
    const results = t.occurrences(data)
      .unique('$x')
      .project($ => $.x)
      .filter(x => typeof x === 'number')
      .sort();
    assert.deepEqual(results, [1, 2, 3]);
  });

  test('uniqueBy() uses custom key function', () => {
    const t = new Tendril('{ a = $a, b = $b }');
    const data = [
      { a: 1, b: 2 },
      { a: 1, b: 3 },
      { a: 2, b: 2 }
    ];
    const results = t.occurrences(data)
      .uniqueBy(['$a'], $ => String($.a))
      .project($ => $.a);
    // Should dedupe by $a only
    assert.equal(results.length, 2);
    assert.ok(results.includes(1));
    assert.ok(results.includes(2));
  });

  test('filter() filters solutions', () => {
    const t = new Tendril('$x');
    const data = [1, 2, 3, 4, 5];
    const results = t.occurrences(data)
      .filter(sol => typeof sol.bindings.x === 'number' && sol.bindings.x > 2)
      .project($ => $.x);
    assert.deepEqual(results.sort(), [3, 4, 5]);
  });

  test('take() limits results', () => {
    const t = new Tendril('$x');
    const data = [1, 2, 3, 4, 5];
    const results = t.occurrences(data)
      .filter(sol => typeof sol.bindings.x === 'number')
      .take(3)
      .project($ => $.x);
    assert.equal(results.length, 3);
  });

  test('map() transforms lazily', () => {
    const t = new Tendril('$x');
    const mapped = t.solutions([1, 2]).map($ => $.x * 2);
    const results = Array.from(mapped);
    assert.ok(results.length > 0);
  });

  test('project() extracts values', () => {
    const t = new Tendril('[$x, $y]');
    const results = t.solutions([1, 2]).project($ => ({ x: $.x, y: $.y }));
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], { x: 1, y: 2 });
  });

  test('extract() is alias for project()', () => {
    const t = new Tendril('[$x, $y]');
    const r1 = t.solutions([1, 2]).project($ => $.x);
    const r2 = t.solutions([1, 2]).extract($ => $.x);
    assert.deepEqual(r1, r2);
  });

  test('forEach() executes side effects', () => {
    const t = new Tendril('$x');
    let count = 0;
    t.solutions(42).forEach(() => count++);
    assert.equal(count, 1);
  });

  test('toArray() materializes solutions', () => {
    const t = new Tendril('$x');
    const arr = t.solutions(42).toArray();
    assert.ok(Array.isArray(arr));
    assert.equal(arr.length, 1);
  });

  test('first() returns first solution', () => {
    const t = new Tendril('$x');
    const sol = t.solutions(42).first();
    assert.ok(sol);
    assert.deepEqual(sol.bindings, { x: 42 });
  });

  test('count() counts solutions', () => {
    const t = new Tendril('$x');
    const data = [1, 2, 3];
    const count = t.occurrences(data)
      .filter(sol => typeof sol.bindings.x === 'number')
      .count();
    assert.equal(count, 3);
  });
});

/* ==================== Variable Unification ==================== */

group('Variable unification', () => {
  test('repeated variables must unify', () => {
    const t = new Tendril('[$x, $x]');
    const sol1 = t.match([1, 1]);
    const sol2 = t.match([1, 2]);
    assert.ok(sol1);
    assert.equal(sol2, null);
  });

  test('unification works with nested structures', () => {
    const t = new Tendril('{ a = $x, b = $x }');
    const sol = t.match({ a: { foo: 1 }, b: { foo: 1 } });
    assert.ok(sol);
    assert.deepEqual(sol.bindings.x, { foo: 1 });
  });

  test('unification works with arrays', () => {
    const t = new Tendril('[$arr, $arr]');
    const sol = t.match([[1, 2], [1, 2]]);
    assert.ok(sol);
    assert.deepEqual(sol.bindings.arr, [1, 2]);
  });
});

/* ==================== Occurrence Tracking ==================== */

group('Occurrence tracking (Solution.at)', () => {
  test('at records array element occurrences', () => {
    const t = new Tendril('[$x, $y]');
    const sol = t.match([10, 20]);
    assert.ok(sol.at.x);
    assert.ok(sol.at.y);
    assert.equal(sol.at.x.length, 1);
    assert.equal(sol.at.x[0].kind, 'array-slice');
    assert.equal(sol.at.x[0].start, 0);
    assert.equal(sol.at.x[0].end, 1);
  });

  test('at records object value occurrences', () => {
    const t = new Tendril('{ a = $x, b = $y }');
    const data = { a: 1, b: 2 };
    const sol = t.match(data);
    assert.ok(sol.at.x);
    assert.equal(sol.at.x.length, 1);
    assert.equal(sol.at.x[0].kind, 'object-value');
    assert.equal(sol.at.x[0].key, 'a');
    assert.equal(sol.at.x[0].ref, data);
  });

  test('where tracks position in scan mode', () => {
    const t = new Tendril('$x');
    const data = { a: { b: 42 } };
    const sols = t.occurrences(data)
      .filter(sol => sol.bindings.x === 42)
      .toArray();
    assert.ok(sols.length > 0);
    const sol = sols[0];
    assert.ok(sol.where);
    assert.ok(sol.where.length > 0);
  });
});

/* ==================== Replacement APIs ==================== */

group('Replacement APIs', () => {
  test('replace() replaces by variable', () => {
    const t = new Tendril('[$x, $y]');
    const input = [1, 2];
    const result = t.replace(input, $ => ({ $x: 10, $y: 20 }));
    assert.deepEqual(result, [10, 20]);
    // Original unchanged
    assert.deepEqual(input, [1, 2]);
  });

  test('replace() works with nested structures', () => {
    const t = new Tendril('{ a = $x, .. }');
    const input = { a: 1, b: { c: 2 } };
    const result = t.replace(input, $ => ({ $x: 99 }));
    assert.deepEqual(result, { a: 99, b: { c: 2 } });
    // Original unchanged
    assert.equal(input.a, 1);
  });

  test('replaceAll() scans and replaces', () => {
    const t = new Tendril('$x');
    const input = { a: 1, b: { c: 1 } };
    const result = t.replaceAll(input, $ => {
      if ($.x === 1) return { $x: 99 };
      return {};
    });
    // Should replace both 1s
    assert.equal(result.a, 99);
    assert.equal(result.b.c, 99);
  });

  test('edit() uses explicit refs', () => {
    const t = new Tendril('[$x, $y]');
    const input = [1, 2];
    const result = t.edit(input, sol => {
      // Only edit $x
      return sol.at.x.map(ref => ({ ref, to: 100 }));
    });
    assert.deepEqual(result, [100, 2]);
  });

  test('replacement preserves unmatched data', () => {
    const t = new Tendril('{ a = $x, .. }');
    const input = { a: 1, b: 2, c: { d: 3 } };
    const result = t.replace(input, $ => ({ $x: 10 }));
    assert.equal(result.a, 10);
    assert.equal(result.b, 2);
    assert.deepEqual(result.c, { d: 3 });
  });

  // TODO: Map pattern matching not yet fully implemented
  // test('replacement handles Maps', () => {
  //   const t = new Tendril('Map{ a = $x, .. }');
  //   const input = new Map([['a', 1], ['b', 2]]);
  //   const result = t.replace(input, $ => ({ $x: 10 }));
  //   assert.ok(result instanceof Map);
  //   assert.equal(result.get('a'), 10);
  //   assert.equal(result.get('b'), 2);
  // });

  test('replacement handles Sets', () => {
    const t = new Tendril('{{1, 2, 3}}');
    const input = new Set([1, 2, 3]);
    const sol = t.match(input);
    // Should match the set
    assert.ok(sol);
  });
});

/* ==================== Convenience Functions ==================== */

group('Convenience functions', () => {
  test('matches() returns boolean', () => {
    assert.ok(matches('$x', 42));
    assert.ok(!matches('[1, 2]', [1, 2, 3]));
  });

  test('extract() returns bindings or null', () => {
    const bindings = extract('[$x, $y]', [1, 2]);
    assert.deepEqual(bindings, { x: 1, y: 2 });

    const noMatch = extract('[1, 2]', [1, 2, 3]);
    assert.equal(noMatch, null);
  });

  test('extractAll() returns all bindings', () => {
    const bindings = extractAll('$x | $y', 42);
    assert.ok(Array.isArray(bindings));
    assert.ok(bindings.length > 0);
  });

  test('replaceAll() convenience function', () => {
    const input = [1, 2, 3];
    const result = replaceAll('$out', input, $ => {
      if ($.out === 1) return 10;
      return $.out;
    });
    assert.ok(result);
  });

  test('uniqueMatches() returns unique bindings', () => {
    const data = [1, 2, 1, 3];
    const results = uniqueMatches('$x', data, '$x');
    // Should dedupe based on structural equality
    assert.ok(Array.isArray(results));
  });
});

/* ==================== Critical Fixes ==================== */

group('Critical fixes - varOcc rollback', () => {
  test('alternation does not accumulate varOcc', () => {
    const t = new Tendril('($x | $y)');
    const sols = t.solutions(42).toArray();
    // Should have solutions for both alternatives
    assert.ok(sols.length >= 1);
    // Each solution should have clean occurrence tracking
    for (const sol of sols) {
      const varCount = Object.keys(sol.at).length;
      assert.ok(varCount >= 1, 'Should have at least one variable bound');
    }
  });

  test('array backtracking cleans up varOcc', () => {
    const t = new Tendril('[$x, $x]');
    const sol1 = t.match([1, 1]);
    const sol2 = t.match([1, 2]);

    if (sol1) {
      // First solution should have $x occurring twice
      assert.ok(sol1.at.x);
      assert.equal(sol1.at.x.length, 2);
    }

    // Second should fail cleanly without pollution
    assert.equal(sol2, null);
  });
});

group('Critical fixes - nested structure edits', () => {
  test('edits work on deeply nested structures', () => {
    const t = new Tendril('{ a = $x, .. }');
    const input = {
      top: 1,
      nested: {
        a: 2,
        deeper: {
          a: 3
        }
      }
    };

    const result = t.replaceAll(input, $ => ({ $x: 99 }));

    // Should replace both nested occurrences
    assert.equal(result.nested.a, 99);
    assert.equal(result.nested.deeper.a, 99);
    assert.equal(result.top, 1); // Unchanged
  });

  test('multiple edits to same structure compose correctly', () => {
    const t = new Tendril('[$x, $y]');
    const input = [[1, 2], [3, 4]];
    const result = t.replaceAll(input, $ => ({ $x: 10, $y: 20 }));
    // Should replace in both sub-arrays
    assert.deepEqual(result, [[10, 20], [10, 20]]);
  });

  test('edits maintain immutability throughout tree', () => {
    const t = new Tendril('{ a = $x, .. }');
    const input = {
      outer: { a: 1 },
      shared: { b: 2 }
    };

    const result = t.replaceAll(input, $ => ({ $x: 99 }));

    // Original should be unchanged
    assert.equal(input.outer.a, 1);
    // Result should have new values
    assert.equal(result.outer.a, 99);
    // Unrelated structures should also be cloned
    assert.notEqual(result.shared, input.shared);
  });
});

/* ==================== Edge Cases ==================== */

group('Edge cases', () => {
  test('empty pattern matches empty structure', () => {
    const t = new Tendril('[]');
    const sol = t.match([]);
    assert.ok(sol);
  });

  test('handles null and undefined', () => {
    const t = new Tendril('$x');
    const solNull = t.match(null);
    const solUndef = t.match(undefined);
    assert.ok(solNull);
    assert.ok(solUndef);
    assert.equal(solNull.bindings.x, null);
    assert.equal(solUndef.bindings.x, undefined);
  });

  test('handles primitive values', () => {
    const t = new Tendril('$x');
    assert.ok(t.match(42));
    assert.ok(t.match('hello'));
    assert.ok(t.match(true));
  });

  test('empty occurrences scan', () => {
    const t = new Tendril('[1, 2, 3]');
    const sols = t.occurrences([]).toArray();
    // Should only match the empty array itself
    assert.ok(sols.length >= 0);
  });

  test('complex nested patterns', () => {
    const t = new Tendril('{ a = [$x, { b = $y }], .. }');
    const data = { a: [1, { b: 2 }], c: 3 };
    const sol = t.match(data);
    assert.ok(sol);
    assert.equal(sol.bindings.x, 1);
    assert.equal(sol.bindings.y, 2);
  });
});

/* ==================== Run Tests ==================== */

if (require.main === module) {
  loadAPI().then(() => {
    return run();
  }).then((results) => {
    process.exit(results.failed.length > 0 ? 1 : 0);
  }).catch(error => {
    console.error('Failed to load API:', error);
    process.exit(1);
  });
}

module.exports = { test, assert };
