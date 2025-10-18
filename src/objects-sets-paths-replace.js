// objects-sets-paths-replace.js
// Milestone 4: Full feature layer (Objects, Sets, Vertical paths, Replacement).
//
// Strategy
// --------
// We keep `engine.js` intact for the fast subset. Here, we:
//  1) Parse+validate as usual.
//  2) If the AST contains only M3 features, delegate to `engine.Pattern`.
//  3) Otherwise, run a compact **backtracking interpreter** that supports all
//     M4 features (objects, sets, vertical `.` in object keys, and replacements).
//
// Notes
// -----
// • Vertical keys (`{ a.b.c: v }`) are desugared before matching into nested
//   object patterns (right-to-left), e.g. `{ a: { b: { c: v } } }` (anchored).
// • Object kvs are unordered, **overlapping** and **non-consuming**; anchoring
//   means every input key is “covered” by at least one kv-pattern (unless `..`).
// • Counts `k:v #{m,n}` are post-checks over keys satisfying both k and v.
// • Sets use order-insensitive bipartite matching; extras allowed only with
//   set-level spread `..` (sugar for “allow extras”).
//   array-slice, object-key, and object-value captures; `replaceAll()` applies
//   non-overlapping edits left→right, returning a new immutable structure.

import { parseAndValidate, PatternSyntaxError } from "./syntax.js";
import {
  Semantics,
  Env,
  isArr, isSet, isMap, isObj,
  atomEqNumber, atomEqBoolean, atomEqString, regexFull, deepEq,
  Coverage, enumerateKeys, getValue, cloneShallow,
  makeArraySlice, makeObjectValueRef, makeObjectKeysSlice,
} from "./semantics.js";
import { Pattern as CorePattern } from "./engine.js";

/* ============================== AST utilities ============================== */

// Detect if AST uses any "advanced" features that engine.js doesn't compile.
function needsAdvanced(n) {
  if (!n || typeof n !== "object") return false;
  switch (n.type) {
    case "Object":
    case "Map":
    case "Set":
    case "Dot":
    case "IndexedPath":
    case "ReplaceSlice":
    case "ReplaceKey":
    case "ReplaceVal":
    case "BindSlice":
    case "Assert": // Assertions always use M4 path for proper support
      return true;
    case "Alt": return n.options.some(needsAdvanced);
    case "And": return n.parts.some(needsAdvanced);
    case "Adj": return n.elems.some(needsAdvanced);
    case "Array": return n.elems.some(needsAdvanced);
    case "Group": return needsAdvanced(n.sub);
    case "Quant": return needsAdvanced(n.sub);
    case "Bind": return needsAdvanced(n.pat);
    case "BindEq": return needsAdvanced(n.left) || needsAdvanced(n.right);
    default: return false;
  }
}

// Lower BindSlice: keep Spread as-is for special residual handling
function lowerBindSlice(bs) {
  // Don't transform Spread to (_=_)* for objects - it needs special handling
  // to collect residual k=v pairs not matched by other assertions
  return bs;
}

// Lower vertical key paths inside Object/Map kvs: k1.k2.k3 = v  ⇒  k1 = { k2.k3 = v } (anchored)
// Also handles indexed paths: a[$x].c = v  ⇒  a = { $x = { c = v } } (anchored)
function lowerVerticalInObjectLike(obj) {
  const nodeType = obj.type; // Preserve whether it's "Object" or "Map"
  const lowerDot = (kPat, vPat) => {
    // kPat is a Dot-chain or IndexedPath; split leftmost and rest
    const peel = (k) => {
      if (k.type === "Dot") return [k.left, k.right];
      if (k.type === "IndexedPath") return [k.obj, k.index];
      return [k, null];
    };
    const [left, rest] = peel(kPat);
    if (!rest) return { kPat: left, vPat };
    // Build nested object on right: { rest = vPat } (anchored), preserve type
    const innerKV = { type: nodeType, span: vPat.span ?? kPat.span, anchored: true, hasSpread: false,
      kvs: [ { kPat: rest, vPat, count: null } ] };
    return lowerDot(left, innerKV);
  };

  const kvs = [];
  for (const kv of obj.kvs) {
    if (kv.type === "BindSlice") {
      // Lower BindSlice and recurse into its pattern
      const lowered = lowerBindSlice(kv);
      kvs.push({ ...lowered, pat: lowerVerticalEverywhere(lowered.pat) });
      continue;
    }
    if (kv.type === "ReplaceKey" || kv.type === "ReplaceVal") {
      // Replacement: also allow vertical on the key side
      if (kv.kPat?.type === "Dot" || kv.kPat?.type === "IndexedPath") {
        const lowered = lowerDot(kv.kPat, kv.vPat);
        kvs.push({ ...kv, kPat: lowered.kPat, vPat: lowered.vPat });
      } else {
        kvs.push(kv);
      }
      continue;
    }
    const { kPat, vPat, count } = kv;
    if (kPat.type === "Dot" || kPat.type === "IndexedPath") {
      const lowered = lowerDot(kPat, vPat);
      kvs.push({ kPat: lowered.kPat, vPat: lowered.vPat, count });
    } else {
      kvs.push(kv);
    }
  }
  return { ...obj, kvs };
}

