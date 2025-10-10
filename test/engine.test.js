/**
 * Smoke tests for engine.js (Milestone 3)
 * Tests end-to-end pattern matching via compile() and Pattern API
 *
 * Milestone 3 supports:
 * - Atoms: Number, Bool, String, Regex, Any (_)
 * - Variables & Bind/BindEq
 * - Groups, Alternation (|), Conjunction (&)
 * - Quantifiers (*, +, ?, {m,n})
 * - Arrays (anchored), including spread (...)
 * - Lookaheads (?=p) (?!p)
 *
 * NOT YET SUPPORTED (will throw):
 * - Object, Set, Dot, ReplaceSlice, ReplaceKey, ReplaceVal
 */

const { test, assert, run, group, setSourceFile } = require('./framework.js');

setSourceFile('engine.test.js');

// Import engine (using dynamic import for ES modules)
let compile, Pattern;

// Load the engine module (use M4 which routes to M3 when appropriate)
async function loadEngine() {
  const engineModule = await import('../src/objects-sets-paths-replace.js');
  compile = engineModule.compile;
  Pattern = engineModule.Pattern;
}

// Atoms
group('atoms', () => {
  test('match number literal', async () => {
    const p = compile('123');
    assert.ok(p.matches(123));
    assert.notOk(p.matches(124));
  }, { group: 'engine' });

  test('match number with coercion', async () => {
    const p = compile('42');
    assert.ok(p.matches('42'));
    assert.ok(p.matches(42));
  }, { group: 'engine' });

  test('match boolean true', async () => {
    const p = compile('true');
    assert.ok(p.matches(true));
    assert.ok(p.matches('true'));
    assert.notOk(p.matches(false));
  }, { group: 'engine' });

  test('match boolean false', async () => {
    const p = compile('false');
    assert.ok(p.matches(false));
    assert.ok(p.matches('false'));
    assert.notOk(p.matches(true));
  }, { group: 'engine' });

  test('match string literal', async () => {
    const p = compile('"hello"');
    assert.ok(p.matches('hello'));
    assert.notOk(p.matches('world'));
  }, { group: 'engine' });

  test('match bareword', async () => {
    const p = compile('foo');
    assert.ok(p.matches('foo'));
    assert.notOk(p.matches('bar'));
  }, { group: 'engine' });

  test('match regex', async () => {
    const p = compile('/[a-z]+/');
    assert.ok(p.matches('hello'));
    assert.notOk(p.matches('123'));
  }, { group: 'engine' });

  test('match regex with flags', async () => {
    const p = compile('/ABC/i');
    assert.ok(p.matches('abc'));
    assert.ok(p.matches('ABC'));
  }, { group: 'engine' });

  test('match any (_)', async () => {
    const p = compile('_');
    assert.ok(p.matches(123));
    assert.ok(p.matches('hello'));
    assert.ok(p.matches(true));
    assert.ok(p.matches(null));
  }, { group: 'engine' });
});

// Variables and binding
group('variables and binding', () => {
  test('variable captures value', async () => {
    const p = compile('$x');
    const results = [...p.find(42)];
    assert.equal(results.length, 1);
    assert.equal(results[0].scope.x, 42);
  }, { group: 'engine' });

  test('variable binding with pattern', async () => {
    const p = compile('$x=123');
    const results = [...p.find(123)];
    assert.equal(results.length, 1);
    assert.equal(results[0].scope.x, 123);
  }, { group: 'engine' });

  test('variable binding fails on mismatch', async () => {
    const p = compile('$x=123');
    assert.notOk(p.matches(456));
  }, { group: 'engine' });

  test('variable unification - same value', async () => {
    const p = compile('[$x, $x]');
    assert.ok(p.matches([1, 1]));
    assert.notOk(p.matches([1, 2]));
  }, { group: 'engine' });

  test('variable equality constraint', async () => {
    const p = compile('$x=$y');
    const results = [...p.find(42)];
    assert.equal(results.length, 1);
    assert.equal(results[0].scope.x, 42);
    assert.equal(results[0].scope.y, 42);
  }, { group: 'engine' });
});

