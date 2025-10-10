// semantics.js
// Pure helpers for matching semantics: coercions, equality, env (bindings with trail),
// slice/coverage utilities, and safe regex matching.
// No parser/compiler/VM logic lives here.

/** @typedef {{unicodeNormalize?: false|'NFC'|'NFD'}} SemanticsOptions */

export const defaultSemOpts = Object.freeze({
  unicodeNormalize: false, // set to 'NFC' or 'NFD' to normalize all string comparisons
});

/* ============================== Type guards ============================== */

export const isArr = Array.isArray;
export const isSet = v => v instanceof Set;
export const isMap = v => v instanceof Map;
export const isObj =
  v => v !== null && typeof v === "object" && !isArr(v) && !isSet(v) && !isMap(v);

/* ============================== Unicode normalize ============================== */

function normStr(s, opts) {
  if (!opts || !opts.unicodeNormalize) return s;
  return String(s).normalize(opts.unicodeNormalize);
}

/* ============================== Coercions & atom equality ============================== */

/**
 * Coerce to number with JS semantics. Returns {ok, value}.
 * Rejects NaN/Infinity for matching numeric atoms.
 */
export function coerceNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, value: NaN };
}

/**
 * Coerce to boolean - strict mode.
 * Only accepts boolean primitives and string literals "true"/"false".
 * Rejects all other values (numbers, arrays, objects, etc.).
 * Use _ (wildcard) if you need to match any truthy/falsy value.
 */
export function coerceBoolean(x) {
  if (typeof x === "boolean") return { ok: true, value: x };
  if (typeof x === "string") {
    if (x === "true") return { ok: true, value: true };
    if (x === "false") return { ok: true, value: false };
  }
  // Reject all other values
  return { ok: false, value: false };
}

/** Coerce to string (String(x)) then optional Unicode normalization. */
export function coerceString(x, opts = defaultSemOpts) {
  return { ok: true, value: normStr(String(x), opts) };
}

/** Full-string regex match after string coercion + normalization. */
export function regexFull(reBody, reFlags, value, opts = defaultSemOpts) {
  const { value: s } = coerceString(value, opts);
  // Ensure ^..$ semantics even if caller passed a body without anchors.
  // We avoid double-anchoring by not adding ^/$; instead we test with lastIndex=0 and ^$ in source:
  // For simplicity and perf, rebuild a RegExp and anchor explicitly.
  const anchored = new RegExp(`^(?:${reBody})$`, reFlags);
  return anchored.test(s);
}

/** Compare 'expected' numeric atom against any value using numeric coercion. */
export function atomEqNumber(expectedNumber, actual) {
  const c = coerceNumber(actual);
  return c.ok && c.value === expectedNumber;
}

/** Compare 'expected' boolean atom against any value with boolean coercion. */
export function atomEqBoolean(expectedBool, actual) {
  const c = coerceBoolean(actual);
  return c.ok && c.value === expectedBool;
}

/** Compare 'expected' string/ bareword atom against any value using string coercion (with normalization). */
export function atomEqString(expectedString, actual, opts = defaultSemOpts) {
  const a = normStr(expectedString, opts);
  const { value: b } = coerceString(actual, opts);
  return a === b;
}

/* ============================== Deep structural equality ============================== */

/**
 * Deep equality used for variable unification and guard checks.
 * Rules:
 * - Primitives by === (no cross-type coercion).
 * - Numbers: +0 === -0 (JS === already does), NaN === NaN (we treat NaN equal to NaN for containers).
 * - Arrays: length + element-wise deepEq.
 * - Objects: same set of own enumerable string keys; values deepEq (order not relevant).
 * - Sets: order-insensitive; equal if sizes equal and each element deepEq-matches exactly one in the other.
 * - Maps: equal if same size and keys pairwise deepEq & values deepEq (order not relevant).
 * - Functions / symbols: by reference equality.
 */
