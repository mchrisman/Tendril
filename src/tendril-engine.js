// tendril-engine.js — evaluator for Tendril v5-A AST
// Requires AST produced by tendril-parser.js and helpers from microparser.js

import {
  bindScalar, bindSlice, cloneEnv, isBound,
} from './microparser.js';

// ------------- Solution structure: {env, sites} -------------
// Solution tracks both bindings (env) and where they were bound (sites)
// Site kinds:
//  - scalar: {kind: 'scalar', path: [], valueRef: obj}
//  - slice (array): {kind: 'slice', path: [], sliceStart: n, sliceEnd: m, valueRefs: [obj1, ...]}
//  - slice (object): {kind: 'slice', path: [], keys: ['a', ...], valueRefs: {a: obj1, ...}}

function newSolution() {
  return {env: new Map(), sites: new Map()};
}

function cloneSolution(sol) {
  const sites = new Map();
  for (const [k, v] of sol.sites) {
    sites.set(k, [...v]); // shallow copy of site array
  }
  return {env: cloneEnv(sol.env), sites};
}

function recordScalarSite(sol, varName, path, valueRef) {
  if (!sol.sites.has(varName)) {
    sol.sites.set(varName, []);
  }
  sol.sites.get(varName).push({kind: 'scalar', path: [...path], valueRef});
}

function recordSliceSite(sol, varName, path, sliceStart, sliceEnd, valueRefs) {
  if (!sol.sites.has(varName)) {
    sol.sites.set(varName, []);
  }
  sol.sites.get(varName).push({
    kind: 'slice',
    path: [...path],
    sliceStart,
    sliceEnd,
    valueRefs: [...valueRefs],
  });
}

