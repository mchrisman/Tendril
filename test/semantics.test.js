/**
 * Smoke tests for semantics.js
 * Tests semantic helper functions
 */

const { test, assert, run, group } = require('./framework.js');

// Import semantics (using dynamic import for ES modules)
let sem;

// Load the semantics module
async function loadSemantics() {
  const semanticsModule = await import('../src/semantics.js');
  sem = semanticsModule;
}

// Type guards
group('type guards', () => {
  test('isArr identifies arrays', async () => {
    assert.ok(sem.isArr([]));
    assert.ok(sem.isArr([1, 2, 3]));
    assert.notOk(sem.isArr({}));
    assert.notOk(sem.isArr(null));
  }, { group: 'semantics' });

  test('isSet identifies sets', async () => {
    assert.ok(sem.isSet(new Set()));
    assert.ok(sem.isSet(new Set([1, 2, 3])));
    assert.notOk(sem.isSet([]));
    assert.notOk(sem.isSet({}));
  }, { group: 'semantics' });

  test('isMap identifies maps', async () => {
    assert.ok(sem.isMap(new Map()));
    assert.ok(sem.isMap(new Map([['a', 1]])));
    assert.notOk(sem.isMap({}));
    assert.notOk(sem.isMap([]));
  }, { group: 'semantics' });

  test('isObj identifies plain objects', async () => {
    assert.ok(sem.isObj({}));
    assert.ok(sem.isObj({ a: 1 }));
    assert.notOk(sem.isObj([]));
    assert.notOk(sem.isObj(new Set()));
    assert.notOk(sem.isObj(new Map()));
    assert.notOk(sem.isObj(null));
  }, { group: 'semantics' });
});

// Coercions
group('coercions', () => {
  test('coerceNumber - valid numbers', async () => {
    assert.deepEqual(sem.coerceNumber(123), { ok: true, value: 123 });
    assert.deepEqual(sem.coerceNumber('456'), { ok: true, value: 456 });
    assert.deepEqual(sem.coerceNumber('3.14'), { ok: true, value: 3.14 });
  }, { group: 'semantics' });

  test('coerceNumber - invalid numbers', async () => {
    const result1 = sem.coerceNumber('abc');
    assert.equal(result1.ok, false);

    const result2 = sem.coerceNumber(NaN);
    assert.equal(result2.ok, false);

    const result3 = sem.coerceNumber(Infinity);
    assert.equal(result3.ok, false);
  }, { group: 'semantics' });

  test('coerceBoolean - true/false', async () => {
    assert.deepEqual(sem.coerceBoolean(true), { ok: true, value: true });
    assert.deepEqual(sem.coerceBoolean(false), { ok: true, value: false });
    assert.deepEqual(sem.coerceBoolean('true'), { ok: true, value: true });
    assert.deepEqual(sem.coerceBoolean('false'), { ok: true, value: false });
  }, { group: 'semantics' });

  test('coerceBoolean - truthy/falsy', async () => {
    assert.deepEqual(sem.coerceBoolean(1), { ok: true, value: true });
    assert.deepEqual(sem.coerceBoolean(0), { ok: true, value: false });
    assert.deepEqual(sem.coerceBoolean(''), { ok: true, value: false });
    assert.deepEqual(sem.coerceBoolean('abc'), { ok: true, value: true });
  }, { group: 'semantics' });

  test('coerceString - basic', async () => {
    assert.deepEqual(sem.coerceString('hello'), { ok: true, value: 'hello' });
    assert.deepEqual(sem.coerceString(123), { ok: true, value: '123' });
    assert.deepEqual(sem.coerceString(true), { ok: true, value: 'true' });
  }, { group: 'semantics' });
});

// Atom equality
group('atom equality', () => {
  test('atomEqNumber - matching', async () => {
    assert.ok(sem.atomEqNumber(42, 42));
    assert.ok(sem.atomEqNumber(42, '42'));
    assert.ok(sem.atomEqNumber(3.14, '3.14'));
  }, { group: 'semantics' });

  test('atomEqNumber - non-matching', async () => {
    assert.notOk(sem.atomEqNumber(42, 43));
    assert.notOk(sem.atomEqNumber(42, 'abc'));
    assert.notOk(sem.atomEqNumber(42, NaN));
  }, { group: 'semantics' });

  test('atomEqBoolean - matching', async () => {
    assert.ok(sem.atomEqBoolean(true, true));
    assert.ok(sem.atomEqBoolean(true, 'true'));
    assert.ok(sem.atomEqBoolean(false, false));
    assert.ok(sem.atomEqBoolean(false, 'false'));
  }, { group: 'semantics' });

  test('atomEqBoolean - non-matching', async () => {
    assert.notOk(sem.atomEqBoolean(true, false));
    assert.notOk(sem.atomEqBoolean(true, 'false'));
  }, { group: 'semantics' });

  test('atomEqString - matching', async () => {
    assert.ok(sem.atomEqString('hello', 'hello'));
    assert.ok(sem.atomEqString('42', 42));
    assert.ok(sem.atomEqString('true', true));
  }, { group: 'semantics' });

  test('atomEqString - non-matching', async () => {
    assert.notOk(sem.atomEqString('hello', 'world'));
    assert.notOk(sem.atomEqString('42', 43));
  }, { group: 'semantics' });
});

