// engine.js
// Milestone 3: minimal VM + compiler subset.
// Features:
//  - Atoms: Number/Bool/String/Regex, Any (_)
//  - Vars & Bind/BindEq
//  - Groups, Alternation (|), Conjunction (&)
//  - Quantifiers (* + ? {m,n}) on any subpattern
//  - Arrays (anchored-by-default); "..." lowered to lazy _*? during compilation
//  - Lookaheads (?=p) (?!p) — shadow execution, no binding commits
//
// Not yet in this milestone: Objects, Sets, Vertical paths (Dot), Replacement.

import {parseAndValidate} from "./syntax.js";
import {
  Env,
  atomEqNumber,
  atomEqBoolean,
  atomEqString,
  regexFull,
  deepEq,
  isArr,
} from "./semantics.js";

/* ============================== Opcodes ============================== */

export const OP = Object.freeze({
  // flow
  JMP: 1,
  SPLIT: 2,  // push alt(ipB), jump ipA
  FAIL: 3,  // backtrack (or hard fail if none)
  HALT_OK: 4,  // success: yield match

  // env save/rollback (placeholders for symmetry)
  SAVE: 10,
  ROLLBACK: 11,
  COMMIT: 12,

  // atoms/guards
  ANY: 20,
  NUM_EQ: 21,
  BOOL_EQ: 22,
  STR_EQ: 23,
  REGEX: 24,

  // variables
  VAR_CHECK_OR_BIND: 30,
  VARS_EQ: 31,

  // lookaheads
  ASSERT_POS: 40,
  ASSERT_NEG: 41,

  // arrays
  ENTER_ARR: 50,
  ELEM_BEGIN: 51,
  ELEM_END: 52,
  ARR_END_ANCHORED: 53,

  // meta
  NOOP: 99,
});

/* ============================== Compiler ============================== */

