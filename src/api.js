// api.js
// Fluent Tendril API: Tendril and Solutions classes.
// Exposes logical solutions, positional occurrences, projection utilities,
// and replacement/editing without author-authored >>&<< markers.
//
// JSDoc types are provided for editor tooling without TypeScript.
//
// This layer delegates matching to the Milestone 4 interpreter helpers
// exported from objects-sets-paths-replace.js. It does not change core
// language semantics (anchoring, unification, lookaheads).

import { parseAndValidate } from "./syntax.js";
import {
  parseAndLower,
  matchAll,
} from "./objects-sets-paths-replace.js";

/**
 * @typedef {Object} OccurrenceRef
 * @property {"array-slice"|"object-value"|"object-keys"|"value"} kind
 * @property {any} [ref]
 * @property {number} [start]
 * @property {number} [end]
 * @property {string|number|any} [key]
 * @property {Array<string|number|any>} [keys]
 * @property {Array<string|number>} [path]
 */

/**
 * @typedef {Object} Solution
 * @property {Object<string, any>} bindings
 * @property {Object<string, OccurrenceRef[]>} at
 * @property {OccurrenceRef[]} where
 */

/**
 * Wrapper for a lazy sequence of Solution objects with combinators.
 */
class Solutions {
  /**
   * @param {() => Iterable<Solution>} genFactory
   */
  constructor(genFactory) {
    this._genFactory = genFactory;
    /** @type {Array<(sol: Solution) => boolean>} */
    this._filters = [];
    /** @type {null|{vars: string[], key?: (b: Record<string, unknown>) => string}} */
    this._uniqueSpec = null;
    /** @type {number|null} */
    this._takeN = null;
  }

  /**
   * Deduplicate by selected vars: unique('$A','$B')
   * @param  {...string} vars
   * @returns {Solutions}
   */
  unique(...vars) {
    if (vars.length === 0) return this;
    const next = new Solutions(this._genFactory);
    next._filters = this._filters.slice();
    next._takeN = this._takeN;
    next._uniqueSpec = { vars, key: undefined };
    return next;
  }

  /**
   * Deduplicate by custom key function over selected vars.
   * @param {string[]} vars
   * @param {(b: Record<string, unknown>) => string} keyFn
   * @returns {Solutions}
   */
  uniqueBy(vars, keyFn) {
    const next = new Solutions(this._genFactory);
    next._filters = this._filters.slice();
    next._takeN = this._takeN;
    next._uniqueSpec = { vars, key: keyFn };
    return next;
  }

  /**
   * @param {(sol: Solution) => boolean} pred
   * @returns {Solutions}
   */
  filter(pred) {
    const next = new Solutions(this._genFactory);
    next._filters = this._filters.concat([pred]);
    next._takeN = this._takeN;
    next._uniqueSpec = this._uniqueSpec;
    return next;
  }

  /**
   * @param {number} n
   * @returns {Solutions}
   */
  take(n) {
    const next = new Solutions(this._genFactory);
    next._filters = this._filters.slice();
    next._takeN = Math.max(0, n|0);
    next._uniqueSpec = this._uniqueSpec;
    return next;
  }

  /**
   * Map over bindings lazily.
   * @template T
   * @param {(bindings: Record<string, unknown>) => T} f
   * @returns {Iterable<T>}
   */
  map(f) {
    const self = this;
    return {
      [Symbol.iterator]() {
        const base = self[Symbol.iterator]();
        return {
          next() {
            const n = base.next();
            if (n.done) return n;
            return { value: f(n.value.bindings), done: false };
          }
        };
      }
    };
  }

  /**
   * Eager projection into an array.
   * @template T
   * @param {(bindings: Record<string, unknown>) => T} f
   * @returns {T[]}
   */
  project(f) {
    const out = [];
    for (const sol of this) out.push(f(sol.bindings));
    return out;
  }

  /**
   * Alias for project (for familiarity).
   * @template T
   * @param {(bindings: Record<string, unknown>) => T} f
   * @returns {T[]}
   */
  extract(f) { return this.project(f); }

  /**
   * Side effects over full solutions.
   * @param {(sol: Solution) => void} f
   * @returns {void}
   */
  forEach(f) { for (const s of this) f(s); }