// Regex matching
group('regex matching', () => {
  test('regexFull - basic match', async () => {
    assert.ok(sem.regexFull('abc', '', 'abc'));
    assert.ok(sem.regexFull('[a-z]+', '', 'hello'));
    assert.ok(sem.regexFull('\\d+', '', '12345'));
  }, { group: 'semantics' });

  test('regexFull - non-match', async () => {
    assert.notOk(sem.regexFull('abc', '', 'abcd'));
    assert.notOk(sem.regexFull('[a-z]+', '', '123'));
  }, { group: 'semantics' });

  test('regexFull - with flags', async () => {
    assert.ok(sem.regexFull('ABC', 'i', 'abc'));
    assert.notOk(sem.regexFull('ABC', '', 'abc'));
  }, { group: 'semantics' });
});

// Deep equality
group('deep equality', () => {
  test('deepEq - primitives', async () => {
    assert.ok(sem.deepEq(1, 1));
    assert.ok(sem.deepEq('hello', 'hello'));
    assert.ok(sem.deepEq(true, true));
    assert.ok(sem.deepEq(null, null));
    assert.notOk(sem.deepEq(1, 2));
    assert.notOk(sem.deepEq('a', 'b'));
  }, { group: 'semantics' });

  test('deepEq - NaN', async () => {
    assert.ok(sem.deepEq(NaN, NaN));
  }, { group: 'semantics' });

  test('deepEq - arrays', async () => {
    assert.ok(sem.deepEq([1, 2, 3], [1, 2, 3]));
    assert.ok(sem.deepEq([], []));
    assert.notOk(sem.deepEq([1, 2], [1, 2, 3]));
    assert.notOk(sem.deepEq([1, 2], [2, 1]));
  }, { group: 'semantics' });

  test('deepEq - objects', async () => {
    assert.ok(sem.deepEq({ a: 1, b: 2 }, { a: 1, b: 2 }));
    assert.ok(sem.deepEq({ a: 1, b: 2 }, { b: 2, a: 1 })); // order-insensitive
    assert.ok(sem.deepEq({}, {}));
    assert.notOk(sem.deepEq({ a: 1 }, { a: 2 }));
    assert.notOk(sem.deepEq({ a: 1 }, { a: 1, b: 2 }));
  }, { group: 'semantics' });

  test('deepEq - nested structures', async () => {
    assert.ok(sem.deepEq(
      { a: [1, 2], b: { c: 3 } },
      { a: [1, 2], b: { c: 3 } }
    ));
    assert.notOk(sem.deepEq(
      { a: [1, 2], b: { c: 3 } },
      { a: [1, 2], b: { c: 4 } }
    ));
  }, { group: 'semantics' });

  test('deepEq - sets', async () => {
    assert.ok(sem.deepEq(new Set([1, 2, 3]), new Set([1, 2, 3])));
    assert.ok(sem.deepEq(new Set([1, 2, 3]), new Set([3, 2, 1]))); // order-insensitive
    assert.notOk(sem.deepEq(new Set([1, 2]), new Set([1, 2, 3])));
  }, { group: 'semantics' });

  test('deepEq - maps', async () => {
    assert.ok(sem.deepEq(
      new Map([['a', 1], ['b', 2]]),
      new Map([['a', 1], ['b', 2]])
    ));
    assert.ok(sem.deepEq(
      new Map([['a', 1], ['b', 2]]),
      new Map([['b', 2], ['a', 1]]) // order-insensitive
    ));
    assert.notOk(sem.deepEq(
      new Map([['a', 1]]),
      new Map([['a', 2]])
    ));
  }, { group: 'semantics' });

  test('deepEq - circular references', async () => {
    const a = { x: 1 };
    a.self = a;
    const b = { x: 1 };
    b.self = b;
    assert.ok(sem.deepEq(a, b));
  }, { group: 'semantics' });
});

