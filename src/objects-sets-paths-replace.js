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
//   means every input key is “covered” by at least one kv-pattern (unless `...`).
// • Counts `k:v #{m,n}` are post-checks over keys satisfying both k and v.
// • Sets use order-insensitive bipartite matching; extras allowed only with
//   set-level spread `...` (sugar for “allow extras”).
// • Replacement: exactly one `>>…<<` overall (enforced by validator). We support
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
    case "Set":
    case "Dot":
    case "IndexedPath":
    case "ReplaceSlice":
    case "ReplaceKey":
    case "ReplaceVal":
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

// Lower vertical key paths inside Object kvs: k1.k2.k3 : v  ⇒  k1 : { k2.k3 : v } (anchored)
// Also handles indexed paths: a[$x].c : v  ⇒  a : { $x : { c : v } } (anchored)
function lowerVerticalInObject(obj) {
  const lowerDot = (kPat, vPat) => {
    // kPat is a Dot-chain or IndexedPath; split leftmost and rest
    const peel = (k) => {
      if (k.type === "Dot") return [k.left, k.right];
      if (k.type === "IndexedPath") return [k.obj, k.index];
      return [k, null];
    };
    const [left, rest] = peel(kPat);
    if (!rest) return { kPat: left, vPat };
    // Build nested object on right: { rest : vPat } (anchored), then recurse
    const innerKV = { type: "Object", span: vPat.span ?? kPat.span, anchored: true, hasSpread: false, typeGuard: null,
      kvs: [ { kPat: rest, vPat, count: null } ] };
    return lowerDot(left, innerKV);
  };

  const kvs = [];
  for (const kv of obj.kvs) {
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

// Transform AST: apply vertical lowering to all nested Objects.
function lowerVerticalEverywhere(n) {
  if (!n || typeof n !== "object") return n;
  switch (n.type) {
    case "Object": {
      const loweredSelf = lowerVerticalInObject(n);
      return { ...loweredSelf, kvs: loweredSelf.kvs.map(kv => {
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

/* ============================== Interpreter core ============================== */

function* matchNode(n, val, ctx) {
  // ctx: { env: Env, path: any[], captures: {arrSlices:[], objKeys:[], objVals:[]}, opts }
  switch (n.type) {
    /* ---- Boolean combinators ---- */
    case "Alt": {
      // left-first
      yield* matchNode(n.options[0], val, ctx);
      yield* matchNode(n.options[1], val, ctx);
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

        // Normal element: match single array element
        if (j >= val.length) return;
        for (const _ of matchNode(el, val[j], ctx)) {
          yield* matchFrom(i + 1, j + 1);
        }
      }

      yield* matchFrom(0, 0);
      return;
    }

    /* ---- Objects (unordered, overlapping kv; counts post-check) ---- */
    case "Object": {
      if (!(isObj(val) || isMap(val))) return;
      const cov = new Coverage(val);
      // First pass: evaluate all explicit kv patterns (non-consuming, independent).
      for (const kv of n.kvs) {
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
          for (const _ of matchNode(kv.vPat, getValue(val, k), ctx)) {
            cov.add(k);
            okThisKV = true;
            // Do NOT break; overlapping is allowed, but we only need at least one success
            break;
          }
          if (okThisKV) break;
        }
        if (!okThisKV) return;
      }

      // Counts (post-check, non-consuming)
      for (const kv of n.kvs) {
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

    /* ---- Bindings ---- */
    case "Var": {
      if (!ctx.env.bindOrCheck(n.name, val)) return;
      yield ctx.env;
      return;
    }
    case "Bind": {
      for (const _ of matchNode(n.pat, val, ctx)) {
        if (!ctx.env.bindOrCheck(n.name, val)) continue;
        yield ctx.env;
      }
      return;
    }
    case "BindEq": {
      // Evaluate both sides to ensure vars exist/are compatible
      for (const _ of matchNode(n.left, val, ctx)) {
        for (const __ of matchNode(n.right, val, ctx)) {
          const a = ctx.env.get(n.left.name), b = ctx.env.get(n.right.name);
          if (deepEq(a, b)) yield ctx.env;
        }
      }
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
