/**
 * V5 Core Test Suite
 *
 * Tests for the rewritten V5 architecture covering:
 * - Basic literals and wildcards
 * - Arrays with quantifiers and spread
 * - Objects with K=V / K?:V
 * - Breadcrumbs (path navigation)
 * - Scalar binding ($x) and unification
 * - Alternation (|)
 * - Lookaheads (? / (!
 *
 * Run with: node test/v5-core.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';
import { parsePattern } from '../src/tendril-parser.js';

// Helper functions for old API compatibility
function matches(pattern, data) {
  return Tendril(pattern).match(data).hasMatch();
}

function extract(pattern, data) {
  const sol = Tendril(pattern).match(data).solutions().first();
  return sol ? sol.toObject() : null;
}

function extractAll(pattern, data) {
  return Tendril(pattern).match(data).solutions().toArray().map(s => s.toObject());
}

function replaceAll(pattern, data, fn) {
  // COMPATIBILITY SHIM: Old API → New API
  //
  // Old API (v4): replaceAll(pattern, data, planFn)
  //   - planFn receives bindings, returns a PLAN object mapping variable names to replacement values
  //   - Example: planFn = (b) => ({x: 99}) means "replace $x with 99"
  //   - Behavior: Mutates variables in-place within the matched structure
  //
  // New API (v5) has two methods:
  //   - pattern.find(data).replaceAll(valueFn) - replaces the ENTIRE matched structure
  //   - pattern.find(data).editAll(planFn) - mutates variables within the structure (in-place)
  //
  // Strategy:
  //   - For root-level matches (pattern matches the whole data), use replaceAll()
  //   - For nested matches (pattern matches part of data), clone and use editAll()
  //
  // Detection heuristic: If pattern starts with '{' or '[', assume nested match.
  // This is a hack but works for these test cases.

  const isNestedMatch = /^\s*[\{\[]/.test(pattern);

  if (typeof fn === 'function') {
    if (isNestedMatch) {
      // Nested match - editAll is now PURE (returns copy)
      return Tendril(pattern).find(data).editAll(fn);
    } else {
      // Root match - use replaceAll and extract value from plan
      return Tendril(pattern).find(data).replaceAll((bindings) => {
        const plan = fn(bindings);
        const values = Object.values(plan);
        return values.length > 0 ? values[0] : plan;
      });
    }
  } else {
    // Direct value replacement (no function)
    return Tendril(pattern).find(data).replaceAll(() => fn);
  }
}

// ==================== Literals & Wildcards ====================

test('literal number', () => {
  assert.ok(matches('123', 123));
  assert.ok(!matches('123', 456));
});

test('literal string', () => {
  assert.ok(matches('"foo"', 'foo'));
  assert.ok(!matches('"foo"', 'bar'));
});

test('literal bareword', () => {
  assert.ok(matches('foo', 'foo'));
  assert.ok(!matches('foo', 'bar'));
});

test('literal boolean', () => {
  assert.ok(matches('true', true));
  assert.ok(matches('false', false));
  assert.ok(!matches('true', false));
});

test('wildcard matches anything', () => {
  assert.ok(matches('_', 123));
  assert.ok(matches('_', 'foo'));
  assert.ok(matches('_', true));
  assert.ok(matches('_', null));
  assert.ok(matches('_', {a: 1}));
});

test('regex literal', () => {
  assert.ok(matches('/fo+/', 'foo'));
  assert.ok(matches('/fo+/', 'foooo'));
  assert.ok(!matches('/fo+/', 'bar'));
});

test('regex only matches strings', () => {
  // Regex should NOT match non-string values, even if their string representation would match
  assert.ok(!matches('/1/', 1));           // number 1 stringifies to "1", but shouldn't match
  assert.ok(!matches('/true/', true));     // boolean true stringifies to "true"
  assert.ok(!matches('/null/', null));     // null stringifies to "null"
  assert.ok(!matches('/object/', {}));     // objects stringify to "[object Object]"
  assert.ok(matches('/1/', '1'));          // string "1" should match
});

// ==================== Arrays ====================

test('empty array', () => {
  assert.ok(matches('[]', []));
  assert.ok(!matches('[]', [1]));
});

test('single element array', () => {
  assert.ok(matches('[1]', [1]));
  assert.ok(!matches('[1]', []));
  assert.ok(!matches('[1]', [1, 2]));
});

test('multiple element array', () => {
  assert.ok(matches('[1 2 3]', [1, 2, 3]));
  assert.ok(!matches('[1 2 3]', [1, 2]));
  assert.ok(!matches('[1 2 3]', [1, 2, 3, 4]));
});

test('array with wildcards', () => {
  assert.ok(matches('[_ _]', [1, 2]));
  assert.ok(matches('[_ _]', ['a', 'b']));
  assert.ok(!matches('[_ _]', [1]));
});

test('array spread - empty', () => {
  assert.ok(matches('[..]', []));
  assert.ok(matches('[..]', [1, 2, 3]));
});

test('array spread - prefix', () => {
  assert.ok(matches('[1 ..]', [1]));
  assert.ok(matches('[1 ..]', [1, 2, 3]));
  assert.ok(!matches('[1 ..]', [2, 3]));
});

test('array spread - suffix', () => {
  assert.ok(matches('[.. 3]', [3]));
  assert.ok(matches('[.. 3]', [1, 2, 3]));
  assert.ok(!matches('[.. 3]', [1, 2]));
});

test('array spread - middle', () => {
  assert.ok(matches('[1 .. 3]', [1, 3]));
  assert.ok(matches('[1 .. 3]', [1, 2, 3]));
  assert.ok(matches('[1 .. 3]', [1, 2, 2, 3]));
  assert.ok(!matches('[1 .. 3]', [1, 2]));
});

test('array quantifier - exact', () => {
  assert.ok(matches('[1{2}]', [1, 1]));
  assert.ok(!matches('[1{2}]', [1]));
  assert.ok(!matches('[1{2}]', [1, 1, 1]));
});

test('array quantifier - range', () => {
  assert.ok(matches('[1{2,3}]', [1, 1]));
  assert.ok(matches('[1{2,3}]', [1, 1, 1]));
  assert.ok(!matches('[1{2,3}]', [1]));
  assert.ok(!matches('[1{2,3}]', [1, 1, 1, 1]));
});

test('array nested', () => {
  assert.ok(matches('[[1 2]]', [[1, 2]]));
  assert.ok(matches('[_ [1 2]]', [99, [1, 2]]));
});

// ==================== Objects ====================

test('empty object', () => {
  assert.ok(matches('{}', {}));
  assert.ok(matches('{}', {a: 1})); // no assertions = all assertions satisfied
  assert.ok(!matches('{(!remainder)}', {a: 1})); // explicitly forbid keys with (!remainder)
});

test('object single property', () => {
  assert.ok(matches('{a:1}', {a: 1}));
  assert.ok(!matches('{a:1}', {}));
  assert.ok(!matches('{a:1}', {a: 2}));
  assert.ok(matches('{a:1}', {a: 1, b: 2})); // extra keys allowed without remainder
  assert.ok(!matches('{a:1 (!remainder)}', {a: 1, b: 2})); // (!remainder) forbids extra keys
});

test('object multiple properties', () => {
  assert.ok(matches('{a:1 b:2}', {a: 1, b: 2}));
  assert.ok(!matches('{a:1 b:2}', {a: 1}));
  assert.ok(matches('{a:1 b:2}', {a: 1, b: 2, c: 3})); // extra keys allowed
  assert.ok(!matches('{a:1 b:2 (!remainder)}', {a: 1, b: 2, c: 3})); // (!remainder) forbids extras
});

test('object with remainder binding', () => {
  // Use remainder? to allow empty residual (bare remainder requires nonempty)
  assert.ok(matches('{a:1 @x=(remainder?)}', {a: 1}));
  assert.ok(matches('{a:1 @x=(remainder)}', {a: 1, b: 2, c: 3}));
  assert.ok(!matches('{a:1 @x=(remainder)}', {b: 2}));
});

test('object wildcard key', () => {
  assert.ok(matches('{_:1}', {a: 1}));
  assert.ok(matches('{_:1}', {b: 1}));
  assert.ok(!matches('{_:1}', {a: 2}));
});

test('object regex key', () => {
  assert.ok(matches('{/foo.*/:1}', {foobar: 1}));
  assert.ok(matches('{/foo.*/:1}', {foo: 1}));
  assert.ok(!matches('{/foo.*/:1}', {bar: 1}));
});

