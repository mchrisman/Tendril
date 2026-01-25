// tendril-engine.js — evaluator for Tendril v5-A AST
// Requires AST produced by tendril-parser.js and helpers from microparser.js

import {
  bindScalar, bindGroup, cloneEnv, isBound,
} from './microparser.js';
import {Group} from './tendril-api.js';
import {sameValueZero} from './tendril-util.js';
import {evaluateExpr, getExprVariables} from './tendril-el.js';

// ------------- StopSearch sentinel for early termination -------------
// Used by short-circuit helpers (matchExists, scanFirst, etc.) to stop
// enumeration after the first solution is found.
class StopSearch extends Error {
  constructor(payload) {
    super('StopSearch');
    this.payload = payload;
  }
}

// ------------- Solution structure: {env, sites} -------------
// Solution tracks both bindings (env) and where they were bound (sites)
// Site kinds:
//  - scalar: {kind: 'scalar', path: [], valueRef: obj}
//  - group (array): {kind: 'group', path: [], groupStart: n, groupEnd: m, valueRefs: [obj1, ...]}
//  - group (object): {kind: 'group', path: [], keys: ['a', ...], valueRefs: {a: obj1, ...}}

function newSolution() {
  // labels: Map<labelName, {key: flowKey, bucketLevel: number}>
  // bucketLevel is the index in bucketStack where entries for this label should go
  return {env: new Map(), sites: new Map(), guards: [], bucketStack: [], labels: new Map()};
}

function cloneSolution(sol) {
  const sites = new Map();
  for (const [k, v] of sol.sites) {
    sites.set(k, [...v]); // shallow copy of site array
  }
  // Deep clone bucketStack: array of Maps, each Map has bucket entries
  const bucketStack = sol.bucketStack.map(level => {
    const clonedLevel = new Map();
    for (const [name, entries] of level) {
      clonedLevel.set(name, {...entries}); // shallow clone of entries object
    }
    return clonedLevel;
  });
  return {
    env: cloneEnv(sol.env),
    sites,
    guards: sol.guards ? [...sol.guards] : [],
    bucketStack,
    labels: new Map([...sol.labels].map(([name, info]) => [name, {...info}]))
  };
}

// ---------- Bucket helpers for Flow operator ----------

// Push a new bucket level onto a solution's stack
function pushBucketLevel(sol) {
  sol.bucketStack.push(new Map());
}

// Add an entry to a bucket level
// If bucketLevel is provided, add to that level; otherwise add to current (top) level
// sliceKind: 'object' collects {key: value}, 'array' collects [value, ...]
// Returns true on success, false on collision (same key already exists for object buckets)
function addToBucket(sol, bucketName, key, value, bucketLevel = null, sliceKind = 'object') {
  if (sol.bucketStack.length === 0) {
    throw new Error(`Flow ->${sliceKind === 'object' ? '%' : '@'}${bucketName} used outside of K:V context`);
  }

  const levelIndex = bucketLevel !== null ? bucketLevel : sol.bucketStack.length - 1;
  if (levelIndex < 0 || levelIndex >= sol.bucketStack.length) {
    throw new Error(`Invalid bucket level ${levelIndex} (stack size: ${sol.bucketStack.length})`);
  }

  const level = sol.bucketStack[levelIndex];
  if (!level.has(bucketName)) {
    // Initialize bucket with kind tracking
    level.set(bucketName, {kind: sliceKind, entries: sliceKind === 'object' ? {} : []});
  }
  const bucket = level.get(bucketName);

  // Check for kind mismatch (same bucket used with both % and @)
  if (bucket.kind !== sliceKind) {
    throw new Error(`Bucket '${bucketName}' used with both % and @ sigils - pick one`);
  }

  if (sliceKind === 'object') {
    // Object bucket: {key: value, ...}
    if (Object.prototype.hasOwnProperty.call(bucket.entries, key)) {
      // Collision: same key already in bucket - fail this branch
      return false;
    }
    bucket.entries[key] = value;
  } else {
    // Array bucket: [value, ...]
    bucket.entries.push(value);
  }
  return true;
}

// Collect and merge bucket entries from top level of all solutions,
// then pop that level and bind merged buckets to all solutions.
// Returns the filtered list of solutions (those where binding succeeded).
function finalizeBucketLevel(solutions) {
  if (solutions.length === 0) return solutions;

  // Collect and merge from top level of all solutions
  // Also detect collisions: same key appearing in multiple solutions with different values (object buckets only)
  const merged = new Map(); // bucketName -> {kind: 'object'|'array', entries: {...}|[...]}
  let hasCollision = false;

  for (const state of solutions) {
    const sol = state.sol || state;
    if (sol.bucketStack.length === 0) continue;
    const top = sol.bucketStack[sol.bucketStack.length - 1];
    for (const [name, bucket] of top) {
      if (!merged.has(name)) {
        merged.set(name, {kind: bucket.kind, entries: bucket.kind === 'object' ? {} : []});
      }
      const mergedBucket = merged.get(name);

      if (bucket.kind === 'object') {
        // Object bucket: merge k:v pairs, detect collisions
        for (const [key, value] of Object.entries(bucket.entries)) {
          if (Object.prototype.hasOwnProperty.call(mergedBucket.entries, key)) {
            // Same key already exists - only a collision if values differ
            const existing = mergedBucket.entries[key];
            if (!sameValueZero(existing, value) && JSON.stringify(existing) !== JSON.stringify(value)) {
              // Collision: same key with different values
              hasCollision = true;
            }
            // If same value, just keep the existing (they're duplicates)
          } else {
            mergedBucket.entries[key] = value;
          }
        }
      } else {
        // Array bucket: concatenate values (no collision detection)
        mergedBucket.entries.push(...bucket.entries);
      }
    }
  }

  // If there was a collision during merge, fail all solutions
  if (hasCollision) {
    // Pop bucket levels but don't bind
    for (const state of solutions) {
      const sol = state.sol || state;
      if (sol.bucketStack.length > 0) {
        sol.bucketStack.pop();
      }
    }
    return [];
  }

  // Pop and bind to all solutions, filtering out those where binding fails
  const surviving = [];
  for (const state of solutions) {
    const sol = state.sol || state;
    if (sol.bucketStack.length > 0) {
      sol.bucketStack.pop();
    }
    // Bind each merged bucket as a group variable
    let bindOk = true;
    for (const [name, bucket] of merged) {
      const groupValue = bucket.kind === 'object'
        ? Group.object(bucket.entries)
        : Group.array(...bucket.entries);
      if (!bindGroup(sol.env, name, groupValue)) {
        bindOk = false;
        break;
      }
    }
    if (bindOk) {
      surviving.push(state);
    }
  }
  return surviving;
}

// Add a guard to the solution's pending guards list
function addGuard(sol, guard, varName) {
  if (!guard) return;
  const requiredVars = getExprVariables(guard);
  sol.guards.push({guard, varName, requiredVars});
}

// Check if all pending guards evaluate to true
// Returns true if all guards pass, false if any guard fails
function checkGuards(sol) {
  for (const {guard, varName, requiredVars} of sol.guards) {
    // Check if all required variables are bound
    let allBound = true;
    for (const v of requiredVars) {
      if (!isBound(sol.env, v)) {
        allBound = false;
        break;
      }
    }

    if (!allBound) {
      // Guard not yet closed - this is an error at the end of matching
      // For now, we'll check this at emit time
      continue;
    }

    // Evaluate the guard
    try {
      const result = evaluateExpr(guard, sol.env);
      if (!result) {
        return false; // Guard failed
      }
    } catch (e) {
      return false; // Guard errored - treat as failure
    }
  }
  return true;
}

// Check if all guards are closed (all required variables are bound)
function allGuardsClosed(sol) {
  for (const {requiredVars} of sol.guards) {
    for (const v of requiredVars) {
      if (!isBound(sol.env, v)) return false;
    }
  }
  return true;
}

function recordScalarSite(sol, varName, path, valueRef) {
  if (!sol.sites.has(varName)) {
    sol.sites.set(varName, []);
  }
  sol.sites.get(varName).push({kind: 'scalar', path: [...path], valueRef});
}

