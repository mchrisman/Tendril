// tendril-api.js — public API vNext (engine-compatible)
//
// NOTE:
// - Group is kept for internal use and for tendril-engine.js.
//   Users see plain arrays/objects for @-bindings.
// - $0 (the automatic whole-match binding) is used internally for
//   locating/replacing, but hidden from user-visible bindings.

import {parsePattern} from './tendril-parser.js';
import {
  match as engineMatch,
  scan as engineScan,
  matchExists as engineMatchExists,
  matchFirst as engineMatchFirst,
  scanExists as engineScanExists,
  scanFirst as engineScanFirst,
} from './tendril-engine.js';
import {deepEqual} from './tendril-util.js';

// ------------------- Compile & cache -------------------

const CACHE_MAX = 64;
const _cache = new Map(); // pattern -> ast (LRU-ish)

function compile(pattern) {
  if (pattern && pattern.type) return pattern; // already compiled AST
  if (_cache.has(pattern)) {
    const hit = _cache.get(pattern);
    _cache.delete(pattern);
    _cache.set(pattern, hit);
    return hit;
  }
  let ast = parsePattern(String(pattern));

  // Wrap AST with $0 binding to capture entire match region
  ast = {type: 'SBind', name: '0', pat: ast};

  _cache.set(pattern, ast);
  if (_cache.size > CACHE_MAX) {
    const k = _cache.keys().next().value;
    _cache.delete(k);
  }
  return ast;
}

// ------------------- Group class (internal representation) -------------------

/**
 * Group — wrapper for group bindings and replacements
 * Represents a contiguous subsequence of an array or subset of object properties.
 *
 * This is used internally by the engine and replacement logic.
 * User-facing APIs never expose Group instances; they see plain arrays/objects.
 */
export class Group {
  constructor(type, value) {
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

    if (type === 'array') {
      value.forEach((v, i) => {
        this[i] = v;
      });
      this.length = value.length;
    } else if (type === 'object') {
      Object.assign(this, value);
    }
  }

  static array(...items) {
    return new Group('array', items);
  }

  static object(obj) {
    return new Group('object', obj);
  }

  [Symbol.iterator]() {
    if (this._type !== 'array') {
      throw new TypeError('Object-type Group is not iterable');
    }
    let i = 0;
    const arr = this._value;
    return {
      next() {
        return i < arr.length ? {value: arr[i++], done: false} : {done: true};
      }
    };
  }

  get [Symbol.toStringTag]() {
    return `Group(${this._type})`;
  }

  at(i) {
    if (this._type === 'array') return this._value[i];
    throw new TypeError('Not an array group');
  }
}

// ------------------- Helper utilities -------------------

// Deep clone JSON-like values (arrays/objects/primitives)
function cloneDeep(v) {
  if (Array.isArray(v)) {
    return v.map(cloneDeep);
  }
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) {
      out[k] = cloneDeep(v[k]);
    }
    return out;
  }
  return v;
}

// Convert internal Group values into plain arrays/objects for bindings
function groupToPublicValue(v) {
  // Duck-type check for Group (works across different Group class instances)
  if (!v || typeof v !== 'object' || !v._type || !v._value) return v;
  if (v._type === 'array') {
    // New array to avoid aliasing; underlying _value is already an array
    return v._value.slice ? v._value.slice() : [...v._value];
  }
  if (v._type === 'object') {
    return {...v._value};
  }
  return v;
}