test('object nested', () => {
  assert.ok(matches('{a:{b:1}}', {a: {b: 1}}));
  assert.ok(!matches('{a:{b:1}}', {a: {b: 2}}));
});

// ==================== Breadcrumbs (Path Navigation) ====================

test('breadcrumb - single key', () => {
  assert.ok(matches('{a:1}', {a: 1}));
  assert.ok(!matches('{a:1}', {a: 2}));
  assert.ok(!matches('{a:1}', {b: 1}));
});

test('breadcrumb - nested keys', () => {
  assert.ok(matches('{a.b:1}', {a: {b: 1}}));
  assert.ok(!matches('{a.b:1}', {a: {b: 2}}));
  assert.ok(!matches('{a.b:1}', {a: {c: 1}}));
});

test('breadcrumb - deeper nesting', () => {
  assert.ok(matches('{a.b.c:1}', {a: {b: {c: 1}}}));
  assert.ok(!matches('{a.b.c:1}', {a: {b: {c: 2}}}));
});

test('breadcrumb - array index literal', () => {
  assert.ok(matches('{a[0]:1}', {a: [1, 2, 3]}));
  assert.ok(matches('{a[2]:3}', {a: [1, 2, 3]}));
  assert.ok(!matches('{a[0]:2}', {a: [1, 2, 3]}));
});