  /**
   * Materialize solutions into an array.
   * @returns {Solution[]}
   */
  toArray() { return Array.from(this); }

  /**
   * First solution or null.
   * @returns {Solution|null}
   */
  first() {
    const it = this[Symbol.iterator]();
    const n = it.next();
    return n.done ? null : n.value;
  }

  /**
   * Count solutions (consumes iterator).
   * @returns {number}
   */
  count() { let c = 0; for (const _ of this) c++; return c; }

  /**
   * Iterator composing filters, uniqueness, and take().
   * @returns {Iterator<Solution>}
   */
  [Symbol.iterator]() {
    const baseIt = this._genFactory()[Symbol.iterator]();
    const filters = this._filters;
    const unique = this._uniqueSpec;
    const takeN = this._takeN;
    /** @type {Set<string>|null} */
    const seen = unique ? new Set() : null;
    let yielded = 0;
    return {
      next: () => {
        while (true) {
          const n = baseIt.next();
          if (n.done) return n;
          /** @type {Solution} */
          const sol = n.value;
          let ok = true;
          for (const f of filters) { if (!f(sol)) { ok = false; break; } }
          if (!ok) continue;
          if (seen) {
            const k = (unique.key
              ? unique.key(projectBindings(sol.bindings, unique.vars))
              : stableKey(projectBindings(sol.bindings, unique.vars)));
            if (seen.has(k)) continue;
            seen.add(k);
          }
          if (takeN != null && yielded >= takeN) return { value: undefined, done: true };
          yielded++;
          return { value: sol, done: false };
        }
      }
    };
  }
}

/**
 * Internal Tendril class implementation.
 */
class TendrilImpl {
  /**
   * @param {string} pattern
   */
  constructor(pattern) {
    this._pattern = String(pattern);
    /** @type {Record<string, unknown>} */
    this._env = {};
    /** @type {{unicodeNormalize?: 'NFC'|'NFD'}} */
    this._opts = {};
    /** @type {any} */
    this._ast = null;
    /** @type {boolean} */
    this._debug = false;
  }

  /**
   * Enable debug mode - returns a copy with debug enabled.
   * @returns {TendrilImpl}
   */
  debug() {
    const t = new TendrilImpl(this._pattern);
    t._env = this._env;
    t._opts = this._opts;
    t._ast = this._ast;
    t._debug = true;
    return t;
  }

  /**
   * @param {Record<string, unknown>} bindings
   * @returns {TendrilImpl}
   */
  withEnv(bindings) {
    const t = new TendrilImpl(this._pattern);
    t._env = Object.assign({}, this._env, bindings || {});
    t._opts = this._opts;
    t._ast = this._ast;
    return t;
  }

  /**
   * @param {{unicodeNormalize?: 'NFC'|'NFD'}} opts
   * @returns {TendrilImpl}
   */
  withOptions(opts) {
    const t = new TendrilImpl(this._pattern);
    t._env = this._env;
    t._opts = Object.assign({}, this._opts, opts || {});
    t._ast = this._ast;
    return t;
  }

  /**
   * @param {any} input
   * @returns {Solutions}
   */
  solutions(input) {
    const ast = this._ast || (this._ast = parseAndLower(parseAndValidate(this._pattern)));
    const env = this._env;
    const opts = this._opts;
    return new Solutions(function* () {
      yield* matchAll(ast, input, { envSeed: env, semOpts: opts, mode: "logical" });
    });
  }

  /**
   * @param {any} input
   * @returns {Solutions}
   */
  occurrences(input) {
    const ast = this._ast || (this._ast = parseAndLower(parseAndValidate(this._pattern)));
    const env = this._env;
    const opts = this._opts;
    const debug = this._debug;

    const genFactory = function* () {
      yield* matchAll(ast, input, { envSeed: env, semOpts: opts, mode: "scan" });
    };

    if (debug) {
      // Collect all solutions for debug visualization
      const allSols = Array.from(genFactory());
      console.log(formatDebugOccurrences(input, allSols));
      // Return solutions iterator
      return new Solutions(function* () { yield* allSols; });
    }

    return new Solutions(genFactory);
  }

  /**
   * First logical solution or null.
   * @param {any} input
   * @returns {Solution|null}
   */
  match(input) {
    return this.solutions(input).first();
  }

