// engine.js
// Milestone 3: minimal VM + compiler subset.
// Features:
//  - Atoms: Number/Bool/String/Regex, Any (_)
//  - Vars & Bind/BindEq
//  - Groups, Alternation (|), Conjunction (&)
//  - Quantifiers (* + ? {m,n}) on any subpattern
//  - Arrays (anchored-by-default), including lazy spread "..." (as _*?)
//  - Lookaheads (?=p) (?!p) — shadow execution, no binding commits
//
// Not yet in this milestone: Objects, Sets, Vertical paths (Dot), Replacement.
// Those arrive in Milestone 4.
//
// Design:
//  - parseAndValidate(source) → AST (syntax.js)
//  - compile(AST) → { code, pool } bytecode
//  - run(code, pool, value, opts) → iterator of matches (env snapshots)
//  - Pattern API: matches(value), find(value, {initialEnv})
//
// Bytecode (compact, VM-friendly). State includes:
//  ip        - instruction pointer
//  val       - current value being matched
//  env       - binding environment with trail (from semantics.js)
//  arrStack  - stack of {arr, idx} for array contexts
//  choice    - backtrack stack of frames (ip, val, envTrailLen, arrStackSnapshot)
//  save      - auxiliary save/rollback stack for explicit SAVE/ROLLBACK pairs (optional in this subset)

import { parseAndValidate } from "./syntax.js";
import {
  Semantics,
  Env,
  isArr,
  isObj,
  isMap,
  isSet,
  coerceNumber,
  atomEqNumber,
  atomEqBoolean,
  atomEqString,
  regexFull,
  deepEq,
} from "./semantics.js";

/* ============================== Opcodes ============================== */

const OP = Object.freeze({
  // flow
  JMP:        1,
  SPLIT:      2,  // push alt(ipB), jump ipA
  FAIL:       3,  // backtrack (or hard fail if none)
  HALT_OK:    4,  // success: yield match (used by top-level)

  // env save/rollback (rarely needed in this subset thanks to choice frames)
  SAVE:       10,
  ROLLBACK:   11,
  COMMIT:     12,

  // atom/guards
  ANY:        20,
  NUM_EQ:     21, // poolIdx (number)
  BOOL_EQ:    22, // poolIdx (bool)
  STR_EQ:     23, // poolIdx (string)
  REGEX:      24, // poolIdx {body,flags}

  // variables
  VAR_CHECK_OR_BIND: 30, // poolIdx(name string) : bind if unbound else deepEq check
  VARS_EQ:           31, // nameA, nameB (poolIdx each)

  // lookaheads (exec block in shadow env; no commit)
  ASSERT_POS: 40,   // addr
  ASSERT_NEG: 41,   // addr

  // arrays
  ENTER_ARR:  50,   // ensure val is array; push arr frame (idx=0)
  ELEM_BEGIN: 51,   // set val = arr[idx]
  ELEM_END:   52,   // if element matched → idx++
  ARR_END_ANCHORED: 53, // require idx == arr.length
  ARR_SPREAD_LAZY:  54, // non-greedy wildcard over elements: try 0, then 1, 2, ...

  // meta
  NOOP:       99,
});

/* ============================== Compiler ============================== */

class Compiler {
  constructor() {
    this.code = [];
    this.pool = [];        // constants pool
    this.poolMap = new Map();
  }

  poolIndex(v) {
    const k = typeof v === "object" ? JSON.stringify(v) : `:${typeof v}:${v}`;
    if (this.poolMap.has(k)) return this.poolMap.get(k);
    const idx = this.pool.length;
    this.pool.push(v);
    this.poolMap.set(k, idx);
    return idx;
  }

  emit(op, a = 0, b = 0, c = 0) {
    this.code.push(op, a, b, c);
    return this.code.length - 4;
  }

  patchAt(pos, a, b = undefined, c = undefined) {
    this.code[pos + 1] = a;
    if (b !== undefined) this.code[pos + 2] = b;
    if (c !== undefined) this.code[pos + 3] = c;
  }

  // Entry
  compile(ast) {
    // Top-level sequence: pattern, HALT_OK
    this.compileNode(ast, { context: "top" });
    this.emit(OP.HALT_OK);
    return { code: new Int32Array(this.code), pool: this.pool };
  }