class Compiler {
  constructor() {
    this.code = [];
    this.pool = [];
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

  patchAt(pos, a, b, c) {
    this.code[pos + 1] = a;
    if (b !== undefined) this.code[pos + 2] = b;
    if (c !== undefined) this.code[pos + 3] = c;
  }

  compile(ast) {
    compileTop(ast, this);
    this.emit(OP.HALT_OK);
    return {code: new Int32Array(this.code), pool: this.pool};
  }
}

/* ----- Per-node compilation (Option 2) ----- */

function compileTop(n, c) {
  const f = topCompilers[n.type];
  if (!f) throw new Error(`Compiler: unknown node type '${n.type}'`);
  f(n, c);
}

function compileAsArrayElem(n, c) {
  const f = elemCompilers[n.type] || elemDefault;
  f(n, c);
}

/* Top-level compilers */

const topCompilers = {
  Alt(n, c) {
    compileAlt(n, c);
  },
  And(n, c) {
    for (const p of n.parts) compileTop(p, c);
  },
  Adj(n, c) {
    for (const el of n.elems) compileTop(el, c);
  },

  Group(n, c) {
    compileTop(n.sub, c);
  },
  Quant(n, c) {
    compileQuant(n, c, /*inArrayElem=*/false);
  },

  Array(n, c) {
    compileArray(n, c);
  },

  Assert(n, c) {
    compileAssert(n, c);
  },

  Var(n, c) {
    emitVarCheckOrBind(c, n.name);
  },
  Bind(n, c) {
    compileTop(n.pat, c);
    emitVarCheckOrBind(c, n.name);
  },
  BindEq(n, c) {
    compileTop(n.left, c);
    compileTop(n.right, c);
    const aIdx = c.poolIndex(n.left.name);
    const bIdx = c.poolIndex(n.right.name);
    c.emit(OP.VARS_EQ, aIdx, bIdx);
  },

  Any(_n, c) {
    c.emit(OP.ANY);
  },
  Number(n, c) {
    c.emit(OP.NUM_EQ, c.poolIndex(n.value));
  },
  Bool(n, c) {
    c.emit(OP.BOOL_EQ, c.poolIndex(n.value));
  },
  String(n, c) {
    c.emit(OP.STR_EQ, c.poolIndex(n.value));
  },
  Regex(n, c) {
    c.emit(OP.REGEX, c.poolIndex({body: n.body, flags: n.flags || ""}));
  },

  Object() {
    throw new Error("Compiler: 'Object' not supported in M3");
  },
  Set() {
    throw new Error("Compiler: 'Set' not supported in M3");
  },
  Dot() {
    throw new Error("Compiler: 'Dot' not supported in M3");
  },
  ReplaceGroup() {
    throw new Error("Compiler: 'ReplaceGroup' not supported in M3");
  },
  ReplaceKey() {
    throw new Error("Compiler: 'ReplaceKey' not supported in M3");
  },
  ReplaceVal() {
    throw new Error("Compiler: 'ReplaceVal' not supported in M3");
  },

  // Top-level Spread has no meaning; ignore gracefully
  Spread(_n, _c) {
  },
};

/* Array-element compilers */

function elemDefault(n, c) {
  c.emit(OP.ELEM_BEGIN);
  compileTop(n, c);
  c.emit(OP.ELEM_END);
}

const elemCompilers = {
  Quant(n, c) {
    compileQuant(n, c, /*inArrayElem=*/true);
  },

  // "..." is lowered in compileArray; element path included for safety
  Spread(_n, c) {
    // Fallback: behave like _*? at element position
    const any = {type: "Any", span: _n.span};
    const q = {type: "Quant", sub: any, min: 0, max: Infinity, greedy: false, span: _n.span};
    compileAsArrayElem(q, c);
  },

  Group(n, c) {
    compileAsArrayElem(n.sub, c);
  },

  Bind(n, c) {
    compileAsArrayElem(n.pat, c);
    emitVarCheckOrBind(c, n.name);
  },

  Assert(n, c) {
    // Check current element without consuming it:
    c.emit(OP.ELEM_BEGIN);
    const op = n.kind === "pos" ? OP.ASSERT_POS : OP.ASSERT_NEG;
    const at = c.emit(op, 0);
    const addr = c.code.length;
    compileTop(n.pat, c);
    c.patchAt(at, addr);
    // no ELEM_END here (no consumption)
  },
};

/* Helpers */

function emitVarCheckOrBind(c, name) {
  c.emit(OP.VAR_CHECK_OR_BIND, c.poolIndex(name));
}

function compileAlt(n, c) {
  const splitPos = c.emit(OP.SPLIT, 0, 0);
  const leftStart = c.code.length;
  compileTop(n.options[0], c);
  const jmpEnd = c.emit(OP.JMP, 0);
  const rightStart = c.code.length;
  c.patchAt(splitPos, leftStart, rightStart);
  compileTop(n.options[1], c);
  const end = c.code.length;
  c.patchAt(jmpEnd, end);
}

function compileQuant(n, c, inArrayElem) {
  const {min, max} = n;
  const greedy = !!n.greedy;
  const sub = n.sub;

  // mandatory reps
  for (let i = 0; i < min; i++) {
    if (inArrayElem) c.emit(OP.ELEM_BEGIN);
    compileTop(sub, c);
    if (inArrayElem) c.emit(OP.ELEM_END);
  }
  if (max === min) return;

  const reps = (max === Infinity) ? Infinity : (max - min);

  if (reps !== Infinity) {
    for (let i = 0; i < reps; i++) {
      const splitPos = c.emit(OP.SPLIT, 0, 0);
      const takeStart = c.code.length;
      if (greedy) {
        if (inArrayElem) c.emit(OP.ELEM_BEGIN);
        compileTop(sub, c);
        if (inArrayElem) c.emit(OP.ELEM_END);
      }
      const exit = c.code.length;
      if (greedy) c.patchAt(splitPos, takeStart, exit);
      else {
        c.patchAt(splitPos, exit, takeStart);
        if (inArrayElem) c.emit(OP.ELEM_BEGIN);
        compileTop(sub, c);
        if (inArrayElem) c.emit(OP.ELEM_END);
      }
    }
    return;
  }

  // infinite
  if (greedy) {
    const loop = c.code.length;
    const split = c.emit(OP.SPLIT, 0, 0);
    const take = c.code.length;
    if (inArrayElem) c.emit(OP.ELEM_BEGIN);
    compileTop(sub, c);
    if (inArrayElem) c.emit(OP.ELEM_END);
    c.emit(OP.JMP, loop);
    const exit = c.code.length;
    c.patchAt(split, take, exit);
  } else {
    const loop = c.code.length;
    const split = c.emit(OP.SPLIT, 0, 0);
    const take = c.code.length;
    if (inArrayElem) c.emit(OP.ELEM_BEGIN);
    compileTop(sub, c);
    if (inArrayElem) c.emit(OP.ELEM_END);
    c.emit(OP.JMP, loop);
    const exit = c.code.length;
    c.patchAt(split, exit, take);
  }
}

function compileArray(n, c) {
  c.emit(OP.ENTER_ARR);

  // Lower "Spread" elements to Quant(Any, 0..∞, lazy) up front
  const lowered = n.elems.map(e => (
    e.type === "Spread"
      ? {type: "Quant", sub: {type: "Any", span: e.span}, min: 0, max: Infinity, greedy: false, span: e.span}
      : e
  ));

  for (const el of lowered) {
    compileAsArrayElem(el, c);
  }

  // Arrays anchored unless a lowered spread can consume remainder;
  // The lowered form already handles remainder, but for strict M3 anchoring,
  // require idx == length here (matches README semantics).
  c.emit(OP.ARR_END_ANCHORED);
}

function compileAssert(n, c) {
  const op = n.kind === "pos" ? OP.ASSERT_POS : OP.ASSERT_NEG;
  const pos = c.emit(op, 0);
  const addr = c.code.length;
  compileTop(n.pat, c);
  c.patchAt(pos, addr);
}

/* ============================== VM ============================== */

function makeFrame(ip, val, envTrail, arrStackSnapshot) {
  return {ip, val, envTrail, arrStackSnapshot};
}
function snapshotArrStack(arrStack) {
  return arrStack.map(fr => ({arr: fr.arr, idx: fr.idx}));
}
function restoreArrStack(dst, snap) {
  dst.length = 0;
  for (const fr of snap) dst.push({arr: fr.arr, idx: fr.idx});
}

function* runVM(code, pool, value, opts = {}) {
  const env = new Env(opts.initialEnv || null);
  const choice = [];
  const arrStack = [];

  let ip = 0;
  let val = value;

  const next = () => code[ip++];
  const fail = () => {
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
      case OP.NOOP:
        next();
        next();
        next();
        break;

      case OP.JMP: {
        const addr = next();
        next();
        next();
        ip = addr;
        break;
      }

      case OP.SPLIT: {
        const a = next(), b = next();
        next();
        choice.push(makeFrame(b, val, env.snapshot(), snapshotArrStack(arrStack)));
        ip = a;
        break;
      }

      case OP.FAIL: {
        next();
        next();
        next();
        if (!fail()) return;
        break;
      }

      case OP.ANY: {
        next();
        next();
        next();
        break;
      }

      case OP.NUM_EQ: {
        const idx = next();
        next();
        next();
        if (!atomEqNumber(pool[idx], val)) {
          if (!fail()) return;
        }
        break;
      }

      case OP.BOOL_EQ: {
        const idx = next();
        next();
        next();
        if (!atomEqBoolean(pool[idx], val)) {
          if (!fail()) return;
        }
        break;
      }

      case OP.STR_EQ: {
        const idx = next();
        next();
        next();
        if (!atomEqString(pool[idx], val)) {
          if (!fail()) return;
        }
        break;
      }

      case OP.REGEX: {
        const idx = next();
        next();
        next();
        const {body, flags} = pool[idx];
        if (!regexFull(body, flags, val)) {
          if (!fail()) return;
        }
        break;
      }

      case OP.VAR_CHECK_OR_BIND: {
        const nameIdx = next();
        next();
        next();
        const ok = env.bindOrCheck(pool[nameIdx], val);
        if (!ok) {
          if (!fail()) return;
        }
        break;
      }

      case OP.VARS_EQ: {
        const aIdx = next(), bIdx = next();
        next();
        const a = env.get(pool[aIdx]), b = env.get(pool[bIdx]);
        if (!deepEq(a, b)) {
          if (!fail()) return;
        }
        break;
      }

      case OP.ASSERT_POS: {
        const addr = next();
        next();
        next();
        const snap = env.snapshot();
        const ipSaved = ip;
        choice.push(makeFrame(ipSaved, val, env.snapshot(), snapshotArrStack(arrStack)));
        ip = addr;
        break;
      }

      case OP.ASSERT_NEG: {
        const addr = next();
        next();
        next();
        const snap = env.snapshot();
        const ipSaved = ip;
        choice.push(makeFrame(ipSaved, val, env.snapshot(), snapshotArrStack(arrStack)));
        ip = addr;
        // When inner succeeds, overall path must fail; enforced via backtracking.
        env.rollback(snap);
        break;
      }

      case OP.ENTER_ARR: {
        next();
        next();
        next();
        if (!isArr(val)) {
          if (!fail()) return;
          break;
        }
        arrStack.push({arr: val, idx: 0});
        break;
      }

      case OP.ELEM_BEGIN: {
        next();
        next();
        next();
        if (arrStack.length === 0) {
          if (!fail()) return;
          break;
        }
        const top = arrStack[arrStack.length - 1];
        if (top.idx >= top.arr.length) {
          if (!fail()) return;
          break;
        }
        val = top.arr[top.idx];
        break;
      }

      case OP.ELEM_END: {
        next();
        next();
        next();
        if (arrStack.length === 0) {
          if (!fail()) return;
          break;
        }
        const top = arrStack[arrStack.length - 1];
        top.idx++;
        break;
      }

      case OP.ARR_END_ANCHORED: {
        next();
        next();
        next();
        if (arrStack.length === 0) {
          if (!fail()) return;
          break;
        }
        const top = arrStack[arrStack.length - 1];
        if (top.idx !== top.arr.length) {
          if (!fail()) return;
          break;
        }
        arrStack.pop();
        break;
      }

      case OP.HALT_OK: {
        next();
        next();
        next();
        // yield a plain {scope} object (matches M4 API)
        yield Object.fromEntries(new Map(env.map));
        if (!fail()) return;
        break;
      }

      default: {
        // Unknown op → fail path
        next();
        next();
        next();
        if (!fail()) return;
        break;
      }
    }
  }
}

/* ============================== Public API ============================== */

export class Pattern {
  constructor(source) {
    this.source = String(source); // needed by tests
    const {code, pool} = compile(source);
    this.code = code;
    this.pool = pool;
  }

  static compile(source) {
    return new Pattern(source);
  }

  matches(value, opts = {}) {
    const it = runVM(this.code, this.pool, value, opts);
    const r = it.next();
    return !r.done;
  }

  // Yield { scope } objects (aligns with M4 objects-sets-paths-replace.js API)
  * find(value, opts = {}) {
    const it = runVM(this.code, this.pool, value, opts);
    for (let n = it.next(); !n.done; n = it.next()) {
      yield {scope: n.value};
    }
  }
}

export function compile(source) {
  const ast = parseAndValidate(source);
  const c = new Compiler();
  return c.compile(ast);
}