  /**
   * All logical solutions as an array.
   * @param {any} input
   * @returns {Solution[]}
   */
  all(input) {
    return this.solutions(input).toArray();
  }

  /**
   * Replace all occurrences per-solution by symbol map.
   * Implementation: gather edits from each solution's at, schedule, apply immutably.
   * @param {any} input
   * @param {(bindings: Record<string, unknown>) => Partial<Record<string, unknown>>} f
   * @returns {any}
   */
  replace(input, f) {
    const edits = [];
    for (const sol of this.solutions(input)) {
      const plan = f(sol.bindings) || {};
      for (const [varName, to] of Object.entries(plan)) {
        // Strip $ prefix if present to match sol.at keys
        const key = varName.startsWith('$') ? varName.slice(1) : varName;
        const spots = sol.at[key] || [];
        for (const ref of spots) edits.push({ ref, to });
      }
    }
    return applyScheduledEdits(input, edits);
  }

  /**
   * Replace using explicit ref list per solution.
   * @param {any} input
   * @param {(sol: Solution) => Array<{ref: OccurrenceRef, to: unknown}>} f
   * @returns {any}
   */
  edit(input, f) {
    const edits = [];
    for (const sol of this.solutions(input)) {
      const list = f(sol) || [];
      for (const e of list) edits.push(e);
    }
    return applyScheduledEdits(input, edits);
  }

  /**
   * Replace all occurrences by scanning entire structure.
   * Two-stage approach: collect all solutions, then apply deepest-first with validation.
   * @param {any} input
   * @param {(bindings: Record<string, unknown>) => Partial<Record<string, unknown>>} f
   * @returns {any}
   */
  replaceAll(input, f) {
    // Stage 1: Collect all solutions with their replacement plans
    const solutions = Array.from(this.occurrences(input)).map(sol => ({
      bindings: sol.bindings,
      at: sol.at,
      where: sol.where,
      plan: f(sol.bindings) || {}
    }));

    // Sort by depth (deepest first), then lexicographically for determinism
    solutions.sort((a, b) => {
      // Primary: depth (longer paths = deeper = higher priority)
      const depthDiff = b.where.length - a.where.length;
      if (depthDiff !== 0) return depthDiff;

      // Secondary: lexicographic comparison of serialized paths
      const pathA = serializePath(a.where);
      const pathB = serializePath(b.where);
      return pathA < pathB ? -1 : pathA > pathB ? 1 : 0;
    });

    // Stage 2: Apply solutions if still valid using breadcrumb navigation
    let current = input;
    for (const sol of solutions) {
      if (stillValid(current, sol, input)) {
        // Apply this solution using breadcrumb-based replacement
        current = applyWithBreadcrumbs(current, sol, input);
      }
    }

    return current;
  }
}

/**
 * Fluent API factory function.
 * Can be called with or without `new`: Tendril(pattern) or new Tendril(pattern)
 * @param {string} pattern
 * @returns {TendrilImpl}
 */
export function Tendril(pattern) {
  return new TendrilImpl(pattern);
}

/**
 * Convenience: true if any logical solution exists.
 * @param {string} pattern
 * @param {any} input
 */
export function matches(pattern, input) {
  return Tendril(pattern).match(input) !== null;
}

/**
 * Convenience: bindings from first logical solution or null.
 * @param {string} pattern
 * @param {any} input
 * @returns {Record<string, unknown>|null}
 */
export function extract(pattern, input) {
  const s = Tendril(pattern).match(input);
  return s ? s.bindings : null;
}

/**
 * Convenience: bindings from all logical solutions.
 * @param {string} pattern
 * @param {any} input
 * @returns {Record<string, unknown>[]}
 */
export function extractAll(pattern, input) {
  return Tendril(pattern).solutions(input).project(b => b);
}

/**
 * Convenience: pattern → template rewrite.
 * Scans entire structure for occurrences and replaces them.
 * @template T
 * @param {string} pattern
 * @param {any} input
 * @param {(bindings: Record<string, unknown>) => T} builder
 * @returns {any}
 */
export function replaceAll(pattern, input, builder) {
  // Default idiom: user binds $out or similar in their pattern
  return Tendril(pattern).replaceAll(input, b => ({ $out: builder(b) }));
}