// Transform AST: apply vertical lowering to all nested Objects and Maps.
function lowerVerticalEverywhere(n) {
  if (!n || typeof n !== "object") return n;
  switch (n.type) {
    case "Object":
    case "Map": {
      const loweredSelf = lowerVerticalInObjectLike(n);
      return { ...loweredSelf, kvs: loweredSelf.kvs.map(kv => {
        if (kv.type === "BindSlice") {
          // Already lowered in lowerVerticalInObjectLike
          return kv;
        }
        if (kv.type === "ReplaceKey" || kv.type === "ReplaceVal") {
          return {
            ...kv,
            kPat: lowerVerticalEverywhere(kv.kPat),
            vPat: lowerVerticalEverywhere(kv.vPat),
          };
        }
        return {
          ...kv,
          kPat: lowerVerticalEverywhere(kv.kPat),
          vPat: lowerVerticalEverywhere(kv.vPat),
        };
      })};
    }
    case "BindSlice": return { ...n, pat: lowerVerticalEverywhere(n.pat) };
    case "Array": return { ...n, elems: n.elems.map(lowerVerticalEverywhere) };
    case "Adj":   return { ...n, elems: n.elems.map(lowerVerticalEverywhere) };
    case "Alt":   return { ...n, options: n.options.map(lowerVerticalEverywhere) };
    case "And":   return { ...n, parts: n.parts.map(lowerVerticalEverywhere) };
    case "Group": return { ...n, sub: lowerVerticalEverywhere(n.sub) };
    case "Quant": return { ...n, sub: lowerVerticalEverywhere(n.sub) };
    case "Bind":  return { ...n, pat: lowerVerticalEverywhere(n.pat) };
    case "BindEq":return { ...n, left: lowerVerticalEverywhere(n.left), right: lowerVerticalEverywhere(n.right) };
    case "Assert":return { ...n, pat: lowerVerticalEverywhere(n.pat) };
    case "IndexedPath": return { ...n, obj: lowerVerticalEverywhere(n.obj), index: lowerVerticalEverywhere(n.index) };
    default:      return n;
  }
}

/**
 * Public helper: parse then lower vertical paths everywhere.
 * @param {string|object} sourceOrAst
 * @returns {object}
 */
export function parseAndLower(sourceOrAst) {
  const ast = typeof sourceOrAst === "string" ? parseAndValidate(sourceOrAst) : sourceOrAst;
  return lowerVerticalEverywhere(ast);
}

/**
 * Build a Solution object from current context.
 * @param {Env} env
 * @param {Map<string, Array<any>>} varOcc
 * @param {Array<any>} pathStack
 */
function makeSolution(env, varOcc, pathStack) {
  const bindings = Object.fromEntries(env.map.entries());
  const at = {};
  for (const [k, arr] of varOcc.entries()) at[k] = arr.slice();
  const where = pathStack.slice();
  return { bindings, at, where };
}

/**
 * Traverse a structure to yield positional "occurrence" candidates (value, pathStack).
 * @param {any} val
 * @param {Array<any>} path
 * @param {(v:any, path:any[])=>void} cb
 */
function traverseAll(val, path, cb) {
  cb(val, path);
  if (Array.isArray(val)) {
    for (let i = 0; i < val.length; i++) {
      const ref = { kind: "array-slice", ref: val, start: i, end: i + 1 };
      traverseAll(val[i], path.concat([ref]), cb);
    }
    return;
  }
  if (isObj(val)) {
    for (const k of Object.keys(val)) {
      const ref = { kind: "object-value", ref: val, key: k };
      traverseAll(val[k], path.concat([ref]), cb);
    }
    return;
  }
  if (isMap(val)) {
    for (const [k, v] of val.entries()) {
      const ref = { kind: "object-value", ref: val, key: k };
      traverseAll(v, path.concat([ref]), cb);
    }
  }
}

/* ============================== Interpreter core ============================== */