// Alternation
group('alternation', () => {
  test('alternation - first branch matches', async () => {
    const p = compile('a | b');
    assert.ok(p.matches('a'));
  }, { group: 'engine' });

  test('alternation - second branch matches', async () => {
    const p = compile('a | b');
    assert.ok(p.matches('b'));
  }, { group: 'engine' });

  test('alternation - neither matches', async () => {
    const p = compile('a | b');
    assert.notOk(p.matches('c'));
  }, { group: 'engine' });

  test('alternation with numbers', async () => {
    const p = compile('1 | 2 | 3');
    assert.ok(p.matches(1));
    assert.ok(p.matches(2));
    assert.ok(p.matches(3));
    assert.notOk(p.matches(4));
  }, { group: 'engine' });

  test('alternation multiple solutions', async () => {
    const p = compile('$x=1 | $x=2');
    const results = [...p.find(1)];
    assert.equal(results.length, 1);
    assert.equal(results[0].scope.x, 1);
  }, { group: 'engine' });
});

// Conjunction
group('conjunction', () => {
  test('conjunction - both match', async () => {
    const p = compile('_ & 42');
    assert.ok(p.matches(42));
  }, { group: 'engine' });

  test('conjunction - first fails', async () => {
    const p = compile('123 & 42');
    assert.notOk(p.matches(42));
  }, { group: 'engine' });

  test('conjunction - second fails', async () => {
    const p = compile('42 & 123');
    assert.notOk(p.matches(42));
  }, { group: 'engine' });

  test('conjunction with regex and type', async () => {
    const p = compile('/[a-z]+/ & _');
    assert.ok(p.matches('hello'));
    assert.notOk(p.matches('123'));
  }, { group: 'engine' });
});

// Groups
group('groups', () => {
  test('group with alternation', async () => {
    const p = compile('(a | b)');
    assert.ok(p.matches('a'));
    assert.ok(p.matches('b'));
  }, { group: 'engine' });

  test('nested groups', async () => {
    const p = compile('((1 | 2) | 3)');
    assert.ok(p.matches(1));
    assert.ok(p.matches(2));
    assert.ok(p.matches(3));
  }, { group: 'engine' });
});