/**
 * Convenience: unique projected bindings for selected vars.
 * @param {string} pattern
 * @param {any} input
 * @param  {...string} vars
 * @returns {Record<string, unknown>[]}
 */
export function uniqueMatches(pattern, input, ...vars) {
  return Tendril(pattern)
    .solutions(input)
    .unique(...vars)
    .project(b => projectBindings(b, vars));
}

/* ======================= helpers ======================= */

/**
 * @param {Record<string, unknown>} b
 * @param {string[]} vars
 */
function projectBindings(b, vars) {
  const out = {};
  for (const v of vars) {
    // Strip $ prefix if present
    const key = v.startsWith('$') ? v.slice(1) : v;
    if (Object.prototype.hasOwnProperty.call(b, key)) out[key] = b[key];
  }
  return out;
}

/**
 * Serialize an OccurrenceRef path to a stable string for lexicographic sorting.
 * @param {OccurrenceRef[]} path
 * @returns {string}
 */
function serializePath(path) {
  const parts = path.map(ref => {
    switch (ref.kind) {
      case "array-slice":
        return `array[${ref.start}:${ref.end}]`;
      case "object-value":
        return `obj.${String(ref.key)}`;
      case "object-keys":
        return `keys[${ref.keys.join(',')}]`;
      case "value":
        return `value`;
      default:
        return ref.kind;
    }
  });
  return parts.join('/');
}

/**
 * Format debug visualization of occurrences.
 * @param {any} input
 * @param {Solution[]} solutions
 * @returns {string}
 */
function formatDebugOccurrences(input, solutions) {
  if (solutions.length === 0) {
    return "No occurrences found.";
  }

  // Traverse input and build a map of all locations
  const locationMap = new Map(); // path string -> {value, markers: string[]}

  function traverse(value, path) {
    const pathStr = refPathToString(path);
    if (!locationMap.has(pathStr)) {
      locationMap.set(pathStr, {
        value,
        markers: Array(solutions.length).fill(" ")
      });
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const ref = { kind: "array-slice", ref: value, start: i, end: i + 1 };
        traverse(value[i], path.concat([ref]));
      }
    } else if (value instanceof Map) {
      for (const [k, v] of value.entries()) {
        const ref = { kind: "object-value", ref: value, key: k };
        traverse(v, path.concat([ref]));
      }
    } else if (value && typeof value === 'object' && !(value instanceof Set)) {
      for (const k of Object.keys(value)) {
        const ref = { kind: "object-value", ref: value, key: k };
        traverse(value[k], path.concat([ref]));
      }
    }
  }

  traverse(input, []);

  // Now mark which variables were bound where in each solution
  solutions.forEach((sol, solIdx) => {
    // Mark where the pattern matched
    const whereStr = refPathToString(sol.where);
    if (locationMap.has(whereStr)) {
      locationMap.get(whereStr).markers[solIdx] = "•";
    }

    // Mark variable bindings
    for (const [varName, refs] of Object.entries(sol.at)) {
      for (const ref of refs) {
        // Find this ref in our location map by comparing object identity and position
        for (const [pathStr, loc] of locationMap.entries()) {
          if (refMatchesLocation(ref, input, pathStr)) {
            const marker = varName[0]; // First letter of variable name
            loc.markers[solIdx] = marker;
            break;
          }
        }
      }
    }
  });

  // Sort paths lexicographically
  const sortedPaths = Array.from(locationMap.entries()).sort((a, b) => {
    return a[0].localeCompare(b[0], undefined, { numeric: true });
  });

  // Format output
  const lines = [];
  const header = "Occurrences:         " + solutions.map((_, i) => String(i).padStart(3)).join("");
  lines.push(header);
  lines.push("-".repeat(header.length));

  for (const [pathStr, {value, markers}] of sortedPaths) {
    let label = pathStr || "input";

    // Add value representation if it's a leaf
    if (value !== undefined && value !== null && typeof value !== 'object') {
      label += `=${JSON.stringify(value)}`;
    } else if (Array.isArray(value)) {
      label += ` (array[${value.length}])`;
    } else if (typeof value === 'object' && !(value instanceof Set) && !(value instanceof Map)) {
      label += ` (object)`;
    }

    const markerStr = markers.join("  ");
    lines.push(label.padEnd(30) + markerStr);
  }

  return "\n" + lines.join("\n") + "\n";
}

