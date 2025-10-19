// tendril-engine.js — evaluator for Tendril AST
// Requires AST produced by tendril-parser.js and helpers from microparser.js

import {
  bindScalar, bindSlice, cloneEnv, isBound,
} from './microparser.js';

// Public entry: evaluate a parsed Program AST on input, return list of env Maps.
export function matchProgram(ast, input, opts = {}) {
  const maxSteps = opts.maxSteps ?? 20000;
  const ctx = {steps: 0, maxSteps};
  let envs = [new Map()];

  for (const path of ast.rules) {
    const next = [];
    for (const env of envs) {
      walkPath(path.segs, 0, input, env, (e) => next.push(e), ctx);
      guard(ctx);
    }
    envs = next;
    if (!envs.length) break;
  }
  return envs;
}

// ------------- Core path walker -------------

function walkPath(segs, i, node, env, emit, ctx) {
  guard(ctx);
  if (i === segs.length) {
    emit(cloneEnv(env));
    return;
  }

  const seg = segs[i];

  switch (seg.type) {
    case 'KeyLit': {
      if (!isObject(node)) return;
      for (const k of Object.keys(node)) {
        if (!keyAtomOk(seg.pat, k)) continue;
        walkPath(segs, i + 1, node[k], env, emit, ctx);
      }
      return;
    }
    case 'KeyPatVar': {
      if (!isObject(node)) return;
      for (const k of Object.keys(node)) {
        if (!keyAtomOk(seg.pat, k)) continue;
        const e = cloneEnv(env);
        if (!bindScalar(e, seg.name, k)) continue;
        walkPath(segs, i + 1, node[k], e, emit, ctx);
      }
      return;
    }
    case 'KeyVar': {
      if (!isObject(node)) return;
      const bound = env.get(seg.name)?.value;
      if (bound != null) {
        if (Object.prototype.hasOwnProperty.call(node, bound)) {
          walkPath(segs, i + 1, node[bound], env, emit, ctx);
        }
        return;
      }
      for (const k of Object.keys(node)) {
        const e = cloneEnv(env);
        if (!bindScalar(e, seg.name, k)) continue;
        walkPath(segs, i + 1, node[k], e, emit, ctx);
      }
      return;
    }

    case 'IdxAny': {
      if (!Array.isArray(node)) return;
      for (let a = 0; a < node.length; a++) {
        if (!(a in node)) continue;
        walkPath(segs, i + 1, node[a], env, emit, ctx);
      }
      return;
    }
    case 'IdxLit': {
      if (!Array.isArray(node)) return;
      const a = seg.idx;
      if (a in node) walkPath(segs, i + 1, node[a], env, emit, ctx);
      return;
    }
    case 'IdxVarLit': {
      if (!Array.isArray(node)) return;
      const a = seg.idx;
      const e = cloneEnv(env);
      if (!bindScalar(e, seg.name, a)) return;
      if (a in node) walkPath(segs, i + 1, node[a], e, emit, ctx);
      return;
    }
    case 'IdxVar': {
      if (!Array.isArray(node)) return;
      const b = env.get(seg.name)?.value;
      if (Number.isInteger(b)) {
        if (b in node) walkPath(segs, i + 1, node[b], env, emit, ctx);
        return;
      }
      for (let a = 0; a < node.length; a++) {
        if (!(a in node)) continue;
        const e = cloneEnv(env);
        if (!bindScalar(e, seg.name, a)) continue;
        walkPath(segs, i + 1, node[a], e, emit, ctx);
      }
      return;
    }

    case 'ValPat': {
      matchPattern(seg.pat, node, env, emit, ctx);
      return;
    }
    case 'ValVar': {
      const e = cloneEnv(env);
      if (!bindScalar(e, seg.name, node)) return;
      emit(e);
      return;
    }
    case 'ValPatVar': {
      matchPattern(seg.pat, node, env, (e) => {
        const e2 = cloneEnv(e);
        if (!bindScalar(e2, seg.name, node)) return;
        emit(e2);
      }, ctx);
      return;
    }

    default:
      return; // unknown seg
  }
}

// ------------- Pattern matching -------------

