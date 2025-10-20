// tendril-engine.js — evaluator for Tendril AST
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

// Public entry: evaluate a parsed Program AST on input, return list of solutions.
// Each solution: {bindings: Object, sites: Map<varName, Site[]>}
export function matchProgram(ast, input, opts = {}) {
  const maxSteps = opts.maxSteps ?? 20000;
  const ctx = {steps: 0, maxSteps};
  let solutions = [newSolution()];

  for (const rulePath of ast.rules) {
    const next = [];
    for (const sol of solutions) {
      walkPath(rulePath.segs, 0, input, [], sol, (s) => next.push(s), ctx);
      guard(ctx);
    }
    solutions = next;
    if (!solutions.length) break;
  }

  // Convert to public API format
  return solutions.map(sol => ({
    bindings: Object.fromEntries(
      Array.from(sol.env.entries()).map(([k, v]) => [k, v.value])
    ),
    sites: sol.sites,
  }));
}

// ------------- Core path walker -------------

function walkPath(segs, i, node, path, sol, emit, ctx) {
  guard(ctx);
  if (i === segs.length) {
    emit(cloneSolution(sol));
    return;
  }

  const seg = segs[i];

  switch (seg.type) {
    case 'KeyLit': {
      if (!isObject(node)) return;
      for (const k of Object.keys(node)) {
        if (!keyAtomOk(seg.pat, k)) continue;
        walkPath(segs, i + 1, node[k], [...path, k], sol, emit, ctx);
      }
      return;
    }
    case 'KeyPatVar': {
      if (!isObject(node)) return;
      for (const k of Object.keys(node)) {
        if (!keyAtomOk(seg.pat, k)) continue;
        const s = cloneSolution(sol);
        if (!bindScalar(s.env, seg.name, k)) continue;
        recordScalarSite(s, seg.name, path, k);
        walkPath(segs, i + 1, node[k], [...path, k], s, emit, ctx);
      }
      return;
    }
    case 'KeyVar': {
      if (!isObject(node)) return;
      const bound = sol.env.get(seg.name)?.value;
      if (bound != null) {
        if (Object.prototype.hasOwnProperty.call(node, bound)) {
          walkPath(segs, i + 1, node[bound], [...path, bound], sol, emit, ctx);
        }
        return;
      }
      for (const k of Object.keys(node)) {
        const s = cloneSolution(sol);
        if (!bindScalar(s.env, seg.name, k)) continue;
        recordScalarSite(s, seg.name, path, k);
        walkPath(segs, i + 1, node[k], [...path, k], s, emit, ctx);
      }
      return;
    }

    case 'IdxAny': {
      if (!Array.isArray(node)) return;
      for (let a = 0; a < node.length; a++) {
        if (!(a in node)) continue;
        walkPath(segs, i + 1, node[a], [...path, a], sol, emit, ctx);
      }
      return;
    }
    case 'IdxLit': {
      if (!Array.isArray(node)) return;
      const a = seg.idx;
      if (a in node) walkPath(segs, i + 1, node[a], [...path, a], sol, emit, ctx);
      return;
    }
    case 'IdxVarLit': {
      if (!Array.isArray(node)) return;
      const a = seg.idx;
      const s = cloneSolution(sol);
      if (!bindScalar(s.env, seg.name, a)) return;
      recordScalarSite(s, seg.name, path, a);
      if (a in node) walkPath(segs, i + 1, node[a], [...path, a], s, emit, ctx);
      return;
    }
    case 'IdxVar': {
      if (!Array.isArray(node)) return;
      const b = sol.env.get(seg.name)?.value;
      if (Number.isInteger(b)) {
        if (b in node) walkPath(segs, i + 1, node[b], [...path, b], sol, emit, ctx);
        return;
      }
      for (let a = 0; a < node.length; a++) {
        if (!(a in node)) continue;
        const s = cloneSolution(sol);
        if (!bindScalar(s.env, seg.name, a)) continue;
        recordScalarSite(s, seg.name, path, a);
        walkPath(segs, i + 1, node[a], [...path, a], s, emit, ctx);
      }
      return;
    }

    case 'ValPat': {
      matchPattern(seg.pat, node, path, sol, emit, ctx);
      return;
    }
    case 'ValVar': {
      const s = cloneSolution(sol);
      if (!bindScalar(s.env, seg.name, node)) return;
      recordScalarSite(s, seg.name, path, node);
      emit(s);
      return;
    }
    case 'ValPatVar': {
      matchPattern(seg.pat, node, path, sol, (s) => {
        const s2 = cloneSolution(s);
        if (!bindScalar(s2.env, seg.name, node)) return;
        recordScalarSite(s2, seg.name, path, node);
        emit(s2);
      }, ctx);
      return;
    }

    default:
      return; // unknown seg
  }
}