export function deepEq(a, b, opts = defaultSemOpts, _memo = new WeakMap()) {
  if (a === b) return a !== 0 || 1 / a === 1 / b; // handle -0
  if (Number.isNaN(a) && Number.isNaN(b)) return true;

  const ta = typeof a, tb = typeof b;
  if (ta !== "object" || a === null || tb !== "object" || b === null) return false;

  // Cycle guard: memoize pair-wise checks using WeakMap of WeakMap
  let inner = _memo.get(a);
  if (!inner) { inner = new WeakMap(); _memo.set(a, inner); }
  const seen = inner.get(b);
  if (seen !== undefined) return seen;
  inner.set(b, true);

  // Arrays
  if (isArr(a) || isArr(b)) {
    if (!(isArr(a) && isArr(b))) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEq(a[i], b[i], opts, _memo)) return false;
    return true;
  }

  // Sets
  if (isSet(a) || isSet(b)) {
    if (!(isSet(a) && isSet(b))) return false;
    if (a.size !== b.size) return false;
    // Greedy matching via backtracking (small sets expected)
    const used = new Set();
    const arrA = Array.from(a), arrB = Array.from(b);
    const tryMatch = (i) => {
      if (i === arrA.length) return true;
      for (let j = 0; j < arrB.length; j++) {
        if (used.has(j)) continue;
        if (deepEq(arrA[i], arrB[j], opts, _memo)) {
          used.add(j);
          if (tryMatch(i + 1)) return true;
          used.delete(j);
        }
      }
      return false;
    };
    return tryMatch(0);
  }

  // Maps
  if (isMap(a) || isMap(b)) {
    if (!(isMap(a) && isMap(b))) return false;
    if (a.size !== b.size) return false;
    // Map keys can be non-primitive; need pairwise matching
    const entriesA = Array.from(a.entries());
    const entriesB = Array.from(b.entries());
    const used = new Set();
    const tryMatch = (i) => {
      if (i === entriesA.length) return true;
      const [ka, va] = entriesA[i];
      for (let j = 0; j < entriesB.length; j++) {
        if (used.has(j)) continue;
        const [kb, vb] = entriesB[j];
        if (deepEq(ka, kb, opts, _memo) && deepEq(va, vb, opts, _memo)) {
          used.add(j);
          if (tryMatch(i + 1)) return true;
          used.delete(j);
        }
      }
      return false;
    };
    return tryMatch(0);
  }

  // Plain objects
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    // Ensure same key set (string keys only)
    ka.sort(); kb.sort();
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return false;
    for (let i = 0; i < ka.length; i++) {
      const k = ka[i];
      if (!deepEq(a[k], b[k], opts, _memo)) return false;
    }
    return true;
  }

  // Fallback for other objects (Date, RegExp, etc.): use valueOf/ toString heuristics
  // to keep deterministic behavior without special-casing every type.
  try {
    if (a.valueOf !== Object.prototype.valueOf || b.valueOf !== Object.prototype.valueOf) {
      const va = a.valueOf(), vb = b.valueOf();
      if (va !== a || vb !== b) return deepEq(va, vb, opts, _memo);
    }
    if (a.toString !== Object.prototype.toString || b.toString !== Object.prototype.toString) {
      return a.toString() === b.toString();
    }
  } catch (_) {}
  return false;
}

/* ============================== Variable environment ============================== */

/**
 * Trail-based environment for variable bindings.
 * Backtracking-friendly: snapshot() → index; rollback(index); commit(index).
 */
export class Env {
  constructor(initial = null) {
    /** @type {Map<string, any>} */
    this.map = new Map();
    this.trail = []; // records of {name, had, prev}
    if (initial) {
      for (const [k, v] of Object.entries(initial)) this.map.set(k, v);
    }
  }

  isBound(name) { return this.map.has(name); }
  get(name) { return this.map.get(name); }

  /** Bind if unbound; if bound, enforce deep equality. Returns boolean success. */
  bindOrCheck(name, value, opts = defaultSemOpts) {
    if (!this.map.has(name)) {
      this.trail.push({ name, had: false, prev: undefined });
      this.map.set(name, value);
      return true;
    }
    const ok = deepEq(this.map.get(name), value, opts);
    return ok;
  }

  /** Force-bind (used after a successful submatch that computed a value). */
  bind(name, value) {
    if (!this.map.has(name)) {
      this.trail.push({ name, had: false, prev: undefined });
    } else {
      const prev = this.map.get(name);
      this.trail.push({ name, had: true, prev });
    }
    this.map.set(name, value);
  }

  /** Snapshot trail size for rollback/commit. */
  snapshot() { return this.trail.length; }

  rollback(to) {
    for (let i = this.trail.length - 1; i >= to; i--) {
      const rec = this.trail[i];
      if (rec.had) this.map.set(rec.name, rec.prev);
      else this.map.delete(rec.name);
    }
    this.trail.length = to;
  }

  commit(to) {
    // Commit by discarding trail records up to 'to'
    this.trail.splice(to, this.trail.length - to);
  }