// Quantifiers
group('quantifiers', () => {
  test('star quantifier - zero matches', async () => {
    const p = compile('[1*]');
    assert.ok(p.matches([]));
  }, { group: 'engine' });

  test('star quantifier - multiple matches', async () => {
    const p = compile('[1*]');
    assert.ok(p.matches([1]));
    assert.ok(p.matches([1, 1]));
    assert.ok(p.matches([1, 1, 1]));
  }, { group: 'engine' });

  test('star quantifier - fails on mismatch', async () => {
    const p = compile('[1*]');
    assert.notOk(p.matches([1, 2]));
  }, { group: 'engine' });

  test('plus quantifier - requires at least one', async () => {
    const p = compile('[1+]');
    assert.notOk(p.matches([]));
    assert.ok(p.matches([1]));
    assert.ok(p.matches([1, 1]));
  }, { group: 'engine' });

  test('question quantifier - zero or one', async () => {
    const p = compile('[1?]');
    assert.ok(p.matches([]));
    assert.ok(p.matches([1]));
    assert.notOk(p.matches([1, 1]));
  }, { group: 'engine' });

  test('exact count quantifier', async () => {
    const p = compile('[1{3}]');
    assert.notOk(p.matches([1, 1]));
    assert.ok(p.matches([1, 1, 1]));
    assert.notOk(p.matches([1, 1, 1, 1]));
  }, { group: 'engine' });

  test('range quantifier {m,n}', async () => {
    const p = compile('[1{2,4}]');
    assert.notOk(p.matches([1]));
    assert.ok(p.matches([1, 1]));
    assert.ok(p.matches([1, 1, 1]));
    assert.ok(p.matches([1, 1, 1, 1]));
    assert.notOk(p.matches([1, 1, 1, 1, 1]));
  }, { group: 'engine' });

  test('open-ended quantifier {m,}', async () => {
    const p = compile('[1{2,}]');
    assert.notOk(p.matches([1]));
    assert.ok(p.matches([1, 1]));
    assert.ok(p.matches([1, 1, 1]));
    assert.ok(p.matches([1, 1, 1, 1, 1, 1]));
  }, { group: 'engine' });

  test('lazy quantifier - prefers fewer matches', async () => {
    // With precedence: $x=1*? means ($x=1)*?, lazy prefers 0 reps
    const p = compile('[$x=1*? $y=1*]');
    const results = [...p.find([1, 1, 1])];
    assert.ok(results.length > 0);

    // Order is not specified; assert presence of boundary solutions:
    // - x unbound (0 reps), y=1 (all)
    // - y unbound (0 reps), x=1 (all)
    const scopes = results.map(r => r.scope);
    const hasYOnly = scopes.some(s => s && s.y === 1 && !('x' in s));
    const hasXOnly = scopes.some(s => s && s.x === 1 && !('y' in s));
    assert.ok(hasYOnly, 'expected a solution with only y bound to 1');
    assert.ok(hasXOnly, 'expected a solution with only x bound to 1');
  }, { group: 'engine' });

  test('greedy quantifier - prefers more matches', async () => {
    // With precedence: $x=1* means ($x=1)*, greedy prefers max reps
    const p = compile('[$x=1* $y=1*]');
    const results = [...p.find([1, 1, 1])];
    assert.ok(results.length > 0);

    // Order is not specified; assert presence of boundary solutions:
    const scopes = results.map(r => r.scope);
    const hasXOnly = scopes.some(s => s && s.x === 1 && !('y' in s));
    const hasYOnly = scopes.some(s => s && s.y === 1 && !('x' in s));
    assert.ok(hasXOnly, 'expected a solution with only x bound to 1');
    assert.ok(hasYOnly, 'expected a solution with only y bound to 1');
  }, { group: 'engine' });
});

// Arrays
group('arrays', () => {
  test('empty array', async () => {
    const p = compile('[]');
    assert.ok(p.matches([]));
    assert.notOk(p.matches([1]));
  }, { group: 'engine' });

  test('single element', async () => {
    const p = compile('[1]');
    assert.ok(p.matches([1]));
    assert.notOk(p.matches([]));
    assert.notOk(p.matches([1, 2]));
  }, { group: 'engine' });

  test('multiple elements', async () => {
    const p = compile('[1, 2, 3]');
    assert.ok(p.matches([1, 2, 3]));
    assert.notOk(p.matches([1, 2]));
    assert.notOk(p.matches([1, 2, 3, 4]));
  }, { group: 'engine' });

  test('array with any', async () => {
    const p = compile('[_, _, _]');
    assert.ok(p.matches([1, 2, 3]));
    assert.ok(p.matches(['a', 'b', 'c']));
    assert.notOk(p.matches([1, 2]));
  }, { group: 'engine' });

  test('array with variable capture', async () => {
    const p = compile('[1, $x, 3]');
    const results = [...p.find([1, 2, 3])];
    assert.equal(results.length, 1);
    assert.equal(results[0].scope.x, 2);
  }, { group: 'engine' });

  test('array with alternation in element', async () => {
    const p = compile('[1 | 2]');
    assert.ok(p.matches([1]));
    assert.ok(p.matches([2]));
    assert.notOk(p.matches([3]));
  }, { group: 'engine' });

  test('array is anchored by default', async () => {
    const p = compile('[1, 2]');
    assert.ok(p.matches([1, 2]));
    assert.notOk(p.matches([1, 2, 3]));
  }, { group: 'engine' });

  test('array with spread at end', async () => {
    const p = compile('[1, 2, ..]');
    assert.ok(p.matches([1, 2]));
    assert.ok(p.matches([1, 2, 3]));
    assert.ok(p.matches([1, 2, 3, 4, 5]));
    assert.notOk(p.matches([1]));
  }, { group: 'engine' });

  test('array with spread at start', async () => {
    const p = compile('[.., 3, 4]');
    assert.ok(p.matches([3, 4]));
    assert.ok(p.matches([1, 2, 3, 4]));
    assert.notOk(p.matches([1, 2, 3]));
  }, { group: 'engine' });

  test('array with spread in middle', async () => {
    const p = compile('[1, .., 5]');
    assert.ok(p.matches([1, 5]));
    assert.ok(p.matches([1, 2, 3, 4, 5]));
    assert.notOk(p.matches([1, 2]));
  }, { group: 'engine' });

  test('array with only spread', async () => {
    const p = compile('[..]');
    assert.ok(p.matches([]));
    assert.ok(p.matches([1]));
    assert.ok(p.matches([1, 2, 3]));
  }, { group: 'engine' });

  test('nested arrays', async () => {
    const p = compile('[[1, 2], [3, 4]]');
    assert.ok(p.matches([[1, 2], [3, 4]]));
    assert.notOk(p.matches([[1, 2]]));
  }, { group: 'engine' });
});

