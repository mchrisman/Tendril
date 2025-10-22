// tendril-api.js — public API matching V1 surface

import {parsePattern} from './tendril-parser.js';
import {match, scan} from './tendril-engine.js';
import {deepEqual} from './tendril-util.js';

// ------------------- Compile & cache -------------------

const CACHE_MAX = 64;
const _cache = new Map(); // pattern -> ast (LRU-ish)

function compile(pattern) {
  if (pattern && pattern.type) return pattern; // already compiled (any AST node)
  if (_cache.has(pattern)) {
    const hit = _cache.get(pattern);
    // simple LRU touch
    _cache.delete(pattern);
    _cache.set(pattern, hit);
    return hit;
  }
  const ast = parsePattern(String(pattern));
  _cache.set(pattern, ast);
  if (_cache.size > CACHE_MAX) {
    // evict oldest
    const k = _cache.keys().next().value;
    _cache.delete(k);
  }
  return ast;
}

// ------------------- Solutions class -------------------

/**
 * Lazy iterable wrapper for solutions with combinators
 */
class Solutions {
  constructor(genFactory) {
    this._genFactory = genFactory;
    this._filters = [];
    this._uniqueSpec = null;
    this._uniqueByFn = null;
    this._takeN = null;
  }

  unique(...vars) {
    if (vars.length === 0) return this;
    const next = new Solutions(this._genFactory);
    next._filters = this._filters.slice();
    next._takeN = this._takeN;
    next._uniqueSpec = {vars};
    next._uniqueByFn = this._uniqueByFn;
    return next;
  }

  uniqueBy(keyFn) {
    const next = new Solutions(this._genFactory);
    next._filters = this._filters.slice();
    next._takeN = this._takeN;
    next._uniqueSpec = this._uniqueSpec;
    next._uniqueByFn = keyFn;
    return next;
  }

  filter(pred) {
    const next = new Solutions(this._genFactory);
    next._filters = this._filters.concat([pred]);
    next._takeN = this._takeN;
    next._uniqueSpec = this._uniqueSpec;
    next._uniqueByFn = this._uniqueByFn;
    return next;
  }

  take(n) {
    const next = new Solutions(this._genFactory);
    next._filters = this._filters.slice();
    next._takeN = Math.max(0, n | 0);
    next._uniqueSpec = this._uniqueSpec;
    next._uniqueByFn = this._uniqueByFn;
    return next;
  }

  map(f) {
    const self = this;
    return {
      [Symbol.iterator]() {
        const base = self[Symbol.iterator]();
        return {
          next() {
            const n = base.next();
            if (n.done) return n;
            return {value: f(n.value.bindings), done: false};
          }
        };
      }
    };
  }

  project(f) {
    const out = [];
    for (const sol of this) out.push(f(sol.bindings));
    return out;
  }

  extract(f) {
    return this.project(f);
  }

  forEach(f) {
    for (const s of this) f(s);
  }

  toArray() {
    return Array.from(this);
  }

  first() {
    const it = this[Symbol.iterator]();
    const n = it.next();
    return n.done ? null : n.value;
  }

  count() {
    let c = 0;
    for (const _ of this) c++;
    return c;
  }

  [Symbol.iterator]() {
    const baseIt = this._genFactory()[Symbol.iterator]();
    const filters = this._filters;
    const unique = this._uniqueSpec;
    const uniqueByFn = this._uniqueByFn;
    const takeN = this._takeN;
    const seen = (unique || uniqueByFn) ? new Set() : null;
    let yielded = 0;

    return {
      next: () => {
        while (true) {
          const n = baseIt.next();
          if (n.done) return n;
          const sol = n.value;

          // Apply filters
          let ok = true;
          for (const f of filters) {
            if (!f(sol)) {
              ok = false;
              break;
            }
          }
          if (!ok) continue;

          // Apply uniqueness
          if (seen) {
            let key;
            if (uniqueByFn) {
              // Custom key function
              key = stableKey(uniqueByFn(sol));
            } else if (unique) {
              // Projected bindings
              key = stableKey(projectBindings(sol.bindings, unique.vars));
            }
            if (seen.has(key)) continue;
            seen.add(key);
          }

          // Apply take limit
          if (takeN != null && yielded >= takeN) {
            return {value: undefined, done: true};
          }
          yielded++;
          return {value: sol, done: false};
        }
      }
    };
  }
}