// ------------- Pattern matching -------------

function matchPattern(pat, node, path, sol, emit, ctx) {
  guard(ctx);
  switch (pat.type) {
    case 'Any':
      emit(cloneSolution(sol));
      return;

    case 'Lit':
      if (Object.is(node, pat.value)) emit(cloneSolution(sol));
      return;

    case 'Re':
      if (pat.re.test(String(node))) emit(cloneSolution(sol));
      return;

    case 'Alt': {
      for (const sub of pat.alts) {
        matchPattern(sub, node, path, sol, emit, ctx);
        guard(ctx);
      }
      return;
    }

    case 'Look': {
      // Zero-width assertion; bindings from successful positive lookahead persist.
      let matchedSol = null;
      matchPattern(pat.pat, node, path, cloneSolution(sol), (s2) => {
        if (!matchedSol) matchedSol = s2;  // capture first successful match
      }, ctx);

      const matched = (matchedSol !== null);
      if ((matched && !pat.neg) || (!matched && pat.neg)) {
        emit(matched ? matchedSol : cloneSolution(sol));
      }
      return;
    }

    case 'Bind': {
      // Match inner pattern, then bind variable to node if successful
      matchPattern(pat.pat, node, path, sol, (s2) => {
        const s3 = cloneSolution(s2);
        if (bindScalar(s3.env, pat.name, node)) {
          recordScalarSite(s3, pat.name, path, node);
          emit(s3);
        }
      }, ctx);
      return;
    }

    case 'Arr': {
      if (!Array.isArray(node)) return;
      matchArrayAnchored(pat.items, node, path, sol, emit, ctx);
      return;
    }

    case 'Obj': {
      if (!isObject(node)) return;
      // Track which keys are tested by any assertion
      const testedKeys = new Set();

      // For each entry: all keys matching keyPat must satisfy value pattern.
      let solutions = [cloneSolution(sol)];
      for (const ent of pat.entries) {
        const keys = objectKeysMatching(node, ent.key);
        // Mark these keys as tested
        for (const k of keys) testedKeys.add(k);

        if (ent.op === '=' && keys.length === 0) {
          solutions = [];
          break;
        }
        // fold: for each existing solution, all keys must match
        let next = [];
        for (const s0 of solutions) {
          let okForAll = [s0];
          for (const k of keys) {
            let okNext = [];
            for (const s1 of okForAll) {
              matchPattern(ent.val, node[k], [...path, k], s1, (s2) => okNext.push(s2), ctx);
            }
            okForAll = okNext;
            if (!okForAll.length) break;
          }
          next = next.concat(okForAll);
        }
        solutions = next;
        if (!solutions.length) break;
      }

      // Check residual slice count if '..' is present
      if (pat.rest && solutions.length > 0) {
        const untestedCount = Object.keys(node).filter(k => !testedKeys.has(k)).length;
        const {min, max} = pat.rest;
        if (untestedCount < min || (max !== null && untestedCount > max)) {
          solutions = [];
        }
      }

      for (const s of solutions) emit(s);
      return;
    }

    default:
      return; // unknown pattern
  }
}