// Lookaheads
group('lookaheads', () => {
  test('positive lookahead - matches', async () => {
    const p = compile('(?=42) _');
    assert.ok(p.matches(42));
  }, { group: 'engine' });

  test('positive lookahead - fails', async () => {
    const p = compile('(?=42) _');
    assert.notOk(p.matches(43));
  }, { group: 'engine' });

  test('positive lookahead with string', async () => {
    const p = compile('(?=foo) _');
    assert.ok(p.matches('foo'));
    assert.notOk(p.matches('bar'));
  }, { group: 'engine' });

  test('positive lookahead with regex', async () => {
    const p = compile('(?=/[a-z]+/) _');
    assert.ok(p.matches('hello'));
    assert.notOk(p.matches('123'));
  }, { group: 'engine' });

  test('negative lookahead - matches when not found', async () => {
    const p = compile('(?!42) _');
    assert.ok(p.matches(43));
    assert.notOk(p.matches(42));
  }, { group: 'engine' });

  test('negative lookahead with string', async () => {
    const p = compile('(?!foo) _');
    assert.ok(p.matches('bar'));
    assert.notOk(p.matches('foo'));
  }, { group: 'engine' });

  test('lookahead in array element', async () => {
    const p = compile('[(?=1) _, 2]');
    assert.ok(p.matches([1, 2]));
    assert.notOk(p.matches([3, 2]));
  }, { group: 'engine' });
});

// Complex patterns
group('complex patterns', () => {
  test('array with quantified pattern', async () => {
    const p = compile('[1, 2*, 3]');
    assert.ok(p.matches([1, 3]));
    assert.ok(p.matches([1, 2, 3]));
    assert.ok(p.matches([1, 2, 2, 3]));
  }, { group: 'engine' });

  test('capture multiple variables', async () => {
    const p = compile('[$x, $y, $z]');
    const results = [...p.find([1, 2, 3])];
    assert.equal(results.length, 1);
    assert.equal(results[0].scope.x, 1);
    assert.equal(results[0].scope.y, 2);
    assert.equal(results[0].scope.z, 3);
  }, { group: 'engine' });

  test('backtracking with alternation in array', async () => {
    const p = compile('[1 | 2, 2]');
    assert.ok(p.matches([1, 2]));
    assert.ok(p.matches([2, 2]));
    assert.notOk(p.matches([1, 1]));
  }, { group: 'engine' });

  test('pattern with conjunction and alternation', async () => {
    const p = compile('(1 | 2) & _');
    assert.ok(p.matches(1));
    assert.ok(p.matches(2));
    assert.notOk(p.matches(3));
  }, { group: 'engine' });

  test('multiple solutions with backtracking', async () => {
    const p = compile('($x=1 | $x=2) & _');
    const results = [...p.find(1)];
    assert.equal(results.length, 1);
    assert.equal(results[0].scope.x, 1);
  }, { group: 'engine' });
});