function recordGroupSite(sol, varName, path, groupStart, groupEnd, valueRefs) {
  if (!sol.sites.has(varName)) {
    sol.sites.set(varName, []);
  }
  sol.sites.get(varName).push({
    kind: 'group',
    path: [...path],
    groupStart,
    groupEnd,
    valueRefs: [...valueRefs],
  });
}

/**
 * Check if a pattern AST contains any binding nodes (SBind or GroupBind).
 * Used to optimize lookaheads: if no bindings, we can stop at first match.
 * Result is lazily cached on the node as _hasBindings.
 */
function patternHasBindings(ast) {
  if (!ast || typeof ast !== 'object') return false;

  // Return cached result if available
  if ('_hasBindings' in ast) return ast._hasBindings;

  let result = false;

  if (ast.type === 'SBind' || ast.type === 'GroupBind') {
    result = true;
  } else {
    // Recurse into known child properties
    if (ast.pat && patternHasBindings(ast.pat)) result = true;
    else if (ast.val && patternHasBindings(ast.val)) result = true;
    else if (ast.items) {
      for (const item of ast.items) {
        if (patternHasBindings(item)) { result = true; break; }
      }
    }
    if (!result && ast.alts) {
      for (const alt of ast.alts) {
        if (patternHasBindings(alt)) { result = true; break; }
      }
    }
    if (!result && ast.groups) {
      for (const group of ast.groups) {
        if (patternHasBindings(group)) { result = true; break; }
      }
    }
    if (!result && ast.terms) {
      for (const term of ast.terms) {
        if (patternHasBindings(term)) { result = true; break; }
        if (term.key && patternHasBindings(term.key)) { result = true; break; }
        if (term.val && patternHasBindings(term.val)) { result = true; break; }
      }
    }
  }

  ast._hasBindings = result;
  return result;
}

// Public entry: evaluate a parsed ITEM AST on input, return list of solutions.
// Each solution: {bindings: Object, sites: Map<varName, Site[]>}
export function match(ast, input, opts = {}) {
  const maxSteps = opts.maxSteps ?? 2000000;
  const debug = opts.debug;
  const ctx = {steps: 0, maxSteps, debug};
  const solutions = [];

  matchItem(ast, input, [], newSolution(), (sol) => solutions.push(sol), ctx);

  // Filter and convert to public API format
  // Only include solutions where all guards are closed and pass
  return solutions
    .filter(sol => allGuardsClosed(sol) && checkGuards(sol))
    .map(sol => {
      const bindings = Object.fromEntries(
        Array.from(sol.env.entries()).map(([k, v]) => [k, v.value])
      );
      return {bindings, sites: sol.sites};
    });
}

// Scan mode: find all occurrences at any depth
export function scan(ast, input, opts = {}) {
  const maxSteps = opts.maxSteps ?? 2000000;
  const debug = opts.debug;
  const ctx = {steps: 0, maxSteps, debug};
  const solutions = [];

  // Helper: recursively scan value at path
  function scanValue(value, path) {
    guard(ctx);

    // Try matching pattern at this position
    matchItem(ast, value, path, newSolution(), (sol) => solutions.push(sol), ctx);

    // Recursively descend into structure
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        scanValue(value[i], [...path, i]);
      }
    } else if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) {
        scanValue(value[key], [...path, key]);
      }
    }
  }

  scanValue(input, []);

  // Filter and convert to public API format
  // Only include solutions where all guards are closed and pass
  return solutions
    .filter(sol => allGuardsClosed(sol) && checkGuards(sol))
    .map(sol => {
      const bindings = Object.fromEntries(
        Array.from(sol.env.entries()).map(([k, v]) => [k, v.value])
      );
      return {bindings, sites: sol.sites};
    });
}

// ------------- Short-circuit helpers -------------
// These use StopSearch to terminate early after finding the first solution.

/**
 * Check if pattern matches input (anchored). Returns boolean.
 * Short-circuits on first match - does not enumerate all solutions.
 */
export function matchExists(ast, input, opts = {}) {
  const maxSteps = opts.maxSteps ?? 2000000;
  const debug = opts.debug;
  const ctx = {steps: 0, maxSteps, debug};
  try {
    matchItem(ast, input, [], newSolution(), (sol) => {
      // Only count as match if all guards are closed and pass
      if (allGuardsClosed(sol) && checkGuards(sol)) {
        throw new StopSearch(true);
      }
    }, ctx);
    return false;
  } catch (e) {
    if (e instanceof StopSearch) return true;
    throw e;
  }
}

/**
 * Get first match of pattern on input (anchored). Returns raw solution or null.
 * Short-circuits after finding first solution.
 */
export function matchFirst(ast, input, opts = {}) {
  const maxSteps = opts.maxSteps ?? 2000000;
  const debug = opts.debug;
  const ctx = {steps: 0, maxSteps, debug};
  try {
    matchItem(ast, input, [], newSolution(), (sol) => {
      // Only accept if all guards are closed and pass
      if (allGuardsClosed(sol) && checkGuards(sol)) {
        throw new StopSearch(sol);
      }
    }, ctx);
    return null;
  } catch (e) {
    if (e instanceof StopSearch) {
      // Convert to public API format
      const sol = e.payload;
      const bindings = Object.fromEntries(
        Array.from(sol.env.entries()).map(([k, v]) => [k, v.value])
      );
      return {bindings, sites: sol.sites};
    }
    throw e;
  }
}

/**
 * Check if pattern matches anywhere in input (scan). Returns boolean.
 * Short-circuits on first match - does not scan entire tree.
 */
export function scanExists(ast, input, opts = {}) {
  const maxSteps = opts.maxSteps ?? 2000000;
  const debug = opts.debug;
  const ctx = {steps: 0, maxSteps, debug};

  function scanValue(value, path) {
    guard(ctx);

    // Try matching pattern at this position - throws StopSearch on success
    matchItem(ast, value, path, newSolution(), (sol) => {
      // Only count as match if all guards are closed and pass
      if (allGuardsClosed(sol) && checkGuards(sol)) {
        throw new StopSearch(true);
      }
    }, ctx);

    // Recursively descend into structure
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        scanValue(value[i], [...path, i]);
      }
    } else if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) {
        scanValue(value[key], [...path, key]);
      }
    }
  }

  try {
    scanValue(input, []);
    return false;
  } catch (e) {
    if (e instanceof StopSearch) return true;
    throw e;
  }
}

/**
 * Get first match of pattern anywhere in input (scan). Returns raw solution or null.
 * Short-circuits after finding first match - does not scan entire tree.
 */
export function scanFirst(ast, input, opts = {}) {
  const maxSteps = opts.maxSteps ?? 2000000;
  const debug = opts.debug;
  const ctx = {steps: 0, maxSteps, debug};

  function scanValue(value, path) {
    guard(ctx);

    // Try matching pattern at this position - throws StopSearch on success
    matchItem(ast, value, path, newSolution(), (sol) => {
      // Only accept if all guards are closed and pass
      if (allGuardsClosed(sol) && checkGuards(sol)) {
        throw new StopSearch(sol);
      }
    }, ctx);

    // Recursively descend into structure
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        scanValue(value[i], [...path, i]);
      }
    } else if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) {
        scanValue(value[key], [...path, key]);
      }
    }
  }

  try {
    scanValue(input, []);
    return null;
  } catch (e) {
    if (e instanceof StopSearch) {
      // Convert to public API format
      const sol = e.payload;
      const bindings = Object.fromEntries(
        Array.from(sol.env.entries()).map(([k, v]) => [k, v.value])
      );
      return {bindings, sites: sol.sites};
    }
    throw e;
  }
}

// Backward compatibility: matchProgram for old tests
export function matchProgram(ast, input, opts = {}) {
  // Old AST had {type: 'Program', rules: [...]}
  // Convert to new format or handle directly
  if (ast.type === 'Program') {
    throw new Error('Old Program AST not supported - use new v5-A parser');
  }
  return match(ast, input, opts);
}

// ------------- Core ITEM matching -------------