// Shared matching logic for Object and Map patterns (differ only in type check)
function* matchObjectLike(n, val, ctx, typeCheck) {
  if (!typeCheck(val)) return;
  const cov = new Coverage(val);

  // First pass: evaluate regular kv patterns (non-BindSlice) to establish coverage
  for (const kv of n.kvs) {
    if (kv.type === "BindSlice") {
      // Skip BindSlice in first pass - handle after coverage is established
      continue;
    }

    if (kv.type === "ReplaceKey") {
      // Mark all keys whose kPat matches; value must match vPat too.
      const keys = enumerateKeys(val, k => keyMatches(kv.kPat, k, ctx));
      if (keys.length === 0) { return; }
      let any = false;
      for (const k of keys) {
        for (const _ of matchNode(kv.vPat, getValue(val, k), ctx)) {
          cov.add(k);
          ctx.captures.objKeys.push(makeObjectKeysSlice(val, [k]));
          yield ctx.env;
          ctx.captures.objKeys.pop();
          any = true;
        }
      }
      if (!any) return;
      continue;
    }
    if (kv.type === "ReplaceVal") {
      const keys = enumerateKeys(val, k => keyMatches(kv.kPat, k, ctx));
      if (keys.length === 0) { return; }
      let any = false;
      for (const k of keys) {
        for (const _ of matchNode(kv.vPat, getValue(val, k), ctx)) {
          cov.add(k);
          ctx.captures.objVals.push(makeObjectValueRef(val, k));
          yield ctx.env;
          ctx.captures.objVals.pop();
          any = true;
        }
      }
      if (!any) return;
      continue;
    }

    const keys = enumerateKeys(val, k => keyMatches(kv.kPat, k, ctx));
    if (keys.length === 0) { return; }
    let okThisKV = false;
    for (const k of keys) {
      // Push path ref for occurrence tracking
      ctx.path.push(makeObjectValueRef(val, k));
      for (const _ of matchNode(kv.vPat, getValue(val, k), ctx)) {
        cov.add(k);
        okThisKV = true;
        // Do NOT break; overlapping is allowed, but we only need at least one success
        break;
      }
      ctx.path.pop();
      if (okThisKV) break;
    }
    if (!okThisKV) return;
  }

  // Second pass: handle BindSlice nodes now that coverage is established
  for (const kv of n.kvs) {
    if (kv.type !== "BindSlice") continue;

    const sliceObj = typeCheck === isMap ? new Map() : {};

    if (kv.pat.type === "Spread") {
      // $var:.. - bind residual k=v pairs not yet covered
      const allKeys = enumerateKeys(val, () => true);
      for (const k of allKeys) {
        if (!cov.covered.has(k)) {
          if (typeCheck === isMap) {
            sliceObj.set(k, getValue(val, k));
          } else {
            sliceObj[k] = getValue(val, k);
          }
          cov.add(k); // Mark as covered now
        }
      }
    } else if (kv.pat.type === "Object" || kv.pat.type === "Map") {
      // $var:(kv-pattern) - bind k=v pairs matching the pattern
      for (const innerKV of kv.pat.kvs) {
        const keys = enumerateKeys(val, k => keyMatches(innerKV.kPat, k, ctx));
        for (const k of keys) {
          // Check if value matches
          let vMatches = false;
          const shadowCtx = { ...ctx, env: ctx.env.cloneRO() };
          for (const _ of matchNode(innerKV.vPat, getValue(val, k), shadowCtx)) {
            vMatches = true;
            break;
          }
          if (vMatches) {
            // Add to slice
            if (typeCheck === isMap) {
              sliceObj.set(k, getValue(val, k));
            } else {
              sliceObj[k] = getValue(val, k);
            }
            cov.add(k);
          }
        }
      }

      // Check count constraints if any
      if (kv.pat.kvs.length > 0 && kv.pat.kvs[0].count) {
        const count = kv.pat.kvs[0].count;
        const size = typeCheck === isMap ? sliceObj.size : Object.keys(sliceObj).length;
        if (!(size >= count.min && (count.max === Infinity || size <= count.max))) {
          return;
        }
      }
    }

    // Bind the slice to the variable
    const ok = ctx.env.bindOrCheck(kv.name, sliceObj, ctx.opts);
    if (!ok) return;
    recordVarOcc(ctx, kv.name);
  }

  // Counts (post-check, non-consuming)
  for (const kv of n.kvs) {
    if (kv.type === "BindSlice") continue; // Skip BindSlice in count check
    if (kv.count) {
      const keys = enumerateKeys(val, k => keyMatches(kv.kPat, k, ctx));
      let cnt = 0;
      for (const k of keys) {
        let vok = false;
        for (const _ of matchNode(kv.vPat, getValue(val, k), { ...ctx, env: ctx.env.cloneRO() })) {
          vok = true; break;
        }
        if (vok) cnt++;
      }
      if (!(cnt >= kv.count.min && (kv.count.max === Infinity || cnt <= kv.count.max))) return;
    }
  }

  // Anchoring
  if (n.anchored && !n.hasSpread) {
    if (!cov.isFull()) return;
  }

  yield ctx.env;
}