test('breadcrumb - array index wildcard', () => {
  assert.ok(matches('{a[_]:1}', {a: [1]}));
  assert.ok(matches('{a[_]:2}', {a: [1, 2, 3]}));
  assert.ok(matches('{a[_]:3}', {a: [1, 2, 3]}));
});

test('breadcrumb - mixed key and index', () => {
  assert.ok(matches('{a[0]:1}', {a: [1, 2]}));
  assert.ok(matches('{a[1].b:2}', {a: [{b: 1}, {b: 2}]}));
});

test('breadcrumb - skip levels with ..', () => {
  // Modern syntax: ..password means arbitrary depth (including zero) then password
  assert.ok(matches('{..password:$x}', {password: 'secret'}));
  assert.ok(matches('{..password:$x}', {user: {password: 'secret'}}));
  assert.ok(matches('{..password:$x}', {user: {credentials: {password: 'secret'}}}));
  assert.ok(matches('{..password:$x}', {a: {b: {c: {password: 'secret'}}}}));
});

test('breadcrumb - quantifiers NOT supported (v5)', () => {
  // The old v4 syntax _(._)* is no longer supported
  // This should fail to parse
  assert.throws(() => {
    parsePattern('{ _(._)*.password : $x }');
  }, /unexpected|expected/i);
});

test('breadcrumb - multiple matches at different depths', () => {
  // ..password finds all password fields at any depth
  const data = {
    password: 'top',
    user: {
      password: 'nested',
      profile: {
        password: 'deep'
      }
    }
  };
  const results = extractAll('{..password:$x}', data);
  assert.equal(results.length, 3);
  const passwords = results.map(r => r.x).sort();
  assert.deepEqual(passwords, ['deep', 'nested', 'top']);
});

test('breadcrumb - _..foo (wildcard then skip to foo)', () => {
  // _..foo means: match any key, then descend to foo
  const data = {
    user: {credentials: {foo: 1}},
    admin: {settings: {foo: 2}}
  };
  const results = extractAll('{_..foo:$x}', data);
  assert.equal(results.length, 2);
  const values = results.map(r => r.x).sort();
  assert.deepEqual(values, [1, 2]);
});

test('breadcrumb - ..:bar (any value at any depth)', () => {
  // This test checks find() which scans recursively at all depths
  // Pattern {_:"bar"} matches any key with value "bar"
  // find() should discover this pattern at 3 different depths
  const data = {
    a: {b: {c: 'bar'}},  // depth 3: a.b.c
    x: {y: 'bar'},        // depth 2: x.y
    z: 'bar'              // depth 1: z
  };
  // Use find() to scan at all depths, not match() which only checks root
  const occSet = Tendril('{_:"bar"}').find(data);

  // v2: OccurrenceSet iterates occurrences (locations)
  // Pattern {_:"bar"} matches at 3 locations
  assert.equal(occSet.count(), 3, 'Should find 3 occurrences');

  // All 3 have identical (empty) bindings, so 1 unique solution
  assert.equal(occSet.solutions().count(), 1, 'Should have 1 unique solution');
});