function matchItem(item, node, path, sol, emit, ctx) {
  guard(ctx);

  // Debug hook: entering item match
  if (ctx.debug?.onEnter) {
    ctx.debug.onEnter(item.type, node, path);
  }

  let matched = false;
  const originalEmit = emit;
  const trackingEmit = (s) => {
    matched = true;
    originalEmit(s);
  };

  try {
    // Temporarily replace emit to track if we matched
    emit = trackingEmit;

    doMatch();
  } finally {
    // Debug hook: exiting item match
    if (ctx.debug?.onExit) {
      ctx.debug.onExit(item.type, node, path, matched);
    }
  }

  function doMatch() {
    switch (item.type) {
      case 'Any':
        emit(cloneSolution(sol));
        return;

      case 'TypedAny':
        // Typed wildcards: _string, _number, _boolean
        if (typeof node === item.kind) emit(cloneSolution(sol));
        return;

      case 'Lit':
        // Use SameValueZero: NaN equals NaN, 0 equals -0
        if (sameValueZero(node, item.value)) emit(cloneSolution(sol));
        return;

      case 'StringPattern':
        // String patterns (regex or case-insensitive) use their matchFn
        if (item.matchFn(node)) emit(cloneSolution(sol));
        return;

      case 'Bool':
        // Use SameValueZero for consistency (though booleans don't have edge cases)
        if (sameValueZero(node, item.value)) emit(cloneSolution(sol));
        return;

      case 'Null':
        if (node === null) emit(cloneSolution(sol));
        return;

      case 'Fail':
        // Fail pattern: always fails, never emits solutions
        // Used for 'else !' strong semantics
        return;

      case 'Flow': {
        // Flow operator: P -> %bucket (k:v pairs) or P -> @bucket (values only)
        // Match the inner pattern; if successful, record entry in bucket
        // - sliceKind='object' (%bucket): collect {flowKey: matchedValue}
        // - sliceKind='array' (@bucket): collect [matchedValue, ...]
        // ctx.flowKey is set by the enclosing K:V iteration
        // If labelRef is specified, use the key from that labeled scope instead

        // Note: Flow inside arrays under K:V uses the outer flowKey for all elements.
        // For object buckets: multiple elements flowing DIFFERENT values cause collision.
        // For array buckets: all values are collected (no collision).

        const sliceKind = item.sliceKind || 'object'; // default to object for backward compat
        const sigil = sliceKind === 'object' ? '%' : '@';

        matchItem(item.pat, node, path, sol, (s2) => {
          // Determine which key and bucket level to use
          let flowKey;
          let bucketLevel = null; // null means current (top) level

          if (item.labelRef) {
            // Use key and bucket level from labeled scope
            if (!s2.labels.has(item.labelRef)) {
              throw new Error(
                `Flow operator ->${sigil}${item.bucket}<^${item.labelRef}> references unknown label '${item.labelRef}'`
              );
            }
            const labelInfo = s2.labels.get(item.labelRef);
            if (labelInfo.key === undefined) {
              throw new Error(
                `Flow operator ->${sigil}${item.bucket}<^${item.labelRef}> references label '${item.labelRef}' ` +
                `which was not in a K:V iteration context`
              );
            }
            flowKey = labelInfo.key;
            bucketLevel = labelInfo.bucketLevel;
          } else {
            flowKey = ctx.flowKey;
          }

          if (flowKey !== undefined) {
            // addToBucket returns false on collision (object buckets only) - fail this branch
            if (!addToBucket(s2, item.bucket, flowKey, node, bucketLevel, sliceKind)) {
              return; // Collision - don't emit this solution
            }
          }
          emit(s2);
        }, ctx);
        return;
      }

      case 'Collecting': {
        // <collecting $key:$val in %bucket across ^label> or <collecting $val in @bucket across ^label>
        // Match the inner pattern; if successful, collect the specified variables into the bucket
        // The collectExpr specifies WHICH bound variables to collect:
        // - {key: varName, value: varName} for k:v pairs (%bucket)
        // - {value: varName} for values only (@bucket)
        // The labelRef specifies the bucket level (required, no default scope)

        const sliceKind = item.sliceKind;
        const sigil = sliceKind === 'object' ? '%' : '@';

        matchItem(item.pat, node, path, sol, (s2) => {
          // The <collecting> directive collects values ONLY when all referenced variables are bound
          // and the label is available. This allows the test phase (which doesn't have key bindings)
          // to succeed without collecting anything.

          // Check if label is available
          if (!s2.labels.has(item.labelRef)) {
            // Label not set - we're likely in a test phase or not inside a labeled scope
            // Just emit the solution without collecting
            emit(s2);
            return;
          }

          const labelInfo = s2.labels.get(item.labelRef);
          const bucketLevel = labelInfo.bucketLevel;

          // Get values from collectExpr by looking up bound variables
          const collectExpr = item.collectExpr;
          let collectKey, collectValue;

          // Check if all referenced variables are bound
          if (collectExpr.key !== undefined && !s2.env.has(collectExpr.key)) {
            // Key variable not bound - skip collection (likely test phase)
            emit(s2);
            return;
          }
          if (!s2.env.has(collectExpr.value)) {
            // Value variable not bound - skip collection (likely test phase)
            emit(s2);
            return;
          }

          if (collectExpr.key !== undefined) {
            const keyBinding = s2.env.get(collectExpr.key);
            collectKey = keyBinding.kind === 'scalar' ? keyBinding.value : keyBinding;
          }
          const valueBinding = s2.env.get(collectExpr.value);
          collectValue = valueBinding.kind === 'scalar' ? valueBinding.value : valueBinding;

          if (sliceKind === 'object') {
            // Object bucket: collect {key: value}
            if (!addToBucket(s2, item.bucket, collectKey, collectValue, bucketLevel, 'object')) {
              return; // Collision - don't emit this solution
            }
          } else {
            // Array bucket: collect values only
            if (!addToBucket(s2, item.bucket, null, collectValue, bucketLevel, 'array')) {
              return; // Shouldn't happen for array buckets, but be safe
            }
          }
          emit(s2);
        }, ctx);
        return;
      }

      case 'Alt': {
        if (item.prioritized) {
          // Prioritized alternation (else semantics): try each alternative in order,
          // use only the first one that produces any solutions.
          // Single-pass: track if any solutions emitted, stop on first producing alt.
          for (const sub of item.alts) {
            let any = false;
            matchItem(sub, node, path, sol, (s) => { any = true; emit(s); }, ctx);
            if (any) return;
            guard(ctx);
          }
          // No alternatives matched
        } else {
          // Regular alternation: enumerate all alternatives
          for (const sub of item.alts) {
            matchItem(sub, node, path, sol, emit, ctx);
            guard(ctx);
          }
        }
        return;
      }

      case 'Look': {
        // Zero-width assertion.
        // Positive lookahead: bindings persist; enumerate all solutions if pattern has bindings.
        // Negative lookahead: bindings never persist.
        const hasBindings = patternHasBindings(item.pat);

        if (item.neg) {
          // Negative lookahead: succeed if pattern does NOT match, never commit bindings
          let matched = false;
          matchItem(item.pat, node, path, cloneSolution(sol), () => {
            matched = true;
          }, ctx);
          if (!matched) {
            emit(cloneSolution(sol));
          }
        } else if (hasBindings) {
          // Positive lookahead with bindings: emit all successful solutions
          matchItem(item.pat, node, path, cloneSolution(sol), (s2) => {
            emit(s2);
          }, ctx);
        } else {
          // Positive lookahead without bindings: stop at first match (optimization)
          let matchedSol = null;
          matchItem(item.pat, node, path, cloneSolution(sol), (s2) => {
            if (!matchedSol) matchedSol = s2;
          }, ctx);
          if (matchedSol) {
            emit(matchedSol);
          }
        }
        return;
      }

      case 'SBind': {
        // Scalar binding: $x or $x:(pattern)
        // Scalar bindings cannot match sequences - if pattern is Seq, no match
        if (item.pat.type === 'Seq') {
          // TODO: emit warning that $x:(seq) is invalid, should use @x:(seq)
          return; // No match
        }

        // Match inner pattern, then bind variable to node if successful
        matchItem(item.pat, node, path, sol, (s2) => {
          const s3 = cloneSolution(s2);
          if (bindScalar(s3.env, item.name, node)) {
            recordScalarSite(s3, item.name, path, node);
            if (ctx.debug?.onBind) {
              ctx.debug.onBind('scalar', item.name, node);
            }
            // Add guard expression if present
            addGuard(s3, item.guard, item.name);
            // Check guards - prune if any closed guard fails
            if (!checkGuards(s3)) return;
            emit(s3);
          }
        }, ctx);
        return;
      }

      case 'GroupBind': {
        // Group binding can only appear in array/object contexts
        // If appearing at top level, treat as error
        throw new Error('Group binding @x cannot appear at top level');
      }

      case 'Guarded': {
        // Guarded pattern: (PATTERN where EXPR)
        // Match inner pattern, then evaluate guard with _ = matched value
        matchItem(item.pat, node, path, sol, (s2) => {
          // Create temp env for guard evaluation: solution bindings + _ = node
          const guardEnv = new Map(s2.env);
          guardEnv.set('_', {kind: 'scalar', value: node});
          try {
            if (evaluateExpr(item.guard, guardEnv)) {
              emit(s2);  // emit WITHOUT _ in the env
            }
          } catch (e) {
            // Guard evaluation error - treat as non-match
          }
        }, ctx);
        return;
      }

      case 'Arr': {
        if (!Array.isArray(node)) return;

        if (item.label) {
          // Labeled array: push bucket level for <collecting> directive support
          const s2 = cloneSolution(sol);
          pushBucketLevel(s2);

          // Record label with bucket level info
          if (ctx.flowKey !== undefined) {
            s2.labels.set(item.label, {key: ctx.flowKey, bucketLevel: s2.bucketStack.length - 1});
          } else {
            // No flowKey - record undefined so we can detect it later
            s2.labels.set(item.label, {key: undefined, bucketLevel: s2.bucketStack.length - 1});
          }

          // Collect all solutions from matchArray, then finalize and emit
          const collected = [];
          matchArray(item.items, node, path, s2, (s3) => {
            collected.push(s3);
          }, ctx);

          // Finalize bucket level for all collected solutions
          if (collected.length > 0) {
            const finalized = finalizeBucketLevel(collected);
            for (const s of finalized) emit(s);
          }
        } else {
          // Unlabeled array: no bucket handling needed
          matchArray(item.items, node, path, sol, emit, ctx);
        }
        return;
      }

      case 'Obj': {
        if (!isObject(node)) return;
        // Pass the label to matchObject - it will record the label with the iteration key
        // when iterating over K:V pairs inside this object
        matchObject(item.terms, item.spread, node, path, sol, emit, ctx, null, item.label);
        return;
      }

      case 'Paren': {
        matchItem(item.item, node, path, sol, emit, ctx);
        return;
      }

      default:
        throw new Error(`Unknown item type: ${item.type}`);
    }
  }
}