function* matchNode(n, val, ctx) {
  // ctx: { env: Env, path: any[], captures: {arrSlices:[], objKeys:[], objVals:[]}, opts }
  switch (n.type) {
    /* ---- Variables & Bindings ---- */
    case "Var": {
      const ok = ctx.env.bindOrCheck(n.name, val, ctx.opts);
      if (!ok) return;
      // Record occurrence ref if we have a concrete currentRef on stack; else generic breadcrumb.
      recordVarOcc(ctx, n.name);
      yield ctx.env;
      return;
    }
    case "Bind": {
      for (const _ of matchNode(n.pat, val, ctx)) {
        const ok = ctx.env.bindOrCheck(n.name, val, ctx.opts);
        if (!ok) continue;
        recordVarOcc(ctx, n.name);
        yield ctx.env;
      }
      return;
    }

    /* ---- Boolean combinators ---- */
    case "Alt": {
      // left-first; snapshot varOcc to handle backtracking
      // Each option gets a fresh start from current varOcc state
      const baseSnap = snapshotVarOcc(ctx.varOcc);

      for (const _ of matchNode(n.options[0], val, ctx)) {
        yield _;
      }
      // Rollback any pollution from options[0] before trying options[1]
      rollbackVarOcc(ctx.varOcc, baseSnap);

      for (const _ of matchNode(n.options[1], val, ctx)) {
        yield _;
      }
      // Rollback to clean state before returning
      rollbackVarOcc(ctx.varOcc, baseSnap);
      return;
    }
    case "And": {
      // sequential, same value
      function* chain(i, v) {
        if (i === n.parts.length) { yield ctx.env; return; }
        for (const _ of matchNode(n.parts[i], v, ctx)) {
          yield* chain(i + 1, v);
          // Env is trail-based, backtracking happens naturally via generator unwinding.
        }
      }
      yield* chain(0, val);
      return;
    }
    case "Adj": {
      // Outside arrays/sets/objects, adjacency is not meaningful; treat as And on same value for robustness.
      function* chain(i, v) {
        if (i === n.elems.length) { yield ctx.env; return; }
        for (const _ of matchNode(n.elems[i], v, ctx)) {
          yield* chain(i + 1, v);
        }
      }
      yield* chain(0, val);
      return;
    }
    case "Group": {
      yield* matchNode(n.sub, val, ctx);
      return;
    }
    case "Quant": {
      const { min, max, greedy } = n;
      const sub = n.sub;
      function* rep(k, v) {
        if (k >= min) {
          // Option to stop
          if (!greedy) yield ctx.env;
          else if (k >= max) { yield ctx.env; return; }
        }
        if (k === max) { if (!greedy) return; else return; }

        // Try to take one more
        for (const _ of matchNode(sub, v, ctx)) {
          if (greedy) {
            yield* rep(k + 1, v);
          } else {
            // after yielding stop, try more
            yield* rep(k + 1, v);
          }
        }
        if (k >= min && greedy === true) {
          // Stopping option (for greedy after trying more)
          yield ctx.env;
        }
      }
      yield* rep(0, val);
      return;
    }

    /* ---- Assertions ---- */
    case "Assert": {
      const shadow = new Env(Object.fromEntries(ctx.env.map.entries()));
      const shadowCtx = { ...ctx, env: shadow };
      let ok = false;
      for (const _ of matchNode(n.pat, val, shadowCtx)) { ok = true; break; }
      if ((n.kind === "pos" && ok) || (n.kind === "neg" && !ok)) {
        yield ctx.env;
      }
      return;
    }

    /* ---- Arrays (anchored by default; Spread = _*?) ---- */
    case "Array": {
      if (!isArr(val)) return;
      // Build element program
      const elems = n.elems.slice();
      // Lower Spread elements to Quant(Any, {0,Inf}, lazy)
      const lowered = elems.map(e => e.type === "Spread"
        ? { type: "Quant", sub: { type: "Any", span: e.span }, min: 0, max: Infinity, greedy: false, span: e.span }
        : e);

      function* matchFrom(i, j) {
        if (i === lowered.length) {
          // Anchoring: arrays are anchored, must consume all elements
          if (j === val.length) {
            yield ctx.env;
          }
          return;
        }
        const el = lowered[i];
        // Special case for ReplaceSlice: try any length slice (≥0) that matches its target
        if (el.type === "ReplaceSlice") {
          // Try slice lengths from 0..remaining (non-greedy)
          for (let k = j; k <= val.length; k++) {
            // Bind current slice window to target pattern
            const subArr = val.slice(j, k);
            for (const _ of matchNode(el.target, subArr, ctx)) {
              // capture slice
              ctx.captures.arrSlices.push(makeArraySlice(val, j, k));
              yield* matchFrom(i + 1, k);
              ctx.captures.arrSlices.pop();
            }
          }
          return;
        }

        // Special case for Assert: check current element without consuming
        if (el.type === "Assert") {
          if (j >= val.length) return;
          for (const _ of matchNode(el, val[j], ctx)) {
            yield* matchFrom(i + 1, j); // advance pattern but NOT position
          }
          return;
        }

        // Special case for Group(Adj) or bare Adj: match subsequence
        if (el.type === "Adj" || (el.type === "Group" && el.sub.type === "Adj")) {
          const adjNode = el.type === "Adj" ? el : el.sub;
          const seqLen = adjNode.elems.length;
          if (j + seqLen > val.length) return; // Not enough elements

          // Match each element in the adjacency sequence
          function* matchAdj(elemIdx, pos) {
            if (elemIdx === seqLen) {
              // All elements matched - continue from next position
              yield* matchFrom(i + 1, pos);
              return;
            }

            // Match current element of the subsequence
            ctx.path.push({ kind: "array-slice", ref: val, start: pos, end: pos + 1 });
            const snap = snapshotVarOcc(ctx.varOcc);
            for (const _ of matchNode(adjNode.elems[elemIdx], val[pos], ctx)) {
              yield* matchAdj(elemIdx + 1, pos + 1);
            }
            rollbackVarOcc(ctx.varOcc, snap);
            ctx.path.pop();
          }

          yield* matchAdj(0, j);
          return;
        }

        // Special case for Quant: consume multiple array elements
        if (el.type === "Quant") {
          const { min, max, greedy, sub } = el;
          const maxReps = Math.min(max, val.length - j);

          // Match 'count' consecutive elements with sub-pattern, threading environment
          function* matchReps(count, pos) {
            if (count === 0) {
              yield* matchFrom(i + 1, pos);
              return;
            }
            if (pos >= val.length) return;

            // Match current element and recurse for remaining count
            for (const _ of matchNode(sub, val[pos], ctx)) {
              yield* matchReps(count - 1, pos + 1);
            }
          }

          // Try different repetition counts based on greedy/lazy
          if (greedy) {
            for (let reps = maxReps; reps >= min; reps--) {
              yield* matchReps(reps, j);
            }
          } else {
            for (let reps = min; reps <= maxReps; reps++) {
              yield* matchReps(reps, j);
            }
          }
          return;
        }

        // Special case for Bind with array slice patterns
        if (el.type === "Bind") {
          const pat = el.pat;

          // Case 1: $x:(sequence) - fixed-length slice binding
          if (pat.type === "Adj" || (pat.type === "Group" && pat.sub && pat.sub.type === "Adj")) {
            const adjNode = pat.type === "Adj" ? pat : pat.sub;
            const seqLen = adjNode.elems.length;
            if (j + seqLen > val.length) return; // Not enough elements

            // Match each element in the sequence
            function* matchSeq(elemIdx, pos) {
              if (elemIdx === seqLen) {
                // All elements matched - bind to slice
                const slice = val.slice(j, pos);
                const ok = ctx.env.bindOrCheck(el.name, slice, ctx.opts);
                if (!ok) return;

                // Record occurrence
                const sliceRef = { kind: "array-slice", ref: val, start: j, end: pos };
                const occArr = ctx.varOcc.get(el.name);
                if (occArr) {
                  occArr.push(sliceRef);
                  yield* matchFrom(i + 1, pos);
                  occArr.pop();
                } else {
                  ctx.varOcc.set(el.name, [sliceRef]);
                  yield* matchFrom(i + 1, pos);
                  ctx.varOcc.delete(el.name);
                }
                return;
              }

              const elem = adjNode.elems[elemIdx];

              // Handle Quant elements specially - they can match variable numbers of elements
              if (elem.type === "Quant") {
                const { min, max, greedy, sub } = elem;
                const maxReps = Math.min(max, val.length - pos);

                function* matchReps(count, curPos) {
                  if (count === 0) {
                    yield* matchSeq(elemIdx + 1, curPos);
                    return;
                  }
                  if (curPos >= val.length) return;

                  ctx.path.push({ kind: "array-slice", ref: val, start: curPos, end: curPos + 1 });
                  for (const _ of matchNode(sub, val[curPos], ctx)) {
                    yield* matchReps(count - 1, curPos + 1);
                  }
                  ctx.path.pop();
                }

                if (greedy) {
                  for (let reps = maxReps; reps >= min; reps--) {
                    yield* matchReps(reps, pos);
                  }
                } else {
                  for (let reps = min; reps <= maxReps; reps++) {
                    yield* matchReps(reps, pos);
                  }
                }
                return;
              }

              // Normal element: match single array element
              ctx.path.push({ kind: "array-slice", ref: val, start: pos, end: pos + 1 });
              const snap = snapshotVarOcc(ctx.varOcc);
              for (const _ of matchNode(elem, val[pos], ctx)) {
                yield* matchSeq(elemIdx + 1, pos + 1);
              }
              rollbackVarOcc(ctx.varOcc, snap);
              ctx.path.pop();
            }

            yield* matchSeq(0, j);
            return;
          }

          // Case 2: $x:pat* or $x:pat+ - variable-length slice binding via quantifier
          if (pat.type === "Quant" || pat.type === "Spread" || (pat.type === "Group" && pat.sub && (pat.sub.type === "Quant" || pat.sub.type === "Spread"))) {
            const innerPat = pat.type === "Group" ? pat.sub : pat;
            const quantPat = innerPat.type === "Spread"
              ? { type: "Quant", sub: { type: "Any", span: innerPat.span }, min: 0, max: Infinity, greedy: false, span: innerPat.span }
              : innerPat;

            const { min, max, greedy, sub } = quantPat;
            const maxReps = Math.min(max, val.length - j);

            // Match 'count' consecutive elements, then bind to slice
            function* matchSliceReps(count, pos) {
              if (count === 0) {
                // Bind variable to the slice
                const slice = val.slice(j, pos);
                const ok = ctx.env.bindOrCheck(el.name, slice, ctx.opts);
                if (!ok) return;

                // Record occurrence
                const sliceRef = { kind: "array-slice", ref: val, start: j, end: pos };
                const occArr = ctx.varOcc.get(el.name);
                if (occArr) {
                  occArr.push(sliceRef);
                  yield* matchFrom(i + 1, pos);
                  occArr.pop();
                } else {
                  ctx.varOcc.set(el.name, [sliceRef]);
                  yield* matchFrom(i + 1, pos);
                  ctx.varOcc.delete(el.name);
                }
                return;
              }
              if (pos >= val.length) return;

              // Match current element
              ctx.path.push({ kind: "array-slice", ref: val, start: pos, end: pos + 1 });
              for (const _ of matchNode(sub, val[pos], ctx)) {
                yield* matchSliceReps(count - 1, pos + 1);
              }
              ctx.path.pop();
            }

            // Try different repetition counts based on greedy/lazy
            if (greedy) {
              for (let reps = maxReps; reps >= min; reps--) {
                yield* matchSliceReps(reps, j);
              }
            } else {
              for (let reps = min; reps <= maxReps; reps++) {
                yield* matchSliceReps(reps, j);
              }
            }
            return;
          }

          // Case 3: $x:singleton - binds to single element, fall through to normal handling
        }

        // Normal element: match single array element
        if (j >= val.length) return;
        // Push a concrete ref for breadcrumb and var occurrence capture
        ctx.path.push({ kind: "array-slice", ref: val, start: j, end: j + 1 });
        const snap = snapshotVarOcc(ctx.varOcc);
        for (const _ of matchNode(el, val[j], ctx)) {
          yield* matchFrom(i + 1, j + 1);
        }
        rollbackVarOcc(ctx.varOcc, snap);
        ctx.path.pop();
      }

      yield* matchFrom(0, 0);
      return;
    }

    /* ---- Objects (unordered, overlapping kv; counts post-check) ---- */
    case "Object": {
      yield* matchObjectLike(n, val, ctx, isObj);
      return;
    }

    /* ---- Maps (same semantics as Object, but for Map instances) ---- */
    case "Map": {
      yield* matchObjectLike(n, val, ctx, isMap);
      return;
    }

    /* ---- Sets (order-insensitive) ---- */
    case "Set": {
      if (!isSet(val)) return;
      const elems = Array.from(val);
      // Greedy try: backtracking matching of pattern members to set elems
      const pats = n.members.filter(m => m.type !== "Spread");
      const hasSpread = n.members.some(m => m.type === "Spread");
      const used = new Array(elems.length).fill(false);

      function* assign(i) {
        if (i === pats.length) {
          // Anchoring: if no spread, all elements must be matched
          if (!hasSpread) {
            const allUsed = used.every(u => u);
            if (!allUsed) return;
          }
          yield ctx.env;
          return;
        }
        for (let j = 0; j < elems.length; j++) {
          if (used[j]) continue;
          used[j] = true;
          for (const _ of matchNode(pats[i], elems[j], ctx)) {
            yield* assign(i + 1);
          }
          used[j] = false;
        }
      }
      yield* assign(0);
      return;
    }

    /* ---- Atoms ---- */
    case "Any":      yield ctx.env; return;
    case "Number":   if (atomEqNumber(n.value, val)) yield ctx.env; return;
    case "Bool":     if (atomEqBoolean(n.value, val)) yield ctx.env; return;
    case "String":   if (atomEqString(n.value, val)) yield ctx.env; return;
    case "Regex":    if (regexFull(n.body, n.flags || "", val)) yield ctx.env; return;

    /* ---- Replacement slice (in arrays) ---- */
    case "ReplaceSlice": {
      // Handled inside Array case as a special element; here allow matching against
      // a VALUE that is itself an array slice (when used outside arrays).
      if (!isArr(val)) return;
      // Treat as matching any subarray non-greedily
      for (let end = 0; end <= val.length; end++) {
        const sub = val.slice(0, end);
        for (const _ of matchNode(n.target, sub, ctx)) {
          ctx.captures.arrSlices.push(makeArraySlice(val, 0, end));
          yield ctx.env;
          ctx.captures.arrSlices.pop();
        }
      }
      return;
    }

    default:
      // Dot should be lowered away in objects; if it remains elsewhere, reject.
      return;
  }
}