/**
 * Check if an OccurrenceRef matches a location in the tree.
 * @param {OccurrenceRef} ref
 * @param {any} input
 * @param {string} pathStr
 * @returns {boolean}
 */
function refMatchesLocation(ref, input, pathStr) {
  // Build the path string from the ref and try to match it
  // The ref contains: {kind, ref (parent container), start, end, key, etc.}

  // Try to find where ref.ref appears in the input tree, then add position info
  const refPath = findPathToContainer(input, ref.ref);
  if (!refPath) return false;

  // Add the position within the container
  const fullPath = [...refPath];
  fullPath.push(ref);

  return refPathToString(fullPath) === pathStr;
}

/**
 * Find the path to a container object in the tree.
 * @param {any} tree
 * @param {any} target
 * @param {OccurrenceRef[]} currentPath
 * @returns {OccurrenceRef[] | null}
 */
function findPathToContainer(tree, target, currentPath = []) {
  if (tree === target) return currentPath;

  if (Array.isArray(tree)) {
    for (let i = 0; i < tree.length; i++) {
      const ref = { kind: "array-slice", ref: tree, start: i, end: i + 1 };
      const found = findPathToContainer(tree[i], target, currentPath.concat([ref]));
      if (found) return found;
    }
  } else if (tree instanceof Map) {
    for (const [k, v] of tree.entries()) {
      const ref = { kind: "object-value", ref: tree, key: k };
      const found = findPathToContainer(v, target, currentPath.concat([ref]));
      if (found) return found;
    }
  } else if (tree && typeof tree === 'object') {
    for (const k of Object.keys(tree)) {
      const ref = { kind: "object-value", ref: tree, key: k };
      const found = findPathToContainer(tree[k], target, currentPath.concat([ref]));
      if (found) return found;
    }
  }

  return null;
}

/**
 * Convert OccurrenceRef path to readable string like "input[0][1]".
 * @param {OccurrenceRef[]} refPath
 * @returns {string}
 */
function refPathToString(refPath) {
  if (refPath.length === 0) return "";

  const parts = [];
  for (const ref of refPath) {
    switch (ref.kind) {
      case "array-slice":
        if (ref.start === ref.end - 1) {
          parts.push(`[${ref.start}]`);
        } else {
          parts.push(`[${ref.start}:${ref.end}]`);
        }
        break;
      case "object-value":
        parts.push(`[${JSON.stringify(ref.key)}]`);
        break;
      case "value":
        // Skip - represents the value itself
        break;
      default:
        parts.push(`[${ref.kind}]`);
    }
  }

  return "input" + parts.join("");
}

/**
 * Get value at a reference path.
 * @param {any} tree
 * @param {OccurrenceRef[]} refPath
 * @returns {any}
 */
function getValueAtRefPath(tree, refPath) {
  let current = tree;
  for (const ref of refPath) {
    switch (ref.kind) {
      case "array-slice":
        if (ref.start === ref.end - 1) {
          current = current[ref.start];
        } else {
          current = current.slice(ref.start, ref.end);
        }
        break;
      case "object-value":
        if (current instanceof Map) {
          current = current.get(ref.key);
        } else {
          current = current[ref.key];
        }
        break;
      case "value":
        // No navigation needed
        break;
    }
  }
  return current;
}

/**
 * Check if a solution is still valid by verifying bound values still match.
 * @param {any} tree - Current tree state
 * @param {{bindings: Record<string, any>, at: Record<string, OccurrenceRef[]>, where: OccurrenceRef[], plan: Record<string, any>}} solution
 * @param {any} originalTree - Original input tree
 * @returns {boolean}
 */