// ------------- Array matching -------------

// Match a single pattern item against array starting at startIdx
// Calls onMatch(solution, endIndex) for each way it can match
// This enables proper backtracking for GroupBind and other variable-length patterns
function matchArrayItemWithRange(item, arr, startIdx, path, sol, onMatch, ctx) {
  guard(ctx);

  switch (item.type) {
    case 'Spread': {
      // Spread matches min..max elements (lazy: shortest first for natural ordering)
      const {min, max} = parseQuantRange(item.quant);
      const maxK = Math.min(max, arr.length - startIdx);
      for (let k = min; k <= maxK; k++) {
        onMatch(cloneSolution(sol), startIdx + k);
        if (ctx.steps > ctx.maxSteps) break;
      }
      return;
    }

    case 'Seq': {
      // Sequence: match items in order
      matchArraySeqWithRange(item.items, arr, startIdx, path, sol, onMatch, ctx);
      return;
    }

    case 'Alt': {
      // Alternation: try each branch
      let anyEmitted = false;
      for (const branch of item.alts) {
        if (item.prioritized && anyEmitted) break;
        if (ctx.steps > ctx.maxSteps) break;
        guard(ctx);

        // Unwrap Paren if present
        let inner = branch;
        while (inner.type === 'Paren') inner = inner.item;

        matchArrayItemWithRange(inner, arr, startIdx, path, sol, (s, endIdx) => {
          anyEmitted = true;
          onMatch(s, endIdx);
        }, ctx);
      }
      return;
    }

    case 'Quant': {
      // Quantified: match sub-pattern m..n times
      const m = item.min !== null ? item.min : 0;
      const n = item.max !== null ? item.max : Infinity;
      quantWithRange(item.sub, arr, startIdx, m, n, item.op || '?', path, sol, onMatch, ctx);
      return;
    }

    case 'GroupBind': {
      // Group binding: match inner pattern, capture range
      matchArrayItemWithRange(item.pat, arr, startIdx, path, sol, (s2, endIdx) => {
        const slice = arr.slice(startIdx, endIdx);
        const s3 = cloneSolution(s2);
        const groupValue = Group.array(...slice);
        if (bindGroup(s3.env, item.name, groupValue)) {
          recordGroupSite(s3, item.name, path, startIdx, endIdx, slice);
          if (ctx.debug?.onBind) {
            ctx.debug.onBind('group', item.name, groupValue);
          }
          onMatch(s3, endIdx);
        }
      }, ctx);
      return;
    }

    case 'SBind': {
      // Scalar binding: special handling if inner pattern is Seq
      if (item.pat.type === 'Seq') {
        // $x=(seq) matches iff seq matches exactly 1 element
        matchArraySeqWithRange(item.pat.items, arr, startIdx, path, sol, (s2, endIdx) => {
          if (endIdx - startIdx === 1) {
            const s3 = cloneSolution(s2);
            const element = arr[startIdx];
            if (bindScalar(s3.env, item.name, element)) {
              recordScalarSite(s3, item.name, [...path, startIdx], element);
              if (ctx.debug?.onBind) {
                ctx.debug.onBind('scalar', item.name, element);
              }
              addGuard(s3, item.guard, item.name);
              if (checkGuards(s3)) {
                onMatch(s3, endIdx);
              }
            }
          }
        }, ctx);
        return;
      }
      // Fall through to default single-element handling
      if (startIdx < arr.length) {
        matchItem(item, arr[startIdx], [...path, startIdx], sol, (s2) => {
          onMatch(s2, startIdx + 1);
        }, ctx);
      }
      return;
    }

    case 'Look': {
      // Lookahead: zero-width assertion (doesn't consume elements)
      const remainingGroup = arr.slice(startIdx);
      const patternItems = [item.pat, {type: 'Spread', quant: null}];

      if (item.neg) {
        let matched = false;
        matchArray(patternItems, remainingGroup, [...path, startIdx], cloneSolution(sol), () => {
          matched = true;
        }, ctx);
        if (!matched) {
          onMatch(sol, startIdx);
        }
      } else {
        const hasBindings = patternHasBindings(item.pat);
        if (hasBindings) {
          matchArray(patternItems, remainingGroup, [...path, startIdx], sol, (s2) => {
            onMatch(s2, startIdx);
          }, ctx);
        } else {
          let matchedSol = null;
          matchArray(patternItems, remainingGroup, [...path, startIdx], sol, (s2) => {
            if (!matchedSol) matchedSol = s2;
          }, ctx);
          if (matchedSol) {
            onMatch(matchedSol, startIdx);
          }
        }
      }
      return;
    }

    // Single-element patterns: delegate to matchItem
    default: {
      if (startIdx < arr.length) {
        matchItem(item, arr[startIdx], [...path, startIdx], sol, (s2) => {
          onMatch(s2, startIdx + 1);
        }, ctx);
      }
      return;
    }
  }
}

// Match a sequence of items against array starting at startIdx
// Calls onMatch(solution, endIndex) for each way the sequence can match
function matchArraySeqWithRange(items, arr, startIdx, path, sol, onMatch, ctx) {
  function step(ixItem, ixArr, sIn) {
    guard(ctx);
    if (ixItem === items.length) {
      onMatch(sIn, ixArr);
      return;
    }
    matchArrayItemWithRange(items[ixItem], arr, ixArr, path, sIn, (s2, endIdx) => {
      step(ixItem + 1, endIdx, s2);
    }, ctx);
  }
  step(0, startIdx, sol);
}