// Key-pattern matcher (kPat against key). Supports atoms, Var/Bind, Alt/And/Group/Quant, Regex, String, Any.
function keyMatches(kPat, key, ctx) {
  let ok = false;
  for (const _ of matchNode(kPat, key, ctx)) { ok = true; break; }
  return ok;
}

/**
 * Record a variable occurrence for the current location (top of ctx.path),
 * or a generic value ref if no path info exists.
 * @param {{varOcc: Map<string, any[]>, path: any[]}} ctx
 * @param {string} name
 */
function recordVarOcc(ctx, name) {
  let arr = ctx.varOcc.get(name);
  if (!arr) { arr = []; ctx.varOcc.set(name, arr); }
  const top = ctx.path[ctx.path.length - 1];
  if (top) arr.push(top);
  else arr.push({ kind: "value", ref: undefined, path: [] });
}

/**
 * Snapshot varOcc lengths to enable rollback on backtracking.
 * @param {Map<string, any[]>} varOcc
 * @returns {Map<string, number>}
 */
function snapshotVarOcc(varOcc) {
  const snapshot = new Map();
  for (const [name, arr] of varOcc.entries()) {
    snapshot.set(name, arr.length);
  }
  return snapshot;
}

/**
 * Rollback varOcc to a previous snapshot.
 * @param {Map<string, any[]>} varOcc
 * @param {Map<string, number>} snapshot
 */