// Environment
group('environment', () => {
  test('Env - bind and get', async () => {
    const env = new sem.Env();
    env.bind('x', 42);
    assert.equal(env.get('x'), 42);
    assert.ok(env.isBound('x'));
    assert.notOk(env.isBound('y'));
  }, { group: 'semantics' });

  test('Env - bindOrCheck success', async () => {
    const env = new sem.Env();
    assert.ok(env.bindOrCheck('x', 42));
    assert.equal(env.get('x'), 42);
    assert.ok(env.bindOrCheck('x', 42)); // same value
  }, { group: 'semantics' });

  test('Env - bindOrCheck failure', async () => {
    const env = new sem.Env();
    env.bind('x', 42);
    assert.notOk(env.bindOrCheck('x', 43)); // different value
  }, { group: 'semantics' });

  test('Env - snapshot and rollback', async () => {
    const env = new sem.Env();
    env.bind('x', 1);
    const snap = env.snapshot();
    env.bind('y', 2);
    env.bind('z', 3);
    assert.equal(env.get('y'), 2);
    assert.equal(env.get('z'), 3);
    env.rollback(snap);
    assert.notOk(env.isBound('y'));
    assert.notOk(env.isBound('z'));
    assert.equal(env.get('x'), 1); // still bound
  }, { group: 'semantics' });

  test('Env - snapshot and commit', async () => {
    const env = new sem.Env();
    env.bind('x', 1);
    const snap = env.snapshot();
    env.bind('y', 2);
    env.commit(snap);
    assert.ok(env.isBound('y')); // still bound after commit
    assert.equal(env.get('y'), 2);
  }, { group: 'semantics' });

  test('Env - initial values', async () => {
    const env = new sem.Env({ a: 1, b: 2 });
    assert.equal(env.get('a'), 1);
    assert.equal(env.get('b'), 2);
  }, { group: 'semantics' });

  test('Env - cloneRO', async () => {
    const env = new sem.Env();
    env.bind('x', 42);
    const clone = env.cloneRO();
    assert.equal(clone.get('x'), 42);
  }, { group: 'semantics' });
});

// Slice utilities
group('slice utilities', () => {
  test('makeArraySlice - valid', async () => {
    const arr = [1, 2, 3, 4, 5];
    const slice = sem.makeArraySlice(arr, 1, 3);
    assert.equal(slice.kind, 'array-slice');
    assert.equal(slice.ref, arr);
    assert.equal(slice.start, 1);
    assert.equal(slice.end, 3);
  }, { group: 'semantics' });

  test('makeArraySlice - invalid bounds', async () => {
    const arr = [1, 2, 3];
    assert.throws(() => sem.makeArraySlice(arr, -1, 2), RangeError);
    assert.throws(() => sem.makeArraySlice(arr, 2, 1), RangeError);
    assert.throws(() => sem.makeArraySlice(arr, 0, 10), RangeError);
  }, { group: 'semantics' });

  test('makeArraySlice - non-array', async () => {
    assert.throws(() => sem.makeArraySlice({}, 0, 1), TypeError);
  }, { group: 'semantics' });

  test('makeObjectValueRef - object', async () => {
    const obj = { a: 1 };
    const ref = sem.makeObjectValueRef(obj, 'a');
    assert.equal(ref.kind, 'object-value');
    assert.equal(ref.ref, obj);
    assert.equal(ref.key, 'a');
  }, { group: 'semantics' });

  test('makeObjectValueRef - map', async () => {
    const map = new Map([['a', 1]]);
    const ref = sem.makeObjectValueRef(map, 'a');
    assert.equal(ref.kind, 'object-value');
    assert.equal(ref.ref, map);
    assert.equal(ref.key, 'a');
  }, { group: 'semantics' });

  test('makeObjectValueRef - invalid', async () => {
    assert.throws(() => sem.makeObjectValueRef([], 'a'), TypeError);
  }, { group: 'semantics' });

  test('makeObjectKeysSlice', async () => {
    const obj = { a: 1, b: 2 };
    const slice = sem.makeObjectKeysSlice(obj, ['a', 'b']);
    assert.equal(slice.kind, 'object-keys');
    assert.equal(slice.ref, obj);
    assert.ok(slice.keys.has('a'));
    assert.ok(slice.keys.has('b'));
  }, { group: 'semantics' });
});