// ------------------- Tendril class -------------------

/**
 * Main Tendril pattern matching class
 */
class TendrilImpl {
  constructor(pattern) {
    this._pattern = String(pattern);
    this._ast = null;
    this._env = null;
    this._opts = {};
    this._debug = null;
  }

  withEnv(env) {
    const t = new TendrilImpl(this._pattern);
    t._ast = this._ast;
    t._env = env;
    t._opts = this._opts;
    t._debug = this._debug;
    return t;
  }

  withOptions(opts) {
    const t = new TendrilImpl(this._pattern);
    t._ast = this._ast;
    t._env = this._env;
    t._opts = {...this._opts, ...opts};
    t._debug = this._debug;
    return t;
  }

  debug(listener) {
    const t = new TendrilImpl(this._pattern);
    t._ast = this._ast;
    t._env = this._env;
    t._opts = this._opts;
    t._debug = listener;
    return t;
  }

  solutions(input) {
    const ast = this._ast || (this._ast = compile(this._pattern));
    const opts = {...this._opts};
    if (this._debug) {
      opts.debug = this._debug;
    }
    const genFactory = function* () {
      const rawSolutions = match(ast, input, opts);
      for (const sol of rawSolutions) {
        // Convert sites Map to 'at' object for V1 compatibility
        const at = {};
        for (const [varName, siteList] of sol.sites) {
          at[varName] = siteList;
        }
        yield {bindings: sol.bindings, at, sites: sol.sites};
      }
    };
    return new Solutions(genFactory);
  }

  occurrences(input) {
    const ast = this._ast || (this._ast = compile(this._pattern));
    const opts = {...this._opts};
    if (this._debug) {
      opts.debug = this._debug;
    }
    const genFactory = function* () {
      const rawOccurrences = scan(ast, input, opts);
      for (const sol of rawOccurrences) {
        // Convert sites Map to 'at' object for V1 compatibility
        const at = {};
        for (const [varName, siteList] of sol.sites) {
          at[varName] = siteList;
        }
        yield {bindings: sol.bindings, at, sites: sol.sites};
      }
    };
    return new Solutions(genFactory);
  }

  match(input) {
    return this.solutions(input).first();
  }

  all(input) {
    return this.solutions(input).toArray();
  }

  replace(input, fnOrValue) {
    // Use only the first solution (greedy quantifiers ensure longest match comes first)
    const sol = this.solutions(input).first();
    if (!sol) return input;

    const edits = [];
    // If not a function, treat as $0 replacement
    const plan = typeof fnOrValue === 'function'
      ? fnOrValue(sol.bindings) || {}
      : {'0': fnOrValue};

    for (const [varName, to] of Object.entries(plan)) {
      const key = varName.startsWith('$') ? varName.slice(1) : varName;
      const spots = sol.at[key] || [];
      for (const site of spots) {
        edits.push({site, to});
      }
    }
    return applyEdits(input, edits);
  }

  replaceAll(input, fnOrValue) {
    // Collect all occurrences with their replacement plans
    const allOccurrences = Array.from(this.occurrences(input)).map(sol => {
      const plan = typeof fnOrValue === 'function'
        ? fnOrValue(sol.bindings) || {}
        : {'0': fnOrValue};
      return {sol, plan};
    });

    // Sort by depth (deepest first) for safe replacement
    allOccurrences.sort((a, b) => {
      const depthA = a.sol.at['0']?.[0]?.path?.length || 0;
      const depthB = b.sol.at['0']?.[0]?.path?.length || 0;
      return depthB - depthA;
    });

    // Collect all edits
    const edits = [];
    for (const {sol, plan} of allOccurrences) {
      for (const [varName, to] of Object.entries(plan)) {
        const key = varName.startsWith('$') ? varName.slice(1) : varName;
        const spots = sol.at[key] || [];
        for (const site of spots) {
          edits.push({site, to});
        }
      }
    }

    return applyEdits(input, edits);
  }