function rollbackVarOcc(varOcc, snapshot) {
  // Trim arrays back to snapshot lengths
  for (const [name, len] of snapshot.entries()) {
    const arr = varOcc.get(name);
    if (arr) arr.length = len;
  }
  // Remove any new keys that weren't in snapshot
  for (const name of varOcc.keys()) {
    if (!snapshot.has(name)) {
      varOcc.delete(name);
    }
  }
}

/* ============================== Public matching API ============================== */

/**
 * Generate Solution objects for logical or scan modes.
 * @param {object} ast
 * @param {any} input
 * @param {{envSeed?: Record<string, any>, semOpts?: import('./semantics.js').SemanticsOptions, mode?: "logical"|"scan"}} opts
 */
export function* matchAll(ast, input, opts = {}) {
  const mode = opts.mode || "logical";
  const semOpts = opts.semOpts || undefined;
  if (mode === "logical") {
    const baseCtx = {
      env: new Env(opts.envSeed || null),
      opts: semOpts,
      path: [],
      varOcc: new Map(),
      captures: { arrSlices: [], objKeys: [], objVals: [] },
    };
    for (const _ of matchNode(ast, input, baseCtx)) {
      yield makeSolution(baseCtx.env, baseCtx.varOcc, baseCtx.path);
      // backtracking will naturally roll env; varOcc must be cleared per solution
      baseCtx.varOcc = new Map();
    }
    return;
  }
  // scan mode
  const results = [];
  traverseAll(input, [], (v, path) => {
    const baseCtx = {
      env: new Env(opts.envSeed || null),
      opts: semOpts,
      path: path.slice(),
      varOcc: new Map(),
      captures: { arrSlices: [], objKeys: [], objVals: [] },
    };
    for (const _ of matchNode(ast, v, baseCtx)) {
      results.push(makeSolution(baseCtx.env, baseCtx.varOcc, baseCtx.path));
      baseCtx.varOcc = new Map();
    }
  });
  yield* results;
}