// Coverage
group('coverage', () => {
  test('Coverage - add and size', async () => {
    const obj = { a: 1, b: 2, c: 3 };
    const cov = new sem.Coverage(obj);
    assert.equal(cov.size(), 0);
    assert.equal(cov.total(), 3);

    cov.add('a');
    assert.equal(cov.size(), 1);
    cov.add('b');
    assert.equal(cov.size(), 2);
    cov.add('a'); // duplicate
    assert.equal(cov.size(), 2);
  }, { group: 'semantics' });

  test('Coverage - isFull', async () => {
    const obj = { a: 1, b: 2 };
    const cov = new sem.Coverage(obj);
    assert.notOk(cov.isFull());
    cov.add('a');
    assert.notOk(cov.isFull());
    cov.add('b');
    assert.ok(cov.isFull());
  }, { group: 'semantics' });

  test('Coverage - snapshot and rollback', async () => {
    const obj = { a: 1, b: 2, c: 3 };
    const cov = new sem.Coverage(obj);
    cov.add('a');
    const snap = cov.snapshot();
    cov.add('b');
    cov.add('c');
    assert.ok(cov.isFull());
    cov.rollback(snap);
    assert.equal(cov.size(), 1);
    assert.notOk(cov.isFull());
  }, { group: 'semantics' });

  test('Coverage - with Map', async () => {
    const map = new Map([['a', 1], ['b', 2]]);
    const cov = new sem.Coverage(map);
    assert.equal(cov.total(), 2);
    cov.add('a');
    cov.add('b');
    assert.ok(cov.isFull());
  }, { group: 'semantics' });
});

// Misc helpers
group('misc helpers', () => {
  test('enumerateKeys - object', async () => {
    const obj = { a: 1, b: 2, c: 3 };
    const keys = sem.enumerateKeys(obj, k => k !== 'b');
    assert.deepEqual(keys.sort(), ['a', 'c']);
  }, { group: 'semantics' });

  test('enumerateKeys - map', async () => {
    const map = new Map([['a', 1], ['b', 2], ['c', 3]]);
    const keys = sem.enumerateKeys(map, k => k !== 'b');
    assert.deepEqual(keys.sort(), ['a', 'c']);
  }, { group: 'semantics' });

  test('getValue - object', async () => {
    const obj = { a: 42 };
    assert.equal(sem.getValue(obj, 'a'), 42);
  }, { group: 'semantics' });

  test('getValue - map', async () => {
    const map = new Map([['a', 42]]);
    assert.equal(sem.getValue(map, 'a'), 42);
  }, { group: 'semantics' });

  test('countKeys - object', async () => {
    const obj = { a: 1, b: 2, c: 3 };
    const count = sem.countKeys(
      obj,
      k => true,
      v => v > 1
    );
    assert.equal(count, 2); // b and c
  }, { group: 'semantics' });

  test('countKeys - map', async () => {
    const map = new Map([['a', 1], ['b', 2], ['c', 3]]);
    const count = sem.countKeys(
      map,
      k => true,
      v => v > 1
    );
    assert.equal(count, 2); // b and c
  }, { group: 'semantics' });

  test('cloneShallow - array', async () => {
    const arr = [1, 2, 3];
    const clone = sem.cloneShallow(arr);
    assert.notEqual(clone, arr); // different reference
    assert.deepEqual(clone, arr); // same content
  }, { group: 'semantics' });

  test('cloneShallow - object', async () => {
    const obj = { a: 1, b: 2 };
    const clone = sem.cloneShallow(obj);
    assert.notEqual(clone, obj);
    assert.deepEqual(clone, obj);
  }, { group: 'semantics' });

  test('cloneShallow - set', async () => {
    const set = new Set([1, 2, 3]);
    const clone = sem.cloneShallow(set);
    assert.notEqual(clone, set);
    assert.deepEqual(clone, set);
  }, { group: 'semantics' });

  test('cloneShallow - map', async () => {
    const map = new Map([['a', 1]]);
    const clone = sem.cloneShallow(map);
    assert.notEqual(clone, map);
    assert.deepEqual(clone, map);
  }, { group: 'semantics' });

  test('cloneShallow - primitives', async () => {
    assert.equal(sem.cloneShallow(42), 42);
    assert.equal(sem.cloneShallow('hello'), 'hello');
    assert.equal(sem.cloneShallow(true), true);
  }, { group: 'semantics' });
});

// Run tests if this is the main module
if (require.main === module) {
  loadSemantics().then(() => {
    return run();
  }).then((results) => {
    process.exit(results.failed.length > 0 ? 1 : 0);
  }).catch(error => {
    console.error('Failed to load semantics:', error);
    process.exit(1);
  });
}