function stillValid(tree, solution, originalTree) {
  try {
    // Check if all bound values still match in the current tree
    for (const [varName, expectedValue] of Object.entries(solution.bindings)) {
      const refs = solution.at[varName];
      if (!refs || refs.length === 0) continue;

      for (const ref of refs) {
        // Find where ref.ref was in the original tree
        const containerPath = findPathToContainer(originalTree, ref.ref);
        if (!containerPath) return false;

        // Navigate to the container in the current tree
        let container;
        try {
          container = navigateViaBreadcrumbs(tree, containerPath);
        } catch {
          return false;
        }

        // Extract the value at the ref's position within the container
        let currentValue;
        switch (ref.kind) {
          case "array-slice":
            if (!Array.isArray(container)) return false;
            if (ref.start === ref.end - 1) {
              currentValue = container[ref.start];
            } else {
              currentValue = container.slice(ref.start, ref.end);
            }
            break;
          case "object-value":
            if (container instanceof Map) {
              if (!container.has(ref.key)) return false;
              currentValue = container.get(ref.key);
            } else {
              if (!(ref.key in container)) return false;
              currentValue = container[ref.key];
            }
            break;
          case "value":
            currentValue = container;
            break;
          default:
            return false;
        }

        // Compare current value with expected value
        if (stableKey(currentValue) !== stableKey(expectedValue)) {
          return false;
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Navigate through tree using breadcrumb path.
 * @param {any} tree
 * @param {OccurrenceRef[]} breadcrumbs
 * @returns {any}
 */
function navigateViaBreadcrumbs(tree, breadcrumbs) {
  let current = tree;
  for (const crumb of breadcrumbs) {
    current = navigateStep(current, crumb);
  }
  return current;
}

/**
 * Navigate one step using an OccurrenceRef's position info (not object identity).
 * @param {any} node
 * @param {OccurrenceRef} crumb
 * @returns {any}
 */
function navigateStep(node, crumb) {
  switch (crumb.kind) {
    case "array-slice":
      if (!Array.isArray(node)) throw new Error("Expected array");
      if (crumb.start === crumb.end - 1) {
        if (crumb.start >= node.length) throw new Error("Index out of bounds");
        return node[crumb.start];
      }
      return node.slice(crumb.start, crumb.end);

    case "object-value":
      if (node instanceof Map) {
        if (!node.has(crumb.key)) throw new Error("Key not found");
        return node.get(crumb.key);
      }
      if (node === null || typeof node !== 'object') throw new Error("Expected object");
      if (!(crumb.key in node)) throw new Error("Key not found");
      return node[crumb.key];

    case "value":
      return node;

    default:
      throw new Error(`Unknown crumb kind: ${crumb.kind}`);
  }
}

/**
 * Apply a solution's replacement plan using position-based navigation.
 * Since refs contain stale object pointers after immutable edits, we rebuild the path
 * by finding where ref.ref was in the original tree, then navigate the current tree
 * using those positions.
 * @param {any} tree
 * @param {{bindings: Record<string, any>, at: Record<string, OccurrenceRef[]>, where: OccurrenceRef[], plan: Record<string, any>}} solution
 * @param {any} originalTree - The original input tree (for finding ref paths)
 * @returns {any}
 */
function applyWithBreadcrumbs(tree, solution, originalTree) {
  if (Object.keys(solution.plan).length === 0) return tree;

  // Build edit list with full paths
  const editsWithPaths = [];
  for (const [varName, to] of Object.entries(solution.plan)) {
    const key = varName.startsWith('$') ? varName.slice(1) : varName;
    const spots = solution.at[key] || [];
    for (const ref of spots) {
      // Find the path to ref.ref in the original tree
      const containerPath = findPathToContainer(originalTree, ref.ref);
      if (containerPath) {
        editsWithPaths.push({
          containerPath,
          ref,
          to
        });
      }
    }
  }

  if (editsWithPaths.length === 0) return tree;

  // Group edits by container path
  const editsByContainer = new Map();
  for (const edit of editsWithPaths) {
    const key = refPathToString(edit.containerPath);
    if (!editsByContainer.has(key)) {
      editsByContainer.set(key, {
        containerPath: edit.containerPath,
        edits: []
      });
    }
    editsByContainer.get(key).edits.push({ ref: edit.ref, to: edit.to });
  }

  // Apply edits to each container
  let result = tree;
  for (const { containerPath, edits } of editsByContainer.values()) {
    result = setAtBreadcrumbPath(result, containerPath, (container) => {
      return applyEditsAtLocation(result, container, edits);
    });
  }

  return result;
}

/**
 * Apply edits at a specific breadcrumb location in the tree.
 * @param {any} tree
 * @param {OccurrenceRef[]} breadcrumbs - path to where pattern matched
 * @param {Array<{ref: OccurrenceRef, to: any}>} edits - edits to apply
 * @returns {any}
 */
function applyEditsViaBreadcrumbs(tree, breadcrumbs, edits) {
  if (breadcrumbs.length === 0) {
    // Edits are at root level - navigate the current tree to find matching nodes
    // and rebuild with replacements
    // Since refs contain old object pointers, we match by position
    return applyEditsAtLocation(tree, tree, edits);
  }

  // Navigate to parent and apply edits there
  return setAtBreadcrumbPath(tree, breadcrumbs, (location) => {
    return applyEditsAtLocation(tree, location, edits);
  });
}

/**
 * Apply edits at a specific location using position info from refs.
 * @param {any} root - full tree root (for editMap building)
 * @param {any} location - the node where edits should be applied
 * @param {Array<{ref: OccurrenceRef, to: any}>} edits
 * @returns {any}
 */
function applyEditsAtLocation(root, location, edits) {
  // Group edits by their target location
  // Since refs have old object pointers, we need to match structurally

  if (Array.isArray(location)) {
    // Apply array-slice edits
    const sliceEdits = edits.filter(e => e.ref.kind === 'array-slice');
    if (sliceEdits.length === 0) return location;

    // Sort in reverse order to maintain indices
    sliceEdits.sort((a, b) => b.ref.start - a.ref.start);

    let result = location.slice();
    for (const e of sliceEdits) {
      const mid = Array.isArray(e.to) ? e.to : [e.to];
      result.splice(e.ref.start, e.ref.end - e.ref.start, ...mid);
    }
    return result;
  }

  if (location instanceof Map) {
    const result = new Map(location);
    for (const e of edits) {
      if (e.ref.kind === 'object-value') {
        result.set(e.ref.key, e.to);
      }
    }
    return result;
  }

  if (location && typeof location === 'object') {
    const result = { ...location };
    for (const e of edits) {
      if (e.ref.kind === 'object-value') {
        result[e.ref.key] = e.to;
      }
    }
    return result;
  }

  return location;
}

/**
 * Immutably set value at breadcrumb path by applying a transformation function.
 * Uses structuredClone for efficient deep cloning.
 * @param {any} tree
 * @param {OccurrenceRef[]} breadcrumbs
 * @param {(location: any) => any} transform
 * @returns {any}
 */
function setAtBreadcrumbPath(tree, breadcrumbs, transform) {
  if (breadcrumbs.length === 0) {
    return transform(tree);
  }

  const [first, ...rest] = breadcrumbs;

  if (first.kind === 'array-slice') {
    if (!Array.isArray(tree)) return tree;
    // Clone entire array and recursively process target element
    const result = tree.map((item, idx) => {
      if (idx === first.start) {
        return setAtBreadcrumbPath(item, rest, transform);
      }
      return structuredClone(item);
    });
    return result;
  }

  if (first.kind === 'object-value') {
    if (tree instanceof Map) {
      const result = new Map();
      for (const [k, v] of tree.entries()) {
        if (k === first.key) {
          result.set(k, setAtBreadcrumbPath(v, rest, transform));
        } else {
          result.set(k, structuredClone(v));
        }
      }
      return result;
    }
    if (tree && typeof tree === 'object') {
      const result = {};
      for (const k of Object.keys(tree)) {
        if (k === first.key) {
          result[k] = setAtBreadcrumbPath(tree[k], rest, transform);
        } else {
          result[k] = structuredClone(tree[k]);
        }
      }
      return result;
    }
    return tree;
  }

  if (first.kind === 'value') {
    return setAtBreadcrumbPath(tree, rest, transform);
  }

  return tree;
}

/**
 * Build a stable structural key aligned with deep-structural equality.
 * @param {any} v
 * @returns {string}
 */
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
    // Array
    if (Array.isArray(x)) return ["A", x.map(enc)];
    // Set
    if (x instanceof Set) {
      const arr = Array.from(x).map(enc).map(JSON.stringify).sort();
      return ["S", arr];
    }
    // Map
    if (x instanceof Map) {
      const pairs = Array.from(x.entries()).map(([k, v]) => [enc(k), enc(v)].map(JSON.stringify));
      pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
      return ["M", pairs];
    }
    // Plain object
    const keys = Object.keys(x).sort();
    return ["O", keys.map(k => [k, enc(x[k])])];
  };
  return JSON.stringify(enc(v));
}

/**
 * Apply non-overlapping edits to root; returns a new immutable root.
 * Properly handles nested structures by deep-cloning and applying edits recursively.
 * @param {any} root
 * @param {Array<{ref: OccurrenceRef, to: unknown}>} edits
 * @returns {any}
 */
function applyScheduledEdits(root, edits) {
  if (edits.length === 0) return root;

  // Remove duplicate edits (same ref)
  const seen = new Set();
  const uniq = [];
  for (const e of edits) {
    const k = JSON.stringify(e.ref);
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(e);
  }

  // Build edit map: original node reference -> list of edits
  const editMap = new Map();
  for (const e of uniq) {
    const nodeRef = e.ref.ref;
    if (!editMap.has(nodeRef)) editMap.set(nodeRef, []);
    editMap.get(nodeRef).push(e);
  }

  // Recursively clone tree, applying edits where needed
  function clone(node) {
    const editsHere = editMap.get(node);

    if (Array.isArray(node)) {
      // Apply array-slice edits in reverse order to maintain indices
      if (editsHere) {
        const sliceEdits = editsHere
          .filter(e => e.ref.kind === "array-slice")
          .sort((a, b) => b.ref.start - a.ref.start); // reverse order

        let result = node.slice();
        for (const e of sliceEdits) {
          const mid = Array.isArray(e.to) ? e.to : [e.to];
          result.splice(e.ref.start, e.ref.end - e.ref.start, ...mid);
        }
        return result.map(clone);
      }
      return node.map(clone);
    }

    if (node instanceof Map) {
      const result = new Map();
      const valEdits = editsHere
        ? new Map(editsHere.filter(e => e.ref.kind === "object-value").map(e => [e.ref.key, e.to]))
        : new Map();
      const keyRenames = editsHere
        ? new Map(editsHere
            .filter(e => e.ref.kind === "object-keys" && e.ref.keys.length === 1 && typeof e.to === "string")
            .map(e => [e.ref.keys[0], e.to]))
        : new Map();

      for (const [k, v] of node.entries()) {
        const newKey = keyRenames.get(k) ?? k;
        const newVal = valEdits.has(k) ? valEdits.get(k) : clone(v);
        result.set(newKey, newVal);
      }
      return result;
    }

    if (node instanceof Set) {
      return new Set(Array.from(node).map(clone));
    }

    if (node && typeof node === "object") {
      const result = {};
      const valEdits = editsHere
        ? new Map(editsHere.filter(e => e.ref.kind === "object-value").map(e => [e.ref.key, e.to]))
        : new Map();
      const keyRenames = editsHere
        ? new Map(editsHere
            .filter(e => e.ref.kind === "object-keys" && e.ref.keys.length === 1 && typeof e.to === "string")
            .map(e => [e.ref.keys[0], e.to]))
        : new Map();

      for (const k of Object.keys(node)) {
        const newKey = keyRenames.get(k) ?? k;
        const newVal = valEdits.has(k) ? valEdits.get(k) : clone(node[k]);
        result[newKey] = newVal;
      }
      return result;
    }

    // Primitive value
    return node;
  }

  return clone(root);
}

/**
 * Immutable set at JSON path for plain objects/arrays/maps. Minimal support.
 * @param {any} root
 * @param {Array<string|number>} path
 * @param {any} to
 * @returns {any}
 */
function setAtPathImmutable(root, path, to) {
  if (path.length === 0) return to;
  const [h, ...t] = path;
  if (Array.isArray(root)) {
    const idx = /** @type {number} */ (h);
    const next = setAtPathImmutable(root[idx], t, to);
    const copy = root.slice();
    copy[idx] = next;
    return copy;
  }
  if (root instanceof Map) {
    const copy = new Map(root);
    const next = setAtPathImmutable(root.get(h), t, to);
    copy.set(h, next);
    return copy;
  }
  if (root && typeof root === "object") {
    const copy = Object.assign({}, root);
    copy[h] = setAtPathImmutable(root[h], t, to);
    return copy;
  }
  // Fallback: cannot descend; return root unchanged.
  return root;
}