// Quantifier matching with range tracking
// Matches sub-pattern m..n times, calls onMatch(sol, endIdx) for each match
function quantWithRange(sub, arr, startIdx, m, n, op, path, sol, onMatch, ctx) {
  const maxRep = Math.min(n, arr.length - startIdx);
  const isPossessive = op === '++' || op === '*+' || op === '?+';

  // DP-like expansion to avoid deep recursion
  let frontier = [{idx: startIdx, sol: cloneSolution(sol), reps: 0}];

  // First reach minimum reps
  for (let r = 0; r < m; r++) {
    const next = [];
    for (const st of frontier) {
      if (st.idx >= arr.length) continue;
      matchItem(sub, arr[st.idx], [...path, st.idx], st.sol, (s2) => {
        next.push({idx: st.idx + 1, sol: s2, reps: st.reps + 1});
      }, ctx);
    }
    frontier = next;
    if (!frontier.length) return; // cannot satisfy minimum
  }

  if (isPossessive) {
    // Greedy, no backtracking: consume as many as possible
    for (let r = m; r < maxRep; r++) {
      const grown = [];
      for (const st of frontier) {
        if (st.idx >= arr.length) continue;
        matchItem(sub, arr[st.idx], [...path, st.idx], st.sol, (s2) => {
          grown.push({idx: st.idx + 1, sol: s2, reps: st.reps + 1});
        }, ctx);
      }
      if (!grown.length) break;
      frontier = grown;
    }
    for (const st of frontier) {
      onMatch(st.sol, st.idx);
    }
  } else {
    // Non-possessive: collect all lengths, emit longest first (greedy)
    const allFrontiers = [frontier];
    for (let r = m; r < maxRep; r++) {
      const grown = [];
      for (const st of frontier) {
        if (st.idx >= arr.length) continue;
        matchItem(sub, arr[st.idx], [...path, st.idx], st.sol, (s2) => {
          grown.push({idx: st.idx + 1, sol: s2, reps: st.reps + 1});
        }, ctx);
      }
      if (!grown.length) break;
      frontier = grown;
      allFrontiers.push(frontier);
    }
    // Emit longest first (greedy)
    for (let i = allFrontiers.length - 1; i >= 0; i--) {
      for (const st of allFrontiers[i]) {
        onMatch(st.sol, st.idx);
      }
    }
  }
}

// Entry point for array matching
// Matches items against the entire array (with trailing spread optimization)
function matchArray(items, arr, path, sol, emit, ctx) {
  // Optimization: trailing bare spread means "consume rest" - handle in O(1)
  const last = items[items.length - 1];
  const hadTrailingSpread = last && last.type === 'Spread' && last.quant == null;
  if (hadTrailingSpread) {
    items = items.slice(0, -1);
  }

  // Match using range-tracking, then filter for full consumption
  matchArraySeqWithRange(items, arr, 0, path, sol, (s, endIdx) => {
    // Accept if: trailing spread (any end position) or exact match (consumed all)
    if (hadTrailingSpread || endIdx === arr.length) {
      emit(cloneSolution(s));
    }
  }, ctx);
}

// ------------- Object matching -------------

