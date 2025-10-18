// tendril-api.js — public API: compile / find / replace (bindings-as-targets)

import {parsePattern, AST} from './tendril-parser.js';
import {matchProgram} from './tendril-engine.js';
import {cloneEnv} from './microparser.js';

// ------------------- Compile & cache -------------------

const CACHE_MAX = 64;
const _cache = new Map(); // pattern -> ast (LRU-ish)

export function compile(pattern) {
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

// ------------------- Find -------------------

/**
 * find(input, pattern, opts?)
 *  - Returns Array<Object> where each object is { name: value } of scalar bindings.
 *  - Slice bindings are not part of this minimal core.
 *  - opts.passThroughAst: if true, pass compiled AST rather than string.
 */
export function find(input, pattern, opts = {}) {
  const ast = compile(pattern);
  const envs = matchProgram(ast, input, opts);
  return envs.map(envMapToPlain);
}

function envMapToPlain(m) {
  const obj = {};
  for (const [k, v] of m) {
    if (v.kind === 'scalar') obj[k] = v.value;
  }
  return obj;
}

// ------------------- Replace -------------------

/**
 * replace(input, pattern, replacers, opts?)
 *  - replacers: object mapping "$name" or "name" to:
 *      * a value, or
 *      * a function (envObj) => value
 *    Where envObj is the plain object for that match (like find()).
 *  - Returns a deep-cloned transformed value.
 *
 * Semantics:
 *  - We locate occurrences where variables are **bound at a site**:
 *      * Value site: last path segment `= $x` or `= $x:pat` (variable bound to the node value).
 *      * Key site: key segment `$x` or `$x:pat` used to select a property of an object.
 *  - For value sites, we **replace the node value**.
 *  - For key sites, we **rename the key** (copy value under new key, delete old key).
 *  - Index sites (`[$i]`): we DO NOT support changing array indices; if a replacer targets such a binding, we error.
 *  - If multiple variables point to the same site, all replacements must agree (same result), otherwise error.
 */
export function replace(input, pattern, replacers, opts = {}) {
  const ast = compile(pattern);
  // Step 1: collect matches with precise sites (paths)
  const matches = collectOccurrences(ast, input, opts);

  // Step 2: compute patch plan
  const plan = buildPatchPlan(matches, replacers);

  // Step 3: apply patches on a deep clone
  return applyPatches(input, plan);
}

// ------------------- Occurrence collection -------------------

/**
 * Occurrence:
 *  {
 *    site: { kind: 'value'|'key'|'index', path: (string|number)[], key?: string, index?: number },
 *    env:  Map (clone of env at emission),
 *    envPlain: Object (name -> value),
 *    vars: Set<string>  // variable names bound at this site
 *  }
 *
 * For 'key' sites, site.path points to the **parent object**; 'key' is the current key name.
 * For 'value' sites, site.path points directly to the **value node**.
 * For 'index' sites, site.path points to the **parent array**; 'index' is the current number.
 */
function collectOccurrences(ast, input, opts) {
  const occs = [];

  for (const path of ast.rules) {
    walkForOccurrences(path.segs, 0, input, new Map(), [], (env, siteVars, site) => {
      occs.push({
        site,
        env: cloneEnv(env),
        envPlain: envMapToPlain(env),
        vars: new Set(siteVars),
      });
    }, opts);
  }
  return occs;
}

// Core walker for occurrences (parallel to engine, but tracks path/sites)
function walkForOccurrences(segs, i, node, env, path, emit, opts) {
  if (i === segs.length) {
    // Reached end-of-path with no explicit value var binding at tail; nothing to emit.
    return;
  }

  const seg = segs[i];

  switch (seg.type) {
    // ----- Key segments -----
    case 'KeyLit': {
      if (!isObject(node)) return;
      for (const k of Object.keys(node)) {
        if (!keyAtomOk(seg.pat, k)) continue;
        walkForOccurrences(segs, i + 1, node[k], env, path.concat(k), emit, opts);
      }
      return;
    }
    case 'KeyPatVar': {
      if (!isObject(node)) return;
      for (const k of Object.keys(node)) {
        if (!keyAtomOk(seg.pat, k)) continue;
        // binding site: key variable at this property
        const e = cloneEnv(env);
        // NOTE: We **can** consider this a site (key rename).
        // But first, unify binding as engine would:
        if (!bindScalarNoImport(e, seg.name, k)) continue;
        // If this is the **last segment**, we emit a key-site.
        if (i + 1 === segs.length) {
          emit(e, [seg.name], {kind: 'key', path: path.slice(), key: k});
        } else {
          walkForOccurrences(segs, i + 1, node[k], e, path.concat(k), emit, opts);
        }
      }
      return;
    }
    case 'KeyVar': {
      if (!isObject(node)) return;
      const bound = env.get(seg.name)?.value;
      if (bound != null) {
        if (Object.prototype.hasOwnProperty.call(node, bound)) {
          if (i + 1 === segs.length) {
            emit(env, [seg.name], {kind: 'key', path: path.slice(), key: bound});
          } else {
            walkForOccurrences(segs, i + 1, node[bound], env, path.concat(bound), emit, opts);
          }
        }
        return;
      }
      for (const k of Object.keys(node)) {
        const e = cloneEnv(env);
        if (!bindScalarNoImport(e, seg.name, k)) continue;
        if (i + 1 === segs.length) {
          emit(e, [seg.name], {kind: 'key', path: path.slice(), key: k});
        } else {
          walkForOccurrences(segs, i + 1, node[k], e, path.concat(k), emit, opts);
        }
      }
      return;
    }

    // ----- Index segments -----
    case 'IdxAny': {
      if (!Array.isArray(node)) return;
      for (let a = 0; a < node.length; a++) {
        if (!(a in node)) continue;
        walkForOccurrences(segs, i + 1, node[a], env, path.concat(a), emit, opts);
      }
      return;
    }
    case 'IdxLit': {
      if (!Array.isArray(node)) return;
      const a = seg.idx;
      if (a in node) walkForOccurrences(segs, i + 1, node[a], env, path.concat(a), emit, opts);
      return;
    }
    case 'IdxVarLit': {
      if (!Array.isArray(node)) return;
      const a = seg.idx;
      const e = cloneEnv(env);
      if (!bindScalarNoImport(e, seg.name, a)) return;
      if (a in node) {
        if (i + 1 === segs.length) {
          emit(e, [seg.name], {kind: 'index', path: path.slice(), index: a});
        } else {
          walkForOccurrences(segs, i + 1, node[a], e, path.concat(a), emit, opts);
        }
      }
      return;
    }
    case 'IdxVar': {
      if (!Array.isArray(node)) return;
      const b = env.get(seg.name)?.value;
      if (Number.isInteger(b)) {
        if (b in node) {
          if (i + 1 === segs.length) {
            emit(env, [seg.name], {kind: 'index', path: path.slice(), index: b});
          } else {
            walkForOccurrences(segs, i + 1, node[b], env, path.concat(b), emit, opts);
          }
        }
        return;
      }
      for (let a = 0; a < node.length; a++) {
        if (!(a in node)) continue;
        const e = cloneEnv(env);
        if (!bindScalarNoImport(e, seg.name, a)) continue;
        if (i + 1 === segs.length) {
          emit(e, [seg.name], {kind: 'index', path: path.slice(), index: a});
        } else {
          walkForOccurrences(segs, i + 1, node[a], e, path.concat(a), emit, opts);
        }
      }
      return;
    }

    // ----- Value segments -----
    case 'ValVar': {
      // value site: replace this node
      const e = cloneEnv(env);
      if (!bindScalarNoImport(e, seg.name, node)) return;
      emit(e, [seg.name], {kind: 'value', path: path.slice()});
      return;
    }
    case 'ValPatVar': {
      // ensure pattern matches; site if yes, then bind var
      let ok = false;
      matchPatternForCollect(seg.pat, node, e2 => {
        ok = true;
      }, env);
      if (!ok) return;
      const e = cloneEnv(env);
      if (!bindScalarNoImport(e, seg.name, node)) return;
      emit(e, [seg.name], {kind: 'value', path: path.slice()});
      return;
    }
    case 'ValPat': {
      // pattern must match to keep exploring, but no site unless tail is variable
      let matched = false;
      matchPatternForCollect(seg.pat, node, () => {
        matched = true;
      }, env);
      if (matched) {
        // If this is the last segment (pure predicate rule), expose a virtual site with no vars.
        if (i + 1 === segs.length) {
          emit(env, [], {kind: 'value', path: path.slice()});
        }
      }
      return;
    }

    default:
      return;
  }
}

// A minimal matcher for collecting (patterns only where used in occurrences)
function matchPatternForCollect(pat, node, emit, env) {
  switch (pat.type) {
    case 'Any':
      emit(env);
      return;
    case 'Lit':
      if (Object.is(node, pat.value)) emit(env);
      return;
    case 'Re':
      if (pat.re.test(String(node))) emit(env);
      return;
    case 'Alt':
      for (const sub of pat.alts) matchPatternForCollect(sub, node, emit, env);
      return;
    case 'Look': {
      // read-only lookahead: bindings disallowed; treat as predicate
      let ok = false;
      matchPatternForCollect(pat.pat, node, () => {
        ok = true;
      }, env);
      if ((ok && !pat.neg) || (!ok && pat.neg)) emit(env);
      return;
    }
    case 'Arr': {
      if (!Array.isArray(node)) return;
      // reuse engine semantics by cheap re-entry: we accept array iff full match exists.
      // To keep this collector lean, we piggyback on the real engine for arrays/objects.
      // (No env creation here — we only care if predicate holds.)
      try {
        // Using a tiny adapter Program of a single ValPat
        const probe = {type: 'Program', rules: [{type: 'Path', segs: [{type: 'ValPat', pat}]}]};
        const ok = matchProgram(probe, node, {maxSteps: 20000});
        if (ok.length) emit(env);
      } catch {
        /* fall through as non-match */
      }
      return;
    }
    case 'Obj': {
      if (typeof node !== 'object' || node === null || Array.isArray(node)) return;
      try {
        const probe = {type: 'Program', rules: [{type: 'Path', segs: [{type: 'ValPat', pat}]}]};
        const ok = matchProgram(probe, node, {maxSteps: 20000});
        if (ok.length) emit(env);
      } catch {
      }
      return;
    }
    default:
      return;
  }
}

// bindScalar but without importing from microparser here (to avoid cycle); we mimic unification rules.
function bindScalarNoImport(env, name, val) {
  const cur = env.get(name);
  if (!cur) {
    env.set(name, {kind: 'scalar', value: val});
    return true;
  }
  return cur.kind === 'scalar' && Object.is(cur.value, val);
}

// ------------------- Patch planning & application -------------------

/**
 * Patch plan is a list of normalized operations:
 *  - { op:'set', path:[...], value }                     // replace value at path
 *  - { op:'rename', path:[...], fromKey, toKey }         // rename object key under parent at path
 *
 * For index sites, we currently **error** if a target is provided.
 */
function buildPatchPlan(matches, replacers) {
  // normalize replacers keys: allow with or without leading $
  const repl = new Map();
  for (const [k, v] of Object.entries(replacers || {})) {
    const name = k.startsWith('$') ? k.slice(1) : k;
    repl.set(name, v);
  }

  const plan = [];
  for (const m of matches) {
    // compute per-variable desired target (if any)
    const desired = new Map();
    for (const v of m.vars) {
      if (!repl.has(v)) continue;
      const spec = repl.get(v);
      const envObj = m.envPlain;
      const val = (typeof spec === 'function') ? spec(envObj) : spec;
      desired.set(v, val);
    }
    if (desired.size === 0) continue; // nothing to do for this occurrence

    // Check site kind and synthesize patch
    if (m.site.kind === 'value') {
      // All variables aiming at this value must agree
      const uniq = uniqueDesired(desired);
      if (!uniq.ok) throw new Error(`conflicting replacements at ${ppPath(m.site.path)}: ${uniq.reason}`);
      plan.push({op: 'set', path: m.site.path, value: uniq.value});
    } else if (m.site.kind === 'key') {
      const uniq = uniqueDesired(desired);
      if (!uniq.ok) throw new Error(`conflicting key renames at ${ppPath(m.site.path)}: ${uniq.reason}`);
      const toKey = String(uniq.value);
      plan.push({op: 'rename', path: m.site.path, fromKey: m.site.key, toKey});
    } else if (m.site.kind === 'index') {
      // Not supported safely
      const vname = [...desired.keys()][0];
      throw new Error(`replacement for index variable '$${vname}' not supported`);
    }
  }

  // Deduplicate identical operations (best-effort)
  return dedupePlan(plan);
}

function uniqueDesired(desired) {
  let have = false, value;
  for (const [, v] of desired) {
    if (!have) {
      have = true;
      value = v;
    } else if (!Object.is(value, v)) return {ok: false, reason: `disagreeing values ${String(value)} vs ${String(v)}`};
  }
  return have ? {ok: true, value} : {ok: false, reason: 'no desired value'};
}

function dedupePlan(plan) {
  const seen = new Set();
  const out = [];
  for (const p of plan) {
    const key = JSON.stringify(p);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

// Deep clone (structural sharing not required for minimal core)
function deepClone(x) {
  if (Array.isArray(x)) return x.map(deepClone);
  if (x && typeof x === 'object') {
    const o = {};
    for (const k of Object.keys(x)) o[k] = deepClone(x[k]);
    return o;
  }
  return x;
}

function applyPatches(input, plan) {
  const root = deepClone(input);
  // Group by parent path to perform key renames before value sets (stable)
  const renames = plan.filter(p => p.op === 'rename');
  const sets = plan.filter(p => p.op === 'set');

  // Apply renames
  for (const p of renames) {
    const parent = getAt(root, p.path);
    if (!parent || typeof parent !== 'object' || Array.isArray(parent))
      throw new Error(`cannot rename key at ${ppPath(p.path)} (not an object)`);
    if (!(p.fromKey in parent)) continue; // already moved by earlier rename
    const val = parent[p.fromKey];
    delete parent[p.fromKey];
    parent[p.toKey] = val;
  }

  // Apply sets
  for (const p of sets) {
    setAt(root, p.path, p.value);
  }

  return root;
}

function getAt(root, path) {
  let cur = root;
  for (const step of path) {
    if (cur == null) return undefined;
    cur = cur[step];
  }
  return cur;
}

function setAt(root, path, value) {
  if (path.length === 0) return value;
  let cur = root;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (cur[k] == null || typeof cur[k] !== 'object') {
      // create container as object vs array based on next key type
      const nextKey = path[i + 1];
      cur[k] = (typeof nextKey === 'number') ? [] : {};
    }
    cur = cur[k];
  }
  cur[path[path.length - 1]] = value;
  return root;
}

function ppPath(p) {
  if (!p.length) return '<root>';
  return p.map(k => (typeof k === 'number' ? `[${k}]` : `.${k}`)).join('').slice(1);
}

// ------------------- Small helpers borrowed from engine -------------------

function isObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function keyAtomOk(pat, key) {
  switch (pat.type) {
    case 'Any':
      return true;
    case 'Lit':
      return Object.is(String(key), String(pat.value));
    case 'Re':
      return pat.re.test(String(key));
    default:
      return false;
  }
}

// ------------------- Convenience exports -------------------

export function findAll(input, pattern, opts) {
  return find(input, pattern, opts);
}
export function replaceAll(input, pattern, replacers, opts) {
  return replace(input, pattern, replacers, opts);
}