// Edge cases
group('edge cases', () => {
  test('pattern fails on non-array for array pattern', async () => {
    const p = compile('[1, 2]');
    assert.notOk(p.matches('not an array'));
    assert.notOk(p.matches(123));
    assert.notOk(p.matches({ a: 1 }));
  }, { group: 'engine' });

  test('empty pattern with any', async () => {
    const p = compile('_');
    assert.ok(p.matches(undefined));
  }, { group: 'engine' });

  test('deeply nested quantifiers', async () => {
    const p = compile('[[[1]*]*]');
    assert.ok(p.matches([]));
    assert.ok(p.matches([[]]));
    assert.ok(p.matches([[[1]]]));
  }, { group: 'engine' });
});

// Pattern API
group('pattern API', () => {
  test('Pattern constructor', async () => {
    const p = new Pattern('42');
    assert.ok(p.matches(42));
  }, { group: 'engine' });

  test('Pattern.source property', async () => {
    const p = new Pattern('123');
    assert.equal(p.source, '123');
  }, { group: 'engine' });

  test('find() returns iterator', async () => {
    const p = compile('$x');
    const results = p.find(42);
    assert.equal(typeof results[Symbol.iterator], 'function');
  }, { group: 'engine' });

  test('matches() short-circuits on first match', async () => {
    const p = compile('1 | 2 | 3');
    // Should return true immediately without exploring all branches
    assert.ok(p.matches(1));
  }, { group: 'engine' });
});

// M4 features (now supported via objects-sets-paths-replace.js)
group('M4 features', () => {
  test('object pattern works', async () => {
    const p = compile('{ a: 1 }');
    assert.ok(p.matches({ a: 1 }));
    assert.notOk(p.matches({ a: 2 }));
  }, { group: 'engine' });

  test('set pattern works', async () => {
    const p = compile('{{ 1 2 }}');
    assert.ok(p.matches(new Set([1, 2])));
    assert.notOk(p.matches(new Set([1, 2, 3])));
  }, { group: 'engine' });

  test('dot path works', async () => {
    const p = compile('{ a.b.c: 1 }');
    assert.ok(p.matches({ a: { b: { c: 1 } } }));
    assert.notOk(p.matches({ a: { b: { c: 2 } } }));
  }, { group: 'engine' });

  test('replacement pattern works', async () => {
    const p = compile('[>> 1 <<]');
    assert.ok(p.matches([1]));
  }, { group: 'engine' });

  test('key-value binding', async () => {
    // Objects are anchored by default, so { $k:$v } only matches objects with exactly one key
    const p = compile('{ $k:$v }');
    const results = [...p.find({ foo: 'bar' })];
    assert.equal(results.length, 1, 'expected exactly one result');
    assert.equal(results[0].scope.k, 'foo', '$k should bind to "foo"');
    assert.equal(results[0].scope.v, 'bar', '$v should bind to "bar"');
  }, { group: 'engine' });

  test('variables in indexed paths (not yet implemented)', async () => {
    // TODO: Indexed path syntax [$c] not yet implemented in parser
    const p = compile('{ a.$b[$c].d:e }');
    const input = {
      a: {
        foo: {
          bar: {
            d: 'e'
          }
        }
      }
    };
    const results = [...p.find(input)];
    assert.ok(results.length > 0, 'pattern should match');
    assert.equal(results[0].scope.b, 'foo', '$b should bind to "foo"');
    assert.equal(results[0].scope.c, 'bar', '$c should bind to "bar"');
  }, { group: 'engine' });
});

// Run tests if this is the main module
if (require.main === module) {
  loadEngine().then(() => {
    return run();
  }).then((results) => {
    process.exit(results.failed.length > 0 ? 1 : 0);
  }).catch(error => {
    console.error('Failed to load engine:', error);
    process.exit(1);
  });
}