function matchObject(terms, spread, obj, path, sol, emit, ctx, outMatchedKeys = null, objLabel = null) {
  guard(ctx);

  const DEBUG = false; // Set to true for debugging

  // Process each OTerm sequentially, threading solutions through
  // Each solution tracks:
  // - testedKeys: keys that were successfully matched (for backward compat)
  // - coveredKeys: keys that match any K pattern (for remainder calculation)
  let solutions = [{sol: cloneSolution(sol), testedKeys: new Set(), coveredKeys: new Set()}];

  // Push bucket level only for labeled objects (to support <collecting> directive)
  // Each `each` clause will push its own level for -> operator
  if (objLabel) {
    pushBucketLevel(solutions[0].sol);
  }

  if (DEBUG) console.log(`[matchObject] obj keys:`, Object.keys(obj), `terms:`, terms.length);

  for (const term of terms) {
    // Handle group bindings: @var=(pattern) or @var=(remainder)
    if (term.type === 'GroupBind') {
      const isSpread = term.pat.type === 'Spread';
      const next = [];

      for (const state of solutions) {
        const {sol: s0, testedKeys, coveredKeys = new Set()} = state;
        if (isSpread) {
          // @var=(remainder) - capture residual keys
          // Remainder is keys NOT covered by any key pattern K
          const residualKeys = Object.keys(obj).filter(k => !coveredKeys.has(k));
          const residualObj = {};
          for (const k of residualKeys) {
            residualObj[k] = obj[k];
          }

          const s2 = cloneSolution(s0);
          const groupValue = Group.object(residualObj);
          if (bindGroup(s2.env, term.name, groupValue)) {
            if (!s2.sites.has(term.name)) {
              s2.sites.set(term.name, []);
            }
            s2.sites.get(term.name).push({
              kind: 'group',
              path: [...path],
              keys: residualKeys,
              valueRefs: residualObj
            });
            if (ctx.debug?.onBind) {
              ctx.debug.onBind('group', term.name, groupValue);
            }
            // Preserve both testedKeys and coveredKeys for this branch
            next.push({sol: s2, testedKeys: new Set(testedKeys), coveredKeys: new Set(coveredKeys)});
          }
        } else {
          // @var=(pattern) - recursively match pattern, collect matched keys
          if (term.pat.type !== 'OGroup') {
            throw new Error(`GroupBind in object context expects OGroup or Spread pattern, got ${term.pat.type}`);
          }

          const matchedKeys = new Set();
          matchObject(
            term.pat.groups,
            null,
            obj,
            path,
            s0,
            (s2) => {
              // Bind the matched keys as a group
              const capturedObj = {};
              for (const k of matchedKeys) {
                capturedObj[k] = obj[k];
              }

              const s3 = cloneSolution(s2);
              const groupValue = Group.object(capturedObj);
              if (bindGroup(s3.env, term.name, groupValue)) {
                if (!s3.sites.has(term.name)) {
                  s3.sites.set(term.name, []);
                }
                s3.sites.get(term.name).push({
                  kind: 'group',
                  path: [...path],
                  keys: Array.from(matchedKeys),
                  valueRefs: capturedObj
                });
                if (ctx.debug?.onBind) {
                  ctx.debug.onBind('group', term.name, groupValue);
                }
                // Mark matched keys as tested and covered in this branch
                const newTestedKeys = new Set(testedKeys);
                const newCoveredKeys = new Set(coveredKeys);
                for (const k of matchedKeys) {
                  newTestedKeys.add(k);
                  newCoveredKeys.add(k);
                }
                next.push({sol: s3, testedKeys: newTestedKeys, coveredKeys: newCoveredKeys});
              }
            },
            ctx,
            matchedKeys  // Collect matched keys
          );
        }
      }
      solutions = next;
      continue;
    }

    // Handle OGroup (parenthesized O_BODY)
    if (term.type === 'OGroup') {
      // Process grouped terms - just flatten them into the main sequence
      const next = [];
      for (const state of solutions) {
        const {coveredKeys = new Set()} = state;
        const groupMatchedKeys = new Set();
        matchObject(term.groups, null, obj, path, state.sol, (s2) => {
          // Update covered keys from the group
          const newCoveredKeys = new Set(coveredKeys);
          for (const k of groupMatchedKeys) {
            newCoveredKeys.add(k);
          }
          next.push({sol: s2, testedKeys: new Set(state.testedKeys), coveredKeys: newCoveredKeys});
        }, ctx, groupMatchedKeys);
      }
      solutions = next;
      continue;
    }

    // Handle object lookaheads
    if (term.type === 'OLook') {
      const next = [];
      for (const state of solutions) {
        const {sol: s0, testedKeys, coveredKeys = new Set()} = state;

        // Special case: (?!..) means "no residual keys" (closed object assertion)
        // This is an optimization of the desugaring (?!((?!OT1)(?!OT2)...(?!OTn)_=_))
        if (term.neg && term.pat.type === 'Spread') {
          const residualKeys = Object.keys(obj).filter(k => !coveredKeys.has(k));
          const noResiduals = residualKeys.length === 0;
          if (noResiduals) {
            // No residual keys - negative lookahead succeeds
            next.push({sol: cloneSolution(s0), testedKeys: new Set(testedKeys), coveredKeys: new Set(coveredKeys)});
          }
          // If there are residuals, negative lookahead fails (don't push to next)
        } else if (term.neg) {
          // Negative lookahead: succeed if pattern does NOT match, never commit bindings
          let matched = false;
          const lookaheadTestedKeys = new Set(testedKeys);
          matchObjectGroup(term.pat, obj, path, cloneSolution(s0), () => {
            matched = true;
          }, ctx, lookaheadTestedKeys);
          if (!matched) {
            next.push({sol: cloneSolution(s0), testedKeys: new Set(testedKeys), coveredKeys: new Set(coveredKeys)});
          }
        } else {
          // Positive lookahead: bindings escape
          // If pattern has bindings, enumerate all solutions; otherwise stop at first (optimization)
          const hasBindings = patternHasBindings(term.pat);
          const lookaheadTestedKeys = new Set(testedKeys);

          if (hasBindings) {
            // Enumerate all solutions
            matchObjectGroup(term.pat, obj, path, cloneSolution(s0), (s2) => {
              next.push({sol: s2, testedKeys: new Set(testedKeys), coveredKeys: new Set(coveredKeys)});
            }, ctx, lookaheadTestedKeys);
          } else {
            // Optimization: stop at first match when no bindings
            let matchedSol = null;
            matchObjectGroup(term.pat, obj, path, cloneSolution(s0), (s2) => {
              if (!matchedSol) matchedSol = s2;
            }, ctx, lookaheadTestedKeys);
            if (matchedSol) {
              next.push({sol: matchedSol, testedKeys: new Set(testedKeys), coveredKeys: new Set(coveredKeys)});
            }
          }
        }
      }
      solutions = next;
      continue;
    }

    if (term.type !== 'OTerm') {
      throw new Error(`Expected OTerm, GroupBind, OLook, or OGroup, got ${term.type}`);
    }

    // Bucket level is pushed once at object start, shared by all terms

    // Slice-based semantics:
    // - K:V         = slice exists (#{1,}), bad entries allowed
    // - K:V else !  = slice exists (#{1,}), no bad entries (strong semantics)
    // - K:V?        = slice may be empty (#{0,}), bad entries allowed
    // - K:V else !? = slice may be empty (#{0,}), no bad entries
    //
    // Where:
    // - slice = keys where k~K AND v~V
    // - bad = keys where k~K AND NOT(v~V)
    // - covered = all keys where k~K (for remainder calculation)

    const isStrong = term.strong === true;
    const isOptional = term.optional === true;

    // For strong terms (each clauses), push a bucket level for this clause's scope
    // The -> operator will collect into this level
    if (isStrong) {
      for (const state of solutions) {
        pushBucketLevel(state.sol);
      }
    }

    // For each solution, process the term
    let next = [];
    for (const state of solutions) {
      const {sol: s0, testedKeys, coveredKeys = new Set()} = state;

      // Special handling for RootKey (leading .. in path like {..password:$x})
      if (term.key.type === 'RootKey') {
        // Start breadcrumb navigation from the object itself, not from a matched key
        const s1 = cloneSolution(s0);
        navigateBreadcrumbs(
          term.breadcrumbs,
          obj,
          path,
          s1,
          (finalNode, finalPath, s2) => {
            matchItem(term.val, finalNode, finalPath, s2, (s3) => {
              next.push({sol: s3, testedKeys: new Set(testedKeys), coveredKeys: new Set(coveredKeys)});
            }, ctx);
          },
          ctx
        );
        continue;
      }

      // Find all keys matching the key pattern K
      const matchingKeys = objectKeysMatching(obj, term.key, s0.env);
      if (DEBUG) console.log(`[matchObject] term.key:`, term.key, `matched keys:`, matchingKeys);

      // All matching keys are "covered" for remainder purposes
      const newCoveredKeys = new Set(coveredKeys);
      for (const k of matchingKeys) {
        newCoveredKeys.add(k);
      }

      // Partition keys into slice (v~V) and bad (NOT v~V)
      // Must navigate breadcrumbs before testing value!
      const sliceKeys = [];
      const badKeys = [];

      for (const k of matchingKeys) {
        // Test if value matches V (after navigating breadcrumbs)
        let valueMatches = false;

        // Create a test solution with the label set (if this object has a label)
        // This is needed because the value test may involve Flows that reference the label
        const testSol = cloneSolution(s0);
        if (objLabel) {
          testSol.labels.set(objLabel, {key: k, bucketLevel: testSol.bucketStack.length - 1});
        }

        if (term.breadcrumbs && term.breadcrumbs.length > 0) {
          // Navigate breadcrumbs first, then test value at final node
          navigateBreadcrumbs(
            term.breadcrumbs,
            obj[k],
            [...path, k],
            testSol,
            (finalNode, finalPath, s2) => {
              matchItem(term.val, finalNode, finalPath, s2, () => {
                valueMatches = true;
              }, ctx);
            },
            ctx
          );
        } else {
          // No breadcrumbs - test value directly
          matchItem(term.val, obj[k], [...path, k], testSol, () => {
            valueMatches = true;
          }, ctx);
        }

        if (valueMatches) {
          sliceKeys.push(k);
        } else {
          badKeys.push(k);
        }
      }

      if (DEBUG) console.log(`[matchObject] slice:`, sliceKeys, `bad:`, badKeys);

      // Apply constraints based on operator, quantifier, and optional flag
      //
      // Semantics:
      //   K:V         => at least one (k,v) where k~K and v~V
      //   each K:V    => at least one k~K, AND all k~K must have v~V
      //   K?:V        => no k~K, OR at least one (k,v) where k~K and v~V
      //   each K?:V   => all k~K must have v~V (vacuously true if no k~K)
      //
      // Explicit quantifier like #{2,4} overrides the default slice bounds.

      // 1. Slice count check
      const sliceCount = sliceKeys.length;
      const quant = term.quant;
      // Default: #{1,} unless optional
      // Optional semantics: if any key matches K, at least one must also match V
      const minSlice = quant ? quant.min :
                       (isOptional ? (matchingKeys.length > 0 ? 1 : 0) : 1);
      const maxSlice = quant ? quant.max : null; // null means unbounded

      if (sliceCount < minSlice) {
        if (DEBUG) console.log(`[matchObject] failed: slice count ${sliceCount} < min ${minSlice}`);
        continue;
      }
      if (maxSlice !== null && sliceCount > maxSlice) {
        if (DEBUG) console.log(`[matchObject] failed: slice count ${sliceCount} > max ${maxSlice}`);
        continue;
      }

      // 2. Strong semantics check (else !) - bad #{0}
      if (isStrong && badKeys.length > 0) {
        if (DEBUG) console.log(`[matchObject] failed: bad entries exist with strong semantics (else !)`);
        continue; // Skip this solution - bad entries forbidden
      }

      // Constraints passed! Now enumerate solutions from slice
      if (sliceKeys.length > 0) {
        // Existential branching: each slice key creates an independent solution
        for (const k of sliceKeys) {
          const s1 = cloneSolution(s0);
          const newTestedKeys = new Set(testedKeys);
          newTestedKeys.add(k);

          // If this object has a label, record the current iteration key and bucket level
          // This allows inner Flows with <^label> to use this key and add to this bucket level
          if (objLabel) {
            s1.labels.set(objLabel, {key: k, bucketLevel: s1.bucketStack.length - 1});
          }

          // Bind key variables
          if (!bindKeyVariables(term.key, k, s1, path)) {
            continue; // Binding failed
          }

          // Navigate breadcrumbs and match value to get bindings
          // Set flowKey for Flow operator (bucket collection)
          const savedFlowKey = ctx.flowKey;
          ctx.flowKey = k;
          navigateBreadcrumbs(
            term.breadcrumbs,
            obj[k],
            [...path, k],
            s1,
            (finalNode, finalPath, s2) => {
              matchItem(term.val, finalNode, finalPath, s2, (s3) => {
                next.push({sol: s3, testedKeys: newTestedKeys, coveredKeys: newCoveredKeys});
              }, ctx);
            },
            ctx
          );
          ctx.flowKey = savedFlowKey;
        }
      } else {
        // No slice entries, but constraints passed (must be optional)
        // Continue with unchanged solution but updated coverage
        next.push({sol: cloneSolution(s0), testedKeys: new Set(testedKeys), coveredKeys: newCoveredKeys});
      }
    }

    solutions = next;

    // For strong terms (each clauses), finalize this clause's bucket level
    // This merges collected entries, pops the level, and binds bucket variables
    if (isStrong && solutions.length > 0) {
      solutions = finalizeBucketLevel(solutions);
    }

    if (!solutions.length) break;
  }

  // Handle spread: bare '%'/'remainder' or '@var=(%)' or '(?!%)' or '$'
  // Remainder is based on coveredKeys (keys matching any key pattern K), not testedKeys
  if (spread && solutions.length > 0) {
    if (spread.type === 'OLook') {
      // (?!%) - assert no residual keys
      const next = [];
      for (const state of solutions) {
        const {sol: s0, testedKeys, coveredKeys = new Set()} = state;

        // Special case: (?!%) means "no residual keys" (closed object assertion)
        if (spread.neg && spread.pat.type === 'Spread') {
          const residualKeys = Object.keys(obj).filter(k => !coveredKeys.has(k));
          const noResiduals = residualKeys.length === 0;
          if (noResiduals) {
            // No residual keys - negative lookahead succeeds
            next.push({sol: cloneSolution(s0), testedKeys: new Set(testedKeys), coveredKeys: new Set(coveredKeys)});
          }
          // If there are residuals, negative lookahead fails (don't push to next)
        } else {
          // General lookahead on remainder (not yet fully implemented)
          throw new Error('General lookahead on remainder not yet implemented');
        }
      }
      solutions = next;
    } else if (spread.type === 'GroupBind') {
      // @var=(%) - bind residual keys to group variable
      const next = [];
      for (const state of solutions) {
        const {sol: s0, testedKeys, coveredKeys = new Set()} = state;
        const residualKeys = Object.keys(obj).filter(k => !coveredKeys.has(k));

        // Check quantifier constraints from the spread pattern
        let {min, max} = parseQuantRange(spread.pat?.quant);
        if (!spread.pat?.quant) {
          // @var=(%) requires at least one key by default
          min = 1;
          max = Infinity;
        } else if (spread.pat.quant === '?') {
          // @var=(%?) allows empty remainder and unlimited keys
          min = 0;
          max = Infinity;
        }
        if (residualKeys.length < min || residualKeys.length > max) {
          continue;
        }

        const residualObj = {};
        for (const k of residualKeys) {
          residualObj[k] = obj[k];
        }

        const s2 = cloneSolution(s0);
        const groupValue = Group.object(residualObj);
        if (bindGroup(s2.env, spread.name, groupValue)) {
          if (!s2.sites.has(spread.name)) {
            s2.sites.set(spread.name, []);
          }
          s2.sites.get(spread.name).push({
            kind: 'group',
            path: [...path],
            keys: residualKeys,
            valueRefs: residualObj
          });
          if (ctx.debug?.onBind) {
            ctx.debug.onBind('group', spread.name, groupValue);
          }
          next.push({sol: s2, testedKeys, coveredKeys});
        }
      }
      solutions = next;
    } else {
      // Bare '%' or '$' - just check count per branch
      const next = [];
      for (const state of solutions) {
        const {sol: s0, testedKeys, coveredKeys = new Set()} = state;
        let {min, max} = parseQuantRange(spread.quant);
        // Handle $ which comes through as {min:0, max:0}
        // Handle bare % which requires nonempty (min:1)
        if (!spread.quant) min = 1;  // Bare '%' requires nonempty
        const uncoveredCount = Object.keys(obj).filter(k => !coveredKeys.has(k)).length;
        if (uncoveredCount >= min && (max === null || uncoveredCount <= max)) {
          next.push(state);
        }
      }
      solutions = next;
    }
  }

  // Finalize bucket level for labeled objects (to support <collecting> directive)
  // Each `each` clause finalizes its own level separately
  if (objLabel && solutions.length > 0) {
    solutions = finalizeBucketLevel(solutions);
  }

  // Report matched keys to caller if requested (collect from all branches)
  if (outMatchedKeys) {
    for (const state of solutions) {
      for (const k of state.testedKeys) {
        outMatchedKeys.add(k);
      }
    }
  }

  for (const state of solutions) emit(state.sol);
}