  // Core dispatcher
  compileNode(n, meta) {
    switch (n.type) {
      // Boolean ops
      case "Alt":      return this.compileAlt(n, meta);
      case "And":      return this.compileAnd(n, meta);

      // Adjacency: only valid inside arrays in this milestone; we rely on Array compiler to inline.
      case "Adj":
        // Fallback: treat adjacency as logical AND (same value) for robustness.
        // (Real adjacency is handled by Array compilation.)
        n.elems.forEach(el => this.compileNode(el, meta));
        return;

      // Groups/Quantifiers
      case "Group":    return this.compileNode(n.sub, meta);
      case "Quant":    return this.compileQuant(n, meta);

      // Arrays (anchored; 'Spread' handled inside)
      case "Array":    return this.compileArray(n, meta);

      // Lookaheads
      case "Assert":   return this.compileAssert(n, meta);

      // Variables/bindings
      case "Var": {
        const nameIdx = this.poolIndex(n.name);
        this.emit(OP.VAR_CHECK_OR_BIND, nameIdx);
        return;
      }
      case "Bind": {
        // compile sub; then bind current val (the sub must have succeeded)
        this.compileNode(n.pat, meta);
        const nameIdx = this.poolIndex(n.name);
        this.emit(OP.VAR_CHECK_OR_BIND, nameIdx);
        return;
      }
      case "BindEq": {
        // Ensure two variables hold equal values
        this.compileNode(n.left, meta);   // establishes/reads left
        this.compileNode(n.right, meta);  // establishes/reads right
        const aIdx = this.poolIndex(n.left.name);
        const bIdx = this.poolIndex(n.right.name);
        this.emit(OP.VARS_EQ, aIdx, bIdx);
        return;
      }

      // Atoms
      case "Any":      this.emit(OP.ANY); return;
      case "Number":   this.emit(OP.NUM_EQ, this.poolIndex(n.value)); return;
      case "Bool":     this.emit(OP.BOOL_EQ, this.poolIndex(n.value)); return;
      case "String":   this.emit(OP.STR_EQ, this.poolIndex(n.value)); return;
      case "Regex":    this.emit(OP.REGEX, this.poolIndex({ body: n.body, flags: n.flags || "" })); return;

      // Not yet supported in milestone 3
      case "Object":
      case "Set":
      case "Dot":
      case "ReplaceSlice":
      case "ReplaceKey":
      case "ReplaceVal":
        throw new Error(`Compiler: node type '${n.type}' not yet supported in this milestone`);

      case "Spread":
        // As a standalone node (only meaningful inside arrays): compile to lazy spread
        this.emit(OP.ARR_SPREAD_LAZY);
        return;

      default:
        throw new Error(`Compiler: unknown node type '${n.type}'`);
    }
  }

  compileAlt(n, meta) {
    // SPLIT left, right
    //  emit split -> left
    //  left code
    //  JMP end
    // right:
    //  right code
    // end:
    const splitPos = this.emit(OP.SPLIT, 0, 0); // placeholders
    const leftStart = this.code.length;
    this.compileNode(n.options[0], meta);
    const jmpEnd = this.emit(OP.JMP, 0);
    const rightStart = this.code.length;
    this.patchAt(splitPos, leftStart, rightStart);
    this.compileNode(n.options[1], meta);
    const end = this.code.length;
    this.patchAt(jmpEnd, end);
  }

  compileAnd(n, meta) {
    // Just linearize: p1 then p2
    for (const p of n.parts) this.compileNode(p, meta);
  }

  compileQuant(n, meta) {
    // Greedy by default; lazy if !n.greedy
    // Implement via SPLIT-based repetition around subpattern.
    // Structure:
    //   count=0..∞ with bounds [min,max]
    //   For greedy: try to consume, else exit when >=min
    const { min, max } = n;
    const greedy = !!n.greedy;
    const sub = n.sub;

    // We'll unroll for min times, then for the remaining (max-min) we add optional reps.
    for (let i = 0; i < min; i++) this.compileNode(sub, meta);
    if (max === min) return;

    const reps = (max === Infinity) ? Infinity : (max - min);

    if (greedy) {
      // Greedy: (sub)* with a loop that prefers consuming
      // loopStart:
      //   SPLIT take, exit
      // take:
      //   sub
      //   JMP loopStart
      // exit:
      const loopStart = this.code.length;
      const splitPos = this.emit(OP.SPLIT, 0, 0);
      const takeStart = this.code.length;
      this.compileNode(sub, meta);
      this.emit(OP.JMP, loopStart);
      const exit = this.code.length;
      this.patchAt(splitPos, takeStart, exit);
    } else {
      // Lazy: prefer exit, backtrack to take another
      // loopStart:
      //   SPLIT exit, take
      // exit:
      //   (fall through)
      // take:
      //   sub
      //   JMP loopStart
      const loopStart = this.code.length;
      const splitPos = this.emit(OP.SPLIT, 0, 0);
      const exit = this.code.length;
      const takeStart = this.code.length;
      this.patchAt(splitPos, exit, takeStart);
      this.compileNode(sub, meta);
      this.emit(OP.JMP, loopStart);
    }
  }

