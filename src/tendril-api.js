// tendril-api.js — public API matching V1 surface

import {parsePattern} from './tendril-parser.js';
import {matchProgram} from './tendril-engine.js';

// ------------------- Compile & cache -------------------

const CACHE_MAX = 64;
const _cache = new Map(); // pattern -> ast (LRU-ish)

function compile(pattern) {
  if (pattern && pattern.type === 'Program') return pattern; // already compiled
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
    this._takeN = null;
  }

  unique(...vars) {
    if (vars.length === 0) return this;
    const next = new Solutions(this._genFactory);
    next._filters = this._filters.slice();
    next._takeN = this._takeN;
    next._uniqueSpec = {vars};
    return next;
  }

  filter(pred) {
    const next = new Solutions(this._genFactory);
    next._filters = this._filters.concat([pred]);
    next._takeN = this._takeN;
    next._uniqueSpec = this._uniqueSpec;
    return next;
  }

  take(n) {
    const next = new Solutions(this._genFactory);
    next._filters = this._filters.slice();
    next._takeN = Math.max(0, n | 0);
    next._uniqueSpec = this._uniqueSpec;
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
    const takeN = this._takeN;
    const seen = unique ? new Set() : null;
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
            const key = stableKey(projectBindings(sol.bindings, unique.vars));
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
  }

  solutions(input) {
    const ast = this._ast || (this._ast = compile(this._pattern));
    const genFactory = function* () {
      const rawSolutions = matchProgram(ast, input);
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

  match(input) {
    return this.solutions(input).first();
  }

  all(input) {
    return this.solutions(input).toArray();
  }

  replace(input, f) {
    const edits = [];
    for (const sol of this.solutions(input)) {
      const plan = f(sol.bindings) || {};
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
}

/**
 * Fluent API factory function
 */
export function Tendril(pattern) {
  return new TendrilImpl(pattern);
}

// ------------------- Convenience functions -------------------

export function matches(pattern, input) {
  return Tendril(pattern).match(input) !== null;
}

export function extract(pattern, input) {
  const s = Tendril(pattern).match(input);
  return s ? s.bindings : null;
}

export function extractAll(pattern, input) {
  return Tendril(pattern).solutions(input).project(b => b);
}

export function replaceAll(pattern, input, builder) {
  return Tendril(pattern).replace(input, b => ({$out: builder(b)}));
}

// ------------------- Slice helper -------------------

/**
 * Slice() — helper to wrap slice replacement values
 * Usage: t.replace(input, v => ({pair: Slice(v.x, v.x, v.x)}))
 */
export function Slice(...elements) {
  return {__slice__: true, elements};
}

// ------------------- Replacement implementation -------------------

function applyEdits(input, edits) {
  if (edits.length === 0) return input;

  let root = deepClone(input);

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
      const current = getAt(root, edit.site.path);
      // Identity check: only replace if current value is same object
      if (Object.is(current, edit.site.valueRef)) {
        root = setAt(root, edit.site.path, edit.to);
      }
    }

    // Apply splices (needs index adjustment)
    if (splices.length > 0) {
      // Sort by sliceStart ascending (leftmost first - Option C)
      splices.sort((a, b) => a.site.sliceStart - b.site.sliceStart);

      let offset = 0;
      for (const edit of splices) {
        const arr = getAt(root, edit.site.path);
        if (!Array.isArray(arr)) continue;

        // Adjust indices by cumulative offset
        const start = edit.site.sliceStart + offset;
        const end = edit.site.sliceEnd + offset;

        // Identity check: verify all elements still match
        let allMatch = true;
        for (let i = 0; i < edit.site.valueRefs.length; i++) {
          if (!Object.is(arr[start + i], edit.site.valueRefs[i])) {
            allMatch = false;
            break;
          }
        }

        if (allMatch) {
          // Extract replacement elements from Slice wrapper
          const elements = edit.to && edit.to.__slice__ ? edit.to.elements : [edit.to];

          // Splice out old, splice in new
          const oldLength = end - start;
          const newLength = elements.length;
          arr.splice(start, oldLength, ...elements);
          offset += (newLength - oldLength);
        }
      }
    }
  }

  return root;
}

// Helper: navigate path to get value
function getAt(root, path) {
  let current = root;
  for (const key of path) {
    current = current[key];
  }
  return current;
}

// Helper: navigate path and set value (immutable-style)
function setAt(root, path, value) {
  if (path.length === 0) return value;

  const [head, ...tail] = path;
  const isArray = Array.isArray(root);
  const copy = isArray ? [...root] : {...root};
  copy[head] = setAt(root[head], tail, value);
  return copy;
}

// Helper: deep clone
function deepClone(x) {
  if (Array.isArray(x)) return x.map(deepClone);
  if (x && typeof x === 'object') {
    const o = {};
    for (const k of Object.keys(x)) o[k] = deepClone(x[k]);
    return o;
  }
  return x;
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
