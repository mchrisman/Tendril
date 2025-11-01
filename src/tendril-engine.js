// tendril-engine.js — evaluator for Tendril v5-A AST
// Requires AST produced by tendril-parser.js and helpers from microparser.js

import {
  bindScalar, bindSlice, cloneEnv, isBound,
} from './microparser.js';
import {Slice} from './tendril-api.js';

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
  const debug = opts.debug;
  const ctx = {steps: 0, maxSteps, debug};
  const solutions = [];

  matchItem(ast, input, [], newSolution(), (sol) => solutions.push(sol), ctx);

  // Convert to public API format
  return solutions.map(sol => {
    const bindings = Object.fromEntries(
      Array.from(sol.env.entries()).map(([k, v]) => [k, v.value])
    );
    return {bindings, sites: sol.sites};
  });
}

// Scan mode: find all occurrences at any depth
export function scan(ast, input, opts = {}) {
  const maxSteps = opts.maxSteps ?? 20000;
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

  // Convert to public API format
  return solutions.map(sol => {
    const bindings = Object.fromEntries(
      Array.from(sol.env.entries()).map(([k, v]) => [k, v.value])
    );
    return {bindings, sites: sol.sites};
  });
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
          if (ctx.debug?.onBind) {
            ctx.debug.onBind('scalar', item.name, node);
          }
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

    // Lookahead — zero-width assertion at current position (unanchored)
    if (it.type === 'Look') {
      let matchedSol = null;
      const remainingSlice = arr.slice(ixArr);

      // Match the lookahead pattern against remaining array (unanchored at end)
      // For negative lookahead, clone to discard bindings
      // For positive lookahead, don't clone so bindings escape
      const testSol = it.neg ? cloneSolution(sIn) : sIn;

      // Make pattern unanchored by appending '..' if not already present
      const patternItems = [it.pat];
      const lastItem = patternItems[patternItems.length - 1];
      const alreadyUnanchored = lastItem && lastItem.type === 'Spread';
      if (!alreadyUnanchored) {
        patternItems.push({type: 'Spread', quant: null}); // '..' with no quant
      }

      matchArray(patternItems, remainingSlice, [...path, ixArr], testSol, (s2) => {
        if (!matchedSol) matchedSol = s2;
      }, ctx);

      const matched = (matchedSol !== null);
      if ((matched && !it.neg) || (!matched && it.neg)) {
        // For positive lookahead: use matchedSol (bindings escape)
        // For negative lookahead: use sIn (bindings don't escape)
        const continueSol = (matched && !it.neg) ? matchedSol : sIn;
        stepItems(ixItem + 1, ixArr, continueSol);
      }
      return;
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
          const sliceValue = Slice.array(...slice);
          if (bindSlice(s3.env, sliceBind.name, sliceValue)) {
            recordSliceSite(s3, sliceBind.name, path, ixArr, ixArr + k, slice);
            if (ctx.debug?.onBind) {
              ctx.debug.onBind('slice', sliceBind.name, sliceValue);
            }
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
        const sliceValue = Slice.array(...slice);
        if (bindSlice(s2.env, sliceBind.name, sliceValue)) {
          recordSliceSite(s2, sliceBind.name, path, ixArr, ixArr + k, slice);
          if (ctx.debug?.onBind) {
            ctx.debug.onBind('slice', sliceBind.name, sliceValue);
          }
          stepItems(ixItem + 1, ixArr + k, s2);
        }
      }
    } else {
      // Non-quantified pattern: @x:(pattern) means exactly one item matching pattern
      if (ixArr < arr.length) {
        matchItem(sliceBind.pat, arr[ixArr], [...path, ixArr], sIn, (s2) => {
          const slice = [arr[ixArr]];
          const s3 = cloneSolution(s2);
          const sliceValue = Slice.array(...slice);
          if (bindSlice(s3.env, sliceBind.name, sliceValue)) {
            recordSliceSite(s3, sliceBind.name, path, ixArr, ixArr + 1, slice);
            if (ctx.debug?.onBind) {
              ctx.debug.onBind('slice', sliceBind.name, sliceValue);
            }
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

function matchObject(terms, spread, obj, path, sol, emit, ctx, outMatchedKeys = null) {
  guard(ctx);

  const DEBUG = false; // Set to true for debugging

  // Process each OTerm sequentially, threading solutions through
  // Each solution tracks its own tested keys for correct residual computation
  let solutions = [{sol: cloneSolution(sol), testedKeys: new Set()}];

  if (DEBUG) console.log(`[matchObject] obj keys:`, Object.keys(obj), `terms:`, terms.length);

  for (const term of terms) {
    // Handle slice bindings: @var:(pattern) or @var:(remainder)
    if (term.type === 'SliceBind') {
      const isSpread = term.pat.type === 'Spread';
      const next = [];

      for (const state of solutions) {
        const {sol: s0, testedKeys} = state;
        if (isSpread) {
          // @var:(remainder) - capture residual keys
          const residualKeys = Object.keys(obj).filter(k => !testedKeys.has(k));
          const residualObj = {};
          for (const k of residualKeys) {
            residualObj[k] = obj[k];
          }

          const s2 = cloneSolution(s0);
          const sliceValue = Slice.object(residualObj);
          if (bindSlice(s2.env, term.name, sliceValue)) {
            if (!s2.sites.has(term.name)) {
              s2.sites.set(term.name, []);
            }
            s2.sites.get(term.name).push({
              kind: 'slice',
              path: [...path],
              keys: residualKeys,
              valueRefs: residualObj
            });
            if (ctx.debug?.onBind) {
              ctx.debug.onBind('slice', term.name, sliceValue);
            }
            // Preserve tested keys for this branch
            next.push({sol: s2, testedKeys: new Set(testedKeys)});
          }
        } else {
          // @var:(pattern) - recursively match pattern, collect matched keys
          if (term.pat.type !== 'OGroup') {
            throw new Error(`SliceBind in object context expects OGroup or Spread pattern, got ${term.pat.type}`);
          }

          const matchedKeys = new Set();
          matchObject(
            term.pat.slices,
            null,
            obj,
            path,
            s0,
            (s2) => {
              // Bind the matched keys as a slice
              const capturedObj = {};
              for (const k of matchedKeys) {
                capturedObj[k] = obj[k];
              }

              const s3 = cloneSolution(s2);
              const sliceValue = Slice.object(capturedObj);
              if (bindSlice(s3.env, term.name, sliceValue)) {
                if (!s3.sites.has(term.name)) {
                  s3.sites.set(term.name, []);
                }
                s3.sites.get(term.name).push({
                  kind: 'slice',
                  path: [...path],
                  keys: Array.from(matchedKeys),
                  valueRefs: capturedObj
                });
                if (ctx.debug?.onBind) {
                  ctx.debug.onBind('slice', term.name, sliceValue);
                }
                // Mark matched keys as tested in this branch
                const newTestedKeys = new Set(testedKeys);
                for (const k of matchedKeys) {
                  newTestedKeys.add(k);
                }
                next.push({sol: s3, testedKeys: newTestedKeys});
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
        matchObject(term.slices, null, obj, path, state.sol, (s2) => {
          next.push({sol: s2, testedKeys: new Set(state.testedKeys)});
        }, ctx);
      }
      solutions = next;
      continue;
    }

    // Handle object lookaheads
    if (term.type === 'OLook') {
      const next = [];
      for (const state of solutions) {
        const {sol: s0, testedKeys} = state;

        // Special case: (?!..) means "no residual keys" (closed object assertion)
        // This is an optimization of the desugaring (?!((?!OT1)(?!OT2)...(?!OTn)_=_))
        if (term.neg && term.pat.type === 'Spread') {
          const residualKeys = Object.keys(obj).filter(k => !testedKeys.has(k));
          const noResiduals = residualKeys.length === 0;
          if (noResiduals) {
            // No residual keys - negative lookahead succeeds
            next.push({sol: cloneSolution(s0), testedKeys: new Set(testedKeys)});
          }
          // If there are residuals, negative lookahead fails (don't push to next)
        } else {
          // General lookahead: try matching pattern
          // Pass parent's testedKeys so .. inside lookahead knows which keys are residual
          let matchedSol = null;
          const lookaheadTestedKeys = new Set(testedKeys);
          matchObjectSlice(term.pat, obj, path, cloneSolution(s0), (s2) => {
            if (!matchedSol) matchedSol = s2;  // capture first successful match
          }, ctx, lookaheadTestedKeys);

          const matched = (matchedSol !== null);
          if ((matched && !term.neg) || (!matched && term.neg)) {
            // Positive lookahead: bindings escape (Prolog-style)
            // Negative lookahead: no bindings escape
            // In both cases, preserve tested keys from parent branch
            // (lookahead tested keys don't affect parent)
            next.push({
              sol: matched ? matchedSol : cloneSolution(s0),
              testedKeys: new Set(testedKeys)
            });
          }
        }
      }
      solutions = next;
      continue;
    }

    if (term.type !== 'OTerm') {
      throw new Error(`Expected OTerm, SliceBind, OLook, or OGroup, got ${term.type}`);
    }

    // Handle K?=V desugaring: K?=V → (K=V | (?!K=_))
    if (term.op === '?=') {
      const next = [];
      for (const state of solutions) {
        const {sol: s0, testedKeys} = state;
        const keys = objectKeysMatching(obj, term.key, s0.env);

        if (keys.length > 0) {
          // First alternative: K=V (key exists, must match value)
          for (const k of keys) {
            const s1 = cloneSolution(s0);
            const newTestedKeys = new Set(testedKeys);
            newTestedKeys.add(k);

            // Bind key variables (handle direct bindings and alternations)
            if (!bindKeyVariables(term.key, k, s1, path)) {
              continue;
            }

            navigateBreadcrumbs(
              term.breadcrumbs,
              obj[k],
              [...path, k],
              s1,
              (finalNode, finalPath, s2) => {
                matchItem(term.val, finalNode, finalPath, s2, (s3) => {
                  next.push({sol: s3, testedKeys: newTestedKeys});
                }, ctx);
              },
              ctx
            );
          }
        } else {
          // Second alternative: (?!K=_) (key doesn't exist)
          // This succeeds because no keys matched the pattern
          next.push({sol: cloneSolution(s0), testedKeys: new Set(testedKeys)});
        }
      }
      solutions = next;
      continue;
    }

    // For each solution, process all matching keys
    let next = [];
    for (const state of solutions) {
      const {sol: s0, testedKeys} = state;
      // OPTIMIZATION: Compute keys for THIS solution's bindings
      const keys = objectKeysMatching(obj, term.key, s0.env);
      if (DEBUG) console.log(`[matchObject] term.key:`, term.key, `matched keys:`, keys);

      // For '=' operator, require at least one key to match
      if (term.op === '=' && keys.length === 0) {
        continue; // Skip this solution
      }

      // Existential semantics: each matching key creates an independent solution branch
      // (consistent with array semantics where [.. 5 ..] means "exists a 5")
      for (const k of keys) {
        if (DEBUG) console.log(`[matchObject] processing key '${k}', breadcrumbs:`, term.breadcrumbs?.length || 0);

        const s1 = cloneSolution(s0);
        // Track that this key was tested in this branch
        const newTestedKeys = new Set(testedKeys);
        newTestedKeys.add(k);

        // Bind key variables (handle direct bindings and alternations)
        if (!bindKeyVariables(term.key, k, s1, path)) {
          continue; // Binding failed
        }

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
              next.push({sol: s3, testedKeys: newTestedKeys});
            }, ctx);
          },
          ctx
        );
      }
    }

    solutions = next;
    if (!solutions.length) break;
  }

  // Handle spread: bare 'remainder' or '@var:(remainder)' or '(?!remainder)'
  if (spread && solutions.length > 0) {
    if (spread.type === 'OLook') {
      // (?!remainder) - assert no residual keys
      const next = [];
      for (const state of solutions) {
        const {sol: s0, testedKeys} = state;

        // Special case: (?!remainder) means "no residual keys" (closed object assertion)
        if (spread.neg && spread.pat.type === 'Spread') {
          const residualKeys = Object.keys(obj).filter(k => !testedKeys.has(k));
          const noResiduals = residualKeys.length === 0;
          if (noResiduals) {
            // No residual keys - negative lookahead succeeds
            next.push({sol: cloneSolution(s0), testedKeys: new Set(testedKeys)});
          }
          // If there are residuals, negative lookahead fails (don't push to next)
        } else {
          // General lookahead on remainder (not yet fully implemented)
          throw new Error('General lookahead on remainder not yet implemented');
        }
      }
      solutions = next;
    } else if (spread.type === 'SliceBind') {
      // @var:(remainder) - bind residual keys to slice variable
      const next = [];
      for (const state of solutions) {
        const {sol: s0, testedKeys} = state;
        const residualKeys = Object.keys(obj).filter(k => !testedKeys.has(k));
        const residualObj = {};
        for (const k of residualKeys) {
          residualObj[k] = obj[k];
        }

        const s2 = cloneSolution(s0);
        const sliceValue = Slice.object(residualObj);
        if (bindSlice(s2.env, spread.name, sliceValue)) {
          if (!s2.sites.has(spread.name)) {
            s2.sites.set(spread.name, []);
          }
          s2.sites.get(spread.name).push({
            kind: 'slice',
            path: [...path],
            keys: residualKeys,
            valueRefs: residualObj
          });
          if (ctx.debug?.onBind) {
            ctx.debug.onBind('slice', spread.name, sliceValue);
          }
          next.push({sol: s2, testedKeys});
        }
      }
      solutions = next;
    } else {
      // Bare 'remainder' - just check count per branch
      const next = [];
      for (const state of solutions) {
        const {sol: s0, testedKeys} = state;
        const {min, max} = parseQuantRange(spread.quant);
        const untestedCount = Object.keys(obj).filter(k => !testedKeys.has(k)).length;
        if (untestedCount >= min && (max === null || untestedCount <= max)) {
          next.push(state);
        }
      }
      solutions = next;
    }
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
 * matchObjectSlice - Match a single O_SLICE pattern against an object
 * Used by lookaheads and other contexts where we need to match one slice in isolation
 */
function matchObjectSlice(slice, obj, path, sol, emit, ctx, testedKeys = new Set()) {
  guard(ctx);

  // Handle different slice types
  if (slice.type === 'OTerm') {
    // Single object term K=V or K?=V
    matchObject([slice], null, obj, path, sol, emit, ctx, testedKeys);
  } else if (slice.type === 'OGroup') {
    // Group of slices (K1=V1 K2=V2 ...)
    matchObject(slice.slices, null, obj, path, sol, emit, ctx, testedKeys);
  } else if (slice.type === 'SliceBind') {
    // @var:(pattern)
    matchObject([slice], null, obj, path, sol, emit, ctx, testedKeys);
  } else if (slice.type === 'OLook') {
    // Nested lookahead
    matchObject([slice], null, obj, path, sol, emit, ctx, testedKeys);
  } else if (slice.type === 'Spread') {
    // Bare .. - match if there are residual keys
    matchObject([], slice, obj, path, sol, emit, ctx, testedKeys);
  } else {
    throw new Error(`Unexpected slice type in matchObjectSlice: ${slice.type}`);
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
      return true;

    case 'Alt':
      // Alternation: try each alternative, bind variables from the one that matches
      for (const alt of keyPat.alts) {
        if (keyMatches(alt, key)) {
          // This alternative matches - bind any variables it contains
          return bindKeyVariables(alt, key, sol, path);
        }
      }
      return false; // No alternative matched

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
  if (typeof quant === 'object' && 'min' in quant && 'max' in quant) {
    return {min: quant.min, max: quant.max === null ? Infinity : quant.max};
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