function matchPattern(pat, node, env, emit, ctx) {
  guard(ctx);
  switch (pat.type) {
    case 'Any':
      emit(cloneEnv(env));
      return;

    case 'Lit':
      if (Object.is(node, pat.value)) emit(cloneEnv(env));
      return;

    case 'Re':
      if (pat.re.test(String(node))) emit(cloneEnv(env));
      return;

    case 'Alt': {
      for (const sub of pat.alts) {
        matchPattern(sub, node, env, emit, ctx);
        guard(ctx);
      }
      return;
    }

    case 'Look': {
      // Zero-width assertion; bindings from successful positive lookahead persist.
      let matchedEnv = null;
      matchPattern(pat.pat, node, cloneEnv(env), (e2) => {
        if (!matchedEnv) matchedEnv = e2;  // capture first successful match
      }, ctx);

      const matched = (matchedEnv !== null);
      if ((matched && !pat.neg) || (!matched && pat.neg)) {
        emit(matched ? matchedEnv : cloneEnv(env));
      }
      return;
    }

    case 'Bind': {
      // Match inner pattern, then bind variable to node if successful
      matchPattern(pat.pat, node, env, (e2) => {
        const e3 = cloneEnv(e2);
        if (bindScalar(e3, pat.name, node)) {
          emit(e3);
        }
      }, ctx);
      return;
    }

    case 'Arr': {
      if (!Array.isArray(node)) return;
      matchArrayAnchored(pat.items, node, env, emit, ctx);
      return;
    }

    case 'Obj': {
      if (!isObject(node)) return;
      // Track which keys are tested by any assertion
      const testedKeys = new Set();

      // For each entry: all keys matching keyPat must satisfy value pattern.
      let envs = [cloneEnv(env)];
      for (const ent of pat.entries) {
        const keys = objectKeysMatching(node, ent.key);
        // Mark these keys as tested
        for (const k of keys) testedKeys.add(k);

        if (ent.op === '=' && keys.length === 0) {
          envs = [];
          break;
        }
        // fold: for each existing env, all keys must match
        let next = [];
        for (const e0 of envs) {
          let okForAll = [e0];
          for (const k of keys) {
            let okNext = [];
            for (const e1 of okForAll) {
              matchPattern(ent.val, node[k], e1, (e2) => okNext.push(e2), ctx);
            }
            okForAll = okNext;
            if (!okForAll.length) break;
          }
          next = next.concat(okForAll);
        }
        envs = next;
        if (!envs.length) break;
      }

      // Check residual slice count if '..' is present
      if (pat.rest && envs.length > 0) {
        const untestedCount = Object.keys(node).filter(k => !testedKeys.has(k)).length;
        const {min, max} = pat.rest;
        if (untestedCount < min || (max !== null && untestedCount > max)) {
          envs = [];
        }
      }

      for (const e of envs) emit(e);
      return;
    }

    default:
      return; // unknown pattern
  }
}

// ------------- Array machinery -------------

function matchArrayAnchored(items, arr, env, emit, ctx) {
  // Anchored: start at index 0 and must end at arr.length
  stepItems(0, 0, env);

  function stepItems(ixItem, ixArr, eIn) {
    guard(ctx);
    if (ixItem === items.length) {
      if (ixArr === arr.length) emit(cloneEnv(eIn));
      return;
    }
    const it = items[ixItem];

    // Spread '..' — lazy: try minimal consumption first
    if (it.type === 'Spread') {
      // try consuming k elements, k from 0..(remaining)
      const maxK = arr.length - ixArr;
      for (let k = 0; k <= maxK; k++) {
        stepItems(ixItem + 1, ixArr + k, eIn);
        if (ctx.steps > ctx.maxSteps) break;
      }
      return;
    }

    // Quantified item: repeat sub m..n times over consecutive elements
    if (it.type === 'Quant') {
      return quantOnArray(it.sub, it.min, it.max, ixItem, ixArr, eIn);
    }

    // Regular pattern item — match one element at current index
    if (ixArr >= arr.length) return;
    matchPattern(it, arr[ixArr], eIn, (e2) => {
      stepItems(ixItem + 1, ixArr + 1, e2);
    }, ctx);
  }

  function quantOnArray(sub, m, n, ixItem, ixArr, eIn) {
    // Consume exactly k repetitions for some k ∈ [m..n]
    const maxRep = Math.min(n, arr.length - ixArr);

    // DP-like iterative expansion to avoid deep recursion explosion
    let frontier = [{idx: ixArr, env: cloneEnv(eIn), reps: 0}];

    // First, ensure we can reach at least m reps
    for (let r = 0; r < m; r++) {
      const next = [];
      for (const st of frontier) {
        const {idx, env} = st;
        if (idx >= arr.length) continue;
        matchPattern(sub, arr[idx], env, (e2) => {
          next.push({idx: idx + 1, env: e2, reps: st.reps + 1});
        }, ctx);
      }
      frontier = next;
      if (!frontier.length) return; // cannot satisfy minimum
    }

    // Having satisfied m, allow up to n with early handoff to next item at each stage
    // First, handoff with exactly m
    for (const st of frontier) {
      stepItems(ixItem + 1, st.idx, st.env);
    }

    // Then extend from m+1 to n
    for (let r = m + 1; r <= maxRep; r++) {
      const grown = [];
      for (const st of frontier) {
        const {idx, env} = st;
        if (idx >= arr.length) continue;
        matchPattern(sub, arr[idx], env, (e2) => {
          grown.push({idx: idx + 1, env: e2, reps: st.reps + 1});
        }, ctx);
      }
      frontier = grown;
      if (!frontier.length) break;
      for (const st of frontier) {
        stepItems(ixItem + 1, st.idx, st.env);
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