/* ============================== Replacement application ============================== */

function applyReplacements(root, captures, replacement) {
  // Build immutable copy with non-overlapping edits.
  // Strategy:
  //  - Array slices: sort by (array identity, start). Apply left→right, skipping overlaps.
  //  - Object keys: change key names (if replacement is string or via fn) — here we’ll
  //    restrict replacement to values (ReplaceVal) for safety, and treat ReplaceKey as
  //    replacing the VALUE at those keys (common redaction use). If you truly want key
  //    renames, wire in a policy here.
  //  - Object values: straightforward replacement at (obj,key).
  const arrEdits = [];
  for (const sl of captures.arrSlices) {
    arrEdits.push({ kind: "arr", ref: sl.ref, start: sl.start, end: sl.end });
  }
  const valEdits = [];
  for (const v of captures.objVals) {
    valEdits.push({ kind: "oval", ref: v.ref, key: v.key });
  }
  const keyEdits = [];
  for (const ks of captures.objKeys) {
    for (const k of ks.keys) keyEdits.push({ kind: "okey", ref: ks.ref, key: k });
  }

  // We treat replacement as:
  //  - constant value, or
  //  - function (scope) => value  (scope provided by caller’s find loop)
  const constValue = replacement;

  // Shallow clone root and mutate copies along the way
  function cloneDeepWithEdits(node) {
    if (isArr(node)) {
      // Collect edits targeting this array
      const edits = arrEdits.filter(e => e.ref === node)
                            .sort((a, b) => a.start - b.start);
      if (edits.length === 0) return node;
      const out = node.slice();
      let shift = 0;
      const applied = [];
      for (const e of edits) {
        // Skip if overlaps previously applied
        if (applied.some(p => !(e.end <= p.start || e.start >= p.end))) continue;
        const repl = typeof constValue === "function" ? constValue() : constValue;
        out.splice(e.start + shift, e.end - e.start, repl);
        applied.push(e);
        shift += 1 - (e.end - e.start);
      }
      return out;
    }
    if (isObj(node)) {
      const out = { ...node };
      for (const e of valEdits) {
        if (e.ref === node && Object.prototype.hasOwnProperty.call(out, e.key)) {
          out[e.key] = (typeof constValue === "function" ? constValue() : constValue);
        }
      }
      // Key edits: by default redact values at these keys (safer)
      for (const e of keyEdits) {
        if (e.ref === node && Object.prototype.hasOwnProperty.call(out, e.key)) {
          out[e.key] = (typeof constValue === "function" ? constValue() : constValue);
        }
      }
      return out;
    }
    if (isMap(node)) {
      const out = new Map(node);
      for (const e of valEdits) {
        if (e.ref === node && out.has(e.key)) {
          out.set(e.key, (typeof constValue === "function" ? constValue() : constValue));
        }
      }
      for (const e of keyEdits) {
        if (e.ref === node && out.has(e.key)) {
          out.set(e.key, (typeof constValue === "function" ? constValue() : constValue));
        }
      }
      return out;
    }
    if (isSet(node)) {
      return new Set(node); // no edits defined for sets
    }
    return node;
  }

  return cloneDeepWithEdits(root);
}