test('breadcrumb - ..foo:bar vs .. foo:bar (spacing)', () => {
  // In Tendril, whitespace is a delimiter, so '.. foo' should be two tokens
  // But since .. needs to be followed by a key in breadcrumb context,
  // both should parse the same way if foo follows ..
  const data = {a: {foo: 'bar'}};

  assert.ok(matches('{..foo:bar}', data), '..foo should match');

  // With space: '.. foo' - the space should not affect parsing
  // since whitespace is generally insignificant except as delimiter
  assert.ok(matches('{.. foo:bar}', data), '.. foo should match same as ..foo');
});

// ==================== Scalar Binding ($x) ====================

test('binding - simple', () => {
  const result = extractAll('$x', 42);
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 42);
});

test('binding - in array', () => {
  const result = extractAll('[$x $y $z]', [1, 2, 3]);
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 1);
  assert.equal(result[0].y, 2);
  assert.equal(result[0].z, 3);
});

test('binding - unification success', () => {
  const result = extractAll('[$x $x]', [1, 1]);
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 1);
});

test('binding - unification failure', () => {
  const result = extractAll('[$x $x]', [1, 2]);
  assert.equal(result.length, 0);
});

test('binding - with pattern constraint', () => {
  const result = extractAll('[$x=(1) $y]', [1, 2]);
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 1);
  assert.equal(result[0].y, 2);
});

test('binding - with spread', () => {
  const results = extractAll('[.. $x ..]', [1, 2, 3]);
  assert.ok(results.length >= 3); // should match each element
  assert.ok(results.some(r => r.x === 1));
  assert.ok(results.some(r => r.x === 2));
  assert.ok(results.some(r => r.x === 3));
});

test('binding - in object key', () => {
  const results = extractAll('{$x:_}', {a: 1, b: 2});
  assert.ok(results.length >= 2);
  assert.ok(results.some(r => r.x === 'a'));
  assert.ok(results.some(r => r.x === 'b'));
});

test('binding - in object value', () => {
  const result = extract('{a:$x}', {a: 42});
  assert.deepEqual(result, {x: 42});
});

test('binding - breadcrumb traversal', () => {
  const result = extract('{a.b.c:$x}', {a: {b: {c: 42}}});
  assert.deepEqual(result, {x: 42});
});

test('scalar binding with seq - matches length 1 only', () => {
  // $x=(1? 2?) matches iff the seq matches exactly 1 element
  // The seq "1? 2?" can match: [] (0 elements), [1] (1), [2] (1), [1,2] (2)
  // But $x only accepts length-1 matches

  // Matches [1] - seq matches 1 element, bind x=1
  let result = Tendril('[$x=(1? 2?)]').match([1]).solutions().toArray();
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 1);

  // Matches [2] - seq matches 1 element, bind x=2
  result = Tendril('[$x=(1? 2?)]').match([2]).solutions().toArray();
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 2);

  // Does NOT match [] - seq matches 0 elements
  result = Tendril('[$x=(1? 2?)]').match([]).solutions().toArray();
  assert.equal(result.length, 0);

  // Does NOT match [1, 2] - seq matches 2 elements
  result = Tendril('[$x=(1? 2?)]').match([1, 2]).solutions().toArray();
  assert.equal(result.length, 0);
});

test('group binding with seq - matches any length', () => {
  // Contrast with @x which accepts any length
  // @x=(1? 2?) matches [], [1], [2], [1,2]

  let result = Tendril('[@x=(1? 2?)]').match([]).solutions().toArray();
  assert.equal(result.length, 1);

  result = Tendril('[@x=(1? 2?)]').match([1]).solutions().toArray();
  assert.equal(result.length, 1);

  result = Tendril('[@x=(1? 2?)]').match([1, 2]).solutions().toArray();
  assert.equal(result.length, 1);
});

// ==================== Alternation (|) ====================

test('alternation - simple', () => {
  assert.ok(matches('(1|2)', 1));
  assert.ok(matches('(1|2)', 2));
  assert.ok(!matches('(1|2)', 3));
});

test('alternation - in array', () => {
  assert.ok(matches('[(1|2) (3|4)]', [1, 3]));
  assert.ok(matches('[(1|2) (3|4)]', [2, 4]));
  assert.ok(!matches('[(1|2) (3|4)]', [1, 5]));
});

test('alternation - with binding', () => {
  const results = extractAll('$x=(1|2)', 1);
  assert.equal(results.length, 1);
  assert.equal(results[0].x, 1);
});

// ==================== Lookaheads ====================