// Public entry: evaluate a parsed ITEM AST on input, return list of solutions.
// Each solution: {bindings: Object, sites: Map<varName, Site[]>}
export function match(ast, input, opts = {}) {
  const maxSteps = opts.maxSteps ?? 20000;
  const ctx = {steps: 0, maxSteps};
  const solutions = [];

  matchItem(ast, input, [], newSolution(), (sol) => solutions.push(sol), ctx);

  // Convert to public API format
  return solutions.map(sol => ({
    bindings: Object.fromEntries(
      Array.from(sol.env.entries()).map(([k, v]) => [k, v.value])
    ),
    sites: sol.sites,
  }));
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

  switch (item.type) {
    case 'Any':
      emit(cloneSolution(sol));
      return;

    case 'Lit':
      if (Object.is(node, item.value)) emit(cloneSolution(sol));
      return;

    case 'Re':
      if (item.re.test(String(node))) emit(cloneSolution(sol));
      return;

    case 'Bool':
      if (Object.is(node, item.value)) emit(cloneSolution(sol));
      return;

    case 'Null':
      if (node === null) emit(cloneSolution(sol));
      return;

    case 'Alt': {
      for (const sub of item.alts) {
        matchItem(sub, node, path, sol, emit, ctx);
        guard(ctx);
      }
      return;
    }

    case 'Look': {
      // Zero-width assertion; bindings from successful positive lookahead persist.
      let matchedSol = null;
      matchItem(item.pat, node, path, cloneSolution(sol), (s2) => {
        if (!matchedSol) matchedSol = s2;  // capture first successful match
      }, ctx);

      const matched = (matchedSol !== null);
      if ((matched && !item.neg) || (!matched && item.neg)) {
        emit(matched ? matchedSol : cloneSolution(sol));
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
          emit(s3);
        }
      }, ctx);
      return;
    }

    case 'SliceBind': {
      // Slice binding can only appear in array/object contexts
      // If appearing at top level, treat as error
      throw new Error('Slice binding @x cannot appear at top level');
    }

    case 'Arr': {
      if (!Array.isArray(node)) return;
      matchArray(item.items, node, path, sol, emit, ctx);
      return;
    }

    case 'Obj': {
      if (!isObject(node)) return;
      matchObject(item.terms, item.spread, node, path, sol, emit, ctx);
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

// ------------- Array matching -------------

function matchArray(items, arr, path, sol, emit, ctx) {
  // Match array items anchored at start and end
  stepItems(0, 0, sol);

  function stepItems(ixItem, ixArr, sIn) {
    guard(ctx);
    if (ixItem === items.length) {
      if (ixArr === arr.length) emit(cloneSolution(sIn));
      return;
    }
    const it = items[ixItem];

    // Spread '..' — try consuming k elements, k from 0..(remaining)
    if (it.type === 'Spread') {
      const {min, max} = parseQuantRange(it.quant);
      const maxK = Math.min(max, arr.length - ixArr);

      for (let k = min; k <= maxK; k++) {
        stepItems(ixItem + 1, ixArr + k, sIn);
        if (ctx.steps > ctx.maxSteps) break;
      }
      return;
    }

    // Slice binding @x or @x:(pattern)
    if (it.type === 'SliceBind') {
      return matchArraySliceBind(it, ixItem, ixArr, sIn);
    }

    // Quantified item (from parser: Quant node)
    if (it.type === 'Quant') {
      const min = it.min !== null ? it.min : 0;
      const max = it.max !== null ? it.max : Infinity;
      const op = it.op || '?';
      return quantOnArray(it.sub, min, max, op, ixItem, ixArr, sIn);
    }

    // Regular pattern item — match one element at current index
    if (ixArr >= arr.length) return;
    matchItem(it, arr[ixArr], [...path, ixArr], sIn, (s2) => {
      stepItems(ixItem + 1, ixArr + 1, s2);
    }, ctx);
  }

  function matchArraySliceBind(sliceBind, ixItem, ixArr, sIn) {
    // @x matches 0+ consecutive items
    // @x:(pat) matches 0+ items where each matches pat
    const maxK = arr.length - ixArr;

    // For @x:(item1 item2? ...), match a sequence of items
    if (sliceBind.pat.type === 'Seq') {
      // Try each possible slice length and see if the Seq pattern matches
      // GREEDY: try longer slices first
      for (let k = maxK; k >= 0; k--) {
        const testSlice = arr.slice(ixArr, ixArr + k);

        matchArray(sliceBind.pat.items, testSlice, [...path, ixArr], sIn, (s2) => {
          const slice = testSlice;
          const s3 = cloneSolution(s2);
          if (bindSlice(s3.env, sliceBind.name, slice)) {
            recordSliceSite(s3, sliceBind.name, path, ixArr, ixArr + k, slice);
            stepItems(ixItem + 1, ixArr + k, s3);
          }
        }, ctx);
      }
      return;
    }

    // For @x:(pat*), validate using quantifier logic
    if (sliceBind.pat.type === 'Quant') {
      const {sub, min, max} = sliceBind.pat;
      const effectiveMin = min !== null ? min : 0;
      const effectiveMax = max !== null ? max : Infinity;

      for (let k = 0; k <= maxK; k++) {
        const slice = arr.slice(ixArr, ixArr + k);

        // Check if slice length satisfies quantifier bounds
        if (slice.length < effectiveMin || slice.length > effectiveMax) continue;

        // Validate each item matches sub-pattern
        let allMatch = true;
        for (let i = 0; i < slice.length; i++) {
          let foundMatch = false;
          matchItem(sub, slice[i], [...path, ixArr + i], sIn, () => {
            foundMatch = true;
          }, ctx);
          if (!foundMatch) {
            allMatch = false;
            break;
          }
        }
        if (!allMatch) continue;

        // Try binding this slice
        const s2 = cloneSolution(sIn);
        if (bindSlice(s2.env, sliceBind.name, slice)) {
          recordSliceSite(s2, sliceBind.name, path, ixArr, ixArr + k, slice);
          stepItems(ixItem + 1, ixArr + k, s2);
        }
      }
    } else {
      // Non-quantified pattern: @x:(pattern) means exactly one item matching pattern
      if (ixArr < arr.length) {
        matchItem(sliceBind.pat, arr[ixArr], [...path, ixArr], sIn, (s2) => {
          const slice = [arr[ixArr]];
          const s3 = cloneSolution(s2);
          if (bindSlice(s3.env, sliceBind.name, slice)) {
            recordSliceSite(s3, sliceBind.name, path, ixArr, ixArr + 1, slice);
            stepItems(ixItem + 1, ixArr + 1, s3);
          }
        }, ctx);
      }
    }
  }

  function quantOnArray(sub, m, n, op, ixItem, ixArr, sIn) {
    // Consume exactly k repetitions for some k ∈ [m..n]
    const maxRep = Math.min(n, arr.length - ixArr);

    // Determine if this is possessive (commit to first match, no backtracking)
    const isPossessive = op && (op.startsWith('*{') || op.endsWith('+'));

    // DP-like iterative expansion to avoid deep recursion explosion
    let frontier = [{idx: ixArr, sol: cloneSolution(sIn), reps: 0}];

    // First, ensure we can reach at least m reps
    for (let r = 0; r < m; r++) {
      const next = [];
      for (const st of frontier) {
        const {idx, sol} = st;
        if (idx >= arr.length) continue;
        matchItem(sub, arr[idx], [...path, idx], sol, (s2) => {
          next.push({idx: idx + 1, sol: s2, reps: st.reps + 1});
        }, ctx);
      }
      frontier = next;
      if (!frontier.length) return; // cannot satisfy minimum
    }

    if (isPossessive) {
      // Possessive: greedily consume as many as possible, then commit
      // Continue expanding to maximum
      for (let r = m; r < maxRep; r++) {
        const grown = [];
        for (const st of frontier) {
          const {idx, sol} = st;
          if (idx >= arr.length) continue;
          matchItem(sub, arr[idx], [...path, idx], sol, (s2) => {
            grown.push({idx: idx + 1, sol: s2, reps: st.reps + 1});
          }, ctx);
        }
        if (!grown.length) break; // Can't match more
        frontier = grown;
      }
      // Emit only the longest match (possessive - no backtracking)
      for (const st of frontier) {
        stepItems(ixItem + 1, st.idx, st.sol);
      }
    } else {
      // Non-possessive: try all lengths from m to n (backtracking allowed)
      // GREEDY: emit longer matches before shorter ones

      // Collect all frontiers from m to maxRep
      const allFrontiers = [frontier]; // frontier at m reps

      for (let r = m; r < maxRep; r++) {
        const grown = [];
        for (const st of frontier) {
          const {idx, sol} = st;
          if (idx >= arr.length) continue;
          matchItem(sub, arr[idx], [...path, idx], sol, (s2) => {
            grown.push({idx: idx + 1, sol: s2, reps: st.reps + 1});
          }, ctx);
        }
        if (!grown.length) break;
        frontier = grown;
        allFrontiers.push(frontier);
      }

      // Emit in reverse order: longest matches first (greedy)
      for (let i = allFrontiers.length - 1; i >= 0; i--) {
        for (const st of allFrontiers[i]) {
          stepItems(ixItem + 1, st.idx, st.sol);
        }
      }
    }
  }
}

// ------------- Object matching -------------

function matchObject(terms, spread, obj, path, sol, emit, ctx) {
  guard(ctx);

  const DEBUG = false; // Set to true for debugging

  // Track which keys are tested by any assertion
  const testedKeys = new Set();

  // Process each OTerm sequentially, threading solutions through
  let solutions = [cloneSolution(sol)];

  if (DEBUG) console.log(`[matchObject] obj keys:`, Object.keys(obj), `terms:`, terms.length);

  for (const term of terms) {
    // Handle slice bindings for residual keys: @rest:(..)
    if (term.type === 'SliceBind') {
      // Bind remaining untested keys to the slice variable
      const next = [];
      for (const s0 of solutions) {
        const residualKeys = Object.keys(obj).filter(k => !testedKeys.has(k));
        const residualObj = {};
        for (const k of residualKeys) {
          residualObj[k] = obj[k];
        }

        const s2 = cloneSolution(s0);
        if (bindSlice(s2.env, term.name, residualObj)) {
          // Record slice site - for objects, we record the keys
          if (!s2.sites.has(term.name)) {
            s2.sites.set(term.name, []);
          }
          s2.sites.get(term.name).push({
            kind: 'slice',
            path: [...path],
            keys: residualKeys,
            valueRefs: residualObj
          });
          next.push(s2);
        }
      }
      solutions = next;
      continue;
    }

    if (term.type !== 'OTerm') {
      throw new Error(`Expected OTerm or SliceBind, got ${term.type}`);
    }

    // For each solution, process all matching keys
    let next = [];
    for (const s0 of solutions) {
      // OPTIMIZATION: Compute keys for THIS solution's bindings
      const keys = objectKeysMatching(obj, term.key, s0.env);
      if (DEBUG) console.log(`[matchObject] term.key:`, term.key, `matched keys:`, keys);

      // Mark these keys as tested
      for (const k of keys) testedKeys.add(k);

      // For '=' operator, require at least one key to match
      if (term.op === '=' && keys.length === 0) {
        continue; // Skip this solution
      }

      let okForAll = [s0];

      for (const k of keys) {
        let okNext = [];

        if (DEBUG) console.log(`[matchObject] processing key '${k}', breadcrumbs:`, term.breadcrumbs?.length || 0);

        for (const s1 of okForAll) {
          // Navigate breadcrumbs from obj[k], then match value pattern
          if (DEBUG) console.log(`[matchObject] obj[${k}]:`, obj[k]);
          navigateBreadcrumbs(
            term.breadcrumbs,
            obj[k],
            [...path, k],
            s1,
            (finalNode, finalPath, s2) => {
              if (DEBUG) console.log(`[matchObject] reached final node:`, finalNode, `matching against:`, term.val);
              matchItem(term.val, finalNode, finalPath, s2, (s3) => {
                if (DEBUG) console.log(`[matchObject] value matched!`);
                okNext.push(s3);
              }, ctx);
            },
            ctx
          );
        }

        if (DEBUG) console.log(`[matchObject] okNext length:`, okNext.length);
        okForAll = okNext;
        if (!okForAll.length) break;
      }

      next = next.concat(okForAll);
    }

    solutions = next;
    if (!solutions.length) break;
  }

  // Check residual slice count if spread is present
  if (spread && solutions.length > 0) {
    const {min, max} = parseQuantRange(spread.quant);
    const untestedCount = Object.keys(obj).filter(k => !testedKeys.has(k)).length;
    if (untestedCount < min || (max !== null && untestedCount > max)) {
      solutions = [];
    }
  }

  for (const s of solutions) emit(s);
}

function navigateBreadcrumbs(breadcrumbs, startNode, basePath, sol, emit, ctx) {
  guard(ctx);

  if (!breadcrumbs || breadcrumbs.length === 0) {
    emit(startNode, basePath, sol);
    return;
  }

  const bc = breadcrumbs[0];
  const rest = breadcrumbs.slice(1);

  if (bc.quant) {
    // Breadcrumb with quantifier: (.key){m,n} or ([idx])*
    navigateBreadcrumbWithQuant(bc, rest, startNode, basePath, sol, emit, ctx);
  } else {
    // Simple breadcrumb without quantifier
    navigateSingleBreadcrumb(bc, rest, startNode, basePath, sol, emit, ctx);
  }
}

function navigateSingleBreadcrumb(bc, restBreadcrumbs, node, path, sol, emit, ctx) {
  if (bc.kind === 'dot') {
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

function navigateBreadcrumbWithQuant(bc, restBreadcrumbs, node, path, sol, emit, ctx) {
  // Breadcrumb quantifier: repeat navigation {m,n} times
  const {min, max} = parseQuantRange(bc.quant);

  // Navigate bc.quant times, then continue with restBreadcrumbs
  function repeatNav(reps, currentNode, currentPath, currentSol) {
    guard(ctx);

    if (reps >= min) {
      // Can stop here and continue with rest
      navigateBreadcrumbs(restBreadcrumbs, currentNode, currentPath, currentSol, emit, ctx);
    }

    if (reps >= max) return;

    // Try one more navigation
    const bcWithoutQuant = {...bc, quant: null};
    navigateSingleBreadcrumb(
      bcWithoutQuant,
      [],
      currentNode,
      currentPath,
      currentSol,
      (nextNode, nextPath, nextSol) => {
        repeatNav(reps + 1, nextNode, nextPath, nextSol);
      },
      ctx
    );
  }

  repeatNav(0, node, path, sol);
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
  if (pat.pat && (pat.pat.type === 'SBind' || pat.pat.type === 'SliceBind')) {
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
    case 'Lit':
      return Object.is(String(key), String(pat.value));
    case 'Re':
      return pat.re.test(String(key));
    case 'SBind':
      // Key pattern with binding: $x matches any key (binding handled separately)
      return true;
    default:
      return false;
  }
}

function isObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function parseQuantRange(quant) {
  if (!quant) return {min: 0, max: Infinity};

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