/* ============================== Public API (full) ============================== */

export class Pattern {
  constructor(source, options = {}) {
    this.source = String(source);
    this.options = options;
    const ast0 = parseAndValidate(this.source);
    this._advanced = needsAdvanced(ast0);
    if (!this._advanced) {
      // Delegate to M3 engine
      this._core = new CorePattern(this.source, options);
      return;
    }
    // For advanced: lower vertical and keep AST
    this._ast = lowerVerticalEverywhere(ast0);
  }

  matches(value, opts = {}) {
    if (!this._advanced) return this._core.matches(value, opts);
    const env = new Env(opts.initialEnv || null);
    const ctx = { env, path: [], captures: { arrSlices: [], objKeys: [], objVals: [] }, opts };
    for (const _ of matchNode(this._ast, value, ctx)) return true;
    return false;
  }

  *find(value, opts = {}) {
    if (!this._advanced) {
      yield* this._core.find(value, opts);
      return;
    }
    const env = new Env(opts.initialEnv || null);
    const ctx = { env, path: [], captures: { arrSlices: [], objKeys: [], objVals: [] }, opts };
    for (const _ of matchNode(this._ast, value, ctx)) {
      yield { scope: Object.fromEntries(env.map.entries()), captures: { ...ctx.captures } };
    }
  }

  replaceAll(value, replacement, opts = {}) {
    // Apply the pattern repeatedly; for simplicity we take the first match scope
    // (if you need multi-match application on nested structures, expose a walker).
    let out = value;
    for (const m of this.find(value, opts)) {
      out = applyReplacements(out, m.captures, typeof replacement === "function"
        ? () => replacement(m.scope)
        : replacement);
      // Single-application semantics: if you need global walk, call multiple times or implement a deep findAll.
      break;
    }
    return out;
  }
}

// Factory staying consistent with engine.js
export function compile(source, options) {
  return new Pattern(source, options);
}