/**
 * matchObjectGroup - Match a single O_GROUP pattern against an object
 * Used by lookaheads and other contexts where we need to match one group in isolation
 */
function matchObjectGroup(group, obj, path, sol, emit, ctx, testedKeys = new Set()) {
  guard(ctx);

  // Handle different group types
  if (group.type === 'OTerm') {
    // Single object term K:V or K?:V
    matchObject([group], null, obj, path, sol, emit, ctx, testedKeys);
  } else if (group.type === 'OGroup') {
    // Group of groups (K1:V1 K2:V2 ...)
    matchObject(group.groups, null, obj, path, sol, emit, ctx, testedKeys);
  } else if (group.type === 'GroupBind') {
    // @var=(pattern)
    matchObject([group], null, obj, path, sol, emit, ctx, testedKeys);
  } else if (group.type === 'OLook') {
    // Nested lookahead
    matchObject([group], null, obj, path, sol, emit, ctx, testedKeys);
  } else if (group.type === 'Spread') {
    // Bare .. - match if there are residual keys
    matchObject([], group, obj, path, sol, emit, ctx, testedKeys);
  } else {
    throw new Error(`Unexpected group type in matchObjectGroup: ${group.type}`);
  }
}

function navigateBreadcrumbs(breadcrumbs, startNode, basePath, sol, emit, ctx) {
  guard(ctx);

  if (!breadcrumbs || breadcrumbs.length === 0) {
    emit(startNode, basePath, sol);
    return;
  }

  const bc = breadcrumbs[0];
  const rest = breadcrumbs.slice(1);

  // Navigate the breadcrumb (no quantifiers in v5)
  navigateSingleBreadcrumb(bc, rest, startNode, basePath, sol, emit, ctx);
}

function navigateSingleBreadcrumb(bc, restBreadcrumbs, node, path, sol, emit, ctx) {
  if (bc.kind === 'skip') {
    // ..key navigation - skip any number of levels to find key
    if (!isObject(node)) return;

    navigateSkipLevels(bc.key, restBreadcrumbs, node, path, sol, emit, ctx);
  } else if (bc.kind === 'dot') {
    // .key navigation on objects
    if (!isObject(node)) return;

    // Special handling for $name binding in key position
    if (bc.key.type === 'SBind') {
      const keyPattern = bc.key.pat;
      const fast = fastBoundKey(bc.key, sol.env, keyMatches, k => node.hasOwnProperty(k));

      if (fast !== undefined) {
        // Fast path: variable already bound, use its value
        if (fast.length === 0) return; // Failed validation
        const boundKey = fast[0];
        navigateBreadcrumbs(restBreadcrumbs, node[boundKey], [...path, boundKey], sol, emit, ctx);
        return;
      }

      // Not bound yet - enumerate all matching keys and try to bind
      for (const k of Object.keys(node)) {
        if (!keyMatches(keyPattern, k)) continue;
        const s2 = cloneSolution(sol);
        if (bindScalar(s2.env, bc.key.name, k)) {
          recordScalarSite(s2, bc.key.name, path, k);
          navigateBreadcrumbs(restBreadcrumbs, node[k], [...path, k], s2, emit, ctx);
        }
      }
    } else {
      // Regular key pattern
      const keys = objectKeysMatching(node, bc.key, sol.env);
      for (const k of keys) {
        navigateBreadcrumbs(restBreadcrumbs, node[k], [...path, k], sol, emit, ctx);
      }
    }
  } else if (bc.kind === 'bracket') {
    // [key] navigation on arrays
    if (!Array.isArray(node)) return;

    // bc.key could be:
    // - Lit (number): specific index
    // - Any (_): any index
    // - SBind ($x): bind index variable
    // - Pattern: match index as string/number

    if (bc.key.type === 'Lit') {
      const idx = bc.key.value;
      if (Number.isInteger(idx) && idx in node) {
        navigateBreadcrumbs(restBreadcrumbs, node[idx], [...path, idx], sol, emit, ctx);
      }
    } else if (bc.key.type === 'Any') {
      for (let i = 0; i < node.length; i++) {
        if (i in node) {
          navigateBreadcrumbs(restBreadcrumbs, node[i], [...path, i], sol, emit, ctx);
        }
      }
    } else if (bc.key.type === 'SBind') {
      const idxPattern = bc.key.pat;
      const fast = fastBoundKey(bc.key, sol.env, keyMatches, i => Number.isInteger(i) && i in node);

      if (fast !== undefined) {
        // Fast path: variable already bound, use its value
        if (fast.length === 0) return; // Failed validation
        const idx = fast[0];
        navigateBreadcrumbs(restBreadcrumbs, node[idx], [...path, idx], sol, emit, ctx);
        return;
      }

      // Not bound yet - enumerate indices and try to bind
      for (let i = 0; i < node.length; i++) {
        if (i in node) {
          const s2 = cloneSolution(sol);
          if (bindScalar(s2.env, bc.key.name, i)) {
            recordScalarSite(s2, bc.key.name, path, i);
            navigateBreadcrumbs(restBreadcrumbs, node[i], [...path, i], s2, emit, ctx);
          }
        }
      }
    } else {
      // General pattern on index
      for (let i = 0; i < node.length; i++) {
        if (i in node) {
          matchItem(bc.key, i, path, sol, (s2) => {
            navigateBreadcrumbs(restBreadcrumbs, node[i], [...path, i], s2, emit, ctx);
          }, ctx);
        }
      }
    }
  }
}