  edit(input, f) {
    const edits = [];
    for (const sol of this.solutions(input)) {
      const list = f(sol) || [];
      for (const e of list) edits.push(e);
    }
    return applyEdits(input, edits);
  }
}

/**
 * Fluent API factory function
 */
export function Tendril(pattern) {
  return new TendrilImpl(pattern);
}

// ------------------- Convenience functions -------------------

// Helper: filter out $0 from bindings for extraction
function filterBindings(bindings) {
  const {0: _, ...rest} = bindings;
  return rest;
}

export function matches(pattern, input) {
  return Tendril(pattern).match(input) !== null;
}

export function extract(pattern, input) {
  const s = Tendril(pattern).match(input);
  return s ? filterBindings(s.bindings) : null;
}

export function extractAll(pattern, input) {
  return Tendril(pattern).solutions(input).project(b => filterBindings(b));
}

export function replaceAll(pattern, input, builder) {
  return Tendril(pattern).replaceAll(input, builder);
}

export function uniqueMatches(pattern, input, ...vars) {
  return Tendril(pattern).solutions(input).unique(...vars).project(b => b);
}

// ------------------- Slice class -------------------

/**
 * Slice — wrapper for slice bindings and replacements
 * Represents a contiguous subsequence of an array or subset of object properties
 */
export class Slice {
  constructor(type, value) {
    // Make internal properties non-enumerable so they don't pollute spreading
    Object.defineProperty(this, '_type', {
      value: type,
      writable: false,
      enumerable: false,
      configurable: false
    });
    Object.defineProperty(this, '_value', {
      value: value,
      writable: false,
      enumerable: false,
      configurable: false
    });

    if (type === "array") {
      // Copy array elements as numeric properties
      value.forEach((v, i) => { this[i] = v; });
      this.length = value.length;
    } else if (type === "object") {
      Object.assign(this, value);
    }
  }

  // Factory methods
  static array(...items) {
    return new Slice("array", items);
  }

  static object(obj) {
    return new Slice("object", obj);
  }

  // Iterable protocol (for [...s])
  [Symbol.iterator]() {
    if (this._type !== "array") {
      throw new TypeError("Object-type Slice is not iterable");
    }
    let i = 0;
    const arr = this._value;
    return {
      next() {
        return i < arr.length ? { value: arr[i++], done: false } : { done: true };
      }
    };
  }

  // Index access (s[2])
  get [Symbol.toStringTag]() {
    return `Slice(${this._type})`;
  }

  // Optional: convenience to mimic array indexing directly
  at(i) {
    if (this._type === "array") return this._value[i];
    throw new TypeError("Not an array slice");
  }
}

// ------------------- Replacement implementation -------------------