// ------------- Array machinery -------------

function matchArrayAnchored(items, arr, path, sol, emit, ctx) {
  // Anchored: start at index 0 and must end at arr.length
  stepItems(0, 0, sol);

  function stepItems(ixItem, ixArr, sIn) {
    guard(ctx);
    if (ixItem === items.length) {
      if (ixArr === arr.length) emit(cloneSolution(sIn));
      return;
    }
    const it = items[ixItem];

    // Spread '..' — lazy: try minimal consumption first
    if (it.type === 'Spread') {
      // try consuming k elements, k from 0..(remaining)
      const maxK = arr.length - ixArr;
      for (let k = 0; k <= maxK; k++) {
        stepItems(ixItem + 1, ixArr + k, sIn);
        if (ctx.steps > ctx.maxSteps) break;
      }
      return;
    }

    // Quantified item: repeat sub m..n times over consecutive elements
    if (it.type === 'Quant') {
      return quantOnArray(it.sub, it.min, it.max, ixItem, ixArr, sIn);
    }

    // Regular pattern item — match one element at current index
    if (ixArr >= arr.length) return;
    matchPattern(it, arr[ixArr], [...path, ixArr], sIn, (s2) => {
      stepItems(ixItem + 1, ixArr + 1, s2);
    }, ctx);
  }

  function quantOnArray(sub, m, n, ixItem, ixArr, sIn) {
    // Consume exactly k repetitions for some k ∈ [m..n]
    const maxRep = Math.min(n, arr.length - ixArr);

    // DP-like iterative expansion to avoid deep recursion explosion
    let frontier = [{idx: ixArr, sol: cloneSolution(sIn), reps: 0}];

    // First, ensure we can reach at least m reps
    for (let r = 0; r < m; r++) {
      const next = [];
      for (const st of frontier) {
        const {idx, sol} = st;
        if (idx >= arr.length) continue;
        matchPattern(sub, arr[idx], [...path, idx], sol, (s2) => {
          next.push({idx: idx + 1, sol: s2, reps: st.reps + 1});
        }, ctx);
      }
      frontier = next;
      if (!frontier.length) return; // cannot satisfy minimum
    }

    // Having satisfied m, allow up to n with early handoff to next item at each stage
    // First, handoff with exactly m
    for (const st of frontier) {
      stepItems(ixItem + 1, st.idx, st.sol);
    }

    // Then extend from m+1 to n
    for (let r = m + 1; r <= maxRep; r++) {
      const grown = [];
      for (const st of frontier) {
        const {idx, sol} = st;
        if (idx >= arr.length) continue;
        matchPattern(sub, arr[idx], [...path, idx], sol, (s2) => {
          grown.push({idx: idx + 1, sol: s2, reps: st.reps + 1});
        }, ctx);
      }
      frontier = grown;
      if (!frontier.length) break;
      for (const st of frontier) {
        stepItems(ixItem + 1, st.idx, st.sol);
      }
    }
  }
}

// ------------- Helpers -------------

function keyAtomOk(pat, key) {
  switch (pat.type) {
    case 'Any':
      return true;
    case 'Lit':
      return Object.is(String(key), String(pat.value));
    case 'Re':
      return pat.re.test(String(key));
    default:
      return false; // keys accept only atom-like patterns
  }
}

function objectKeysMatching(obj, keyPat) {
  const out = [];
  for (const k of Object.keys(obj)) {
    if (keyAtomOk(keyPat, k)) out.push(k);
  }
  return out;
}

function isObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function equalEnvs(a, b) {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    const w = b.get(k);
    if (!w) return false;
    if (v.kind !== w.kind) return false;
    if (!Object.is(v.value, w.value)) return false;
  }
  return true;
}

function guard(ctx) {
  ctx.steps++;
  if (ctx.steps > ctx.maxSteps) throw new Error('pattern too ambiguous (step budget exceeded)');
}