// Normalize bindings for user:
// - Strip $0 (key "0")
// - Convert Group values to plain arrays/objects
function normalizeBindings(rawBindings, {includeWhole = false} = {}) {
  const out = {};
  for (const [k, v] of Object.entries(rawBindings)) {
    if (k === '0' && !includeWhole) continue;
    out[k] = groupToPublicValue(v);
  }
  return out;
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

// Helper: project bindings by selected vars ($-prefix supported)
function projectBindings(b, vars) {
  const out = {};
  for (const v of vars) {
    const key = v.startsWith('$') ? v.slice(1) : v;
    if (Object.prototype.hasOwnProperty.call(b, key)) out[key] = b[key];
  }
  return out;
}

// Helper: stable key for deduplication across arbitrary JS structures
function stableKey(v) {
  const seen = new WeakMap();
  let id = 0;
  const enc = (x) => {
    if (x === null) return ['null'];
    const t = typeof x;
    if (t === 'undefined') return ['u'];
    if (t === 'number') return ['n', Number.isNaN(x) ? 'NaN' : String(x)];
    if (t === 'boolean') return ['b', x ? '1' : '0'];
    if (t === 'string') return ['s', x];
    if (t === 'function') return ['f'];
    if (t !== 'object') return ['o', String(x)];
    if (seen.has(x)) return ['r', seen.get(x)];
    seen.set(x, ++id);
    if (Array.isArray(x)) return ['A', x.map(enc)];
    const keys = Object.keys(x).sort();
    return ['O', keys.map(k => [k, enc(x[k])])];
  };
  return JSON.stringify(enc(v));
}

// ------------------- Replacement implementation (mutating) -------------------

/**
 * applyEdits mutates the given root in-place.
 * For pure operations, call it on a deep clone.
 */
function applyEdits(root, edits) {
  if (edits.length === 0) return root;

  let result = root;

  // Group edits by path
  const editsByPath = new Map();
  for (const edit of edits) {
    const pathKey = JSON.stringify(edit.site.path);
    if (!editsByPath.has(pathKey)) {
      editsByPath.set(pathKey, []);
    }
    editsByPath.get(pathKey).push(edit);
  }

  // Apply edits per path
  for (const [, pathEdits] of editsByPath) {
    const sets = pathEdits.filter(e => e.site.kind === 'scalar');
    const splices = pathEdits.filter(e => e.site.kind === 'group');

    // Scalar replacements
    for (const edit of sets) {
      const current = getAt(result, edit.site.path);
      if (deepEqual(current, edit.site.valueRef)) {
        if (edit.site.path.length === 0) {
          result = edit.to;
        } else {
          setAtMutate(result, edit.site.path, edit.to);
        }
      }
    }

    // Group (array/object) replacements
    if (splices.length > 0) {
      const arraySplices = splices.filter(e => e.site.groupStart !== undefined);
      const objectSplices = splices.filter(e => e.site.keys !== undefined);

      // Array group splices
      if (arraySplices.length > 0) {
        arraySplices.sort((a, b) => a.site.groupStart - b.site.groupStart);

        let offset = 0;
        for (const edit of arraySplices) {
          const arr = getAt(result, edit.site.path);
          if (!Array.isArray(arr)) continue;

          const start = edit.site.groupStart + offset;
          const end = edit.site.groupEnd + offset;

          let allMatch = true;
          for (let i = 0; i < edit.site.valueRefs.length; i++) {
            if (!deepEqual(arr[start + i], edit.site.valueRefs[i])) {
              allMatch = false;
              break;
            }
          }

          if (allMatch) {
            if (!edit.to || !(edit.to instanceof Group) || edit.to._type !== 'array') {
              throw new Error(
                'Array group variable replacement must use Group.array() internally.'
              );
            }

            const elements = edit.to._value;
            const oldLength = end - start;
            const newLength = elements.length;
            arr.splice(start, oldLength, ...elements);
            offset += (newLength - oldLength);
          }
        }
      }

      // Object group "splices"
      for (const edit of objectSplices) {
        const obj = getAt(result, edit.site.path);
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) continue;

        let allMatch = true;
        for (const key of edit.site.keys) {
          if (!deepEqual(obj[key], edit.site.valueRefs[key])) {
            allMatch = false;
            break;
          }
        }

        if (allMatch) {
          if (!edit.to || !(edit.to instanceof Group) || edit.to._type !== 'object') {
            throw new Error(
              'Object group variable replacement must use Group.object() internally.'
            );
          }

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

// ------------------- Core data structures: Match, Solution, MatchSet -------------------

class Match {
  constructor(root, path, rawSolutions, matchSet) {
    this._root = root;
    this._path = path;
    this._rawSolutions = rawSolutions;
    this._matchSet = matchSet;

    // Precompute solutions for this match
    this._solutions = rawSolutions.map(raw => new Solution(raw, this, matchSet));
    // $0 site (first one) for replacements/editing
    const zeroSites = rawSolutions[0]?.sites.get('0') || [];
    this._zeroSite = zeroSites[0] || null;
  }

  path() {
    return [...this._path];
  }

  value() {
    if (!this._zeroSite) return undefined;
    return getAt(this._root, this._zeroSite.path);
  }

  /**
   * Iterator of Solution objects for this match.
   */
  solutions() {
    const sols = this._solutions;
    return {
      [Symbol.iterator]() {
        let i = 0;
        return {
          next() {
            if (i >= sols.length) return {done: true};
            return {value: sols[i++], done: false};
          }
        };
      }
    };
  }

  /**
   * Pure replace: returns a NEW root with this match replaced.
   * Uses first solution of this match.
   */
  replace(replOrFn) {
    if (!this._zeroSite) return this._root;

    const firstSol = this._solutions[0] || null;
    const to = (typeof replOrFn === 'function')
      ? replOrFn(firstSol)
      : replOrFn;

    const edits = [{site: this._zeroSite, to}];
    const cloned = cloneDeep(this._root);
    return applyEdits(cloned, edits);
  }

  /**
   * Mutating edit: modifies variables in-place for this match.
   *
   * Forms:
   *   edit("x", $ => $.x * 2)
   *   edit($ => ({ x: $.y, y: $.x }))
   *   edit({ x: $ => $.y, y: $ => $.x })
   */
  edit(arg1, arg2) {
    const {planFactory} = normalizeEditArgs(arg1, arg2);
    const edits = [];

    for (const sol of this._solutions) {
      const plan = planFactory(sol) || {};
      const sitesMap = sol._sites;

      for (const [varNameRaw, valueSpec] of Object.entries(plan)) {
        const varName = varNameRaw.startsWith('$')
          ? varNameRaw.slice(1)
          : varNameRaw;
        const sites = sitesMap.get(varName) || [];

        for (const site of sites) {
          const to = convertValueForSite(site, valueSpec);
          edits.push({site, to});
        }
      }
    }

    return applyEdits(this._root, edits);
  }
}

/**
 * Solution: an object representing bindings, with a .matches() method.
 * - Binding names become properties on the instance (e.g. sol.x, sol.y).
 * - $0 is NOT exposed; use Match.value() for whole-match.
 */
class Solution {
  constructor(rawSolution, match, matchSet) {
    this._match = match;
    this._matchSet = matchSet;
    this._rawSolution = rawSolution;
    this._sites = rawSolution.sites;

    const publicBindings = normalizeBindings(rawSolution.bindings, {includeWhole: false});
    this._bindings = publicBindings;

    // Copy bindings as enumerable properties
    for (const [k, v] of Object.entries(publicBindings)) {
      this[k] = v;
    }

    // Non-enumerable helper to get plain object
    Object.defineProperty(this, 'toObject', {
      value: () => ({...this._bindings}),
      enumerable: false
    });
  }

  /**
   * Iterator of Match objects with these bindings.
   * Searches across all matches in the MatchSet for equivalent bindings.
   */
  matches() {
    const myKey = stableKey(this._bindings);
    const matchSet = this._matchSet;

    return {
      [Symbol.iterator]() {
        const allMatches = [];

        // Search all matches in matchSet for equivalent bindings
        for (const m of matchSet) {
          for (const s of m._solutions) {
            if (stableKey(s._bindings) === myKey) {
              allMatches.push(m);
              break; // One solution per match is enough
            }
          }
        }

        let i = 0;
        return {
          next() {
            if (i >= allMatches.length) return {done: true};
            return {value: allMatches[i++], done: false};
          }
        };
      }
    };
  }
}

/**
 * SolutionSet: iterable of unique Solution objects with combinators.
 */
class SolutionSet {
  constructor(matchSet) {
    this._matchSet = matchSet;
  }

  [Symbol.iterator]() {
    const matches = this._matchSet._matches;
    const seen = new Set();
    let mi = 0;
    let si = 0;
    let currentMatch = matches[0] || null;

    return {
      next() {
        while (true) {
          if (!currentMatch) return {done: true};

          if (si >= currentMatch._solutions.length) {
            mi++;
            if (mi >= matches.length) return {done: true};
            currentMatch = matches[mi];
            si = 0;
            continue;
          }

          const sol = currentMatch._solutions[si++];
          const key = stableKey(sol._bindings);
          if (seen.has(key)) continue;
          seen.add(key);
          return {value: sol, done: false};
        }
      }
    };
  }

  filter(pred) {
    const filtered = [];
    for (const sol of this) {
      if (pred(sol)) filtered.push(sol);
    }
    return new FilteredSolutionSet(filtered);
  }

  take(n) {
    const limited = [];
    let count = 0;
    for (const sol of this) {
      if (count >= n) break;
      limited.push(sol);
      count++;
    }
    return new FilteredSolutionSet(limited);
  }

  first() {
    const it = this[Symbol.iterator]();
    const n = it.next();
    return n.done ? null : n.value;
  }

  toArray() {
    return Array.from(this);
  }

  count() {
    let c = 0;
    for (const _ of this) c++;
    return c;
  }
}

/**
 * FilteredSolutionSet: wrapper around pre-computed solutions array.
 */
class FilteredSolutionSet {
  constructor(solutions) {
    this._solutions = solutions;
  }

  [Symbol.iterator]() {
    return this._solutions[Symbol.iterator]();
  }

  filter(pred) {
    const filtered = this._solutions.filter(pred);
    return new FilteredSolutionSet(filtered);
  }

  take(n) {
    const limited = this._solutions.slice(0, n);
    return new FilteredSolutionSet(limited);
  }

  first() {
    return this._solutions[0] || null;
  }

  toArray() {
    return [...this._solutions];
  }

  count() {
    return this._solutions.length;
  }
}

/**
 * MatchSet: iterable of Match objects, with transformation APIs.
 */
class MatchSet {
  constructor(root, matchGroups) {
    this._root = root;
    // Each group: {path, rawSolutions}
    this._matches = matchGroups.map(
      g => new Match(root, g.path, g.rawSolutions, this)
    );
  }

  // Iterable of Match
  [Symbol.iterator]() {
    return this._matches[Symbol.iterator]();
  }

  matches() {
    return this;
  }

  hasMatch() {
    return this._matches.length > 0;
  }

  /**
   * Returns a SolutionSet of unique Solution objects across all matches.
   * "Uniqueness" is based on structural equality of bindings.
   */
  solutions() {
    return new SolutionSet(this);
  }

  /**
   * Filter matches by predicate.
   * Returns a new MatchSet containing only matches that satisfy the predicate.
   */
  filter(pred) {
    const filtered = this._matches.filter(pred);
    return new MatchSet(this._root,
      filtered.map(m => ({path: m._path, rawSolutions: m._rawSolutions}))
    );
  }

  /**
   * Take first n matches.
   * Returns a new MatchSet containing at most n matches.
   */
  take(n) {
    const limited = this._matches.slice(0, n);
    return new MatchSet(this._root,
      limited.map(m => ({path: m._path, rawSolutions: m._rawSolutions}))
    );
  }

  /**
   * Get the first match, or null if none.
   */
  first() {
    return this._matches[0] || null;
  }

  /**
   * Count the number of matches.
   */
  count() {
    return this._matches.length;
  }

  /**
   * Convert matches to array.
   */
  toArray() {
    return [...this._matches];
  }

  /**
   * Pure replaceAll: returns a NEW root with replacements applied.
   *
   * Overloads:
   *   replaceAll(value)               // replace each $0 with value
   *   replaceAll(solution => value)   // value derived from first solution of each match
   */
  replaceAll(replOrFn) {
    if (!this._matches.length) return this._root;

    const edits = [];
    for (const match of this._matches) {
      if (!match._zeroSite) continue;
      const firstSol = match._solutions[0] || null;
      const to = (typeof replOrFn === 'function')
        ? replOrFn(firstSol)
        : replOrFn;
      edits.push({site: match._zeroSite, to});
    }

    const cloned = cloneDeep(this._root);
    return applyEdits(cloned, edits);
  }

  /**
   * Mutating editAll.
   *
   * Forms:
   *   editAll("x", $ => $.x * 2)
   *   editAll($ => ({ x: $.y, y: $.x }))
   *   editAll({ x: $ => $.y, y: $ => $.x })
   *
   * Replacements apply to variable sites ($ and @),
   * with @-bindings exposed as plain arrays/objects.
   */
  editAll(arg1, arg2) {
    const {planFactory} = normalizeEditArgs(arg1, arg2);
    const edits = [];

    for (const match of this._matches) {
      for (const sol of match._solutions) {
        const plan = planFactory(sol) || {};
        const sitesMap = sol._sites; // Map<varName, Site[]>

        for (const [varNameRaw, valueSpec] of Object.entries(plan)) {
          const varName = varNameRaw.startsWith('$')
            ? varNameRaw.slice(1)
            : varNameRaw;
          const sites = sitesMap.get(varName) || [];
          if (!sites.length) continue;

          for (const site of sites) {
            const to = convertValueForSite(site, valueSpec);
            edits.push({site, to});
          }
        }
      }
    }

    return applyEdits(this._root, edits);
  }
}

// Normalize arguments for editAll
function normalizeEditArgs(arg1, arg2) {
  // editAll("x", fn)
  if (typeof arg1 === 'string' && typeof arg2 === 'function') {
    const name = arg1;
    const fn = arg2;
    return {
      planFactory: (sol) => ({[name]: fn(sol)})
    };
  }

  // editAll(fn)  where fn: Solution => {varName: value}
  if (typeof arg1 === 'function' && arg2 === undefined) {
    const fn = arg1;
    return {
      planFactory: (sol) => fn(sol) || {}
    };
  }

  // editAll(planObj) where planObj: {varName: valueOrFn}
  if (arg1 && typeof arg1 === 'object' && arg2 === undefined) {
    const template = arg1;
    return {
      planFactory: (sol) => {
        const out = {};
        for (const [k, v] of Object.entries(template)) {
          out[k] = (typeof v === 'function') ? v(sol) : v;
        }
        return out;
      }
    };
  }

  throw new TypeError('editAll expects ("var", fn) | (fn) | (planObject)');
}

// Convert user-facing value to internal representation for a Site
function convertValueForSite(site, value) {
  // Scalar replacement: anything goes
  if (site.kind === 'scalar') {
    return value;
  }

  // Group replacement: need Group wrappers internally
  const isArrayGroup = site.groupStart !== undefined;
  const isObjectGroup = site.keys !== undefined;

  if (isArrayGroup) {
    if (value instanceof Group && value._type === 'array') {
      return value;
    }
    if (Array.isArray(value)) {
      return Group.array(...value);
    }
    // Single value -> single-element slice
    return Group.array(value);
  }

  if (isObjectGroup) {
    if (value instanceof Group && value._type === 'object') {
      return value;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Group.object(value);
    }
    throw new TypeError('Object group replacement expects a plain object or internal Group.object()');
  }

  // Fallback
  return value;
}

// Group raw engine solutions by $0 path => match groups
function groupByZeroPath(rawSolutions) {
  const map = new Map(); // key -> {path, rawSolutions}
  for (const sol of rawSolutions) {
    const zeroSites = sol.sites.get('0') || [];
    if (!zeroSites.length) continue;
    const path = zeroSites[0].path || [];
    const key = JSON.stringify(path);
    let group = map.get(key);
    if (!group) {
      group = {path, rawSolutions: []};
      map.set(key, group);
    }
    group.rawSolutions.push(sol);
  }
  return Array.from(map.values());
}

// ------------------- Pattern class (Tendril(pattern)) -------------------

class PatternImpl {
  constructor(pattern) {
    this._pattern = String(pattern);
    this._ast = null;
    this._opts = {};
    this._debug = null;
  }

  withOptions(opts) {
    const p = new PatternImpl(this._pattern);
    p._ast = this._ast;
    p._opts = {...this._opts, ...opts};
    p._debug = this._debug;
    return p;
  }

  debug(listener) {
    const p = new PatternImpl(this._pattern);
    p._ast = this._ast;
    p._opts = this._opts;
    p._debug = listener;
    return p;
  }

  _getAst() {
    if (!this._ast) {
      this._ast = compile(this._pattern);
    }
    return this._ast;
  }

  _buildOpts() {
    const opts = {...this._opts};
    if (this._debug) opts.debug = this._debug;
    return opts;
  }

  /**
   * match(data): anchored match at the root.
   * Returns a MatchSet (possibly empty; at most one distinct path: []).
   */
  match(input) {
    const ast = this._getAst();
    const rawSolutions = engineMatch(ast, input, this._buildOpts());
    const groups = groupByZeroPath(rawSolutions);
    return new MatchSet(input, groups);
  }

  /**
   * find(data): scan for matches at any depth.
   * Returns a MatchSet over all occurrences.
   */
  find(input) {
    const ast = this._getAst();
    const rawSolutions = engineScan(ast, input, this._buildOpts());
    const groups = groupByZeroPath(rawSolutions);
    return new MatchSet(input, groups);
  }

  /**
   * first(data): convenience — MatchSet restricted to the first found match (if any).
   */
  first(input) {
    const all = this.find(input);
    if (!all._matches.length) return new MatchSet(input, []);
    const firstGroup = [{
      path: all._matches[0]._path,
      rawSolutions: all._matches[0]._rawSolutions
    }];
    return new MatchSet(input, firstGroup);
  }

  // ------------- Short-circuit methods (fast paths) -------------

  /**
   * hasMatch(data): fast boolean check for anchored match.
   * Short-circuits on first solution — does not enumerate all matches.
   */
  hasMatch(input) {
    const ast = this._getAst();
    return engineMatchExists(ast, input, this._buildOpts());
  }

  /**
   * hasAnyMatch(data): fast boolean check for match anywhere (scan).
   * Short-circuits on first solution — does not scan entire tree.
   */
  hasAnyMatch(input) {
    const ast = this._getAst();
    return engineScanExists(ast, input, this._buildOpts());
  }

  /**
   * firstMatch(data): fast first-match retrieval (scan).
   * Short-circuits after finding first match — does not scan entire tree.
   * Returns a MatchSet containing at most one match, or empty MatchSet if none.
   */
  firstMatch(input) {
    const ast = this._getAst();
    const rawSol = engineScanFirst(ast, input, this._buildOpts());
    if (!rawSol) return new MatchSet(input, []);
    // Wrap in a group
    const zeroSites = rawSol.sites.get('0') || [];
    const path = zeroSites.length ? zeroSites[0].path : [];
    return new MatchSet(input, [{path, rawSolutions: [rawSol]}]);
  }
}

// ------------------- Fluent factory -------------------

export function Tendril(pattern) {
  if (typeof pattern !== 'string') {
    throw new TypeError(
      `Tendril(): pattern must be a string, got ${typeof pattern}`
    );
  }
  return new PatternImpl(pattern);
}

// ------------------- Convenience functions -------------------

// Helper: get first solution object (plain bindings) from an iterable of Solution
function firstSolutionObject(solutionsIterable) {
  const it = solutionsIterable[Symbol.iterator]();
  const n = it.next();
  if (n.done) return null;
  return n.value.toObject();
}

// Filter out $0 from raw bindings (legacy helper)
function filterBindings(bindings) {
  const {0: _ignored, ...rest} = bindings;
  return rest;
}

/**
 * Boolean "does this match the whole data?" helper (anchored).
 */
export function matches(pattern, input) {
  const mset = Tendril(pattern).match(input);
  return mset.hasMatch();
}

/**
 * Extract first solution (anchored), as a plain bindings object.
 */
export function extract(pattern, input) {
  const mset = Tendril(pattern).match(input);
  const solObj = firstSolutionObject(mset.solutions());
  return solObj;
}

/**
 * Extract all unique solutions (anchored), as an array of bindings objects.
 */
export function extractAll(pattern, input) {
  const mset = Tendril(pattern).match(input);
  const out = [];
  for (const sol of mset.solutions()) {
    out.push(sol.toObject());
  }
  return out;
}

/**
 * Convenience replace: find first match and replace it.
 * Pure: returns a NEW root with replacement.
 *
 * builder:
 *   - value -> replaces the match with that value
 *   - function (Solution => value) -> replacement based on first solution
 */
export function replace(pattern, input, builder) {
  return Tendril(pattern).first(input).replaceAll(builder);
}

/**
 * Convenience replaceAll: scan for occurrences and replace each $0.
 * Pure: returns a NEW root with replacements.
 *
 * builder:
 *   - value -> replaces each match with that value
 *   - function (Solution => value) -> per-match replacement based on first solution
 */
export function replaceAll(pattern, input, builder) {
  return Tendril(pattern).find(input).replaceAll(builder);
}

/**
 * Unique matches by variable set, anchored.
 * Returns array of plain bindings objects.
 */
export function uniqueMatches(pattern, input, ...vars) {
  const mset = Tendril(pattern).match(input);
  const out = [];
  const seen = new Set();

  for (const sol of mset.solutions()) {
    const projected = projectBindings(sol._bindings, vars);
    const key = stableKey(projected);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(projected);
  }

  return out;
}