  compileArray(n, meta) {
    // Arrays are anchored by default; elems evaluated left→right.
    // We support 'Spread' (lazy wildcard) anywhere among elems.
    this.emit(OP.ENTER_ARR);

    const elems = n.elems;

    for (let i = 0; i < elems.length; i++) {
      const el = elems[i];
      if (el.type === "Spread") {
        this.emit(OP.ARR_SPREAD_LAZY);
        continue;
      }
      // Element:
      this.emit(OP.ELEM_BEGIN);
      this.compileNode(el, { context: "array-elem" });
      this.emit(OP.ELEM_END);
    }

    // Anchoring: if there's ANY Spread, anchoring is satisfied automatically;
    // otherwise require idx == length.
    const hasSpread = elems.some(e => e.type === "Spread");
    if (!hasSpread) this.emit(OP.ARR_END_ANCHORED);
  }

  compileAssert(n, meta) {
    // Emit a block as a self-contained subprogram starting at 'addr'
    // ASSERT_POS addr: execute in shadow env, must succeed
    // ASSERT_NEG addr: execute in shadow env, must fail
    const op = n.kind === "pos" ? OP.ASSERT_POS : OP.ASSERT_NEG;
    // Reserve op with addr=0, then append subprogram and patch address
    const pos = this.emit(op, 0);
    const addr = this.code.length;
    this.compileNode(n.pat, meta);
    // Sub-blocks don't need a HALT; they just run and fall through
    this.patchAt(pos, addr);
  }
}

/* ============================== VM ============================== */

// Choice frame for backtracking
function makeFrame(ip, val, envTrail, arrStackSnapshot) {
  return { ip, val, envTrail, arrStackSnapshot };
}

// Snapshot helpers for arr stack
function snapshotArrStack(arrStack) {
  // shallow copy of frames with mutable idx value copied
  return arrStack.map(fr => ({ arr: fr.arr, idx: fr.idx }));
}
function restoreArrStack(dst, snap) {
  dst.length = 0;
  for (const fr of snap) dst.push({ arr: fr.arr, idx: fr.idx });
}

