// tendril-api.js — public API vNext (engine-compatible)
//
// NOTE:
// - Group is kept for internal use and for tendril-engine.js.
//   Users never need to construct Group instances.
// - Replacement semantics are determined by the *pattern/site kind*:
//     * scalar sites ($x) treat replacement as a single value
//     * group sites (@x) treat replacement as a slice/splice (array elements or object props)
// - $0 (the automatic whole-match binding) is used internally for
//   locating/replacing, but hidden from user-visible bindings by default.

import {parsePattern} from './tendril-parser.js';
import {
  match as engineMatch,
  scan as engineScan,
  matchExists as engineMatchExists,
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
 * Group — internal wrapper for group bindings and replacements.
 * Represents a contiguous subsequence of an array or subset of object properties.
 *
 * Engine and replacement logic use this to distinguish slice semantics.
 * User-facing APIs never require Group instances.
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

// Helper: navigate path to get value
function getAt(root, path) {
  let current = root;
  for (const key of path) current = current[key];
  return current;
}

// Helper: navigate path and set value (mutates in-place)
function setAtMutate(root, path, value) {
  let current = root;
  for (let i = 0; i < path.length - 1; i++) current = current[path[i]];
  current[path[path.length - 1]] = value;
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

// ------------------- Site identity -------------------

/**
 * Compute a unique identity key for a site.
 * Two sites with the same key target the same structural location.
 */
function siteKey(site) {
  if (site.kind === 'scalar') {
    return JSON.stringify(['scalar', site.path]);
  }
  // Array group: path + start + end
  if (site.groupStart !== undefined) {
    return JSON.stringify(['group-array', site.path, site.groupStart, site.groupEnd]);
  }
  // Object group: path + sorted keys
  if (site.keys !== undefined) {
    return JSON.stringify(['group-object', site.path, [...site.keys].sort()]);
  }
  return JSON.stringify(['unknown', site.path]);
}

// ------------------- Replacement / editing core -------------------

/**
 * applyEdits mutates the given root in-place.
 * For pure operations, call it on a deep clone.
 *
 * Each edit: {site, to}
 *  - site.kind: 'scalar' | 'group'
 *  - scalar site: {kind:'scalar', path, valueRef}
 *  - group array site: {kind:'group', path, groupStart, groupEnd, valueRefs:[...]}
 *  - group object site: {kind:'group', path, keys:[...], valueRefs:{...}}
 *
 * opts.onCASFailure?: (failure) => 'skip' | 'force'
 *   Called when value at site doesn't match captured valueRef.
 *   Default: skip silently.
 *
 * Returns: {result, failures}
 */
function applyEdits(root, edits, opts = {}) {
  const failures = [];
  if (edits.length === 0) return {result: root, failures};

  const onCASFailure = opts.onCASFailure || null;
  let result = root;

  // Helper: handle CAS failure, returns true if we should force the edit
  function handleCASFailure(edit, expected, actual) {
    const failure = {
      site: edit.site,
      siteKey: siteKey(edit.site),
      expected,
      actual,
      to: edit.to
    };
    if (onCASFailure) {
      const action = onCASFailure(failure);
      if (action === 'force') return true;
    }
    failures.push(failure);
    return false;
  }

  // Group edits by path (sites at the same container need coordinated splices)
  const editsByPath = new Map();
  for (const edit of edits) {
    const pathKey = JSON.stringify(edit.site.path);
    if (!editsByPath.has(pathKey)) editsByPath.set(pathKey, []);
    editsByPath.get(pathKey).push(edit);
  }

  for (const [, pathEdits] of editsByPath) {
    const sets = pathEdits.filter(e => e.site.kind === 'scalar');
    const splices = pathEdits.filter(e => e.site.kind === 'group');

    // Scalar replacements
    for (const edit of sets) {
      const current = getAt(result, edit.site.path);
      const matches = deepEqual(current, edit.site.valueRef);
      if (matches) {
        if (edit.site.path.length === 0) result = edit.to;
        else setAtMutate(result, edit.site.path, edit.to);
      } else {
        const shouldForce = handleCASFailure(edit, edit.site.valueRef, current);
        if (shouldForce) {
          if (edit.site.path.length === 0) result = edit.to;
          else setAtMutate(result, edit.site.path, edit.to);
        }
      }
    }

    // Group (array/object) replacements
    if (splices.length > 0) {
      const arraySplices = splices.filter(e => e.site.groupStart !== undefined);
      const objectSplices = splices.filter(e => e.site.keys !== undefined);

      // Array group splices: apply in ascending start order, tracking offsets
      if (arraySplices.length > 0) {
        arraySplices.sort((a, b) => a.site.groupStart - b.site.groupStart);

        let offset = 0;
        for (const edit of arraySplices) {
          const arr = getAt(result, edit.site.path);
          if (!Array.isArray(arr)) continue;

          const start = edit.site.groupStart + offset;
          const end = edit.site.groupEnd + offset;

          // Validate the slice still matches the captured refs
          const actualSlice = arr.slice(start, end);
          let allMatch = actualSlice.length === edit.site.valueRefs.length;
          if (allMatch) {
            for (let i = 0; i < edit.site.valueRefs.length; i++) {
              if (!deepEqual(actualSlice[i], edit.site.valueRefs[i])) {
                allMatch = false;
                break;
              }
            }
          }

          if (!allMatch) {
            const shouldForce = handleCASFailure(edit, edit.site.valueRefs, actualSlice);
            if (!shouldForce) continue;
          }

          if (!edit.to || !(edit.to instanceof Group) || edit.to._type !== 'array') {
            throw new Error('Internal error: array group splice requires Group.array');
          }

          const elements = edit.to._value;
          const oldLength = end - start;
          const newLength = elements.length;
          arr.splice(start, oldLength, ...elements);
          offset += (newLength - oldLength);
        }
      }

      // Object group "splices": delete captured keys then assign new props
      for (const edit of objectSplices) {
        const obj = getAt(result, edit.site.path);
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) continue;

        const actualProps = {};
        let allMatch = true;
        for (const key of edit.site.keys) {
          actualProps[key] = obj[key];
          if (!deepEqual(obj[key], edit.site.valueRefs[key])) {
            allMatch = false;
          }
        }

        if (!allMatch) {
          const shouldForce = handleCASFailure(edit, edit.site.valueRefs, actualProps);
          if (!shouldForce) continue;
        }

        if (!edit.to || !(edit.to instanceof Group) || edit.to._type !== 'object') {
          throw new Error('Internal error: object group splice requires Group.object');
        }

        const newProps = edit.to._value;
        for (const key of edit.site.keys) delete obj[key];
        Object.assign(obj, newProps);
      }
    }
  }

  return {result, failures};
}

// Evaluate a plan (object or function) against a solution and add edits for its sites.
// Low-level: pushes to an array without deduplication.
function collectEditsFromPlan(sol, planOrFn, edits) {
  const plan = (typeof planOrFn === 'function') ? (planOrFn(sol) || {}) : (planOrFn || {});
  const sitesMap = sol._sites;

  for (const [varNameRaw, valueSpec] of Object.entries(plan)) {
    const varName = (varNameRaw.startsWith('$') || varNameRaw.startsWith('@'))
      ? varNameRaw.slice(1)
      : varNameRaw;
    const sites = sitesMap.get(varName) || [];
    if (!sites.length) continue;

    const value = (typeof valueSpec === 'function') ? valueSpec(sol) : valueSpec;
    for (const site of sites) edits.push({site, to: convertValueForSite(site, value)});
  }
}

/**
 * Collect edits across all (occurrence, solution) pairs with site-based deduplication.
 *
 * opts.per: 'site' (default) | 'occurrence'
 *   - 'site': iterate all solutions, dedupe by site identity (for redaction/normalization)
 *   - 'occurrence': use first solution per occurrence (for $0 replacements)
 *
 * Returns: {edits: [...], conflicts: [...]}
 *   - edits: deduplicated array of {site, to}
 *   - conflicts: array of {siteKey, existing, attempted, ...} for same-site-different-value cases
 */
function collectAllSiteEdits(occurrences, planOrFn, opts = {}) {
  const per = opts.per || 'site';
  const editsBySiteKey = new Map(); // siteKey -> {site, to, firstSol}
  const conflicts = [];

  for (const occ of occurrences) {
    // 'occurrence' mode: first solution only; 'site' mode: all solutions
    const sols = per === 'occurrence'
      ? (occ._solutions.length ? [occ._solutions[0]] : [])
      : occ._solutions;

    for (const sol of sols) {
      const plan = (typeof planOrFn === 'function') ? (planOrFn(sol) || {}) : (planOrFn || {});
      const sitesMap = sol._sites;

      for (const [varNameRaw, valueSpec] of Object.entries(plan)) {
        const varName = (varNameRaw.startsWith('$') || varNameRaw.startsWith('@'))
          ? varNameRaw.slice(1)
          : varNameRaw;
        const sites = sitesMap.get(varName) || [];
        if (!sites.length) continue;

        const value = (typeof valueSpec === 'function') ? valueSpec(sol) : valueSpec;

        for (const site of sites) {
          const key = siteKey(site);
          const to = convertValueForSite(site, value);

          if (editsBySiteKey.has(key)) {
            const existing = editsBySiteKey.get(key);
            // Same site, same to => idempotent, skip
            if (!deepEqual(existing.to, to)) {
              // Conflict: same site, different to
              conflicts.push({
                siteKey: key,
                site,
                existing: existing.to,
                attempted: to,
                existingSol: existing.firstSol,
                attemptedSol: sol
              });
            }
          } else {
            editsBySiteKey.set(key, {site, to, firstSol: sol});
          }
        }
      }
    }
  }

  const edits = Array.from(editsBySiteKey.values()).map(e => ({site: e.site, to: e.to}));
  return {edits, conflicts};
}

/**
 * Replacement semantics are determined by the *site kind*:
 *  - scalar site: value is used as-is
 *  - group site:
 *      * array-group: Array => splice elements; non-array => splice single element
 *      * object-group: Object => replace captured keys with provided props
 *
 * Users never have to provide Group explicitly.
 */
function convertValueForSite(site, value) {
  // Scalar replacement: anything goes (including arrays as a single value)
  if (site.kind === 'scalar') return value;

  const isArrayGroup = site.groupStart !== undefined;
  const isObjectGroup = site.keys !== undefined;

  if (isArrayGroup) {
    // Group replacement = splice.
    // Arrays splice as elements; non-arrays treated as a single element slice.
    if (value instanceof Group && value._type === 'array') return value; // internal ok
    if (Array.isArray(value)) return Group.array(...value);
    return Group.array(value);
  }

  if (isObjectGroup) {
    // Group replacement = object "patch" (replace captured keys with new props).
    if (value instanceof Group && value._type === 'object') return value; // internal ok
    if (value && typeof value === 'object' && !Array.isArray(value)) return Group.object(value);
    throw new TypeError('Object group replacement expects a plain object');
  }

  return value;
}

// ------------------- Raw solutions -> occurrences -------------------

// Group raw engine solutions by $0 path => occurrence groups
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

// Normalize bindings for user:
// - Strip $0 by default
// - Convert internal Group values to plain arrays/objects for readability
function normalizeBindings(rawBindings, {includeWhole = false} = {}) {
  const out = {};
  for (const [k, v] of Object.entries(rawBindings)) {
    if (k === '0' && !includeWhole) continue;
    out[k] = groupToPublicValue(v);
  }
  return out;
}

function groupToPublicValue(v) {
  // Duck-type check for Group (works across different Group class instances)
  if (!v || typeof v !== 'object' || !v._type || !v._value) return v;
  if (v._type === 'array') return v._value.slice ? v._value.slice() : [...v._value];
  if (v._type === 'object') return {...v._value};
  return v;
}

// ------------------- Core data structures: Occurrence, Solution, Sets -------------------

class Occurrence {
  constructor(root, path, rawSolutions, matchSet) {
    this._root = root;
    this._path = path;
    this._rawSolutions = rawSolutions;
    this._matchSet = matchSet;

    // Precompute Solution objects for this occurrence
    this._solutions = rawSolutions.map(raw => new Solution(raw, this, matchSet));

    // $0 site (first one) for replace/occurrence value
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
   * replace(replOrFn, {mutate?, onCASFailure?}):
   * Replaces $0 for THIS occurrence using the first solution (deterministic).
   * Default is pure (returns new root); pass {mutate:true} to edit in-place.
   */
  replace(replOrFn, opts = {}) {
    if (!this._zeroSite) return this._root;
    const mutate = !!opts.mutate;

    const firstSol = this._solutions[0] || null;
    const to = (typeof replOrFn === 'function') ? replOrFn(firstSol) : replOrFn;

    const edits = [{site: this._zeroSite, to}];
    const target = mutate ? this._root : cloneDeep(this._root);
    const {result, failures} = applyEdits(target, edits, {onCASFailure: opts.onCASFailure});

    if (failures.length > 0 && typeof result === 'object' && result !== null) {
      Object.defineProperty(result, '_editFailures', {value: failures, enumerable: false});
    }
    return result;
  }

  /**
   * edit(plan, {mutate?, per?, onConflict?, onCASFailure?}):
   * Applies variable edits for THIS occurrence.
   *
   * Options:
   *   per: 'site' (default) | 'occurrence'
   *     - 'site': all solutions for this occurrence, dedupe by site
   *     - 'occurrence': first solution only
   */
  edit(planOrFn, opts = {}) {
    const mutate = !!opts.mutate;
    const per = opts.per || 'site';

    // Collect edits with site-based deduplication for this single occurrence
    const {edits, conflicts} = collectAllSiteEdits([this], planOrFn, {per});

    if (conflicts.length > 0 && opts.onConflict) {
      for (const c of conflicts) opts.onConflict(c);
    }

    const target = mutate ? this._root : cloneDeep(this._root);
    const {result, failures} = applyEdits(target, edits, {onCASFailure: opts.onCASFailure});

    if ((failures.length > 0 || conflicts.length > 0) && typeof result === 'object' && result !== null) {
      if (failures.length > 0) {
        Object.defineProperty(result, '_editFailures', {value: failures, enumerable: false});
      }
      if (conflicts.length > 0) {
        Object.defineProperty(result, '_editConflicts', {value: conflicts, enumerable: false});
      }
    }
    return result;
  }
}

class Solution {
  constructor(rawSolution, occ, matchSet) {
    this._occ = occ;
    this._matchSet = matchSet;
    this._raw = rawSolution;
    this._sites = rawSolution.sites;

    // Public bindings: groups converted to arrays/objects; $0 hidden
    const publicBindings = normalizeBindings(rawSolution.bindings, {includeWhole: false});
    this._bindings = publicBindings;

    for (const [k, v] of Object.entries(publicBindings)) this[k] = v;

    Object.defineProperty(this, 'toObject', {
      value: () => ({...this._bindings}),
      enumerable: false
    });
  }

  bindings() {
    return {...this._bindings};
  }

  occurrence() {
    return this._occ;
  }

  sites(name) {
    const n = name.startsWith('$') || name.startsWith('@') ? name.slice(1) : name;
    return (this._sites.get(n) || []).slice();
  }

  /**
   * edit(plan, {mutate?, onCASFailure?}):
   * Applies edits using THIS solution only (no site deduplication needed for single solution).
   */
  edit(planOrFn, opts = {}) {
    const mutate = !!opts.mutate;
    const target = mutate ? this._occ._root : cloneDeep(this._occ._root);
    const edits = [];
    collectEditsFromPlan(this, planOrFn, edits);
    const {result, failures} = applyEdits(target, edits, {onCASFailure: opts.onCASFailure});

    if (failures.length > 0 && typeof result === 'object' && result !== null) {
      Object.defineProperty(result, '_editFailures', {value: failures, enumerable: false});
    }
    return result;
  }

  /**
   * replace(replOrFn, {mutate?, onCASFailure?}):
   * Replaces $0 for this occurrence using THIS solution.
   */
  replace(replOrFn, opts = {}) {
    // Use this solution (not necessarily first) for deriving replacement
    if (!this._occ._zeroSite) return this._occ._root;
    const mutate = !!opts.mutate;

    const to = (typeof replOrFn === 'function') ? replOrFn(this) : replOrFn;
    const edits = [{site: this._occ._zeroSite, to}];
    const target = mutate ? this._occ._root : cloneDeep(this._occ._root);
    const {result, failures} = applyEdits(target, edits, {onCASFailure: opts.onCASFailure});

    if (failures.length > 0 && typeof result === 'object' && result !== null) {
      Object.defineProperty(result, '_editFailures', {value: failures, enumerable: false});
    }
    return result;
  }

  /**
   * occurrences():
   * Iterate all occurrences in the match set that contain an equivalent binding set.
   * NOTE: This enumerates all occurrences.
   */
  occurrences() {
    const myKey = stableKey(this._bindings);
    const matchSet = this._matchSet;

    return {
      [Symbol.iterator]() {
        const all = [];
        for (const occ of matchSet) {
          for (const s of occ._solutions) {
            if (stableKey(s._bindings) === myKey) {
              all.push(occ);
              break;
            }
          }
        }
        let i = 0;
        return {
          next() {
            if (i >= all.length) return {done: true};
            return {value: all[i++], done: false};
          }
        };
      }
    };
  }
}

class OccurrenceSet {
  constructor(root, groups) {
    this._root = root;
    this._occurrences = groups.map(g => new Occurrence(root, g.path, g.rawSolutions, this));
  }

  [Symbol.iterator]() {
    return this._occurrences[Symbol.iterator]();
  }

  occurrences() {
    return this;
  }

  first() {
    return this._occurrences[0] || null;
  }

  take(n) {
    const sliced = this._occurrences.slice(0, n);
    const groups = sliced.map(o => ({path: o._path, rawSolutions: o._rawSolutions}));
    return new OccurrenceSet(this._root, groups);
  }

  filter(pred) {
    const filtered = this._occurrences.filter(pred);
    const groups = filtered.map(o => ({path: o._path, rawSolutions: o._rawSolutions}));
    return new OccurrenceSet(this._root, groups);
  }

  toArray() {
    return [...this._occurrences];
  }

  count() {
    return this._occurrences.length;
  }

  hasMatch() {
    return this._occurrences.length > 0;
  }

  /**
   * solutions(): returns a SolutionSet of unique solutions across all occurrences.
   */
  solutions() {
    return new SolutionSet(this);
  }

  /**
   * replaceAll(replOrFn, {mutate?, onCASFailure?}):
   * Replaces $0 for each occurrence using the first solution of that occurrence.
   * This is inherently "per occurrence" since $0 is the whole match.
   */
  replaceAll(replOrFn, opts = {}) {
    if (!this._occurrences.length) return this._root;
    const mutate = !!opts.mutate;

    const edits = [];
    for (const occ of this._occurrences) {
      if (!occ._zeroSite) continue;
      const firstSol = occ._solutions[0] || null;
      const to = (typeof replOrFn === 'function') ? replOrFn(firstSol) : replOrFn;
      edits.push({site: occ._zeroSite, to});
    }

    const target = mutate ? this._root : cloneDeep(this._root);
    const {result, failures} = applyEdits(target, edits, {onCASFailure: opts.onCASFailure});

    // Attach failures for inspection if any
    if (failures.length > 0 && typeof result === 'object' && result !== null) {
      Object.defineProperty(result, '_editFailures', {value: failures, enumerable: false});
    }
    return result;
  }

  /**
   * editAll(planOrFn, opts):
   * Edits every bound *site* you referenced, wherever it occurs.
   *
   * Options:
   *   per: 'site' (default) | 'occurrence'
   *     - 'site': iterates all solutions, dedupes by site identity.
   *       This is the right default for redaction, normalization, "change every X".
   *     - 'occurrence': uses first solution per occurrence only.
   *       Useful for $0-focused edits or when you want one edit per match location.
   *   mutate: boolean (default false) - mutate in place vs return copy
   *   onConflict: (conflict) => void - called for planning-time conflicts (same site, different values)
   *   onCASFailure: (failure) => 'skip' | 'force' - called for apply-time CAS failures
   */
  editAll(planOrFn, opts = {}) {
    if (!this._occurrences.length) return this._root;
    const mutate = !!opts.mutate;

    // Collect edits with site-based deduplication
    const {edits, conflicts} = collectAllSiteEdits(this._occurrences, planOrFn, {per: opts.per});

    // Handle planning-time conflicts
    if (conflicts.length > 0 && opts.onConflict) {
      for (const c of conflicts) opts.onConflict(c);
    }

    const target = mutate ? this._root : cloneDeep(this._root);
    const {result, failures} = applyEdits(target, edits, {onCASFailure: opts.onCASFailure});

    // Attach metadata for inspection if any
    if ((failures.length > 0 || conflicts.length > 0) && typeof result === 'object' && result !== null) {
      if (failures.length > 0) {
        Object.defineProperty(result, '_editFailures', {value: failures, enumerable: false});
      }
      if (conflicts.length > 0) {
        Object.defineProperty(result, '_editConflicts', {value: conflicts, enumerable: false});
      }
    }
    return result;
  }
}

class SolutionSet {
  constructor(occSet) {
    this._occSet = occSet;
  }

  [Symbol.iterator]() {
    const occs = this._occSet._occurrences;
    const seen = new Set();
    let oi = 0;
    let si = 0;
    let curOcc = occs[0] || null;

    return {
      next() {
        while (true) {
          if (!curOcc) return {done: true};

          if (si >= curOcc._solutions.length) {
            oi++;
            if (oi >= occs.length) return {done: true};
            curOcc = occs[oi];
            si = 0;
            continue;
          }

          const sol = curOcc._solutions[si++];
          const key = stableKey(sol._bindings);
          if (seen.has(key)) continue;
          seen.add(key);
          return {value: sol, done: false};
        }
      }
    };
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

  filter(pred) {
    const out = [];
    for (const sol of this) if (pred(sol)) out.push(sol);
    return new FilteredSolutionSet(out, this._occSet);
  }

  take(n) {
    const out = [];
    let c = 0;
    for (const sol of this) {
      if (c++ >= n) break;
      out.push(sol);
    }
    return new FilteredSolutionSet(out, this._occSet);
  }
}

class FilteredSolutionSet {
  constructor(solutions, occSet) {
    this._solutions = solutions;
    this._occSet = occSet;
  }

  [Symbol.iterator]() {
    return this._solutions[Symbol.iterator]();
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

  filter(pred) {
    return new FilteredSolutionSet(this._solutions.filter(pred), this._occSet);
  }

  take(n) {
    return new FilteredSolutionSet(this._solutions.slice(0, n), this._occSet);
  }
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
    if (!this._ast) this._ast = compile(this._pattern);
    return this._ast;
  }

  _buildOpts() {
    const opts = {...this._opts};
    if (this._debug) opts.debug = this._debug;
    return opts;
  }

  /**
   * match(data): anchored match at the root.
   * Returns an OccurrenceSet (possibly empty; at most one occurrence: []).
   */
  match(input) {
    const ast = this._getAst();
    const rawSolutions = engineMatch(ast, input, this._buildOpts());
    const groups = groupByZeroPath(rawSolutions);
    return new OccurrenceSet(input, groups);
  }

  /**
   * find(data): scan for matches at any depth.
   * Returns an OccurrenceSet over all occurrences.
   */
  find(input) {
    const ast = this._getAst();
    const rawSolutions = engineScan(ast, input, this._buildOpts());
    const groups = groupByZeroPath(rawSolutions);
    return new OccurrenceSet(input, groups);
  }

  /**
   * first(data): first occurrence only (scan + stop).
   * Returns OccurrenceSet with 0 or 1 occurrence.
   */
  first(input) {
    const ast = this._getAst();
    const rawSol = engineScanFirst(ast, input, this._buildOpts());
    if (!rawSol) return new OccurrenceSet(input, []);
    const zeroSites = rawSol.sites.get('0') || [];
    const path = zeroSites.length ? zeroSites[0].path : [];
    return new OccurrenceSet(input, [{path, rawSolutions: [rawSol]}]);
  }

  // ------------- Short-circuit methods (fast paths) -------------

  hasMatch(input) {
    const ast = this._getAst();
    return engineMatchExists(ast, input, this._buildOpts());
  }

  hasAnyMatch(input) {
    const ast = this._getAst();
    return engineScanExists(ast, input, this._buildOpts());
  }
}

// ------------------- Fluent factory -------------------

export function Tendril(pattern) {
  if (typeof pattern !== 'string') {
    throw new TypeError(`Tendril(): pattern must be a string, got ${typeof pattern}`);
  }
  return new PatternImpl(pattern);
}

// ------------------- Convenience functions (compat helpers) -------------------

// Helper: get first solution object (plain bindings) from an iterable of Solution
function firstSolutionObject(solutionsIterable) {
  const it = solutionsIterable[Symbol.iterator]();
  const n = it.next();
  if (n.done) return null;
  return n.value.toObject();
}

/**
 * Boolean "does this match the whole data?" helper (anchored).
 */
export function matches(pattern, input) {
  return Tendril(pattern).match(input).hasMatch();
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
  for (const sol of mset.solutions()) out.push(sol.toObject());
  return out;
}

/**
 * Convenience replace: find first match and replace it (pure).
 */
export function replace(pattern, input, builder) {
  const occ = Tendril(pattern).first(input).first();
  if (!occ) return input;
  return occ.replace(builder, {mutate: false});
}

/**
 * Convenience replaceAll: scan for occurrences and replace each $0 (pure).
 */
export function replaceAll(pattern, input, builder) {
  return Tendril(pattern).find(input).replaceAll(builder, {mutate: false});
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
    const obj = sol.toObject();
    const projected = {};
    for (const v of vars) {
      const key = v.startsWith('$') || v.startsWith('@') ? v.slice(1) : v;
      if (Object.prototype.hasOwnProperty.call(obj, key)) projected[key] = obj[key];
    }
    const key = stableKey(projected);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(projected);
  }

  return out;
}