function navigateSkipLevels(keyPattern, restBreadcrumbs, node, path, sol, emit, ctx) {
  // ..key navigation: recursively search through tree to find matching keys at any depth
  guard(ctx);

  // Handle arrays: descend into each element
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      navigateSkipLevels(keyPattern, restBreadcrumbs, node[i], [...path, i], sol, emit, ctx);
    }
    return;
  }

  if (!isObject(node)) return;

  // Try to match key at current level
  // Handle $name binding in key position
  if (keyPattern.type === 'SBind') {
    const fast = fastBoundKey(keyPattern, sol.env, keyMatches, k => node.hasOwnProperty(k));

    if (fast !== undefined) {
      // Fast path: variable already bound, use its value
      if (fast.length > 0) {
        const boundKey = fast[0];
        if (node.hasOwnProperty(boundKey)) {
          navigateBreadcrumbs(restBreadcrumbs, node[boundKey], [...path, boundKey], sol, emit, ctx);
        }
      }
    } else {
      // Not bound yet - enumerate all matching keys and try to bind
      const pattern = keyPattern.pat;
      for (const k of Object.keys(node)) {
        if (!keyMatches(pattern, k)) continue;
        const s2 = cloneSolution(sol);
        if (bindScalar(s2.env, keyPattern.name, k)) {
          recordScalarSite(s2, keyPattern.name, path, k);
          navigateBreadcrumbs(restBreadcrumbs, node[k], [...path, k], s2, emit, ctx);
        }
      }
    }
  } else {
    // Regular key pattern (no variable binding)
    const keys = objectKeysMatching(node, keyPattern, sol.env);
    for (const k of keys) {
      navigateBreadcrumbs(restBreadcrumbs, node[k], [...path, k], sol, emit, ctx);
    }
  }

  // Recurse into nested structures to find key at deeper levels
  for (const k of Object.keys(node)) {
    const child = node[k];
    // navigateSkipLevels handles both objects and arrays at its top
    if (isObject(child) || Array.isArray(child)) {
      navigateSkipLevels(keyPattern, restBreadcrumbs, child, [...path, k], sol, emit, ctx);
    }
  }
}

// ------------- Helpers -------------

/**
 * fastBoundKey(pat, env, validate, exists) -> undefined | [] | [key]
 *
 * If pat is SBind($name, inner) AND $name is already bound (scalar) AND
 * inner is not itself a binding, then:
 *   - if validate(inner, boundValue) fails, return [] (fast failure)
 *   - else if exists(boundValue) is true, return [boundValue] (fast success)
 *   - else return [] (not present)
 *
 * If no fast path applies, returns undefined to signal caller to fall back.
 *
 * This encodes the "{ a=$x, $x=$y } ⇒ second term O(1)" idea once,
 * reused by object keys and array indices.
 */
function fastBoundKey(pat, env, validate, exists) {
  if (!pat || pat.type !== 'SBind') return undefined;
  const binding = env.get(pat.name);
  if (!binding || binding.kind !== 'scalar') return undefined;

  // If inner pattern is itself a binding, we need normal binding logic
  if (pat.pat && (pat.pat.type === 'SBind' || pat.pat.type === 'GroupBind')) {
    return undefined;
  }

  const key = binding.value;
  if (!validate(pat.pat, key)) return [];
  return exists(key) ? [key] : [];
}

function objectKeysMatching(obj, keyPat, env) {
  const fast = fastBoundKey(keyPat, env, keyMatches, k => obj.hasOwnProperty(k));
  if (fast !== undefined) return fast;

  // Fall back: enumerate all matching keys
  const out = [];
  for (const k of Object.keys(obj)) {
    if (keyMatches(keyPat, k)) out.push(k);
  }
  return out;
}

function keyMatches(pat, key) {
  switch (pat.type) {
    case 'Any':
      return true;
    case 'TypedAny':
      // Keys are always strings, so _string matches, _number/_boolean never match
      return pat.kind === 'string';
    case 'Lit':
      return Object.is(String(key), String(pat.value));
    case 'StringPattern':
      return pat.matchFn(String(key));
    case 'SBind':
      // Key pattern with binding: check inner pattern constraint
      if (pat.pat) {
        return keyMatches(pat.pat, key);
      }
      return true;  // $x with no constraint matches any key
    case 'Alt':
      // Alternation: key matches if any alternative matches
      return pat.alts.some(alt => keyMatches(alt, key));
    default:
      return false;
  }
}

// Bind variables from a key pattern (handles SBind and alternations)
// Returns true if binding succeeded, false if it failed
function bindKeyVariables(keyPat, key, sol, path) {
  switch (keyPat.type) {
    case 'SBind':
      // Direct binding: $x or $x:(pattern)
      if (!bindScalar(sol.env, keyPat.name, key)) {
        return false;
      }
      recordScalarSite(sol, keyPat.name, path, key);
      // Add guard expression if present
      addGuard(sol, keyPat.guard, keyPat.name);
      // Check guards - prune if any closed guard fails
      if (!checkGuards(sol)) return false;
      return true;

    case 'Alt':
      // Alternation: try each alternative that matches AND whose bindings succeed
      for (const alt of keyPat.alts) {
        if (!keyMatches(alt, key)) continue;
        // Clone solution to avoid corrupting state if binding fails
        const snapshot = cloneSolution(sol);
        if (bindKeyVariables(alt, key, snapshot, path)) {
          // Binding succeeded - commit snapshot back to sol
          sol.env = snapshot.env;
          sol.sites = snapshot.sites;
          return true;
        }
        // Binding failed (e.g., unification conflict) - try next alternative
      }
      return false; // No alternative matched with successful bindings

    default:
      // No variables to bind (Lit, Re, Any, etc.)
      return true;
  }
}

function isObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function parseQuantRange(quant) {
  if (!quant) return {min: 0, max: Infinity};

  // If quant is already an object with min/max (from parser), use it directly
  // Parser now emits Infinity for unbounded max (not null)
  if (typeof quant === 'object' && 'min' in quant && 'max' in quant) {
    return {min: quant.min, max: quant.max};
  }

  // quant could be: '?', '+', '*', '{m}', '{m,}', '{m,n}'
  if (quant === '?') return {min: 0, max: 1};
  if (quant === '+') return {min: 1, max: Infinity};
  if (quant === '*') return {min: 0, max: Infinity};

  // Lazy/possessive variants
  if (quant === '??') return {min: 0, max: 1};
  if (quant === '+?') return {min: 1, max: Infinity};
  if (quant === '*?') return {min: 0, max: Infinity};
  if (quant === '++') return {min: 1, max: Infinity};
  if (quant === '*+') return {min: 0, max: Infinity};

  // Range quantifiers: {m}, {m,}, {m,n}
  const rangeMatch = quant.match(/^\{(\d+)(?:,(\d+)?)?\}$/);
  if (rangeMatch) {
    const m = parseInt(rangeMatch[1], 10);
    const n = rangeMatch[2] !== undefined ? parseInt(rangeMatch[2], 10) : m;
    return {min: m, max: n};
  }

  return {min: 0, max: Infinity};
}

function guard(ctx) {
  ctx.steps++;
  if (ctx.steps > ctx.maxSteps) throw new Error('pattern too ambiguous (step budget exceeded)');
}