function* runVM(code, pool, value, opts = {}) {
  const env = new Env(opts.initialEnv || null);
  const choice = [];
  const arrStack = [];

  // Registers
  let ip = 0;
  let val = value;

  const next = () => code[ip++];
  const peek = () => code[ip];

  const fail = () => {
    // backtrack
    if (choice.length === 0) return false;
    const fr = choice.pop();
    ip = fr.ip;
    val = fr.val;
    env.rollback(fr.envTrail);
    restoreArrStack(arrStack, fr.arrStackSnapshot);
    return true;
  };

  while (true) {
    const op = next();

    switch (op) {
      case OP.NOOP: break;

      case OP.JMP: {
        const addr = next(); ip = addr;
        // skip arg cells
        next(); next();
        break;
      }

      case OP.SPLIT: {
        const a = next(), b = next();
        // push alternative (b)
        choice.push(makeFrame(b, val, env.snapshot(), snapshotArrStack(arrStack)));
        ip = a;
        // consume padding
        next();
        break;
      }

      case OP.FAIL: {
        // padding
        next(); next(); next();
        if (!fail()) return; // hard fail ends generator
        break;
      }

      case OP.SAVE: {
        // Not needed in this subset; kept for completeness
        // consume args
        next(); next(); next();
        break;
      }
      case OP.ROLLBACK: {
        // consume args
        next(); next(); next();
        env.rollback(env.snapshot()); // no-op snapshot here
        break;
      }
      case OP.COMMIT: {
        // consume args
        next(); next(); next();
        env.commit(env.snapshot()); // no-op in this subset
        break;
      }

      case OP.ANY: {
        // always succeeds
        next(); next(); next();
        break;
      }

      case OP.NUM_EQ: {
        const idx = next(); next(); next();
        if (!atomEqNumber(pool[idx], val)) {
          if (!fail()) return;
        }
        break;
      }

      case OP.BOOL_EQ: {
        const idx = next(); next(); next();
        if (!atomEqBoolean(pool[idx], val)) {
          if (!fail()) return;
        }
        break;
      }

      case OP.STR_EQ: {
        const idx = next(); next(); next();
        if (!atomEqString(pool[idx], val)) {
          if (!fail()) return;
        }
        break;
      }

      case OP.REGEX: {
        const idx = next(); next(); next();
        const { body, flags } = pool[idx];
        if (!regexFull(body, flags, val)) {
          if (!fail()) return;
        }
        break;
      }

      case OP.VAR_CHECK_OR_BIND: {
        const nameIdx = next(); next(); next();
        const name = pool[nameIdx];
        if (!env.bindOrCheck(name, val)) {
          if (!fail()) return;
        }
        break;
      }

      case OP.VARS_EQ: {
        const aIdx = next(), bIdx = next(); next();
        const aName = pool[aIdx], bName = pool[bIdx];
        const a = env.get(aName), b = env.get(bName);
        if (!deepEq(a, b)) {
          if (!fail()) return;
        }
        break;
      }

      case OP.ASSERT_POS: {
        const addr = next(); next(); next();
        // Shadow run: clone env read-only; do NOT commit bindings
        const shadowEnv = new Env(Object.fromEntries(env.map.entries()));
        // Run subprogram from addr with same val
        const ipSaved = ip, envTrailSaved = env.snapshot();
        const choiceSaved = choice.length;
        const arrSnap = snapshotArrStack(arrStack);

        // We implement a tiny nested VM call by creating a local run loop limited
        // to the block (which ends before it jumps back into caller).
        let ok = true;
        let ip2 = addr;
        while (ip2 < code.length) {
          const op2 = code[ip2++];
          // Minimal subset: we allow only atoms/ANY/regex/VAR_CHECK inside lookahead in this milestone.
          if (op2 === OP.ANY) {
            ip2 += 3; continue;
          } else if (op2 === OP.NUM_EQ) {
            const idx = code[ip2++]; ip2 += 2;
            if (!atomEqNumber(pool[idx], val)) { ok = false; break; }
          } else if (op2 === OP.BOOL_EQ) {
            const idx = code[ip2++]; ip2 += 2;
            if (!atomEqBoolean(pool[idx], val)) { ok = false; break; }
          } else if (op2 === OP.STR_EQ) {
            const idx = code[ip2++]; ip2 += 2;
            if (!atomEqString(pool[idx], val)) { ok = false; break; }
          } else if (op2 === OP.REGEX) {
            const idx = code[ip2++]; ip2 += 2;
            const { body, flags } = pool[idx];
            if (!regexFull(body, flags, val)) { ok = false; break; }
          } else if (op2 === OP.HALT_OK || op2 === OP.JMP || op2 === OP.SPLIT || op2 === OP.FAIL ||
                     op2 === OP.ENTER_ARR || op2 === OP.ELEM_BEGIN || op2 === OP.ELEM_END ||
                     op2 === OP.ARR_END_ANCHORED || op2 === OP.ARR_SPREAD_LAZY ||
                     op2 === OP.VAR_CHECK_OR_BIND || op2 === OP.VARS_EQ) {
            // For simplicity, bail on complex structures inside lookahead in this milestone.
            // We'll fully support them in M4. For now, treat as unsupported → failure to avoid false positives.
            ok = false; break;
          } else {
            // Unknown/unsupported in assert block
            ok = false; break;
          }
        }

        // Restore caller state (no changes), then check result
        ip = ipSaved;
        env.rollback(envTrailSaved);
        restoreArrStack(arrStack, arrSnap);
        if (!ok) {
          if (!fail()) return;
        }
        break;
      }

      case OP.ASSERT_NEG: {
        const addr = next(); next(); next();
        // In this milestone, treat ASSERT_NEG similarly by trying a simple atom subset.
        // If the simple run would succeed, we fail; otherwise we continue.
        // (Same constraints as ASSERT_POS)
        const shadowEnv = new Env(Object.fromEntries(env.map.entries()));
        const ipSaved = ip, envTrailSaved = env.snapshot();
        const arrSnap = snapshotArrStack(arrStack);
        let ok = true;
        let ip2 = addr;
        while (ip2 < code.length) {
          const op2 = code[ip2++];
          if (op2 === OP.ANY) { ip2 += 3; continue; }
          else if (op2 === OP.NUM_EQ) { const idx = code[ip2++]; ip2 += 2; if (!atomEqNumber(pool[idx], val)) { ok = false; break; } }
          else if (op2 === OP.BOOL_EQ) { const idx = code[ip2++]; ip2 += 2; if (!atomEqBoolean(pool[idx], val)) { ok = false; break; } }
          else if (op2 === OP.STR_EQ) { const idx = code[ip2++]; ip2 += 2; if (!atomEqString(pool[idx], val)) { ok = false; break; } }
          else if (op2 === OP.REGEX) { const idx = code[ip2++]; ip2 += 2; const {body,flags}=pool[idx]; if (!regexFull(body, flags, val)) { ok = false; break; } }
          else { ok = false; break; }
        }
        ip = ipSaved;
        env.rollback(envTrailSaved);
        restoreArrStack(arrStack, arrSnap);
        // Negative assert succeeds iff the block would FAIL
        if (ok) { // it would succeed → this negative assert fails
          if (!fail()) return;
        }
        break;
      }

      case OP.ENTER_ARR: {
        // ensure val is an array
        next(); next(); next();
        if (!isArr(val)) {
          if (!fail()) return;
          break;
        }
        arrStack.push({ arr: val, idx: 0 });
        break;
      }

      case OP.ELEM_BEGIN: {
        next(); next(); next();
        if (arrStack.length === 0) { if (!fail()) return; break; }
        const top = arrStack[arrStack.length - 1];
        if (top.idx >= top.arr.length) { if (!fail()) return; break; }
        // set current val to element
        // Save a backtrack in case element match fails: we need to restore val, idx unchanged will be handled by failure
        val = top.arr[top.idx];
        break;
      }

      case OP.ELEM_END: {
        next(); next(); next();
        if (arrStack.length === 0) { if (!fail()) return; break; }
        const top = arrStack[arrStack.length - 1];
        // element matched → advance idx
        top.idx++;
        // val remains as last element; not used until next ELEM_BEGIN
        break;
      }

      case OP.ARR_SPREAD_LAZY: {
        // Non-greedy wildcard over array elements:
        // Try to consume 0 elements; on backtrack, consume one and stay here.
        next(); next(); next();
        if (arrStack.length === 0) { if (!fail()) return; break; }
        const top = arrStack[arrStack.length - 1];

        // choice: (stay) vs (consume one and retry ARR_SPREAD_LAZY)
        // alt: consume path
        const ipAfter = ip;
        // Push alternative that consumes one element and re-enters spread if possible
        if (top.idx < top.arr.length) {
          const snap = makeFrame(ipAfter, val, env.snapshot(), snapshotArrStack(arrStack));
          // mutate the snapshot to represent 'consume one, then try again at this opcode'
          // We'll simulate by applying consumption immediately on resume:
          // We'll store a special marker by bumping idx in arr snapshot; but easier: we just push a frame
          // that resumes at this same opcode with idx+1 applied now:
          const snap2 = makeFrame(ipAfter, val, env.snapshot(), snapshotArrStack(arrStack));
          // consume one element now in the saved snapshot
          const last = snap2.arrStackSnapshot[snap2.arrStackSnapshot.length - 1];
          last.idx = Math.min(last.idx + 1, last.arr.length);
          choice.push(snap2);
        }
        // fast-path: take 0-consume and continue
        break;
      }

      case OP.ARR_END_ANCHORED: {
        next(); next(); next();
        if (arrStack.length === 0) { if (!fail()) return; break; }
        const top = arrStack[arrStack.length - 1];
        if (top.idx !== top.arr.length) {
          if (!fail()) return;
          break;
        }
        // pop array context at end of array pattern
        arrStack.pop();
        break;
      }

      case OP.HALT_OK: {
        // Yield a match (bindings snapshot) and then backtrack to find more, if any.
        next(); next(); next();
        // Build scope as plain object
        const scope = Object.fromEntries(env.map.entries());
        yield { scope };
        if (!fail()) return; // no more solutions
        break;
      }

      default: {
        // Unknown opcode: treat as failure
        // consume padding
        next(); next(); next();
        if (!fail()) return;
        break;
      }
    }
  }
}

/* ============================== Public API ============================== */

export class Pattern {
  constructor(source, options = {}) {
    this.source = String(source);
    this.options = options;
    const ast = parseAndValidate(this.source);
    const { code, pool } = new Compiler().compile(ast);
    this._code = code;
    this._pool = pool;
  }

  /** True/false match at root value. */
  matches(value, opts = {}) {
    for (const _ of runVM(this._code, this._pool, value, { initialEnv: opts.initialEnv })) {
      return true;
    }
    return false;
  }

  /** Iterate all matches (bindings) at root (milestone 3: root only). */
  *find(value, opts = {}) {
    yield* runVM(this._code, this._pool, value, { initialEnv: opts.initialEnv });
  }
}

// Convenience factory, similar to your examples
export function compile(source, options) {
  return new Pattern(source, options);
}