function applyEdits(input, edits) {
  if (edits.length === 0) return input;

  // Mutate input in-place (except for root replacement which requires returning new value)
  let result = input;

  // Group edits by path
  const editsByPath = new Map();
  for (const edit of edits) {
    const pathKey = JSON.stringify(edit.site.path);
    if (!editsByPath.has(pathKey)) {
      editsByPath.set(pathKey, []);
    }
    editsByPath.get(pathKey).push(edit);
  }

  // Apply edits path by path
  for (const [pathKey, pathEdits] of editsByPath) {
    // Separate scalar sets from array splices
    const sets = pathEdits.filter(e => e.site.kind === 'scalar');
    const splices = pathEdits.filter(e => e.site.kind === 'slice');

    // Apply scalar sets
    for (const edit of sets) {
      const current = getAt(result, edit.site.path);
      // Compare-and-set: only replace if current value matches what was matched
      if (deepEqual(current, edit.site.valueRef)) {
        if (edit.site.path.length === 0) {
          // Root replacement: return new value (can't mutate primitives)
          result = edit.to;
        } else {
          setAtMutate(result, edit.site.path, edit.to);
        }
      }
    }

    // Apply splices (needs index adjustment for arrays)
    if (splices.length > 0) {
      // Separate array slices from object slices
      const arraySplices = splices.filter(e => e.site.sliceStart !== undefined);
      const objectSplices = splices.filter(e => e.site.keys !== undefined);

      // Handle array splices
      if (arraySplices.length > 0) {
        // Sort by sliceStart ascending (leftmost first)
        arraySplices.sort((a, b) => a.site.sliceStart - b.site.sliceStart);

        let offset = 0;
        for (const edit of arraySplices) {
          const arr = getAt(result, edit.site.path);
          if (!Array.isArray(arr)) continue;

          // Adjust indices by cumulative offset
          const start = edit.site.sliceStart + offset;
          const end = edit.site.sliceEnd + offset;

          // Compare-and-set: verify all elements still match
          let allMatch = true;
          for (let i = 0; i < edit.site.valueRefs.length; i++) {
            if (!deepEqual(arr[start + i], edit.site.valueRefs[i])) {
              allMatch = false;
              break;
            }
          }

          if (allMatch) {
            // Slice replacements MUST use Slice wrapper
            if (!edit.to || !(edit.to instanceof Slice) || edit.to._type !== 'array') {
              throw new Error(
                `Array slice variable replacement must use Slice.array(). ` +
                `Use: replace(data, $ => ({varName: Slice.array(...elements)}))`
              );
            }

            // Extract replacement elements from Slice wrapper
            const elements = edit.to._value;

            // Splice out old, splice in new (mutates arr in-place)
            const oldLength = end - start;
            const newLength = elements.length;
            arr.splice(start, oldLength, ...elements);
            offset += (newLength - oldLength);
          }
        }
      }

      // Handle object splices
      for (const edit of objectSplices) {
        const obj = getAt(result, edit.site.path);
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) continue;

        // Compare-and-set: verify all keys/values still match
        let allMatch = true;
        for (const key of edit.site.keys) {
          if (!deepEqual(obj[key], edit.site.valueRefs[key])) {
            allMatch = false;
            break;
          }
        }

        if (allMatch) {
          // Object slice replacements MUST use Slice.object()
          if (!edit.to || !(edit.to instanceof Slice) || edit.to._type !== 'object') {
            throw new Error(
              `Object slice variable replacement must use Slice.object(). ` +
              `Use: replace(data, $ => ({varName: Slice.object({...props})}))`
            );
          }

          // Remove old keys, merge in new properties (mutates obj in-place)
          const newProps = edit.to._value;
          for (const key of edit.site.keys) {
            delete obj[key];
          }
          Object.assign(obj, newProps);
        }
      }
    }
  }

  return result;
}

// Helper: navigate path to get value
function getAt(root, path) {
  let current = root;
  for (const key of path) {
    current = current[key];
  }
  return current;
}

// Helper: navigate path and set value (mutates in-place)
function setAtMutate(root, path, value) {
  let current = root;
  for (let i = 0; i < path.length - 1; i++) {
    current = current[path[i]];
  }
  current[path[path.length - 1]] = value;
}

// Helper: project bindings by selected vars
function projectBindings(b, vars) {
  const out = {};
  for (const v of vars) {
    const key = v.startsWith('$') ? v.slice(1) : v;
    if (Object.prototype.hasOwnProperty.call(b, key)) out[key] = b[key];
  }
  return out;
}

// Helper: stable key for deduplication
function stableKey(v) {
  const seen = new WeakMap();
  let id = 0;
  const enc = (x) => {
    if (x === null) return ["null"];
    const t = typeof x;
    if (t === "undefined") return ["u"];
    if (t === "number") return ["n", Number.isNaN(x) ? "NaN" : String(x)];
    if (t === "boolean") return ["b", x ? "1" : "0"];
    if (t === "string") return ["s", x];
    if (t === "function") return ["f"];
    if (t !== "object") return ["o", String(x)];
    if (seen.has(x)) return ["r", seen.get(x)];
    seen.set(x, ++id);
    if (Array.isArray(x)) return ["A", x.map(enc)];
    const keys = Object.keys(x).sort();
    return ["O", keys.map(k => [k, enc(x[k])])];
  };
  return JSON.stringify(enc(v));
}
