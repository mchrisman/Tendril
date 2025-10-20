// api.js
// Public API facade for Tendril v5 (lean DFS implementation)
//
// Exposes:
//   Tendril(pattern, opts?).solutions(data)
//   Tendril(pattern, opts?).project(data, fn)      // convenience
//   Tendril(pattern, opts?).replaceAll(data, map)  // deterministic deep edits
//
// Design notes:
// - Parsing is done once at construction.
// - Matching is delegated to the single recursive engine in matcher.js.
// - replaceAll applies edits deepest-first; supports value replacement and key renames
//   when the matcher supplies key-site metadata for a binding.
//
// Matcher contract (to implement in matcher.js):
//   for (const env of matchSolutions(ast, data, options)) {
//     // env is a plain object: { [name]: Binding }
//     // Binding shape:
//     //   {
//     //     value: any,
//     //     // absolute path from root to the bound node (array of steps).
//     //     // each step: { type: 'key'|'index', key: string|number }
//     //     path: Array<{type:'key'|'index', key:string|number}>,
//     //     // where the binding occurred:
//     //     //   'value'  -> bound to a value position
//     //     //   'key'    -> bound to an object key (enables key rename)
//     //     //   'slice'  -> multi-item slice (arrays) or kv-slice (objects)
//     //     site: 'value' | 'key' | 'slice',
//     //     // optional: a stable numeric "occurrence id" per binding, if helpful
//     //   }
//   }

import { parsePattern } from './parser.js';
import { matchSolutions } from './matcher.js';

// ---------------------------------------------------------------------------

export function Tendril(pattern, options = {}) {
  const ast = parsePattern(pattern);
  const opts = normalizeOptions(options);

  function* solutions(data) {
    // Delegate to matcher; yield environments directly (lazy).
    yield* matchSolutions(ast, data, opts);
  }

  function project(data, fn) {
    const out = [];
    for (const env of solutions(data)) out.push(fn(env));
    return out;
  }

  // replacers: { [varName]: value | (env) => value | {key?:value|fn, value?:value|fn} }
  // - If a binding was captured at a key site, `key` replacement renames the object key.
  // - If captured at a value site, `value` replacement overwrites the node value.
  // - If captured as a slice, `value` replaces the entire slice (array segment or kv set).
  function replaceAll(input, replacers = {}) {
    // Collect all candidate edits by walking all solutions.
    const occurrences = [];
    for (const env of solutions(input)) {
      for (const [name, bind] of Object.entries(env)) {
        const spec = replacers[name];
        if (spec == null) continue;

        const { site } = bind;

        // Normalize spec into { key?, value? } of (env)=>any
        const norm = normalizeReplacer(spec);

        if (site === 'key' && norm.key) {
          const newKey = norm.key(env);
          // Skip no-op renames
          if (newKey !== getLastKeyFromPath(bind.path)) {
            occurrences.push({
              kind: 'rename-key',
              path: parentPath(bind.path),
              oldKey: getLastKeyFromPath(bind.path),
              newKey,
            });
          }
        }

        if ((site === 'value' || site === 'slice') && norm.value) {
          const newVal = norm.value(env);
          occurrences.push({
            kind: 'set-value',
            path: bind.path,
            value: newVal,
          });
        }
      }
    }

    if (occurrences.length === 0) return deepClone(input);

    // Apply edits deterministically: deepest-first, then stable tiebreak.
    const sorted = occurrences
      .sort((a, b) => {
        const da = a.kind === 'rename-key' ? a.path.length + 1 : a.path.length;
        const db = b.kind === 'rename-key' ? b.path.length + 1 : b.path.length;
        if (da !== db) return db - da; // deeper first
        // stable deterministic fallback:
        return JSON.stringify(a).localeCompare(JSON.stringify(b));
      });

    const root = deepClone(input);

    for (const op of sorted) {
      if (op.kind === 'set-value') {
        setAtPath(root, op.path, op.value);
      } else if (op.kind === 'rename-key') {
        renameKeyAtPath(root, op.path, op.oldKey, op.newKey);
      }
    }
    return root;
  }

  // Optional helper to enumerate all match occurrences with their envs.
  function* occurrences(data) {
    for (const env of solutions(data)) yield env;
  }

  return { solutions, project, replaceAll, occurrences, ast };
}

// ---------------------------------------------------------------------------
// Helpers

function normalizeOptions(o) {
  return {
    // room for toggles (e.g., max backtrack, ordering); defaults are conservative
    ...o,
  };
}

function normalizeReplacer(spec) {
  // Accept: value | fn | {value?, key?}
  if (typeof spec === 'function' || !isObject(spec)) {
    return {
      value: toFn(spec),
      key: null,
    };
  }
  const out = {};
  if ('value' in spec) out.value = toFn(spec.value);
  if ('key' in spec) out.key = toFn(spec.key);
  return out;
}

function toFn(x) {
  return typeof x === 'function' ? x : () => x;
}

function isObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function deepClone(x) {
  // JSON-like clone; supports arrays/objects/primitives.
  if (Array.isArray(x)) return x.map(deepClone);
  if (isObject(x)) {
    const out = {};
    for (const k of Object.keys(x)) out[k] = deepClone(x[k]);
    return out;
  }
  return x;
}

// Path utilities
function setAtPath(root, path, value) {
  if (!Array.isArray(path) || path.length === 0) {
    // replace root
    // eslint-disable-next-line no-param-reassign
    throw new Error('Cannot set empty path (root replacement not supported here)');
  }
  const last = path[path.length - 1];
  const parent = getAtPath(root, path.slice(0, -1));
  if (last.type === 'index' && Array.isArray(parent)) {
    parent[last.key] = value;
  } else if (last.type === 'key' && isObject(parent)) {
    parent[last.key] = value;
  } else {
    // best-effort set
    parent[last.key] = value;
  }
}

function getAtPath(root, path) {
  let cur = root;
  for (const step of path) {
    if (cur == null) return undefined;
    if (step.type === 'index') {
      cur = cur[step.key];
    } else {
      cur = cur[step.key];
    }
  }
  return cur;
}

function parentPath(path) {
  if (!path || path.length === 0) return [];
  return path.slice(0, -1);
}

function getLastKeyFromPath(path) {
  if (!path || path.length === 0) return undefined;
  const last = path[path.length - 1];
  return last.key;
}

function renameKeyAtPath(root, path, oldKey, newKey) {
  const obj = getAtPath(root, path);
  if (!isObject(obj)) return;
  if (Object.prototype.hasOwnProperty.call(obj, newKey)) {
    // collision: last-writer-wins by default; could be configurable
    delete obj[newKey]; // ensure deterministic outcome if both edits present
  }
  if (Object.prototype.hasOwnProperty.call(obj, oldKey)) {
    obj[newKey] = obj[oldKey];
    delete obj[oldKey];
  }
}

// ---------------------------------------------------------------------------
// Tiny convenience wrapper for one-shot usage (optional):
export function solutions(pattern, data, options) {
  return Array.from(Tendril(pattern, options).solutions(data));
}

export function project(pattern, data, mapFn, options) {
  return Tendril(pattern, options).project(data, mapFn);
}

export function replaceAll(pattern, data, replacers, options) {
  return Tendril(pattern, options).replaceAll(data, replacers);
}