  /** Shallow read-only clone (no bindings copied to new trail). */
  cloneRO() {
    const e = new Env();
    e.map = new Map(this.map);
    return e;
  }
}

/* ============================== Slice & reference utilities ============================== */

/** Array slice reference (by identity + half-open [start,end) indices). */
export function makeArraySlice(arrRef, start, end) {
  if (!isArr(arrRef)) throw new TypeError("makeArraySlice: arrRef must be an array");
  if (start < 0 || end < start || end > arrRef.length) throw new RangeError("Invalid slice bounds");
  return Object.freeze({ kind: "array-slice", ref: arrRef, start, end });
}

/** Object value reference (points to a specific key's value in a plain object or Map). */
export function makeObjectValueRef(objRef, key) {
  if (!(isObj(objRef) || isMap(objRef))) throw new TypeError("makeObjectValueRef: objRef must be object or Map");
  return Object.freeze({ kind: "object-value", ref: objRef, key });
}

/** Object-keys slice (a set of keys matched by a kPat, for counting or replacement). */
export function makeObjectKeysSlice(objRef, keysIterable) {
  const keys = new Set(keysIterable);
  return Object.freeze({ kind: "object-keys", ref: objRef, keys });
}

/* ============================== Coverage (anchoring) ============================== */

/**
 * Coverage tracks which keys of an object have been "described" by kv-patterns.
 * Used to enforce anchored-object semantics (every prop must be covered unless '..').
 */
export class Coverage {
  constructor(objRef) {
    this.ref = objRef;
    this.covered = new Set(); // keys (string for plain objects; key objects for Map)
    this._trail = []; // push key when first added so we can rollback
    this._size = isMap(objRef) ? objRef.size : Object.keys(objRef).length;
  }

  /** Mark a key as covered. Returns true if it changed the set. */
  add(key) {
    if (this.covered.has(key)) return false;
    this.covered.add(key);
    this._trail.push(key);
    return true;
  }

  /** Snapshot/rollback/commit for backtracking. */
  snapshot() { return this._trail.length; }
  rollback(to) {
    for (let i = this._trail.length - 1; i >= to; i--) {
      const k = this._trail[i];
      this.covered.delete(k);
    }
    this._trail.length = to;
  }
  commit(to) {
    this._trail.splice(to, this._trail.length - to);
  }

  /** Has every key been covered at least once? */
  isFull() { return this.covered.size === this._size; }
  size() { return this.covered.size; }
  total() { return this._size; }
}

/* ============================== Misc helpers used by the engine ============================== */

/** Enumerate candidate keys of objRef whose key matches a predicate. Works for object or Map. */
export function enumerateKeys(objRef, keyPredicate /* (key)->bool */) {
  if (isMap(objRef)) {
    const out = [];
    for (const k of objRef.keys()) if (keyPredicate(k)) out.push(k);
    return out;
  }
  const out = [];
  for (const k of Object.keys(objRef)) if (keyPredicate(k)) out.push(k);
  return out;
}

/** Get value by key from object or Map. */
export function getValue(objRef, key) {
  return isMap(objRef) ? objRef.get(key) : objRef[key];
}

/** Count keys of objRef that satisfy (kPred && vPred). Non-consuming; stable across backtracking. */
export function countKeys(objRef, kPred, vPred) {
  let c = 0;
  if (isMap(objRef)) {
    for (const [k, v] of objRef.entries()) if (kPred(k) && vPred(v, k)) c++;
  } else {
    for (const k of Object.keys(objRef)) {
      const v = objRef[k];
      if (kPred(k) && vPred(v, k)) c++;
    }
  }
  return c;
}

/** Shallow clone-arr/object for immutable replace operations (engine will use this). */
export function cloneShallow(value) {
  if (isArr(value)) return value.slice();
  if (isObj(value)) return Object.assign({}, value);
  if (isMap(value)) return new Map(value);
  if (isSet(value)) return new Set(value);
  return value; // primitives by value
}

/* ============================== Export convenience for engine ============================== */

export const Semantics = Object.freeze({
  defaultSemOpts,
  coerceNumber,
  coerceBoolean,
  coerceString,
  regexFull,
  atomEqNumber,
  atomEqBoolean,
  atomEqString,
  deepEq,
  Env,
  makeArraySlice,
  makeObjectValueRef,
  makeObjectKeysSlice,
  Coverage,
  enumerateKeys,
  getValue,
  countKeys,
  cloneShallow,
});