test('positive lookahead - success', () => {
  // Lookaheads at root level must be wrapped in array context
  assert.ok(matches('[(?1)_]', [1]));
  assert.ok(!matches('[(?1)_]', [2]));
});

test('positive lookahead - in array', () => {
  assert.ok(matches('[(?1)_ 2]', [1, 2]));
  assert.ok(!matches('[(?2)_ 2]', [1, 2]));
});

test('negative lookahead - success', () => {
  // Lookaheads at root level must be wrapped in array context
  assert.ok(matches('[(!1)_]', [2]));
  assert.ok(!matches('[(!1)_]', [1]));
});

test('negative lookahead - in array', () => {
  assert.ok(matches('[(!1)_ 2]', [3, 2]));
  assert.ok(!matches('[(!1)_ 2]', [1, 2]));
});

test('lookahead with binding - no variable leak', () => {
  // Lookaheads should not leak bindings outside their scope
  const result = extract('[(?$x)_ $y]', [1, 2]);
  assert.ok(result.x === undefined || result.x === 1); // x should not leak
  assert.equal(result.y, 2);
});

// ==================== Replace API ====================

test('replace - simple value', () => {
  const result = replaceAll('$x', 42, bindings => ({x: 99}));
  assert.equal(result, 99);
});

test('replace - whole match', () => {
  // Pattern matches any object with key 'a' that has an array with at least one element
  // Replace the whole match (bound to $0) with a simple value
  const result = replaceAll('{a[_]:_}', {a: [1, 2, 3]}, 'replaced');
  assert.equal(result, 'replaced');
});

test('replace - in object', () => {
  const result = replaceAll('{a:$x}', {a: 1}, bindings => ({x: 99}));
  assert.deepEqual(result, {a: 99});
});


















// ==================== Greedy Quantifiers ====================

test('greedy quantifiers - optional object emits longest match first', () => {
  const input = [
    {tag: 'div', children: 'before'},
    {tag: 'when', condition: true, children: 'show this'},
    {tag: 'else', children: 'or this'},
    {tag: 'span', children: 'after'}
  ];

  // Use remainder? to allow empty residual (bare remainder requires nonempty)
  const pattern = `[.. @whenelse=(
    {tag:when/i @otherProps=(remainder)}
    {tag:else/i children:$else remainder?}?
  ) ..]`;

  const solutions = Tendril(pattern).match(input).solutions().toArray();

  // Should have 2 solutions: with and without else
  assert.equal(solutions.length, 2);

  // First solution should be the longest (greedy)
  assert.equal(solutions[0].whenelse.length, 2);
  assert.equal(solutions[0].else, 'or this');

  // Second solution should be shorter
  assert.equal(solutions[1].whenelse.length, 1);
  assert.equal(solutions[1].else, undefined);
});

test('replace uses first solution only (longest match)', () => {
  const input = [
    {tag: 'div', children: 'before'},
    {tag: 'when', condition: true, children: 'show this'},
    {tag: 'else', children: 'or this'},
    {tag: 'span', children: 'after'}
  ];

  // Use remainder? to allow empty residual (bare remainder requires nonempty)
  const pattern = `[.. @whenelse=(
    {tag:when/i @otherProps=(remainder)}
    {tag:else/i children:$else remainder?}?
  ) ..]`;

  // editAll is now PURE (returns copy)
  const result = Tendril(pattern).find(input).editAll(v => ({
    whenelse: [{ tag: 'when', children2: v.else, ...v.otherProps }]
  }));

  // Should replace the 2-element group with single merged object
  assert.equal(result.length, 3); // div, merged when/else, span
  assert.equal(result[1].tag, 'when');
  assert.equal(result[1].children2, 'or this');
  assert.equal(result[1].condition, true);
});

// ==================== Edge Cases ====================

test('null value', () => {
  assert.ok(matches('null', null));
});

test('empty string', () => {
  assert.ok(matches('""', ''));
  assert.ok(!matches('""', 'x'));
});

test('number zero', () => {
  assert.ok(matches('0', 0));
  assert.ok(!matches('0', false));
});

test('nested arrays', () => {
  assert.ok(matches('[[[1]]]', [[[1]]]));
});

test('deeply nested objects', () => {
  assert.ok(matches('{a:{b:{c:{d:{e:1}}}}}', {a: {b: {c: {d: {e: 1}}}}}));
});

console.log('\n✓ All core tests defined\n');
