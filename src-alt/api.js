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
//     //     //   'group'  -> multi-item group (arrays) or kv-group (objects)
//     //     site: 'value' | 'key' | 'group',
//     //     // optional: a stable numeric "occurrence id" per binding, if helpful
//     //   }
//   }

import { parsePattern } from './parser.js';
import { matchSolutions } from './matcher.js';

export function Tendril(pattern, options = {}) {
  const ast = parsePattern(pattern);
  const opts = { ...options };

  function* solutions(data) {
    yield* matchSolutions(ast, data, opts);
  }

  function project(data, fn) {
    const out = [];
    for (const env of solutions(data)) out.push(fn(env));
    return out;
  }

  // replacers: { [varName]:
  //     value | fn(env)->value |
  //     { key?: value|fn, value?: value|fn }
  //   }
  function replaceAll(input, replacers = {}) {
    const occurrences = [];
    for (const env of solutions(input)) {
      for (const [name, bind] of Object.entries(env)) {
        const spec = replacers[name];
        if (spec == null) continue;
        const norm = normalizeReplacer(spec);

        if (bind.site === 'key' && norm.key) {
          const newKey = norm.key(env);
          const oldKey = getLastKeyFromPath(bind.path);
          if (newKey !== oldKey) {
            occurrences.push({
              kind: 'rename-key',
              path: parentPath(bind.path),
              oldKey,
              newKey,
            });
          }
        }

        if (bind.site === 'group' && norm.value) {
          // group replacement (array/object)
          const group = bind.group || {};
          if (group.type === 'array') {
            occurrences.push({
              kind: 'splice-group',
              pathToArray: group.pathToArray,
              start: group.start,
              deleteCount: group.end - group.start,
              insert: toArray(norm.value(env)),
            });
          } else if (group.type === 'object') {
            occurrences.push({
              kind: 'replace-obj-group',
              pathToObject: group.pathToObject,
              keys: group.keys.slice(),
              replacement: toObject(norm.value(env)),
            });
          } else {
            // fallback: set entire node (best-effort)
            occurrences.push({
              kind: 'set-value',
              path: bind.path,
              value: norm.value(env),
            });
          }
        } else if ((bind.site === 'value') && norm.value) {
          occurrences.push({
            kind: 'set-value',
            path: bind.path,
            value: norm.value(env),
          });
        }
      }
    }

    if (occurrences.length === 0) return deepClone(input);

    // deterministic application: deepest-first
    const sorted = occurrences.sort((a, b) => {
      const da = depthOfOp(a);
      const db = depthOfOp(b);
      if (da !== db) return db - da;
      return JSON.stringify(a).localeCompare(JSON.stringify(b));
    });

    const root = deepClone(input);
    for (const op of sorted) {
      if (op.kind === 'set-value') {
        setAtPath(root, op.path, op.value);
      } else if (op.kind === 'rename-key') {
        renameKeyAtPath(root, op.path, op.oldKey, op.newKey);
      } else if (op.kind === 'splice-group') {
        const arr = getAtPath(root, op.pathToArray);
        if (Array.isArray(arr)) arr.splice(op.start, op.deleteCount, ...op.insert);
      } else if (op.kind === 'replace-obj-group') {
        const obj = getAtPath(root, op.pathToObject);
        if (obj && typeof obj === 'object') {
          // remove covered keys, then merge replacement keys
          for (const k of op.keys) delete obj[k];
          if (op.replacement && typeof op.replacement === 'object') {
            for (const [k, v] of Object.entries(op.replacement)) obj[k] = v;
          }
        }
      }
    }
    return root;
  }

  function* occurrences(data) {
    for (const env of solutions(data)) yield env;
  }

  return { solutions, project, replaceAll, occurrences, ast };
}

// --------------------------------- helpers ---------------------------------

function normalizeReplacer(spec) {
  if (typeof spec === 'function' || !isObject(spec)) {
    return { value: toFn(spec), key: null };
  }
  const out = {};
  if ('value' in spec) out.value = toFn(spec.value);
  if ('key' in spec) out.key = toFn(spec.key);
  return out;
}

function toFn(x) { return typeof x === 'function' ? x : () => x; }
function isObject(x){ return x!==null && typeof x==='object' && !Array.isArray(x); }
function toArray(x){ return Array.isArray(x) ? x : [x]; }
function toObject(x){ return isObject(x) ? x : {}; }

function deepClone(x){
  if (Array.isArray(x)) return x.map(deepClone);
  if (isObject(x)){
    const out = {};
    for (const k of Object.keys(x)) out[k] = deepClone(x[k]);
    return out;
  }
  return x;
}

function setAtPath(root, path, value) {
  if (!Array.isArray(path) || path.length === 0) {
    throw new Error('Cannot set empty path');
  }
  const parent = getAtPath(root, path.slice(0, -1));
  const last = path[path.length - 1];
  if (last.type === 'index' && Array.isArray(parent)) parent[last.key] = value;
  else if (isObject(parent)) parent[last.key] = value;
}

function getAtPath(root, path) {
  let cur = root;
  for (const step of path) {
    if (cur == null) return undefined;
    cur = cur[step.key];
  }
  return cur;
}

function parentPath(path) { return path && path.length ? path.slice(0, -1) : []; }
function getLastKeyFromPath(path){ return path && path.length ? path[path.length-1].key : undefined; }

function renameKeyAtPath(root, path, oldKey, newKey) {
  const obj = getAtPath(root, path);
  if (!isObject(obj)) return;
  if (Object.prototype.hasOwnProperty.call(obj, newKey)) delete obj[newKey];
  if (Object.prototype.hasOwnProperty.call(obj, oldKey)) {
    obj[newKey] = obj[oldKey];
    delete obj[oldKey];
  }
}

function isObject(x){ return x!==null && typeof x==='object' && !Array.isArray(x); }

function depthOfOp(op){
  if (op.kind === 'set-value') return op.path.length;
  if (op.kind === 'rename-key') return op.path.length + 1;
  if (op.kind === 'splice-group') return op.pathToArray.length + 1;
  if (op.kind === 'replace-obj-group') return op.pathToObject.length + 1;
  return 0;
}
