/**
 * Tendril v0.1.0
 * Structural pattern matching + relational logic for JSON-like graphs
 * @license MIT
 */

// src/tendril-util.js
function sameValueZero(a, b) {
  if (a === b)
    return true;
  return Number.isNaN(a) && Number.isNaN(b);
}
function deepEqual(a, b) {
  if (a === b)
    return true;
  if (a === null || b === null)
    return false;
  if (typeof a !== typeof b)
    return false;
  if (typeof a !== "object")
    return sameValueZero(a, b);
  if (Array.isArray(a)) {
    if (!Array.isArray(b))
      return false;
    if (a.length !== b.length)
      return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i]))
        return false;
    }
    return true;
  }
  if (Array.isArray(b))
    return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length)
    return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key))
      return false;
    if (!deepEqual(a[key], b[key]))
      return false;
  }
  return true;
}

// src/microparser.js
function tokenize(src) {
  const toks = [];
  let i = 0;
  const push = (k, v, len) => {
    toks.push({ k, v, pos: i, len });
    i += len;
  };
  const reWS = /\s+/y;
  const reNum = /-?\d+(\.\d+)?/y;
  const reId = /[A-Za-z_][A-Za-z0-9_]*/y;
  while (i < src.length) {
    reWS.lastIndex = i;
    if (reWS.test(src)) {
      i = reWS.lastIndex;
      continue;
    }
    const c = src[i], c2 = src.slice(i, i + 2), c3 = src.slice(i, i + 3);
    if (c2 === "//") {
      let j = i + 2;
      while (j < src.length && src[j] !== "\n")
        j++;
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1, out = "";
      while (j < src.length && src[j] !== q) {
        if (src[j] === "\\") {
          const { chr, adv } = readEsc(src, j + 1);
          out += chr;
          j += adv + 1;
        } else {
          out += src[j++];
        }
      }
      if (src[j] !== q)
        throw syntax(`unterminated string`, src, i);
      const strEnd = j + 1;
      if (src.slice(strEnd, strEnd + 2) === "/i") {
        push("ci", { lower: out.toLowerCase(), desc: src.slice(i, strEnd + 2) }, strEnd + 2 - i);
      } else {
        push("str", out, strEnd - i);
      }
      continue;
    }
    if (c === "/" && src[i + 1] !== "/") {
      let j = i + 1, inClass = false;
      while (j < src.length) {
        const ch = src[j];
        if (ch === "\\") {
          j += 2;
        } else if (ch === "[") {
          inClass = true;
          j++;
        } else if (ch === "]" && inClass) {
          inClass = false;
          j++;
        } else if (ch === "/" && !inClass) {
          break;
        } else {
          j++;
        }
      }
      if (j >= src.length)
        throw syntax(`unterminated regex literal`, src, i);
      const pattern = src.slice(i + 1, j);
      j++;
      const flagStart = j;
      while (j < src.length && /[a-z]/i.test(src[j]))
        j++;
      const flags = src.slice(flagStart, j);
      try {
        new RegExp(pattern, flags);
      } catch (e) {
        throw syntax(`invalid regex: /${pattern}/${flags}`, src, i);
      }
      if (flags.includes("g") || flags.includes("y")) {
        throw syntax(`Regex flags 'g' and 'y' are not allowed (found /${pattern}/${flags})`, src, i);
      }
      push("re", { source: pattern, flags }, j - i);
      continue;
    }
    reNum.lastIndex = i;
    if (reNum.test(src)) {
      const j = reNum.lastIndex;
      push("num", Number(src.slice(i, j)), j - i);
      continue;
    }
    reId.lastIndex = i;
    if (reId.test(src)) {
      const j = reId.lastIndex;
      const w = src.slice(i, j);
      if (src.slice(j, j + 2) === "/i") {
        push("ci", { lower: w.toLowerCase(), desc: src.slice(i, j + 2) }, j + 2 - i);
        continue;
      }
      if (w === "_") {
        push("any", "_", j - i);
        continue;
      }
      if (w === "_string") {
        push("any_string", "_string", j - i);
        continue;
      }
      if (w === "_number") {
        push("any_number", "_number", j - i);
        continue;
      }
      if (w === "_boolean") {
        push("any_boolean", "_boolean", j - i);
        continue;
      }
      if (w === "true") {
        push("bool", true, j - i);
        continue;
      }
      if (w === "false") {
        push("bool", false, j - i);
        continue;
      }
      if (w === "null") {
        push("null", null, j - i);
        continue;
      }
      if (w[0] === "_") {
        throw syntax(`identifiers cannot start with underscore: ${w}`, src, i);
      }
      push("id", w, j - i);
      continue;
    }
    if (c2 === "(?") {
      push("(?", "(?", 2);
      continue;
    }
    if (c2 === "(!") {
      push("(!", "(!", 2);
      continue;
    }
    if (c3 === "...") {
      push("...", "...", 3);
      continue;
    }
    if (c === "\u2026") {
      push("...", "...", 1);
      continue;
    }
    if (c2 === "**") {
      push("**", "**", 2);
      continue;
    }
    if (c2 === "->") {
      push("->", "->", 2);
      continue;
    }
    if (c2 === "??") {
      push("??", "??", 2);
      continue;
    }
    if (c2 === "?+") {
      push("?+", "?+", 2);
      continue;
    }
    if (c2 === "++") {
      push("++", "++", 2);
      continue;
    }
    if (c2 === "*+") {
      push("*+", "*+", 2);
      continue;
    }
    if (c2 === "+?") {
      push("+?", "+?", 2);
      continue;
    }
    if (c2 === "*?") {
      push("*?", "*?", 2);
      continue;
    }
    if (c2 === "<=") {
      push("<=", "<=", 2);
      continue;
    }
    if (c2 === ">=") {
      push(">=", ">=", 2);
      continue;
    }
    if (c2 === "==") {
      push("==", "==", 2);
      continue;
    }
    if (c2 === "!=") {
      push("!=", "!=", 2);
      continue;
    }
    if (c2 === "&&") {
      push("&&", "&&", 2);
      continue;
    }
    if (c2 === "||") {
      push("||", "||", 2);
      continue;
    }
    const single = "()[]{}<>:,.$@=|*+?!-#%&\xA7^".includes(c) ? c : null;
    if (single) {
      push(single, single, 1);
      continue;
    }
    throw syntax(`unexpected character '${c}'`, src, i);
  }
  return toks;
}
function readEsc(s, i) {
  const ch = s[i];
  if (ch === "n")
    return { chr: "\n", adv: 1 };
  if (ch === "r")
    return { chr: "\r", adv: 1 };
  if (ch === "t")
    return { chr: "	", adv: 1 };
  if (ch === '"' || ch === "'" || ch === "\\")
    return { chr: ch, adv: 1 };
  if (ch === "u") {
    if (s[i + 1] === "{") {
      let j = i + 2, hex = "";
      while (j < s.length && s[j] !== "}")
        hex += s[j++];
      if (s[j] !== "}")
        return { chr: "u", adv: 1 };
      return { chr: String.fromCodePoint(parseInt(hex, 16) || 0), adv: j + 1 - i };
    } else {
      const hex = s.slice(i + 1, i + 5);
      return { chr: String.fromCharCode(parseInt(hex, 16) || 0), adv: 5 };
    }
  }
  return { chr: ch, adv: 1 };
}
function syntax(msg, src, pos) {
  const caret = `${src}
${" ".repeat(pos)}^`;
  const err = new Error(`${msg}
${caret}`);
  err.pos = pos;
  return err;
}
var Parser = class {
  constructor(src, tokens = tokenize(src), opts = {}) {
    this.src = src;
    this.toks = tokens;
    this.i = 0;
    this._cut = null;
    this.debug = opts.debug || null;
    this.ctxStack = [];
    this.farthest = { i: 0, exp: /* @__PURE__ */ new Set(), ctx: null, attempts: [] };
  }
  // --- cursor
  atEnd() {
    return this.i >= this.toks.length;
  }
  cur() {
    return this.toks[this.i];
  }
  /**
   * peek(...alts): if no args, returns current token or null.
   * If args given, returns truthy if current token matches any by kind or value.
   */
  peek(...alts) {
    const t = this.toks[this.i];
    if (!t)
      return null;
    if (!alts.length)
      return t;
    for (const a of alts)
      if (t.k === a || t.v === a)
        return t;
    return null;
  }
  // eat specific kind/value; when kind omitted, consumes current
  eat(kind, msg) {
    const t = this.toks[this.i];
    if (!t)
      return this.fail(msg || `unexpected end of input`);
    if (kind && !(t.k === kind || t.v === kind))
      return this.fail(msg || `expected ${kind}`);
    this.debug?.onEat?.(t, this.i);
    this.i++;
    return t;
  }
  maybe(kindOrVal) {
    const t = this.toks[this.i];
    if (t && (t.k === kindOrVal || t.v === kindOrVal)) {
      this.i++;
      return t;
    }
    return null;
  }
  expect(...alts) {
    const t = this.peek(...alts);
    if (!t)
      this.fail(`expected ${alts.join("|")}`);
    return this.eat(t.k);
  }
  // --- error control
  cut() {
    this._cut = this.i;
  }
  // commit to branch to localize errors
  mark() {
    return { i: this.i, cut: this._cut };
  }
  restore(m) {
    this.i = m.i;
    this._cut = m.cut;
  }
  fail(msg = "syntax error") {
    if (this.i >= this.farthest.i) {
      if (this.i > this.farthest.i) {
        this.farthest = { i: this.i, exp: /* @__PURE__ */ new Set(), ctx: null, attempts: [] };
      }
      this.farthest.exp.add(msg);
      this.farthest.ctx = [...this.ctxStack];
    }
    this.debug?.onFail?.(msg, this.i, [...this.ctxStack]);
    const pos = this.toks[this.i]?.pos ?? this.src.length;
    throw syntax(msg, this.src, pos);
  }
  // ifPeek('{', parseobject)
  // Peek first then try fn,
  // return the output or null if it failed
  ifPeek(next, fn) {
    return this.peek(next) ? this.backtrack(fn) : null;
  }
  // --- backtracking
  // Restores parser state if fn() throws OR returns null/undefined.
  // This makes "soft failure" (return null) safe by construction.
  backtrack(fn) {
    const save = this.mark();
    try {
      const result = fn();
      if (result == null) {
        this.restore(save);
        return null;
      }
      return result;
    } catch (e) {
      if (this._cut != null && save.i >= this._cut)
        throw e;
      this.restore(save);
      return null;
    }
  }
  // --- context tracking for debugging
  // Wraps fn in a named context, tracking entry/exit for debug purposes
  ctx(label, fn) {
    this.ctxStack.push(label);
    this.debug?.onEnter?.(label, this.i);
    let success = false;
    try {
      const result = fn();
      success = result != null;
      return result;
    } finally {
      this.debug?.onExit?.(label, this.i, success);
      this.ctxStack.pop();
    }
  }
  // Labeled backtrack: like backtrack() but records the attempt for debugging
  bt(label, fn) {
    const startIdx = this.i;
    this.ctxStack.push(label);
    this.debug?.onEnter?.(label, startIdx);
    const save = this.mark();
    let success = false;
    try {
      const result = fn();
      if (result == null) {
        this.recordAttempt(label, startIdx, false);
        this.restore(save);
        return null;
      }
      success = true;
      this.recordAttempt(label, startIdx, true);
      return result;
    } catch (e) {
      if (this._cut != null && save.i >= this._cut)
        throw e;
      this.recordAttempt(label, startIdx, false);
      this.restore(save);
      return null;
    } finally {
      this.debug?.onExit?.(label, this.i, success);
      this.ctxStack.pop();
    }
  }
  // Record a backtrack attempt at farthest position
  // Uses startIdx (where attempt began) to attribute attempts correctly
  recordAttempt(label, startIdx, success) {
    this.debug?.onBacktrack?.(label, startIdx, success);
    if (!success && startIdx >= this.farthest.i) {
      if (startIdx > this.farthest.i) {
        this.farthest.attempts = [];
        this.farthest.i = startIdx;
      }
      if (!this.farthest.attempts.includes(label)) {
        this.farthest.attempts.push(label);
      }
    }
  }
  // Wrap a parse function to capture source span on the returned AST node
  span(fn) {
    const startTok = this.toks[this.i];
    const startIdx = this.i;
    const result = fn();
    if (result && typeof result === "object") {
      const endTok = this.toks[this.i - 1] || startTok;
      result.loc = {
        start: startTok?.pos ?? this.src.length,
        end: (endTok?.pos ?? this.src.length) + (endTok?.len ?? 0),
        startTok: startIdx,
        endTok: this.i - 1
      };
    }
    return result;
  }
  // Format a debug report from farthest failure info
  formatReport() {
    const f = this.farthest;
    const pos = this.toks[f.i]?.pos ?? this.src.length;
    let line = 1, col = 1;
    for (let i = 0; i < pos; i++) {
      if (this.src[i] === "\n") {
        line++;
        col = 1;
      } else
        col++;
    }
    const windowStart = Math.max(0, f.i - 3);
    const windowEnd = Math.min(this.toks.length, f.i + 4);
    const tokenWindow = this.toks.slice(windowStart, windowEnd).map((t, j) => {
      const idx = windowStart + j;
      const marker = idx === f.i ? ">>>" : "   ";
      const val = typeof t.v === "string" ? `"${t.v}"` : t.v;
      return `${marker} [${idx}] ${t.k}: ${val}`;
    }).join("\n");
    const lineStart = this.src.lastIndexOf("\n", pos - 1) + 1;
    const lineEnd = this.src.indexOf("\n", pos);
    const sourceLine = this.src.slice(lineStart, lineEnd === -1 ? void 0 : lineEnd);
    const caret = " ".repeat(pos - lineStart) + "^";
    const parts = [
      `Parse error at line ${line}, column ${col}:`,
      `  ${sourceLine}`,
      `  ${caret}`,
      "",
      `Expected: ${[...f.exp].join(" | ")}`
    ];
    if (f.ctx && f.ctx.length > 0) {
      parts.push(`Context: ${f.ctx.join(" > ")}`);
    }
    if (f.attempts && f.attempts.length > 0) {
      parts.push(`Tried: ${f.attempts.join(", ")}`);
    }
    parts.push("", "Token window:", tokenWindow);
    return parts.join("\n");
  }
  many(parseOne) {
    const out = [];
    for (; ; ) {
      const save = this.mark();
      const node = this.backtrack(parseOne);
      if (node == null) {
        this.restore(save);
        break;
      }
      out.push(node);
    }
    return out;
  }
  until(parseOne, stopPred) {
    const out = [];
    while (!this.atEnd() && !stopPred())
      out.push(parseOne());
    return out;
  }
  // --- Pratt machinery (used for low-precedence '|')
  parseExpr(spec, minPrec = 0) {
    let lhs = spec.primary(this);
    for (; ; ) {
      const op = spec.peekOp(this);
      if (!op)
        break;
      const { prec, assoc, kind } = spec.info(op);
      if (prec < minPrec)
        break;
      if (kind === "postfix") {
        this.eat(op);
        lhs = spec.buildPostfix(op, lhs);
        continue;
      }
      this.eat(op);
      const rhs = this.parseExpr(spec, assoc === "right" ? prec : prec + 1);
      lhs = spec.buildInfix(op, lhs, rhs);
    }
    return lhs;
  }
};
function cloneEnv(env) {
  const e = /* @__PURE__ */ new Map();
  for (const [k, v] of env)
    e.set(k, v);
  return e;
}
function isBound(env, name) {
  return env.has(name);
}
function bindScalar(env, name, val) {
  const cur = env.get(name);
  if (!cur) {
    env.set(name, { kind: "scalar", value: val });
    return true;
  }
  return cur.kind === "scalar" && deepEqual(cur.value, val);
}
function bindGroup(env, name, group) {
  const cur = env.get(name);
  if (!cur) {
    env.set(name, { kind: "group", value: group });
    return true;
  }
  if (cur.kind !== "group")
    return false;
  return deepEqual(cur.value, group);
}
function makeRegExp(spec) {
  try {
    return new RegExp(spec.source, spec.flags || "");
  } catch (e) {
    throw new Error(`invalid regex: /${spec.source}/${spec.flags || ""}`);
  }
}

// src/tendril-el.js
var ELit = (value) => ({ type: "ELit", value });
var EVar = (name) => ({ type: "EVar", name });
var EUnary = (op, arg) => ({ type: "EUnary", op, arg });
var EBinary = (op, left, right) => ({ type: "EBinary", op, left, right });
var ECall = (fn, args) => ({ type: "ECall", fn, args });
var EL_FUNCTIONS = ["number", "string", "boolean", "size"];
var PRECEDENCE = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  ">": 4,
  "<=": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "%": 6
};
function parseExpr(p) {
  function parsePrimary() {
    const tok = p.peek();
    if (!tok)
      p.fail("unexpected end of expression");
    if (tok.k === "!") {
      p.eat("!");
      return EUnary("!", parsePrimary());
    }
    if (tok.k === "-") {
      p.eat("-");
      return EUnary("-", parsePrimary());
    }
    if (p.maybe("(")) {
      const expr = parseExpression(0);
      p.eat(")");
      return expr;
    }
    if (p.peek("num")) {
      return ELit(p.eat("num").v);
    }
    if (p.peek("bool")) {
      return ELit(p.eat("bool").v);
    }
    if (p.peek("null")) {
      p.eat("null");
      return ELit(null);
    }
    if (p.peek("str")) {
      return ELit(p.eat("str").v);
    }
    if (p.peek("any")) {
      p.eat("any");
      return EVar("_");
    }
    if (p.maybe("$")) {
      const t = p.peek("id");
      if (!t)
        p.fail("expected variable name after $");
      p.eat("id");
      return EVar(t.v);
    }
    if (p.peek("id")) {
      const name = p.cur().v;
      if (EL_FUNCTIONS.includes(name)) {
        p.eat("id");
        p.eat("(");
        const args = [];
        if (!p.peek(")")) {
          args.push(parseExpression(0));
          while (p.maybe(",")) {
            args.push(parseExpression(0));
          }
        }
        p.eat(")");
        return ECall(name, args);
      }
      p.fail(`unexpected identifier '${name}' in expression (variables must be prefixed with $)`);
    }
    p.fail(`unexpected token in expression: '${tok.v || tok.k}'`);
  }
  function parseExpression(minPrec) {
    let left = parsePrimary();
    while (true) {
      const t = p.peek();
      if (!t)
        break;
      const prec = PRECEDENCE[t.k];
      if (prec === void 0 || prec < minPrec)
        break;
      const op = p.eat().k;
      const right = parseExpression(prec + 1);
      left = EBinary(op, left, right);
    }
    return left;
  }
  return parseExpression(0);
}
function evaluateExpr(ast, bindings) {
  function getVar(name) {
    if (bindings instanceof Map) {
      if (!bindings.has(name)) {
        throw new Error(`Unbound variable in guard: $${name}`);
      }
      const entry = bindings.get(name);
      return entry.kind === "scalar" ? entry.value : entry.value;
    }
    if (!(name in bindings)) {
      throw new Error(`Unbound variable in guard: $${name}`);
    }
    return bindings[name];
  }
  function evaluate(node) {
    switch (node.type) {
      case "ELit":
        return node.value;
      case "EVar":
        return getVar(node.name);
      case "EUnary":
        const arg = evaluate(node.arg);
        switch (node.op) {
          case "!":
            return !arg;
          case "-":
            return -arg;
          default:
            throw new Error(`Unknown unary operator: ${node.op}`);
        }
      case "EBinary": {
        if (node.op === "&&") {
          const left2 = evaluate(node.left);
          if (!left2)
            return false;
          return !!evaluate(node.right);
        }
        if (node.op === "||") {
          const left2 = evaluate(node.left);
          if (left2)
            return true;
          return !!evaluate(node.right);
        }
        const left = evaluate(node.left);
        const right = evaluate(node.right);
        switch (node.op) {
          case "+":
            if (typeof left === "string" && typeof right === "string") {
              return left + right;
            }
            if (typeof left !== "number" || typeof right !== "number") {
              throw new Error(`Cannot add ${typeof left} and ${typeof right}`);
            }
            return left + right;
          case "-":
            if (typeof left !== "number" || typeof right !== "number") {
              throw new Error(`Cannot subtract ${typeof left} and ${typeof right}`);
            }
            return left - right;
          case "*":
            if (typeof left !== "number" || typeof right !== "number") {
              throw new Error(`Cannot multiply ${typeof left} and ${typeof right}`);
            }
            return left * right;
          case "%":
            if (typeof left !== "number" || typeof right !== "number") {
              throw new Error(`Cannot modulo ${typeof left} and ${typeof right}`);
            }
            if (right === 0) {
              throw new Error(`Modulo by zero`);
            }
            return left % right;
          case "<":
            return left < right;
          case ">":
            return left > right;
          case "<=":
            return left <= right;
          case ">=":
            return left >= right;
          case "==":
            return sameValueZero(left, right);
          case "!=":
            return !sameValueZero(left, right);
          default:
            throw new Error(`Unknown binary operator: ${node.op}`);
        }
      }
      case "ECall": {
        const args = node.args.map(evaluate);
        switch (node.fn) {
          case "number":
            if (args.length !== 1)
              throw new Error(`number() takes 1 argument`);
            const n = Number(args[0]);
            if (Number.isNaN(n) && typeof args[0] !== "number") {
              throw new Error(`Cannot convert ${typeof args[0]} to number`);
            }
            return n;
          case "string":
            if (args.length !== 1)
              throw new Error(`string() takes 1 argument`);
            return String(args[0]);
          case "boolean":
            if (args.length !== 1)
              throw new Error(`boolean() takes 1 argument`);
            return Boolean(args[0]);
          case "size":
            if (args.length !== 1)
              throw new Error(`size() takes 1 argument`);
            const val = args[0];
            if (typeof val === "string")
              return val.length;
            if (Array.isArray(val))
              return val.length;
            if (val && typeof val === "object")
              return Object.keys(val).length;
            throw new Error(`size() requires string, array, or object`);
          default:
            throw new Error(`Unknown function: ${node.fn}`);
        }
      }
      default:
        throw new Error(`Unknown expression node type: ${node.type}`);
    }
  }
  return evaluate(ast);
}
function getExprVariables(ast) {
  const vars = /* @__PURE__ */ new Set();
  function walk(node) {
    switch (node.type) {
      case "EVar":
        vars.add(node.name);
        break;
      case "EUnary":
        walk(node.arg);
        break;
      case "EBinary":
        walk(node.left);
        walk(node.right);
        break;
      case "ECall":
        node.args.forEach(walk);
        break;
    }
  }
  walk(ast);
  return vars;
}

// src/tendril-parser.js
function parsePattern(src, opts = {}) {
  const p = new Parser(src, void 0, opts);
  try {
    const ast = parseRootPattern(p);
    if (!p.atEnd())
      p.fail("trailing input after pattern");
    validateAST(ast, src);
    return ast;
  } catch (e) {
    if (p.farthest) {
      e.parseReport = p.formatReport();
    }
    throw e;
  }
}
var Any = () => ({ type: "Any" });
var TypedAny = (kind) => ({ type: "TypedAny", kind });
var Lit = (v) => ({ type: "Lit", value: v });
var StringPattern = (kind, desc, matchFn) => ({ type: "StringPattern", kind, desc, matchFn });
var Bool = (v) => ({ type: "Bool", value: v });
var Null = () => ({ type: "Null" });
var RootKey = () => ({ type: "RootKey" });
var Guarded = (pat, guard2) => ({ type: "Guarded", pat, guard: guard2 });
var SBind = (name, pat, guard2 = null) => ({ type: "SBind", name, pat, guard: guard2 });
var GroupBind = (name, pat, sliceKind = "array") => ({ type: "GroupBind", name, pat, sliceKind });
var Flow = (pat, bucket, labelRef = null, sliceKind = "object") => ({ type: "Flow", pat, bucket, labelRef, sliceKind });
var Collecting = (pat, collectExpr, bucket, sliceKind, labelRef) => ({
  type: "Collecting",
  pat,
  // the pattern this directive is attached to
  collectExpr,
  // {key: varName, value: varName} for k:v or {value: varName} for value-only
  bucket,
  // bucket name
  sliceKind,
  // 'object' or 'array'
  labelRef
  // required label reference
});
var Arr = (items, label = null) => ({ type: "Arr", items, label });
var Obj = (terms, spread = null, label = null) => ({ type: "Obj", terms, spread, label });
var Alt = (alts, prioritized = false) => ({ type: "Alt", alts, prioritized });
var Look = (neg, pat) => ({ type: "Look", neg, pat });
var Quant = (sub, op, min = null, max = null) => ({
  type: "Quant",
  sub,
  op,
  // '?', '??', '+', '++', '+?', '*', '*+', '*?', '*{...}'
  min,
  max
});
var OTerm = (key, breadcrumbs, val, quant, optional = false, strong = false) => ({
  type: "OTerm",
  key,
  // ITEM
  breadcrumbs,
  // Breadcrumb[]
  val,
  // ITEM
  quant,
  // null or {min, max}
  optional,
  // true if '?' suffix (K:V?)
  strong
  // true if 'else !' suffix - triggers strong semantics (no bad entries)
});
var Spread = (quant) => ({ type: "Spread", quant });
var SlicePattern = (kind, content) => ({ type: "SlicePattern", kind, content });
var Breadcrumb = (kind, key, quant) => ({
  type: "Breadcrumb",
  kind,
  // 'dot' or 'bracket'
  key,
  // ITEM
  quant
  // null or {op: '?'|'+'|'*', min, max}
});
function eatVarName(p) {
  const t = p.peek("id");
  if (t) {
    p.eat("id");
    return t.v;
  }
  p.fail("expected variable name");
}
function parseParenWithBindingAndGuard(p, parseInner, stopTokens = []) {
  if (!p.maybe("("))
    return null;
  const inner = parseInner(p, [")", "as", "where", ...stopTokens]);
  if (p.maybe("as")) {
    if (p.peek("$")) {
      p.eat("$");
      const name = eatVarName(p);
      let guard2 = null;
      if (p.maybe("where")) {
        guard2 = parseExpr(p);
      }
      p.eat(")");
      return SBind(name, inner, guard2);
    }
    if (p.peek("@")) {
      p.eat("@");
      const name = eatVarName(p);
      if (p.peek("where")) {
        p.fail("guard expressions are not supported on group bindings (@var)");
      }
      p.eat(")");
      return GroupBind(name, inner);
    }
    p.fail('expected $var or @var after "as"');
  }
  if (p.maybe("where")) {
    const guard2 = parseExpr(p);
    p.eat(")");
    return Guarded(inner, guard2);
  }
  p.eat(")");
  return inner;
}
function withOptionalFlow(p, node) {
  if (!p.peek("->"))
    return node;
  return p.span(() => {
    p.eat("->");
    let sliceKind;
    if (p.peek("%")) {
      p.eat("%");
      sliceKind = "object";
    } else {
      p.eat("@");
      sliceKind = "array";
    }
    const bucket = eatVarName(p);
    let labelRef = null;
    if (p.peek("<")) {
      p.eat("<");
      p.eat("^");
      labelRef = eatVarName(p);
      p.eat(">");
    }
    return Flow(node, bucket, labelRef, sliceKind);
  });
}
function withOptionalCollecting(p, node) {
  if (!p.peek("<"))
    return node;
  const next = p.toks[p.i + 1];
  if (!next || next.k !== "id" || next.v !== "collecting")
    return node;
  return p.span(() => {
    p.eat("<");
    p.eat("id");
    p.eat("$");
    const firstVar = eatVarName(p);
    let collectExpr;
    if (p.peek(":")) {
      p.eat(":");
      p.eat("$");
      const valueVar = eatVarName(p);
      collectExpr = { key: firstVar, value: valueVar };
    } else {
      collectExpr = { value: firstVar };
    }
    if (!p.peek("id") || p.toks[p.i].v !== "in") {
      p.fail("expected 'in' after collecting expression");
    }
    p.eat("id");
    let sliceKind;
    if (p.peek("%")) {
      p.eat("%");
      sliceKind = "object";
    } else if (p.peek("@")) {
      p.eat("@");
      sliceKind = "array";
    } else {
      p.fail("expected '%' or '@' after 'in'");
    }
    const bucket = eatVarName(p);
    if (!p.peek("id") || p.toks[p.i].v !== "across") {
      p.fail("expected 'across ^label' - the across clause is required");
    }
    p.eat("id");
    p.eat("^");
    const labelRef = eatVarName(p);
    p.eat(">");
    return Collecting(node, collectExpr, bucket, sliceKind, labelRef);
  });
}
function parseRootPattern(p) {
  if (p.peek("%")) {
    const next = p.toks[p.i + 1];
    if (next && next.k === "{") {
      return parseObjectSlicePattern(p);
    }
  }
  if (p.peek("@")) {
    const next = p.toks[p.i + 1];
    if (next && next.k === "[") {
      return parseArraySlicePattern(p);
    }
  }
  return parseItem(p);
}
function parseObjectSlicePattern(p) {
  p.eat("%");
  p.eat("{");
  const groups = [];
  while (!p.peek("}")) {
    groups.push(parseOGroup(p));
    p.maybe(",");
  }
  if (groups.length === 0) {
    p.fail("empty object slice pattern %{ } is not allowed");
  }
  p.eat("}");
  return SlicePattern("object", { type: "OGroup", groups });
}
function parseArraySlicePattern(p) {
  p.eat("@");
  p.eat("[");
  const items = parseABody(p, "]");
  if (items.length === 0) {
    p.fail("empty array slice pattern @[ ] is not allowed");
  }
  p.eat("]");
  const content = items.length === 1 ? items[0] : { type: "Seq", items };
  return SlicePattern("array", content);
}
function parseItem(p) {
  return p.span(() => parseItemInner(p));
}
function parseItemInner(p) {
  const first = parseItemTerm(p);
  const altChain = p.backtrack(() => {
    p.eat("|");
    const alts = [first, parseItemTerm(p)];
    while (p.backtrack(() => {
      p.eat("|");
      return true;
    })) {
      alts.push(parseItemTerm(p));
    }
    return Alt(alts, false);
  });
  if (altChain) {
    if (p.backtrack(() => {
      p.eat("else");
      return true;
    })) {
      p.fail("cannot mix '|' and 'else' without parentheses");
    }
    return altChain;
  }
  const elseChain = p.backtrack(() => {
    p.eat("else");
    if (p.peek("!"))
      return null;
    const alts = [first, parseItemTerm(p)];
    while (p.backtrack(() => {
      p.eat("else");
      if (p.peek("!"))
        return null;
      return true;
    })) {
      alts.push(parseItemTerm(p));
    }
    return Alt(alts, true);
  });
  if (elseChain) {
    if (p.backtrack(() => {
      p.eat("|");
      return true;
    })) {
      p.fail("cannot mix '|' and 'else' without parentheses");
    }
    return elseChain;
  }
  return first;
}
function parseItemTerm(p) {
  const core = parseItemTermCore(p);
  const withFlow = withOptionalFlow(p, core);
  return withOptionalCollecting(p, withFlow);
}
function parseItemTermCore(p) {
  return p.bt("lookahead", () => parseLookahead(p)) || parseParenWithBindingAndGuard(p, () => parseItem(p)) || p.bt("$bind", () => {
    p.eat("$");
    return SBind(eatVarName(p), Any());
  }) || p.bt("@bind", () => {
    p.eat("@");
    return GroupBind(eatVarName(p), Quant(Any(), "*", 0, Infinity));
  }) || p.bt("any", () => {
    p.eat("any");
    return Any();
  }) || p.bt("any_string", () => {
    p.eat("any_string");
    return TypedAny("string");
  }) || p.bt("any_number", () => {
    p.eat("any_number");
    return TypedAny("number");
  }) || p.bt("any_boolean", () => {
    p.eat("any_boolean");
    return TypedAny("boolean");
  }) || p.bt("number", () => Lit(p.eat("num").v)) || p.bt("boolean", () => Bool(p.eat("bool").v)) || p.bt("null", () => {
    p.eat("null");
    return Null();
  }) || p.bt("string", () => Lit(p.eat("str").v)) || p.bt("identifier", () => Lit(p.eat("id").v)) || p.bt("regex", () => {
    const { source, flags } = p.eat("re").v;
    const re = makeRegExp({ source, flags });
    return StringPattern("regex", `/${source}/${flags}`, (s) => typeof s === "string" && re.test(s));
  }) || p.bt("case-insensitive", () => {
    const { lower, desc } = p.eat("ci").v;
    return StringPattern("ci", desc, (s) => typeof s === "string" && s.toLowerCase() === lower);
  }) || p.bt("labeled-obj", () => {
    p.eat("\xA7");
    const label = eatVarName(p);
    return parseObj(p, label);
  }) || p.bt("labeled-arr", () => {
    p.eat("\xA7");
    const label = eatVarName(p);
    return parseArr(p, label);
  }) || p.bt("object", () => parseObj(p)) || p.bt("array", () => parseArr(p)) || p.fail("expected item");
}
function parseLookahead(p) {
  return p.backtrack(() => {
    p.eat("(?");
    const pat = parseAGroup(p);
    p.eat(")");
    return Look(false, pat);
  }) || p.backtrack(() => {
    p.eat("(!");
    const pat = parseAGroup(p);
    p.eat(")");
    return Look(true, pat);
  });
}
function parseObjectLookahead(p) {
  return p.backtrack(() => {
    p.eat("(?");
    const pat = parseOGroup(p);
    p.eat(")");
    return { type: "OLook", neg: false, pat };
  }) || p.backtrack(() => {
    p.eat("(!");
    const pat = parseOGroup(p);
    p.eat(")");
    return { type: "OLook", neg: true, pat };
  });
}
function parseABody(p, ...stopTokens) {
  const items = [];
  while (!stopTokens.some((t) => p.peek(t))) {
    items.push(parseAGroup(p));
    p.maybe(",");
  }
  return items;
}
function parseArr(p, label = null) {
  return p.span(() => {
    p.eat("[");
    const items = parseABody(p, "]");
    p.eat("]");
    return Arr(items, label);
  });
}
function parseAGroup(p) {
  const spread = p.backtrack(() => {
    p.eat("...");
    const q = parseAQuant(p);
    if (q)
      p.fail(`Quantifiers on '...' are not allowed (found '...${q.op}')`);
    return Spread(null);
  });
  if (spread)
    return spread;
  const parseBaseWithQuant = () => {
    const base = parseAGroupBase(p);
    const q = parseAQuant(p);
    return q ? Quant(base, q.op, q.min, q.max) : base;
  };
  const first = parseBaseWithQuant();
  if (p.backtrack(() => {
    p.eat("|");
    return true;
  })) {
    const alts = [first, parseBaseWithQuant()];
    while (p.backtrack(() => {
      p.eat("|");
      return true;
    })) {
      alts.push(parseBaseWithQuant());
    }
    if (p.backtrack(() => {
      p.eat("else");
      return true;
    })) {
      p.fail("cannot mix '|' and 'else' without parentheses");
    }
    return Alt(alts, false);
  }
  if (p.backtrack(() => {
    p.eat("else");
    return true;
  })) {
    const alts = [first, parseBaseWithQuant()];
    while (p.backtrack(() => {
      p.eat("else");
      return true;
    })) {
      alts.push(parseBaseWithQuant());
    }
    if (p.backtrack(() => {
      p.eat("|");
      return true;
    })) {
      p.fail("cannot mix '|' and 'else' without parentheses");
    }
    return Alt(alts, true);
  }
  return first;
}
function parseAGroupBase(p) {
  return p.bt("arr-lookahead", () => parseLookahead(p)) || parseParenWithBindingAndGuard(p, (p2, stopTokens) => {
    const items = parseABody(p2, ...stopTokens);
    return items.length === 1 ? items[0] : { type: "Seq", items };
  }) || parseItemTerm(p);
}
function parseAQuant(p) {
  return p.backtrack(() => {
    p.eat("?+");
    return { op: "?+", min: 0, max: 1 };
  }) || p.backtrack(() => {
    p.eat("??");
    return { op: "??", min: 0, max: 1 };
  }) || p.backtrack(() => {
    p.eat("?");
    return { op: "?", min: 0, max: 1 };
  }) || p.backtrack(() => {
    p.eat("++");
    return { op: "++", min: 1, max: Infinity };
  }) || p.backtrack(() => {
    p.eat("+?");
    return { op: "+?", min: 1, max: Infinity };
  }) || p.backtrack(() => {
    p.eat("+");
    return { op: "+", min: 1, max: Infinity };
  }) || p.backtrack(() => {
    p.eat("*+");
    return { op: "*+", min: 0, max: Infinity };
  }) || p.backtrack(() => {
    p.eat("*?");
    return { op: "*?", min: 0, max: Infinity };
  }) || p.backtrack(() => {
    p.eat("*");
    return { op: "*", min: 0, max: Infinity };
  }) || p.backtrack(() => {
    p.eat("{");
    p.eat(",");
    const max = eatNonNegInt(p, "quantifier");
    p.eat("}");
    return { op: `{0,${max}}`, min: 0, max };
  }) || p.backtrack(() => {
    p.eat("{");
    const min = eatNonNegInt(p, "quantifier");
    p.eat(",");
    const max = eatNonNegInt(p, "quantifier");
    p.eat("}");
    return { op: `{${min},${max}}`, min, max };
  }) || p.backtrack(() => {
    p.eat("{");
    const min = eatNonNegInt(p, "quantifier");
    p.eat(",");
    p.eat("}");
    return { op: `{${min},}`, min, max: Infinity };
  }) || p.backtrack(() => {
    p.eat("{");
    const n = eatNonNegInt(p, "quantifier");
    p.eat("}");
    return { op: `{${n}}`, min: n, max: n };
  });
}
function parseObj(p, label = null) {
  return p.span(() => {
    p.eat("{");
    const terms = [];
    while (true) {
      const group = p.backtrack(() => {
        if (p.peek("}"))
          return null;
        const s = parseOGroup(p);
        p.maybe(",");
        return s;
      });
      if (!group)
        break;
      terms.push(group);
    }
    const remnant = parseORemnant(p);
    p.eat("}");
    return Obj(terms, remnant, label);
  });
}
function parseORemnant(p) {
  return p.bt("remainder-bind", () => {
    p.eat("(");
    p.eat("%");
    const q = p.backtrack(() => {
      p.eat("?");
      return { min: 0, max: Infinity };
    }) || parseRemainderQuant(p);
    p.eat("as");
    p.eat("%");
    const name = eatVarName(p);
    p.eat(")");
    p.maybe(",");
    return GroupBind(name, Spread(q), "object");
  }) || p.bt("remainder", () => {
    p.eat("%");
    const q = p.backtrack(() => {
      p.eat("?");
      return { min: 0, max: Infinity };
    }) || parseRemainderQuant(p);
    p.maybe(",");
    return Spread(q);
  }) || p.bt("no-remainder", () => {
    p.eat("(!");
    p.eat("%");
    p.eat(")");
    p.maybe(",");
    return { type: "OLook", neg: true, pat: Spread(null) };
  });
}
function parseRemainderQuant(p) {
  return p.backtrack(() => {
    p.eat("#");
    p.eat("?");
    return { min: 0, max: Infinity };
  }) || p.backtrack(() => {
    p.eat("#");
    p.eat("{");
    p.eat(",");
    const max = eatNonNegInt(p, "%");
    p.eat("}");
    return { min: 0, max };
  }) || p.backtrack(() => {
    p.eat("#");
    p.eat("{");
    const min = eatNonNegInt(p, "%");
    p.eat(",");
    const max = eatNonNegInt(p, "%");
    p.eat("}");
    if (max < min)
      p.fail("% quantifier upper < lower");
    return { min, max };
  }) || p.backtrack(() => {
    p.eat("#");
    p.eat("{");
    const min = eatNonNegInt(p, "%");
    p.eat(",");
    p.eat("}");
    return { min, max: Infinity };
  }) || p.backtrack(() => {
    p.eat("#");
    p.eat("{");
    const n = eatNonNegInt(p, "%");
    p.eat("}");
    return { min: n, max: n };
  });
}
function parseOGroup(p) {
  const look = p.bt("obj-lookahead", () => parseObjectLookahead(p));
  if (look)
    return look;
  const groupWithBind = p.bt("obj-group-bind", () => {
    p.eat("(");
    const groups = parseOBodyUntil(p, ")", "as");
    p.eat("as");
    p.eat("%");
    const name = eatVarName(p);
    p.eat(")");
    return GroupBind(name, { type: "OGroup", groups }, "object");
  });
  if (groupWithBind)
    return groupWithBind;
  const groupPlain = p.bt("obj-group", () => {
    p.eat("(");
    const groups = parseOBodyUntil(p, ")");
    p.eat(")");
    return { type: "OGroup", groups };
  });
  if (groupPlain)
    return groupPlain;
  const eachTerm = p.bt("obj-each-term", () => {
    p.eat("each");
    const term2 = parseOTerm(p);
    const optional2 = term2.optional || !!p.backtrack(() => {
      p.eat("?");
      return true;
    });
    const result2 = OTerm(term2.key, term2.breadcrumbs, term2.val, term2.quant, optional2, true);
    if (term2.loc)
      result2.loc = term2.loc;
    return result2;
  });
  if (eachTerm)
    return eachTerm;
  const term = parseOTerm(p);
  const optional = term.optional || !!p.backtrack(() => {
    p.eat("?");
    return true;
  });
  const result = OTerm(term.key, term.breadcrumbs, term.val, term.quant, optional, false);
  if (term.loc)
    result.loc = term.loc;
  return result;
}
function parseOBodyUntil(p, ...stopTokens) {
  const groups = [];
  while (!stopTokens.some((t) => p.peek(t))) {
    groups.push(parseOGroup(p));
    p.maybe(",");
  }
  return groups;
}
function parseOTerm(p) {
  return p.span(() => {
    const key = p.peek("**") ? RootKey() : parseItem(p);
    const breadcrumbs = [];
    for (let bc; bc = parseBreadcrumb(p); )
      breadcrumbs.push(bc);
    const optional = !!p.maybe("?");
    p.eat(":");
    const val = parseItem(p);
    const quant = parseOQuant(p);
    return OTerm(key, breadcrumbs, val, quant, optional, false);
  });
}
function parseBreadcrumb(p) {
  return p.bt("bc-skip", () => {
    p.eat("**");
    if (p.peek(":"))
      return Breadcrumb("skip", Any(), null);
    p.maybe(".");
    return Breadcrumb("skip", parseItem(p), null);
  }) || p.bt("bc-dot-skip", () => {
    p.eat(".");
    p.eat("**");
    if (p.peek(":"))
      return Breadcrumb("skip", Any(), null);
    p.maybe(".");
    return Breadcrumb("skip", parseItem(p), null);
  }) || p.bt("bc-dot", () => {
    p.eat(".");
    return Breadcrumb("dot", parseItem(p), null);
  }) || p.bt("bc-bracket", () => {
    p.eat("[");
    const key = parseItem(p);
    p.eat("]");
    return Breadcrumb("bracket", key, null);
  });
}
function parseOQuant(p) {
  return p.backtrack(() => {
    p.eat("#");
    p.eat("?");
    return { min: 0, max: Infinity };
  }) || p.backtrack(() => {
    p.eat("#");
    p.eat("{");
    p.eat(",");
    const max = eatNonNegInt(p, "O_QUANT");
    p.eat("}");
    return { min: 0, max };
  }) || p.backtrack(() => {
    p.eat("#");
    p.eat("{");
    const min = eatNonNegInt(p, "O_QUANT");
    p.eat(",");
    const max = eatNonNegInt(p, "O_QUANT");
    p.eat("}");
    if (max < min)
      p.fail("O_QUANT upper < lower");
    return { min, max };
  }) || p.backtrack(() => {
    p.eat("#");
    p.eat("{");
    const min = eatNonNegInt(p, "O_QUANT");
    p.eat(",");
    p.eat("}");
    return { min, max: Infinity };
  }) || p.backtrack(() => {
    p.eat("#");
    p.eat("{");
    const n = eatNonNegInt(p, "O_QUANT");
    p.eat("}");
    return { min: n, max: n };
  });
}
function eatNonNegInt(p, context = "quantifier") {
  const tok = p.eat("num", `expected non-negative integer in ${context}`);
  const v = tok.v;
  if (!Number.isInteger(v) || v < 0) {
    p.fail(`${context} requires non-negative integer, got ${v}`);
  }
  return v;
}
function validateAST(ast, src = null) {
  const sliceBindings = /* @__PURE__ */ new Map();
  const bucketScopes = /* @__PURE__ */ new Map();
  const definedLabels = /* @__PURE__ */ new Set();
  function collectLabels(node) {
    if (!node || typeof node !== "object")
      return;
    if ((node.type === "Obj" || node.type === "Arr") && node.label) {
      definedLabels.add(node.label);
    }
    for (const key of Object.keys(node)) {
      const val = node[key];
      if (Array.isArray(val)) {
        for (const item of val)
          collectLabels(item);
      } else if (val && typeof val === "object") {
        collectLabels(val);
      }
    }
  }
  collectLabels(ast);
  let implicitScopeCounter = 0;
  function checkSliceConflict(name, kind, loc) {
    const existing = sliceBindings.get(name);
    if (existing) {
      if (existing.kind !== kind) {
        const existingSigil = existing.kind === "object" ? "%" : "@";
        const newSigil = kind === "object" ? "%" : "@";
        let msg = `Slice name conflict: '${name}' used as both ${existingSigil}${name} and ${newSigil}${name}`;
        if (src && loc) {
          msg += `
  at: ${src.slice(loc.start, loc.end)}`;
        }
        throw new Error(msg);
      }
    } else {
      sliceBindings.set(name, { kind, loc });
    }
  }
  function checkBucketScope(bucketName, scope, loc, sigil) {
    const existing = bucketScopes.get(bucketName);
    if (existing) {
      if (existing.scope !== scope) {
        let msg = `Bucket name conflict: '${sigil}${bucketName}' used in different scopes`;
        if (src && loc) {
          msg += `
  at: ${src.slice(loc.start, loc.end)}`;
        }
        if (src && existing.loc) {
          msg += `
  previously at: ${src.slice(existing.loc.start, existing.loc.end)}`;
        }
        throw new Error(msg);
      }
    } else {
      bucketScopes.set(bucketName, { scope, loc });
    }
  }
  function check(node, ctx) {
    if (!node || typeof node !== "object")
      return;
    const { inContainer, implicitScope } = ctx;
    if (node.type === "Flow") {
      if (!inContainer) {
        const sigil2 = node.sliceKind === "object" ? "%" : "@";
        let msg = `Flow operator ->${sigil2}${node.bucket} can only be used inside an object or array pattern`;
        if (src && node.loc) {
          msg += `
  at: ${src.slice(node.loc.start, node.loc.end)}`;
        }
        throw new Error(msg);
      }
      let scope;
      const sigil = node.sliceKind === "object" ? "%" : "@";
      if (node.labelRef) {
        if (!definedLabels.has(node.labelRef)) {
          let msg = `Flow operator ->${sigil}${node.bucket}<^${node.labelRef}> references unknown label '${node.labelRef}'`;
          if (src && node.loc) {
            msg += `
  at: ${src.slice(node.loc.start, node.loc.end)}`;
          }
          throw new Error(msg);
        }
        scope = `label:${node.labelRef}`;
      } else {
        if (implicitScope === null) {
          let msg = `Flow operator ->${sigil}${node.bucket} requires enclosing 'each' clause (or explicit <^label>)`;
          if (src && node.loc) {
            msg += `
  at: ${src.slice(node.loc.start, node.loc.end)}`;
          }
          throw new Error(msg);
        }
        scope = `implicit:${implicitScope}`;
      }
      checkSliceConflict(node.bucket, node.sliceKind || "object", node.loc);
      checkBucketScope(node.bucket, scope, node.loc, sigil);
    }
    if (node.type === "Collecting") {
      if (!inContainer) {
        const sigil2 = node.sliceKind === "object" ? "%" : "@";
        let msg = `<collecting> directive can only be used inside an object or array pattern`;
        if (src && node.loc) {
          msg += `
  at: ${src.slice(node.loc.start, node.loc.end)}`;
        }
        throw new Error(msg);
      }
      if (node.collectExpr.key !== void 0 && node.sliceKind !== "object") {
        let msg = `key:value collection requires %bucket (object slice), not @bucket`;
        if (src && node.loc) {
          msg += `
  at: ${src.slice(node.loc.start, node.loc.end)}`;
        }
        throw new Error(msg);
      }
      if (node.collectExpr.key === void 0 && node.sliceKind !== "array") {
        let msg = `value-only collection requires @bucket (array slice), not %bucket`;
        if (src && node.loc) {
          msg += `
  at: ${src.slice(node.loc.start, node.loc.end)}`;
        }
        throw new Error(msg);
      }
      if (!definedLabels.has(node.labelRef)) {
        let msg = `<collecting> references unknown label '${node.labelRef}'`;
        if (src && node.loc) {
          msg += `
  at: ${src.slice(node.loc.start, node.loc.end)}`;
        }
        throw new Error(msg);
      }
      const sigil = node.sliceKind === "object" ? "%" : "@";
      const scope = `label:${node.labelRef}`;
      checkSliceConflict(node.bucket, node.sliceKind, node.loc);
      checkBucketScope(node.bucket, scope, node.loc, sigil);
    }
    if (node.type === "GroupBind") {
      checkSliceConflict(node.name, node.sliceKind || "array", node.loc);
    }
    const inChild = inContainer || node.type === "Obj" || node.type === "Arr";
    switch (node.type) {
      case "Obj":
        for (const term of node.terms || [])
          check(term, { inContainer: inChild, implicitScope });
        if (node.spread)
          check(node.spread, { inContainer: inChild, implicitScope });
        break;
      case "Arr":
        for (const item of node.items || [])
          check(item, { inContainer: inChild, implicitScope });
        break;
      case "OTerm":
        check(node.key, { inContainer: inChild, implicitScope });
        if (node.strong) {
          const newScope = `each_${implicitScopeCounter++}`;
          check(node.val, { inContainer: inChild, implicitScope: newScope });
        } else {
          check(node.val, { inContainer: inChild, implicitScope });
        }
        for (const bc of node.breadcrumbs || [])
          check(bc.key, { inContainer: inChild, implicitScope });
        break;
      case "Alt":
        for (const alt of node.alts || [])
          check(alt, { inContainer: inChild, implicitScope });
        break;
      case "Quant":
      case "Look":
      case "SBind":
      case "GroupBind":
      case "Flow":
      case "Collecting":
      case "Guarded":
        check(node.pat || node.sub, { inContainer: inChild, implicitScope });
        break;
      case "Seq":
        for (const item of node.items || [])
          check(item, { inContainer: inChild, implicitScope });
        break;
      case "OGroup":
        for (const g of node.groups || [])
          check(g, { inContainer: inChild, implicitScope });
        break;
      case "SlicePattern":
        check(node.content, { inContainer: true, implicitScope });
        break;
    }
  }
  check(ast, { inContainer: false, implicitScope: null });
}

// src/tendril-engine.js
var StopSearch = class extends Error {
  constructor(payload) {
    super("StopSearch");
    this.payload = payload;
  }
};
function newSolution() {
  return { env: /* @__PURE__ */ new Map(), sites: /* @__PURE__ */ new Map(), guards: [], bucketStack: [], labels: /* @__PURE__ */ new Map() };
}
function cloneSolution(sol) {
  const sites = /* @__PURE__ */ new Map();
  for (const [k, v] of sol.sites) {
    sites.set(k, [...v]);
  }
  const bucketStack = sol.bucketStack.map((level) => {
    const clonedLevel = /* @__PURE__ */ new Map();
    for (const [name, entries] of level) {
      clonedLevel.set(name, { ...entries });
    }
    return clonedLevel;
  });
  return {
    env: cloneEnv(sol.env),
    sites,
    guards: sol.guards ? [...sol.guards] : [],
    bucketStack,
    labels: new Map([...sol.labels].map(([name, info]) => [name, { ...info }]))
  };
}
function pushBucketLevel(sol) {
  sol.bucketStack.push(/* @__PURE__ */ new Map());
}
function addToBucket(sol, bucketName, key, value, bucketLevel = null, sliceKind = "object") {
  if (sol.bucketStack.length === 0) {
    throw new Error(`Flow ->${sliceKind === "object" ? "%" : "@"}${bucketName} used outside of K:V context`);
  }
  const levelIndex = bucketLevel !== null ? bucketLevel : sol.bucketStack.length - 1;
  if (levelIndex < 0 || levelIndex >= sol.bucketStack.length) {
    throw new Error(`Invalid bucket level ${levelIndex} (stack size: ${sol.bucketStack.length})`);
  }
  const level = sol.bucketStack[levelIndex];
  if (!level.has(bucketName)) {
    level.set(bucketName, { kind: sliceKind, entries: sliceKind === "object" ? {} : [] });
  }
  const bucket = level.get(bucketName);
  if (bucket.kind !== sliceKind) {
    throw new Error(`Bucket '${bucketName}' used with both % and @ sigils - pick one`);
  }
  if (sliceKind === "object") {
    if (Object.prototype.hasOwnProperty.call(bucket.entries, key)) {
      return false;
    }
    bucket.entries[key] = value;
  } else {
    bucket.entries.push(value);
  }
  return true;
}
function finalizeBucketLevel(solutions) {
  if (solutions.length === 0)
    return solutions;
  const merged = /* @__PURE__ */ new Map();
  let hasCollision = false;
  for (const state of solutions) {
    const sol = state.sol || state;
    if (sol.bucketStack.length === 0)
      continue;
    const top = sol.bucketStack[sol.bucketStack.length - 1];
    for (const [name, bucket] of top) {
      if (!merged.has(name)) {
        merged.set(name, { kind: bucket.kind, entries: bucket.kind === "object" ? {} : [] });
      }
      const mergedBucket = merged.get(name);
      if (bucket.kind === "object") {
        for (const [key, value] of Object.entries(bucket.entries)) {
          if (Object.prototype.hasOwnProperty.call(mergedBucket.entries, key)) {
            const existing = mergedBucket.entries[key];
            if (!sameValueZero(existing, value) && JSON.stringify(existing) !== JSON.stringify(value)) {
              hasCollision = true;
            }
          } else {
            mergedBucket.entries[key] = value;
          }
        }
      } else {
        mergedBucket.entries.push(...bucket.entries);
      }
    }
  }
  if (hasCollision) {
    for (const state of solutions) {
      const sol = state.sol || state;
      if (sol.bucketStack.length > 0) {
        sol.bucketStack.pop();
      }
    }
    return [];
  }
  const surviving = [];
  for (const state of solutions) {
    const sol = state.sol || state;
    if (sol.bucketStack.length > 0) {
      sol.bucketStack.pop();
    }
    let bindOk = true;
    for (const [name, bucket] of merged) {
      const groupValue = bucket.kind === "object" ? Group.object(bucket.entries) : Group.array(...bucket.entries);
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
function addGuard(sol, guard2, varName) {
  if (!guard2)
    return;
  const requiredVars = getExprVariables(guard2);
  sol.guards.push({ guard: guard2, varName, requiredVars });
}
function checkGuards(sol) {
  for (const { guard: guard2, varName, requiredVars } of sol.guards) {
    let allBound = true;
    for (const v of requiredVars) {
      if (!isBound(sol.env, v)) {
        allBound = false;
        break;
      }
    }
    if (!allBound) {
      continue;
    }
    try {
      const result = evaluateExpr(guard2, sol.env);
      if (!result) {
        return false;
      }
    } catch (e) {
      return false;
    }
  }
  return true;
}
function allGuardsClosed(sol) {
  for (const { requiredVars } of sol.guards) {
    for (const v of requiredVars) {
      if (!isBound(sol.env, v))
        return false;
    }
  }
  return true;
}
function recordScalarSite(sol, varName, path, valueRef) {
  if (!sol.sites.has(varName)) {
    sol.sites.set(varName, []);
  }
  sol.sites.get(varName).push({ kind: "scalar", path: [...path], valueRef });
}
function recordGroupSite(sol, varName, path, groupStart, groupEnd, valueRefs) {
  if (!sol.sites.has(varName)) {
    sol.sites.set(varName, []);
  }
  sol.sites.get(varName).push({
    kind: "group",
    path: [...path],
    groupStart,
    groupEnd,
    valueRefs: [...valueRefs]
  });
}
function patternHasBindings(ast) {
  if (!ast || typeof ast !== "object")
    return false;
  if ("_hasBindings" in ast)
    return ast._hasBindings;
  let result = false;
  if (ast.type === "SBind" || ast.type === "GroupBind") {
    result = true;
  } else {
    if (ast.pat && patternHasBindings(ast.pat))
      result = true;
    else if (ast.val && patternHasBindings(ast.val))
      result = true;
    else if (ast.items) {
      for (const item of ast.items) {
        if (patternHasBindings(item)) {
          result = true;
          break;
        }
      }
    }
    if (!result && ast.alts) {
      for (const alt of ast.alts) {
        if (patternHasBindings(alt)) {
          result = true;
          break;
        }
      }
    }
    if (!result && ast.groups) {
      for (const group of ast.groups) {
        if (patternHasBindings(group)) {
          result = true;
          break;
        }
      }
    }
    if (!result && ast.terms) {
      for (const term of ast.terms) {
        if (patternHasBindings(term)) {
          result = true;
          break;
        }
        if (term.key && patternHasBindings(term.key)) {
          result = true;
          break;
        }
        if (term.val && patternHasBindings(term.val)) {
          result = true;
          break;
        }
      }
    }
  }
  ast._hasBindings = result;
  return result;
}
function match(ast, input, opts = {}) {
  const maxSteps = opts.maxSteps ?? 2e6;
  const debug = opts.debug;
  const ctx = { steps: 0, maxSteps, debug };
  const solutions = [];
  matchItem(ast, input, [], newSolution(), (sol) => solutions.push(sol), ctx);
  return solutions.filter((sol) => allGuardsClosed(sol) && checkGuards(sol)).map((sol) => {
    const bindings = Object.fromEntries(
      Array.from(sol.env.entries()).map(([k, v]) => [k, v.value])
    );
    return { bindings, sites: sol.sites };
  });
}
function scan(ast, input, opts = {}) {
  const maxSteps = opts.maxSteps ?? 2e6;
  const debug = opts.debug;
  const ctx = { steps: 0, maxSteps, debug };
  const solutions = [];
  function scanValue(value, path) {
    guard(ctx);
    matchItem(ast, value, path, newSolution(), (sol) => solutions.push(sol), ctx);
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        scanValue(value[i], [...path, i]);
      }
    } else if (value && typeof value === "object") {
      for (const key of Object.keys(value)) {
        scanValue(value[key], [...path, key]);
      }
    }
  }
  scanValue(input, []);
  return solutions.filter((sol) => allGuardsClosed(sol) && checkGuards(sol)).map((sol) => {
    const bindings = Object.fromEntries(
      Array.from(sol.env.entries()).map(([k, v]) => [k, v.value])
    );
    return { bindings, sites: sol.sites };
  });
}
function matchExists(ast, input, opts = {}) {
  const maxSteps = opts.maxSteps ?? 2e6;
  const debug = opts.debug;
  const ctx = { steps: 0, maxSteps, debug };
  try {
    matchItem(ast, input, [], newSolution(), (sol) => {
      if (allGuardsClosed(sol) && checkGuards(sol)) {
        throw new StopSearch(true);
      }
    }, ctx);
    return false;
  } catch (e) {
    if (e instanceof StopSearch)
      return true;
    throw e;
  }
}
function scanExists(ast, input, opts = {}) {
  const maxSteps = opts.maxSteps ?? 2e6;
  const debug = opts.debug;
  const ctx = { steps: 0, maxSteps, debug };
  function scanValue(value, path) {
    guard(ctx);
    matchItem(ast, value, path, newSolution(), (sol) => {
      if (allGuardsClosed(sol) && checkGuards(sol)) {
        throw new StopSearch(true);
      }
    }, ctx);
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        scanValue(value[i], [...path, i]);
      }
    } else if (value && typeof value === "object") {
      for (const key of Object.keys(value)) {
        scanValue(value[key], [...path, key]);
      }
    }
  }
  try {
    scanValue(input, []);
    return false;
  } catch (e) {
    if (e instanceof StopSearch)
      return true;
    throw e;
  }
}
function scanFirst(ast, input, opts = {}) {
  const maxSteps = opts.maxSteps ?? 2e6;
  const debug = opts.debug;
  const ctx = { steps: 0, maxSteps, debug };
  function scanValue(value, path) {
    guard(ctx);
    matchItem(ast, value, path, newSolution(), (sol) => {
      if (allGuardsClosed(sol) && checkGuards(sol)) {
        throw new StopSearch(sol);
      }
    }, ctx);
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        scanValue(value[i], [...path, i]);
      }
    } else if (value && typeof value === "object") {
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
      const sol = e.payload;
      const bindings = Object.fromEntries(
        Array.from(sol.env.entries()).map(([k, v]) => [k, v.value])
      );
      return { bindings, sites: sol.sites };
    }
    throw e;
  }
}
function matchItem(item, node, path, sol, emit, ctx) {
  guard(ctx);
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
    emit = trackingEmit;
    doMatch();
  } finally {
    if (ctx.debug?.onExit) {
      ctx.debug.onExit(item.type, node, path, matched);
    }
  }
  function doMatch() {
    switch (item.type) {
      case "Any":
        emit(cloneSolution(sol));
        return;
      case "TypedAny":
        if (typeof node === item.kind)
          emit(cloneSolution(sol));
        return;
      case "Lit":
        if (sameValueZero(node, item.value))
          emit(cloneSolution(sol));
        return;
      case "StringPattern":
        if (item.matchFn(node))
          emit(cloneSolution(sol));
        return;
      case "Bool":
        if (sameValueZero(node, item.value))
          emit(cloneSolution(sol));
        return;
      case "Null":
        if (node === null)
          emit(cloneSolution(sol));
        return;
      case "Fail":
        return;
      case "Flow": {
        const sliceKind = item.sliceKind || "object";
        const sigil = sliceKind === "object" ? "%" : "@";
        matchItem(item.pat, node, path, sol, (s2) => {
          let flowKey;
          let bucketLevel = null;
          if (item.labelRef) {
            if (!s2.labels.has(item.labelRef)) {
              throw new Error(
                `Flow operator ->${sigil}${item.bucket}<^${item.labelRef}> references unknown label '${item.labelRef}'`
              );
            }
            const labelInfo = s2.labels.get(item.labelRef);
            if (labelInfo.key === void 0) {
              throw new Error(
                `Flow operator ->${sigil}${item.bucket}<^${item.labelRef}> references label '${item.labelRef}' which was not in a K:V iteration context`
              );
            }
            flowKey = labelInfo.key;
            bucketLevel = labelInfo.bucketLevel;
          } else {
            flowKey = ctx.flowKey;
          }
          if (flowKey !== void 0) {
            if (!addToBucket(s2, item.bucket, flowKey, node, bucketLevel, sliceKind)) {
              return;
            }
          }
          emit(s2);
        }, ctx);
        return;
      }
      case "Collecting": {
        const sliceKind = item.sliceKind;
        const sigil = sliceKind === "object" ? "%" : "@";
        matchItem(item.pat, node, path, sol, (s2) => {
          if (!s2.labels.has(item.labelRef)) {
            emit(s2);
            return;
          }
          const labelInfo = s2.labels.get(item.labelRef);
          const bucketLevel = labelInfo.bucketLevel;
          const collectExpr = item.collectExpr;
          let collectKey, collectValue;
          if (collectExpr.key !== void 0 && !s2.env.has(collectExpr.key)) {
            emit(s2);
            return;
          }
          if (!s2.env.has(collectExpr.value)) {
            emit(s2);
            return;
          }
          if (collectExpr.key !== void 0) {
            const keyBinding = s2.env.get(collectExpr.key);
            collectKey = keyBinding.kind === "scalar" ? keyBinding.value : keyBinding;
          }
          const valueBinding = s2.env.get(collectExpr.value);
          collectValue = valueBinding.kind === "scalar" ? valueBinding.value : valueBinding;
          if (sliceKind === "object") {
            if (!addToBucket(s2, item.bucket, collectKey, collectValue, bucketLevel, "object")) {
              return;
            }
          } else {
            if (!addToBucket(s2, item.bucket, null, collectValue, bucketLevel, "array")) {
              return;
            }
          }
          emit(s2);
        }, ctx);
        return;
      }
      case "Alt": {
        if (item.prioritized) {
          for (const sub of item.alts) {
            let any = false;
            matchItem(sub, node, path, sol, (s) => {
              any = true;
              emit(s);
            }, ctx);
            if (any)
              return;
            guard(ctx);
          }
        } else {
          for (const sub of item.alts) {
            matchItem(sub, node, path, sol, emit, ctx);
            guard(ctx);
          }
        }
        return;
      }
      case "Look": {
        const hasBindings = patternHasBindings(item.pat);
        if (item.neg) {
          let matched2 = false;
          matchItem(item.pat, node, path, cloneSolution(sol), () => {
            matched2 = true;
          }, ctx);
          if (!matched2) {
            emit(cloneSolution(sol));
          }
        } else if (hasBindings) {
          matchItem(item.pat, node, path, cloneSolution(sol), (s2) => {
            emit(s2);
          }, ctx);
        } else {
          let matchedSol = null;
          matchItem(item.pat, node, path, cloneSolution(sol), (s2) => {
            if (!matchedSol)
              matchedSol = s2;
          }, ctx);
          if (matchedSol) {
            emit(matchedSol);
          }
        }
        return;
      }
      case "SBind": {
        if (item.pat.type === "Seq") {
          return;
        }
        matchItem(item.pat, node, path, sol, (s2) => {
          const s3 = cloneSolution(s2);
          if (bindScalar(s3.env, item.name, node)) {
            recordScalarSite(s3, item.name, path, node);
            if (ctx.debug?.onBind) {
              ctx.debug.onBind("scalar", item.name, node);
            }
            addGuard(s3, item.guard, item.name);
            if (!checkGuards(s3))
              return;
            emit(s3);
          }
        }, ctx);
        return;
      }
      case "GroupBind": {
        throw new Error("Group binding @x cannot appear at top level");
      }
      case "Guarded": {
        matchItem(item.pat, node, path, sol, (s2) => {
          const guardEnv = new Map(s2.env);
          guardEnv.set("_", { kind: "scalar", value: node });
          try {
            if (evaluateExpr(item.guard, guardEnv)) {
              emit(s2);
            }
          } catch (e) {
          }
        }, ctx);
        return;
      }
      case "Arr": {
        if (!Array.isArray(node))
          return;
        if (item.label) {
          const s2 = cloneSolution(sol);
          pushBucketLevel(s2);
          if (ctx.flowKey !== void 0) {
            s2.labels.set(item.label, { key: ctx.flowKey, bucketLevel: s2.bucketStack.length - 1 });
          } else {
            s2.labels.set(item.label, { key: void 0, bucketLevel: s2.bucketStack.length - 1 });
          }
          const collected = [];
          matchArray(item.items, node, path, s2, (s3) => {
            collected.push(s3);
          }, ctx);
          if (collected.length > 0) {
            const finalized = finalizeBucketLevel(collected);
            for (const s of finalized)
              emit(s);
          }
        } else {
          matchArray(item.items, node, path, sol, emit, ctx);
        }
        return;
      }
      case "Obj": {
        if (!isObject(node))
          return;
        matchObject(item.terms, item.spread, node, path, sol, emit, ctx, null, item.label);
        return;
      }
      case "Paren": {
        matchItem(item.item, node, path, sol, emit, ctx);
        return;
      }
      default:
        throw new Error(`Unknown item type: ${item.type}`);
    }
  }
}
function matchArrayItemWithRange(item, arr, startIdx, path, sol, onMatch, ctx) {
  guard(ctx);
  switch (item.type) {
    case "Spread": {
      const { min, max } = parseQuantRange(item.quant);
      const maxK = Math.min(max, arr.length - startIdx);
      for (let k = min; k <= maxK; k++) {
        onMatch(cloneSolution(sol), startIdx + k);
        if (ctx.steps > ctx.maxSteps)
          break;
      }
      return;
    }
    case "Seq": {
      matchArraySeqWithRange(item.items, arr, startIdx, path, sol, onMatch, ctx);
      return;
    }
    case "Alt": {
      let anyEmitted = false;
      for (const branch of item.alts) {
        if (item.prioritized && anyEmitted)
          break;
        if (ctx.steps > ctx.maxSteps)
          break;
        guard(ctx);
        let inner = branch;
        while (inner.type === "Paren")
          inner = inner.item;
        matchArrayItemWithRange(inner, arr, startIdx, path, sol, (s, endIdx) => {
          anyEmitted = true;
          onMatch(s, endIdx);
        }, ctx);
      }
      return;
    }
    case "Quant": {
      const m = item.min !== null ? item.min : 0;
      const n = item.max !== null ? item.max : Infinity;
      quantWithRange(item.sub, arr, startIdx, m, n, item.op || "?", path, sol, onMatch, ctx);
      return;
    }
    case "GroupBind": {
      matchArrayItemWithRange(item.pat, arr, startIdx, path, sol, (s2, endIdx) => {
        const slice = arr.slice(startIdx, endIdx);
        const s3 = cloneSolution(s2);
        const groupValue = Group.array(...slice);
        if (bindGroup(s3.env, item.name, groupValue)) {
          recordGroupSite(s3, item.name, path, startIdx, endIdx, slice);
          if (ctx.debug?.onBind) {
            ctx.debug.onBind("group", item.name, groupValue);
          }
          onMatch(s3, endIdx);
        }
      }, ctx);
      return;
    }
    case "SBind": {
      if (item.pat.type === "Seq") {
        matchArraySeqWithRange(item.pat.items, arr, startIdx, path, sol, (s2, endIdx) => {
          if (endIdx - startIdx === 1) {
            const s3 = cloneSolution(s2);
            const element = arr[startIdx];
            if (bindScalar(s3.env, item.name, element)) {
              recordScalarSite(s3, item.name, [...path, startIdx], element);
              if (ctx.debug?.onBind) {
                ctx.debug.onBind("scalar", item.name, element);
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
      if (startIdx < arr.length) {
        matchItem(item, arr[startIdx], [...path, startIdx], sol, (s2) => {
          onMatch(s2, startIdx + 1);
        }, ctx);
      }
      return;
    }
    case "Look": {
      const remainingGroup = arr.slice(startIdx);
      const patternItems = [item.pat, { type: "Spread", quant: null }];
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
            if (!matchedSol)
              matchedSol = s2;
          }, ctx);
          if (matchedSol) {
            onMatch(matchedSol, startIdx);
          }
        }
      }
      return;
    }
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
function quantWithRange(sub, arr, startIdx, m, n, op, path, sol, onMatch, ctx) {
  const maxRep = Math.min(n, arr.length - startIdx);
  const isPossessive = op === "++" || op === "*+" || op === "?+";
  let frontier = [{ idx: startIdx, sol: cloneSolution(sol), reps: 0 }];
  for (let r = 0; r < m; r++) {
    const next = [];
    for (const st of frontier) {
      if (st.idx >= arr.length)
        continue;
      matchItem(sub, arr[st.idx], [...path, st.idx], st.sol, (s2) => {
        next.push({ idx: st.idx + 1, sol: s2, reps: st.reps + 1 });
      }, ctx);
    }
    frontier = next;
    if (!frontier.length)
      return;
  }
  if (isPossessive) {
    for (let r = m; r < maxRep; r++) {
      const grown = [];
      for (const st of frontier) {
        if (st.idx >= arr.length)
          continue;
        matchItem(sub, arr[st.idx], [...path, st.idx], st.sol, (s2) => {
          grown.push({ idx: st.idx + 1, sol: s2, reps: st.reps + 1 });
        }, ctx);
      }
      if (!grown.length)
        break;
      frontier = grown;
    }
    for (const st of frontier) {
      onMatch(st.sol, st.idx);
    }
  } else {
    const allFrontiers = [frontier];
    for (let r = m; r < maxRep; r++) {
      const grown = [];
      for (const st of frontier) {
        if (st.idx >= arr.length)
          continue;
        matchItem(sub, arr[st.idx], [...path, st.idx], st.sol, (s2) => {
          grown.push({ idx: st.idx + 1, sol: s2, reps: st.reps + 1 });
        }, ctx);
      }
      if (!grown.length)
        break;
      frontier = grown;
      allFrontiers.push(frontier);
    }
    for (let i = allFrontiers.length - 1; i >= 0; i--) {
      for (const st of allFrontiers[i]) {
        onMatch(st.sol, st.idx);
      }
    }
  }
}
function matchArray(items, arr, path, sol, emit, ctx) {
  const last = items[items.length - 1];
  const hadTrailingSpread = last && last.type === "Spread" && last.quant == null;
  if (hadTrailingSpread) {
    items = items.slice(0, -1);
  }
  matchArraySeqWithRange(items, arr, 0, path, sol, (s, endIdx) => {
    if (hadTrailingSpread || endIdx === arr.length) {
      emit(cloneSolution(s));
    }
  }, ctx);
}
function matchObject(terms, spread, obj, path, sol, emit, ctx, outMatchedKeys = null, objLabel = null) {
  guard(ctx);
  const DEBUG = false;
  let solutions = [{ sol: cloneSolution(sol), testedKeys: /* @__PURE__ */ new Set(), coveredKeys: /* @__PURE__ */ new Set() }];
  if (objLabel) {
    pushBucketLevel(solutions[0].sol);
  }
  if (DEBUG)
    console.log(`[matchObject] obj keys:`, Object.keys(obj), `terms:`, terms.length);
  for (const term of terms) {
    if (term.type === "GroupBind") {
      const isSpread = term.pat.type === "Spread";
      const next2 = [];
      for (const state of solutions) {
        const { sol: s0, testedKeys, coveredKeys = /* @__PURE__ */ new Set() } = state;
        if (isSpread) {
          const residualKeys = Object.keys(obj).filter((k) => !coveredKeys.has(k));
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
              kind: "group",
              path: [...path],
              keys: residualKeys,
              valueRefs: residualObj
            });
            if (ctx.debug?.onBind) {
              ctx.debug.onBind("group", term.name, groupValue);
            }
            next2.push({ sol: s2, testedKeys: new Set(testedKeys), coveredKeys: new Set(coveredKeys) });
          }
        } else {
          if (term.pat.type !== "OGroup") {
            throw new Error(`GroupBind in object context expects OGroup or Spread pattern, got ${term.pat.type}`);
          }
          const matchedKeys = /* @__PURE__ */ new Set();
          matchObject(
            term.pat.groups,
            null,
            obj,
            path,
            s0,
            (s2) => {
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
                  kind: "group",
                  path: [...path],
                  keys: Array.from(matchedKeys),
                  valueRefs: capturedObj
                });
                if (ctx.debug?.onBind) {
                  ctx.debug.onBind("group", term.name, groupValue);
                }
                const newTestedKeys = new Set(testedKeys);
                const newCoveredKeys = new Set(coveredKeys);
                for (const k of matchedKeys) {
                  newTestedKeys.add(k);
                  newCoveredKeys.add(k);
                }
                next2.push({ sol: s3, testedKeys: newTestedKeys, coveredKeys: newCoveredKeys });
              }
            },
            ctx,
            matchedKeys
            // Collect matched keys
          );
        }
      }
      solutions = next2;
      continue;
    }
    if (term.type === "OGroup") {
      const next2 = [];
      for (const state of solutions) {
        const { coveredKeys = /* @__PURE__ */ new Set() } = state;
        const groupMatchedKeys = /* @__PURE__ */ new Set();
        matchObject(term.groups, null, obj, path, state.sol, (s2) => {
          const newCoveredKeys = new Set(coveredKeys);
          for (const k of groupMatchedKeys) {
            newCoveredKeys.add(k);
          }
          next2.push({ sol: s2, testedKeys: new Set(state.testedKeys), coveredKeys: newCoveredKeys });
        }, ctx, groupMatchedKeys);
      }
      solutions = next2;
      continue;
    }
    if (term.type === "OLook") {
      const next2 = [];
      for (const state of solutions) {
        const { sol: s0, testedKeys, coveredKeys = /* @__PURE__ */ new Set() } = state;
        if (term.neg && term.pat.type === "Spread") {
          const residualKeys = Object.keys(obj).filter((k) => !coveredKeys.has(k));
          const noResiduals = residualKeys.length === 0;
          if (noResiduals) {
            next2.push({ sol: cloneSolution(s0), testedKeys: new Set(testedKeys), coveredKeys: new Set(coveredKeys) });
          }
        } else if (term.neg) {
          let matched = false;
          const lookaheadTestedKeys = new Set(testedKeys);
          matchObjectGroup(term.pat, obj, path, cloneSolution(s0), () => {
            matched = true;
          }, ctx, lookaheadTestedKeys);
          if (!matched) {
            next2.push({ sol: cloneSolution(s0), testedKeys: new Set(testedKeys), coveredKeys: new Set(coveredKeys) });
          }
        } else {
          const hasBindings = patternHasBindings(term.pat);
          const lookaheadTestedKeys = new Set(testedKeys);
          if (hasBindings) {
            matchObjectGroup(term.pat, obj, path, cloneSolution(s0), (s2) => {
              next2.push({ sol: s2, testedKeys: new Set(testedKeys), coveredKeys: new Set(coveredKeys) });
            }, ctx, lookaheadTestedKeys);
          } else {
            let matchedSol = null;
            matchObjectGroup(term.pat, obj, path, cloneSolution(s0), (s2) => {
              if (!matchedSol)
                matchedSol = s2;
            }, ctx, lookaheadTestedKeys);
            if (matchedSol) {
              next2.push({ sol: matchedSol, testedKeys: new Set(testedKeys), coveredKeys: new Set(coveredKeys) });
            }
          }
        }
      }
      solutions = next2;
      continue;
    }
    if (term.type !== "OTerm") {
      throw new Error(`Expected OTerm, GroupBind, OLook, or OGroup, got ${term.type}`);
    }
    const isStrong = term.strong === true;
    const isOptional = term.optional === true;
    if (isStrong) {
      for (const state of solutions) {
        pushBucketLevel(state.sol);
      }
    }
    let next = [];
    for (const state of solutions) {
      const { sol: s0, testedKeys, coveredKeys = /* @__PURE__ */ new Set() } = state;
      if (term.key.type === "RootKey") {
        const s1 = cloneSolution(s0);
        navigateBreadcrumbs(
          term.breadcrumbs,
          obj,
          path,
          s1,
          (finalNode, finalPath, s2) => {
            matchItem(term.val, finalNode, finalPath, s2, (s3) => {
              next.push({ sol: s3, testedKeys: new Set(testedKeys), coveredKeys: new Set(coveredKeys) });
            }, ctx);
          },
          ctx
        );
        continue;
      }
      const matchingKeys = objectKeysMatching(obj, term.key, s0.env);
      if (DEBUG)
        console.log(`[matchObject] term.key:`, term.key, `matched keys:`, matchingKeys);
      const newCoveredKeys = new Set(coveredKeys);
      for (const k of matchingKeys) {
        newCoveredKeys.add(k);
      }
      const sliceKeys = [];
      const badKeys = [];
      for (const k of matchingKeys) {
        let valueMatches = false;
        const testSol = cloneSolution(s0);
        if (objLabel) {
          testSol.labels.set(objLabel, { key: k, bucketLevel: testSol.bucketStack.length - 1 });
        }
        if (term.breadcrumbs && term.breadcrumbs.length > 0) {
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
      if (DEBUG)
        console.log(`[matchObject] slice:`, sliceKeys, `bad:`, badKeys);
      const sliceCount = sliceKeys.length;
      const quant = term.quant;
      const minSlice = quant ? quant.min : isOptional ? 0 : 1;
      const maxSlice = quant ? quant.max : null;
      if (sliceCount < minSlice) {
        if (DEBUG)
          console.log(`[matchObject] failed: slice count ${sliceCount} < min ${minSlice}`);
        continue;
      }
      if (maxSlice !== null && sliceCount > maxSlice) {
        if (DEBUG)
          console.log(`[matchObject] failed: slice count ${sliceCount} > max ${maxSlice}`);
        continue;
      }
      if (isStrong && badKeys.length > 0) {
        if (DEBUG)
          console.log(`[matchObject] failed: bad entries exist with strong semantics (else !)`);
        continue;
      }
      if (sliceKeys.length > 0) {
        for (const k of sliceKeys) {
          const s1 = cloneSolution(s0);
          const newTestedKeys = new Set(testedKeys);
          newTestedKeys.add(k);
          if (objLabel) {
            s1.labels.set(objLabel, { key: k, bucketLevel: s1.bucketStack.length - 1 });
          }
          if (!bindKeyVariables(term.key, k, s1, path)) {
            continue;
          }
          const savedFlowKey = ctx.flowKey;
          ctx.flowKey = k;
          navigateBreadcrumbs(
            term.breadcrumbs,
            obj[k],
            [...path, k],
            s1,
            (finalNode, finalPath, s2) => {
              matchItem(term.val, finalNode, finalPath, s2, (s3) => {
                next.push({ sol: s3, testedKeys: newTestedKeys, coveredKeys: newCoveredKeys });
              }, ctx);
            },
            ctx
          );
          ctx.flowKey = savedFlowKey;
        }
      } else {
        next.push({ sol: cloneSolution(s0), testedKeys: new Set(testedKeys), coveredKeys: newCoveredKeys });
      }
    }
    solutions = next;
    if (isStrong && solutions.length > 0) {
      solutions = finalizeBucketLevel(solutions);
    }
    if (!solutions.length)
      break;
  }
  if (spread && solutions.length > 0) {
    if (spread.type === "OLook") {
      const next = [];
      for (const state of solutions) {
        const { sol: s0, testedKeys, coveredKeys = /* @__PURE__ */ new Set() } = state;
        if (spread.neg && spread.pat.type === "Spread") {
          const residualKeys = Object.keys(obj).filter((k) => !coveredKeys.has(k));
          const noResiduals = residualKeys.length === 0;
          if (noResiduals) {
            next.push({ sol: cloneSolution(s0), testedKeys: new Set(testedKeys), coveredKeys: new Set(coveredKeys) });
          }
        } else {
          throw new Error("General lookahead on remainder not yet implemented");
        }
      }
      solutions = next;
    } else if (spread.type === "GroupBind") {
      const next = [];
      for (const state of solutions) {
        const { sol: s0, testedKeys, coveredKeys = /* @__PURE__ */ new Set() } = state;
        const residualKeys = Object.keys(obj).filter((k) => !coveredKeys.has(k));
        let { min, max } = parseQuantRange(spread.pat?.quant);
        if (!spread.pat?.quant) {
          min = 1;
          max = Infinity;
        } else if (spread.pat.quant === "?") {
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
            kind: "group",
            path: [...path],
            keys: residualKeys,
            valueRefs: residualObj
          });
          if (ctx.debug?.onBind) {
            ctx.debug.onBind("group", spread.name, groupValue);
          }
          next.push({ sol: s2, testedKeys, coveredKeys });
        }
      }
      solutions = next;
    } else {
      const next = [];
      for (const state of solutions) {
        const { sol: s0, testedKeys, coveredKeys = /* @__PURE__ */ new Set() } = state;
        let { min, max } = parseQuantRange(spread.quant);
        if (!spread.quant)
          min = 1;
        const uncoveredCount = Object.keys(obj).filter((k) => !coveredKeys.has(k)).length;
        if (uncoveredCount >= min && (max === null || uncoveredCount <= max)) {
          next.push(state);
        }
      }
      solutions = next;
    }
  }
  if (objLabel && solutions.length > 0) {
    solutions = finalizeBucketLevel(solutions);
  }
  if (outMatchedKeys) {
    for (const state of solutions) {
      for (const k of state.testedKeys) {
        outMatchedKeys.add(k);
      }
    }
  }
  for (const state of solutions)
    emit(state.sol);
}
function matchObjectGroup(group, obj, path, sol, emit, ctx, testedKeys = /* @__PURE__ */ new Set()) {
  guard(ctx);
  if (group.type === "OTerm") {
    matchObject([group], null, obj, path, sol, emit, ctx, testedKeys);
  } else if (group.type === "OGroup") {
    matchObject(group.groups, null, obj, path, sol, emit, ctx, testedKeys);
  } else if (group.type === "GroupBind") {
    matchObject([group], null, obj, path, sol, emit, ctx, testedKeys);
  } else if (group.type === "OLook") {
    matchObject([group], null, obj, path, sol, emit, ctx, testedKeys);
  } else if (group.type === "Spread") {
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
  navigateSingleBreadcrumb(bc, rest, startNode, basePath, sol, emit, ctx);
}
function navigateSingleBreadcrumb(bc, restBreadcrumbs, node, path, sol, emit, ctx) {
  if (bc.kind === "skip") {
    if (!isObject(node))
      return;
    navigateSkipLevels(bc.key, restBreadcrumbs, node, path, sol, emit, ctx);
  } else if (bc.kind === "dot") {
    if (!isObject(node))
      return;
    if (bc.key.type === "SBind") {
      const keyPattern = bc.key.pat;
      const fast = fastBoundKey(bc.key, sol.env, keyMatches, (k) => node.hasOwnProperty(k));
      if (fast !== void 0) {
        if (fast.length === 0)
          return;
        const boundKey = fast[0];
        navigateBreadcrumbs(restBreadcrumbs, node[boundKey], [...path, boundKey], sol, emit, ctx);
        return;
      }
      for (const k of Object.keys(node)) {
        if (!keyMatches(keyPattern, k))
          continue;
        const s2 = cloneSolution(sol);
        if (bindScalar(s2.env, bc.key.name, k)) {
          recordScalarSite(s2, bc.key.name, path, k);
          navigateBreadcrumbs(restBreadcrumbs, node[k], [...path, k], s2, emit, ctx);
        }
      }
    } else {
      const keys = objectKeysMatching(node, bc.key, sol.env);
      for (const k of keys) {
        navigateBreadcrumbs(restBreadcrumbs, node[k], [...path, k], sol, emit, ctx);
      }
    }
  } else if (bc.kind === "bracket") {
    if (!Array.isArray(node))
      return;
    if (bc.key.type === "Lit") {
      const idx = bc.key.value;
      if (Number.isInteger(idx) && idx in node) {
        navigateBreadcrumbs(restBreadcrumbs, node[idx], [...path, idx], sol, emit, ctx);
      }
    } else if (bc.key.type === "Any") {
      for (let i = 0; i < node.length; i++) {
        if (i in node) {
          navigateBreadcrumbs(restBreadcrumbs, node[i], [...path, i], sol, emit, ctx);
        }
      }
    } else if (bc.key.type === "SBind") {
      const idxPattern = bc.key.pat;
      const fast = fastBoundKey(bc.key, sol.env, keyMatches, (i) => Number.isInteger(i) && i in node);
      if (fast !== void 0) {
        if (fast.length === 0)
          return;
        const idx = fast[0];
        navigateBreadcrumbs(restBreadcrumbs, node[idx], [...path, idx], sol, emit, ctx);
        return;
      }
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
  guard(ctx);
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      navigateSkipLevels(keyPattern, restBreadcrumbs, node[i], [...path, i], sol, emit, ctx);
    }
    return;
  }
  if (!isObject(node))
    return;
  if (keyPattern.type === "SBind") {
    const fast = fastBoundKey(keyPattern, sol.env, keyMatches, (k) => node.hasOwnProperty(k));
    if (fast !== void 0) {
      if (fast.length > 0) {
        const boundKey = fast[0];
        if (node.hasOwnProperty(boundKey)) {
          navigateBreadcrumbs(restBreadcrumbs, node[boundKey], [...path, boundKey], sol, emit, ctx);
        }
      }
    } else {
      const pattern = keyPattern.pat;
      for (const k of Object.keys(node)) {
        if (!keyMatches(pattern, k))
          continue;
        const s2 = cloneSolution(sol);
        if (bindScalar(s2.env, keyPattern.name, k)) {
          recordScalarSite(s2, keyPattern.name, path, k);
          navigateBreadcrumbs(restBreadcrumbs, node[k], [...path, k], s2, emit, ctx);
        }
      }
    }
  } else {
    const keys = objectKeysMatching(node, keyPattern, sol.env);
    for (const k of keys) {
      navigateBreadcrumbs(restBreadcrumbs, node[k], [...path, k], sol, emit, ctx);
    }
  }
  for (const k of Object.keys(node)) {
    const child = node[k];
    if (isObject(child) || Array.isArray(child)) {
      navigateSkipLevels(keyPattern, restBreadcrumbs, child, [...path, k], sol, emit, ctx);
    }
  }
}
function fastBoundKey(pat, env, validate, exists) {
  if (!pat || pat.type !== "SBind")
    return void 0;
  const binding = env.get(pat.name);
  if (!binding || binding.kind !== "scalar")
    return void 0;
  if (pat.pat && (pat.pat.type === "SBind" || pat.pat.type === "GroupBind")) {
    return void 0;
  }
  const key = binding.value;
  if (!validate(pat.pat, key))
    return [];
  return exists(key) ? [key] : [];
}
function objectKeysMatching(obj, keyPat, env) {
  const fast = fastBoundKey(keyPat, env, keyMatches, (k) => obj.hasOwnProperty(k));
  if (fast !== void 0)
    return fast;
  const out = [];
  for (const k of Object.keys(obj)) {
    if (keyMatches(keyPat, k))
      out.push(k);
  }
  return out;
}
function keyMatches(pat, key) {
  switch (pat.type) {
    case "Any":
      return true;
    case "TypedAny":
      return pat.kind === "string";
    case "Lit":
      return Object.is(String(key), String(pat.value));
    case "StringPattern":
      return pat.matchFn(String(key));
    case "SBind":
      if (pat.pat) {
        return keyMatches(pat.pat, key);
      }
      return true;
    case "Alt":
      return pat.alts.some((alt) => keyMatches(alt, key));
    default:
      return false;
  }
}
function bindKeyVariables(keyPat, key, sol, path) {
  switch (keyPat.type) {
    case "SBind":
      if (!bindScalar(sol.env, keyPat.name, key)) {
        return false;
      }
      recordScalarSite(sol, keyPat.name, path, key);
      addGuard(sol, keyPat.guard, keyPat.name);
      if (!checkGuards(sol))
        return false;
      return true;
    case "Alt":
      for (const alt of keyPat.alts) {
        if (!keyMatches(alt, key))
          continue;
        const snapshot = cloneSolution(sol);
        if (bindKeyVariables(alt, key, snapshot, path)) {
          sol.env = snapshot.env;
          sol.sites = snapshot.sites;
          return true;
        }
      }
      return false;
    default:
      return true;
  }
}
function isObject(x) {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}
function parseQuantRange(quant) {
  if (!quant)
    return { min: 0, max: Infinity };
  if (typeof quant === "object" && "min" in quant && "max" in quant) {
    return { min: quant.min, max: quant.max };
  }
  if (quant === "?")
    return { min: 0, max: 1 };
  if (quant === "+")
    return { min: 1, max: Infinity };
  if (quant === "*")
    return { min: 0, max: Infinity };
  if (quant === "??")
    return { min: 0, max: 1 };
  if (quant === "+?")
    return { min: 1, max: Infinity };
  if (quant === "*?")
    return { min: 0, max: Infinity };
  if (quant === "++")
    return { min: 1, max: Infinity };
  if (quant === "*+")
    return { min: 0, max: Infinity };
  const rangeMatch = quant.match(/^\{(\d+)(?:,(\d+)?)?\}$/);
  if (rangeMatch) {
    const m = parseInt(rangeMatch[1], 10);
    const n = rangeMatch[2] !== void 0 ? parseInt(rangeMatch[2], 10) : m;
    return { min: m, max: n };
  }
  return { min: 0, max: Infinity };
}
function guard(ctx) {
  ctx.steps++;
  if (ctx.steps > ctx.maxSteps)
    throw new Error("pattern too ambiguous (step budget exceeded)");
}

// src/tendril-api.js
var CACHE_MAX = 64;
var _cache = /* @__PURE__ */ new Map();
function compile(pattern) {
  if (pattern && pattern.type)
    return pattern;
  if (_cache.has(pattern)) {
    const hit = _cache.get(pattern);
    _cache.delete(pattern);
    _cache.set(pattern, hit);
    return hit;
  }
  let ast = parsePattern(String(pattern));
  let isSlicePattern = false;
  if (ast.type === "SlicePattern") {
    isSlicePattern = true;
    if (ast.kind === "object") {
      ast = {
        type: "Obj",
        terms: [{ type: "GroupBind", name: "0", pat: ast.content }],
        spread: null
      };
    } else if (ast.kind === "array") {
      ast = {
        type: "Arr",
        items: [
          { type: "Spread", quant: null },
          { type: "GroupBind", name: "0", pat: ast.content },
          { type: "Spread", quant: null }
        ]
      };
    }
  } else {
    ast = { type: "SBind", name: "0", pat: ast };
  }
  if (isSlicePattern) {
    ast._isSlicePattern = true;
  }
  _cache.set(pattern, ast);
  if (_cache.size > CACHE_MAX) {
    const k = _cache.keys().next().value;
    _cache.delete(k);
  }
  return ast;
}
var Group = class _Group {
  constructor(type, value) {
    Object.defineProperty(this, "_type", {
      value: type,
      writable: false,
      enumerable: false,
      configurable: false
    });
    Object.defineProperty(this, "_value", {
      value,
      writable: false,
      enumerable: false,
      configurable: false
    });
    if (type === "array") {
      value.forEach((v, i) => {
        this[i] = v;
      });
      this.length = value.length;
    } else if (type === "object") {
      Object.assign(this, value);
    }
  }
  static array(...items) {
    return new _Group("array", items);
  }
  static object(obj) {
    return new _Group("object", obj);
  }
  [Symbol.iterator]() {
    if (this._type !== "array") {
      throw new TypeError("Object-type Group is not iterable");
    }
    let i = 0;
    const arr = this._value;
    return {
      next() {
        return i < arr.length ? { value: arr[i++], done: false } : { done: true };
      }
    };
  }
  get [Symbol.toStringTag]() {
    return `Group(${this._type})`;
  }
  at(i) {
    if (this._type === "array")
      return this._value[i];
    throw new TypeError("Not an array group");
  }
};
function cloneDeep(v) {
  if (Array.isArray(v)) {
    return v.map(cloneDeep);
  }
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v)) {
      out[k] = cloneDeep(v[k]);
    }
    return out;
  }
  return v;
}
function getAt(root, path) {
  let current = root;
  for (const key of path)
    current = current[key];
  return current;
}
function setAtMutate(root, path, value) {
  let current = root;
  for (let i = 0; i < path.length - 1; i++)
    current = current[path[i]];
  current[path[path.length - 1]] = value;
}
function stableKey(v) {
  const seen = /* @__PURE__ */ new WeakMap();
  let id = 0;
  const enc = (x) => {
    if (x === null)
      return ["null"];
    const t = typeof x;
    if (t === "undefined")
      return ["u"];
    if (t === "number")
      return ["n", Number.isNaN(x) ? "NaN" : String(x)];
    if (t === "boolean")
      return ["b", x ? "1" : "0"];
    if (t === "string")
      return ["s", x];
    if (t === "function")
      return ["f"];
    if (t !== "object")
      return ["o", String(x)];
    if (seen.has(x))
      return ["r", seen.get(x)];
    seen.set(x, ++id);
    if (Array.isArray(x))
      return ["A", x.map(enc)];
    const keys = Object.keys(x).sort();
    return ["O", keys.map((k) => [k, enc(x[k])])];
  };
  return JSON.stringify(enc(v));
}
function siteKey(site) {
  if (site.kind === "scalar") {
    return JSON.stringify(["scalar", site.path]);
  }
  if (site.groupStart !== void 0) {
    return JSON.stringify(["group-array", site.path, site.groupStart, site.groupEnd]);
  }
  if (site.keys !== void 0) {
    return JSON.stringify(["group-object", site.path, [...site.keys].sort()]);
  }
  return JSON.stringify(["unknown", site.path]);
}
function applyEdits(root, edits, opts = {}) {
  const failures = [];
  if (edits.length === 0)
    return { result: root, failures };
  const onCASFailure = opts.onCASFailure || null;
  let result = root;
  function handleCASFailure(edit, expected, actual) {
    const failure = {
      site: edit.site,
      siteKey: siteKey(edit.site),
      expected,
      actual,
      to: edit.to
    };
    if (onCASFailure) {
      const action = onCASFailure(failure);
      if (action === "force")
        return true;
    }
    failures.push(failure);
    return false;
  }
  const editsByPath = /* @__PURE__ */ new Map();
  for (const edit of edits) {
    const pathKey = JSON.stringify(edit.site.path);
    if (!editsByPath.has(pathKey))
      editsByPath.set(pathKey, []);
    editsByPath.get(pathKey).push(edit);
  }
  for (const [, pathEdits] of editsByPath) {
    const sets = pathEdits.filter((e) => e.site.kind === "scalar");
    const splices = pathEdits.filter((e) => e.site.kind === "group");
    for (const edit of sets) {
      const current = getAt(result, edit.site.path);
      const matches2 = deepEqual(current, edit.site.valueRef);
      if (matches2) {
        if (edit.site.path.length === 0)
          result = edit.to;
        else
          setAtMutate(result, edit.site.path, edit.to);
      } else {
        const shouldForce = handleCASFailure(edit, edit.site.valueRef, current);
        if (shouldForce) {
          if (edit.site.path.length === 0)
            result = edit.to;
          else
            setAtMutate(result, edit.site.path, edit.to);
        }
      }
    }
    if (splices.length > 0) {
      const arraySplices = splices.filter((e) => e.site.groupStart !== void 0);
      const objectSplices = splices.filter((e) => e.site.keys !== void 0);
      if (arraySplices.length > 0) {
        arraySplices.sort((a, b) => a.site.groupStart - b.site.groupStart);
        let offset = 0;
        for (const edit of arraySplices) {
          const arr = getAt(result, edit.site.path);
          if (!Array.isArray(arr))
            continue;
          const start = edit.site.groupStart + offset;
          const end = edit.site.groupEnd + offset;
          const actualSlice = arr.slice(start, end);
          let allMatch = actualSlice.length === edit.site.valueRefs.length;
          if (allMatch) {
            for (let i = 0; i < edit.site.valueRefs.length; i++) {
              if (!deepEqual(actualSlice[i], edit.site.valueRefs[i])) {
                allMatch = false;
                break;
              }
            }
          }
          if (!allMatch) {
            const shouldForce = handleCASFailure(edit, edit.site.valueRefs, actualSlice);
            if (!shouldForce)
              continue;
          }
          if (!edit.to || !(edit.to instanceof Group) || edit.to._type !== "array") {
            throw new Error("Internal error: array group splice requires Group.array");
          }
          const elements = edit.to._value;
          const oldLength = end - start;
          const newLength = elements.length;
          arr.splice(start, oldLength, ...elements);
          offset += newLength - oldLength;
        }
      }
      for (const edit of objectSplices) {
        const obj = getAt(result, edit.site.path);
        if (typeof obj !== "object" || obj === null || Array.isArray(obj))
          continue;
        const actualProps = {};
        let allMatch = true;
        for (const key of edit.site.keys) {
          actualProps[key] = obj[key];
          if (!deepEqual(obj[key], edit.site.valueRefs[key])) {
            allMatch = false;
          }
        }
        if (!allMatch) {
          const shouldForce = handleCASFailure(edit, edit.site.valueRefs, actualProps);
          if (!shouldForce)
            continue;
        }
        if (!edit.to || !(edit.to instanceof Group) || edit.to._type !== "object") {
          throw new Error("Internal error: object group splice requires Group.object");
        }
        const newProps = edit.to._value;
        for (const key of edit.site.keys)
          delete obj[key];
        Object.assign(obj, newProps);
      }
    }
  }
  return { result, failures };
}
function collectEditsFromPlan(sol, planOrFn, edits) {
  const plan = typeof planOrFn === "function" ? planOrFn(sol) || {} : planOrFn || {};
  const sitesMap = sol._sites;
  for (const [varNameRaw, valueSpec] of Object.entries(plan)) {
    const varName = varNameRaw.startsWith("$") || varNameRaw.startsWith("@") ? varNameRaw.slice(1) : varNameRaw;
    const sites = sitesMap.get(varName) || [];
    if (!sites.length)
      continue;
    const value = typeof valueSpec === "function" ? valueSpec(sol) : valueSpec;
    for (const site of sites)
      edits.push({ site, to: convertValueForSite(site, value) });
  }
}
function collectAllSiteEdits(occurrences, planOrFn, opts = {}) {
  const per = opts.per || "site";
  const editsBySiteKey = /* @__PURE__ */ new Map();
  const conflicts = [];
  for (const occ of occurrences) {
    const sols = per === "occurrence" ? occ._solutions.length ? [occ._solutions[0]] : [] : occ._solutions;
    for (const sol of sols) {
      const plan = typeof planOrFn === "function" ? planOrFn(sol) || {} : planOrFn || {};
      const sitesMap = sol._sites;
      for (const [varNameRaw, valueSpec] of Object.entries(plan)) {
        const varName = varNameRaw.startsWith("$") || varNameRaw.startsWith("@") ? varNameRaw.slice(1) : varNameRaw;
        const sites = sitesMap.get(varName) || [];
        if (!sites.length)
          continue;
        const value = typeof valueSpec === "function" ? valueSpec(sol) : valueSpec;
        for (const site of sites) {
          const key = siteKey(site);
          const to = convertValueForSite(site, value);
          if (editsBySiteKey.has(key)) {
            const existing = editsBySiteKey.get(key);
            if (!deepEqual(existing.to, to)) {
              conflicts.push({
                siteKey: key,
                site,
                existing: existing.to,
                attempted: to,
                existingSol: existing.firstSol,
                attemptedSol: sol
              });
            }
          } else {
            editsBySiteKey.set(key, { site, to, firstSol: sol });
          }
        }
      }
    }
  }
  const edits = Array.from(editsBySiteKey.values()).map((e) => ({ site: e.site, to: e.to }));
  return { edits, conflicts };
}
function convertValueForSite(site, value) {
  if (site.kind === "scalar")
    return value;
  const isArrayGroup = site.groupStart !== void 0;
  const isObjectGroup = site.keys !== void 0;
  if (isArrayGroup) {
    if (value instanceof Group && value._type === "array")
      return value;
    if (Array.isArray(value))
      return Group.array(...value);
    return Group.array(value);
  }
  if (isObjectGroup) {
    if (value instanceof Group && value._type === "object")
      return value;
    if (value && typeof value === "object" && !Array.isArray(value))
      return Group.object(value);
    throw new TypeError("Object group replacement expects a plain object");
  }
  return value;
}
function groupByZeroPath(rawSolutions) {
  const map = /* @__PURE__ */ new Map();
  for (const sol of rawSolutions) {
    const zeroSites = sol.sites.get("0") || [];
    if (!zeroSites.length)
      continue;
    const path = zeroSites[0].path || [];
    const key = JSON.stringify(path);
    let group = map.get(key);
    if (!group) {
      group = { path, rawSolutions: [] };
      map.set(key, group);
    }
    group.rawSolutions.push(sol);
  }
  return Array.from(map.values());
}
function normalizeBindings(rawBindings, { includeWhole = false } = {}) {
  const out = {};
  for (const [k, v] of Object.entries(rawBindings)) {
    if (k === "0" && !includeWhole)
      continue;
    out[k] = groupToPublicValue(v);
  }
  return out;
}
function groupToPublicValue(v) {
  if (!v || typeof v !== "object" || !v._type || !v._value)
    return v;
  if (v._type === "array")
    return v._value.slice ? v._value.slice() : [...v._value];
  if (v._type === "object")
    return { ...v._value };
  return v;
}
var Occurrence = class {
  constructor(root, path, rawSolutions, matchSet) {
    this._root = root;
    this._path = path;
    this._rawSolutions = rawSolutions;
    this._matchSet = matchSet;
    this._solutions = rawSolutions.map((raw) => new Solution(raw, this, matchSet));
    const zeroSites = rawSolutions[0]?.sites.get("0") || [];
    this._zeroSite = zeroSites[0] || null;
  }
  path() {
    return [...this._path];
  }
  value() {
    if (!this._zeroSite)
      return void 0;
    return getAt(this._root, this._zeroSite.path);
  }
  solutions() {
    const sols = this._solutions;
    return {
      [Symbol.iterator]() {
        let i = 0;
        return {
          next() {
            if (i >= sols.length)
              return { done: true };
            return { value: sols[i++], done: false };
          }
        };
      }
    };
  }
  /**
   * replace(replOrFn, {mutate?, onCASFailure?}):
   * Replaces $0 for THIS occurrence using the first solution (deterministic).
   * Default is pure (returns new root); pass {mutate:true} to edit in-place.
   */
  replace(replOrFn, opts = {}) {
    if (!this._zeroSite)
      return this._root;
    const mutate = !!opts.mutate;
    const firstSol = this._solutions[0] || null;
    const to = typeof replOrFn === "function" ? replOrFn(firstSol) : replOrFn;
    const edits = [{ site: this._zeroSite, to }];
    const target = mutate ? this._root : cloneDeep(this._root);
    const { result, failures } = applyEdits(target, edits, { onCASFailure: opts.onCASFailure });
    if (failures.length > 0 && typeof result === "object" && result !== null) {
      Object.defineProperty(result, "_editFailures", { value: failures, enumerable: false });
    }
    return result;
  }
  /**
   * edit(plan, {mutate?, per?, onConflict?, onCASFailure?}):
   * Applies variable edits for THIS occurrence.
   *
   * Options:
   *   per: 'site' (default) | 'occurrence'
   *     - 'site': all solutions for this occurrence, dedupe by site
   *     - 'occurrence': first solution only
   */
  edit(planOrFn, opts = {}) {
    const mutate = !!opts.mutate;
    const per = opts.per || "site";
    const { edits, conflicts } = collectAllSiteEdits([this], planOrFn, { per });
    if (conflicts.length > 0 && opts.onConflict) {
      for (const c of conflicts)
        opts.onConflict(c);
    }
    const target = mutate ? this._root : cloneDeep(this._root);
    const { result, failures } = applyEdits(target, edits, { onCASFailure: opts.onCASFailure });
    if ((failures.length > 0 || conflicts.length > 0) && typeof result === "object" && result !== null) {
      if (failures.length > 0) {
        Object.defineProperty(result, "_editFailures", { value: failures, enumerable: false });
      }
      if (conflicts.length > 0) {
        Object.defineProperty(result, "_editConflicts", { value: conflicts, enumerable: false });
      }
    }
    return result;
  }
};
var Solution = class {
  constructor(rawSolution, occ, matchSet) {
    Object.defineProperties(this, {
      _occ: { value: occ, enumerable: false },
      _matchSet: { value: matchSet, enumerable: false },
      _raw: { value: rawSolution, enumerable: false },
      _sites: { value: rawSolution.sites, enumerable: false },
      _bindings: { value: null, writable: true, enumerable: false },
      toObject: { value: () => ({ ...this._bindings }), enumerable: false }
    });
    const publicBindings = normalizeBindings(rawSolution.bindings, { includeWhole: false });
    this._bindings = publicBindings;
    for (const [k, v] of Object.entries(publicBindings))
      this[k] = v;
  }
  bindings() {
    return { ...this._bindings };
  }
  occurrence() {
    return this._occ;
  }
  sites(name) {
    const n = name.startsWith("$") || name.startsWith("@") ? name.slice(1) : name;
    return (this._sites.get(n) || []).slice();
  }
  /**
   * edit(plan, {mutate?, onCASFailure?}):
   * Applies edits using THIS solution only (no site deduplication needed for single solution).
   */
  edit(planOrFn, opts = {}) {
    const mutate = !!opts.mutate;
    const target = mutate ? this._occ._root : cloneDeep(this._occ._root);
    const edits = [];
    collectEditsFromPlan(this, planOrFn, edits);
    const { result, failures } = applyEdits(target, edits, { onCASFailure: opts.onCASFailure });
    if (failures.length > 0 && typeof result === "object" && result !== null) {
      Object.defineProperty(result, "_editFailures", { value: failures, enumerable: false });
    }
    return result;
  }
  /**
   * replace(replOrFn, {mutate?, onCASFailure?}):
   * Replaces $0 for this occurrence using THIS solution.
   */
  replace(replOrFn, opts = {}) {
    if (!this._occ._zeroSite)
      return this._occ._root;
    const mutate = !!opts.mutate;
    const to = typeof replOrFn === "function" ? replOrFn(this) : replOrFn;
    const edits = [{ site: this._occ._zeroSite, to }];
    const target = mutate ? this._occ._root : cloneDeep(this._occ._root);
    const { result, failures } = applyEdits(target, edits, { onCASFailure: opts.onCASFailure });
    if (failures.length > 0 && typeof result === "object" && result !== null) {
      Object.defineProperty(result, "_editFailures", { value: failures, enumerable: false });
    }
    return result;
  }
  /**
   * occurrences():
   * Iterate all occurrences in the match set that contain an equivalent binding set.
   * NOTE: This enumerates all occurrences.
   */
  occurrences() {
    const myKey = stableKey(this._bindings);
    const matchSet = this._matchSet;
    return {
      [Symbol.iterator]() {
        const all = [];
        for (const occ of matchSet) {
          for (const s of occ._solutions) {
            if (stableKey(s._bindings) === myKey) {
              all.push(occ);
              break;
            }
          }
        }
        let i = 0;
        return {
          next() {
            if (i >= all.length)
              return { done: true };
            return { value: all[i++], done: false };
          }
        };
      }
    };
  }
};
var OccurrenceSet = class _OccurrenceSet {
  constructor(root, groups) {
    this._root = root;
    this._occurrences = groups.map((g) => new Occurrence(root, g.path, g.rawSolutions, this));
  }
  [Symbol.iterator]() {
    return this._occurrences[Symbol.iterator]();
  }
  occurrences() {
    return this;
  }
  first() {
    return this._occurrences[0] || null;
  }
  take(n) {
    const sliced = this._occurrences.slice(0, n);
    const groups = sliced.map((o) => ({ path: o._path, rawSolutions: o._rawSolutions }));
    return new _OccurrenceSet(this._root, groups);
  }
  filter(pred) {
    const filtered = this._occurrences.filter(pred);
    const groups = filtered.map((o) => ({ path: o._path, rawSolutions: o._rawSolutions }));
    return new _OccurrenceSet(this._root, groups);
  }
  toArray() {
    return [...this._occurrences];
  }
  count() {
    return this._occurrences.length;
  }
  hasMatch() {
    return this._occurrences.length > 0;
  }
  /**
   * solutions(): returns a SolutionSet of unique solutions across all occurrences.
   */
  solutions() {
    return new SolutionSet(this);
  }
  /**
   * replaceAll(replOrFn, {mutate?, onCASFailure?}):
   * Replaces $0 for each occurrence using the first solution of that occurrence.
   * This is inherently "per occurrence" since $0 is the whole match.
   */
  replaceAll(replOrFn, opts = {}) {
    if (!this._occurrences.length)
      return this._root;
    const mutate = !!opts.mutate;
    const edits = [];
    for (const occ of this._occurrences) {
      if (!occ._zeroSite)
        continue;
      const firstSol = occ._solutions[0] || null;
      const rawTo = typeof replOrFn === "function" ? replOrFn(firstSol) : replOrFn;
      const to = convertValueForSite(occ._zeroSite, rawTo);
      edits.push({ site: occ._zeroSite, to });
    }
    const target = mutate ? this._root : cloneDeep(this._root);
    const { result, failures } = applyEdits(target, edits, { onCASFailure: opts.onCASFailure });
    if (failures.length > 0 && typeof result === "object" && result !== null) {
      Object.defineProperty(result, "_editFailures", { value: failures, enumerable: false });
    }
    return result;
  }
  /**
   * editAll(planOrFn, opts):
   * Edits every bound *site* you referenced, wherever it occurs.
   *
   * Options:
   *   per: 'site' (default) | 'occurrence'
   *     - 'site': iterates all solutions, dedupes by site identity.
   *       This is the right default for redaction, normalization, "change every X".
   *     - 'occurrence': uses first solution per occurrence only.
   *       Useful for $0-focused edits or when you want one edit per match location.
   *   mutate: boolean (default false) - mutate in place vs return copy
   *   onConflict: (conflict) => void - called for planning-time conflicts (same site, different values)
   *   onCASFailure: (failure) => 'skip' | 'force' - called for apply-time CAS failures
   */
  editAll(planOrFn, opts = {}) {
    if (!this._occurrences.length)
      return this._root;
    const mutate = !!opts.mutate;
    const { edits, conflicts } = collectAllSiteEdits(this._occurrences, planOrFn, { per: opts.per });
    if (conflicts.length > 0 && opts.onConflict) {
      for (const c of conflicts)
        opts.onConflict(c);
    }
    const target = mutate ? this._root : cloneDeep(this._root);
    const { result, failures } = applyEdits(target, edits, { onCASFailure: opts.onCASFailure });
    if ((failures.length > 0 || conflicts.length > 0) && typeof result === "object" && result !== null) {
      if (failures.length > 0) {
        Object.defineProperty(result, "_editFailures", { value: failures, enumerable: false });
      }
      if (conflicts.length > 0) {
        Object.defineProperty(result, "_editConflicts", { value: conflicts, enumerable: false });
      }
    }
    return result;
  }
};
var SolutionSet = class {
  constructor(occSet) {
    this._occSet = occSet;
  }
  [Symbol.iterator]() {
    const occs = this._occSet._occurrences;
    const seen = /* @__PURE__ */ new Set();
    let oi = 0;
    let si = 0;
    let curOcc = occs[0] || null;
    return {
      next() {
        while (true) {
          if (!curOcc)
            return { done: true };
          if (si >= curOcc._solutions.length) {
            oi++;
            if (oi >= occs.length)
              return { done: true };
            curOcc = occs[oi];
            si = 0;
            continue;
          }
          const sol = curOcc._solutions[si++];
          const key = stableKey(sol._bindings);
          if (seen.has(key))
            continue;
          seen.add(key);
          return { value: sol, done: false };
        }
      }
    };
  }
  first() {
    const it = this[Symbol.iterator]();
    const n = it.next();
    return n.done ? null : n.value;
  }
  toArray() {
    return Array.from(this);
  }
  count() {
    let c = 0;
    for (const _ of this)
      c++;
    return c;
  }
  filter(pred) {
    const out = [];
    for (const sol of this)
      if (pred(sol))
        out.push(sol);
    return new FilteredSolutionSet(out, this._occSet);
  }
  take(n) {
    const out = [];
    let c = 0;
    for (const sol of this) {
      if (c++ >= n)
        break;
      out.push(sol);
    }
    return new FilteredSolutionSet(out, this._occSet);
  }
};
var FilteredSolutionSet = class _FilteredSolutionSet {
  constructor(solutions, occSet) {
    this._solutions = solutions;
    this._occSet = occSet;
  }
  [Symbol.iterator]() {
    return this._solutions[Symbol.iterator]();
  }
  first() {
    return this._solutions[0] || null;
  }
  toArray() {
    return [...this._solutions];
  }
  count() {
    return this._solutions.length;
  }
  filter(pred) {
    return new _FilteredSolutionSet(this._solutions.filter(pred), this._occSet);
  }
  take(n) {
    return new _FilteredSolutionSet(this._solutions.slice(0, n), this._occSet);
  }
};
var OnMatcher = class {
  constructor(pattern, data) {
    this._pattern = pattern;
    this._data = data;
    this._occSet = null;
  }
  _getOccSet() {
    if (!this._occSet) {
      this._occSet = this._pattern.advancedMatch(this._data);
    }
    return this._occSet;
  }
  /** Boolean: does the pattern match the data at root? */
  test() {
    return this._pattern.hasMatch(this._data);
  }
  /**
   * First solution as a plain object, or null if no match.
   * Empty object {} means "matched but no bindings".
   */
  solve() {
    const occSet = this._getOccSet();
    const sol = occSet.solutions().first();
    return sol ? sol.toObject() : null;
  }
  /** All solutions as an array of plain objects. */
  solutions() {
    const occSet = this._getOccSet();
    const out = [];
    for (const sol of occSet.solutions()) {
      out.push(sol.toObject());
    }
    return out;
  }
  /**
   * Replace the entire match.
   * @param replacement - value or function (bindings) => value
   */
  replace(replacement) {
    const occSet = this._getOccSet();
    if (!occSet.hasMatch())
      return this._data;
    return occSet.replaceAll(replacement, { mutate: false });
  }
  /**
   * Mutate (edit in place) specific bindings.
   * @param mutation - {varName: value|fn, ...} or function (bindings) => {...}
   */
  mutate(mutation) {
    const occSet = this._getOccSet();
    if (!occSet.hasMatch())
      return this._data;
    return occSet.editAll(mutation, { mutate: false });
  }
};
var InMatcher = class {
  constructor(pattern, data) {
    this._pattern = pattern;
    this._data = data;
    this._occSet = null;
  }
  _getOccSet() {
    if (!this._occSet) {
      this._occSet = this._pattern.advancedFind(this._data);
    }
    return this._occSet;
  }
  /** Count of matching occurrences. */
  count() {
    return this._getOccSet().count();
  }
  /**
   * Array of {path, fragment, bindings} for each occurrence.
   * Uses first solution per occurrence (with warning if multiple solutions).
   */
  locations() {
    const occSet = this._getOccSet();
    const results = [];
    for (const occ of occSet) {
      const sols = [...occ.solutions()];
      if (sols.length > 1) {
        console.warn(
          `Tendril: occurrence at path ${JSON.stringify(occ.path())} has ${sols.length} solutions; using first. Consider refining your pattern for deterministic results.`
        );
      }
      const firstSol = sols[0] || null;
      results.push({
        path: occ.path(),
        fragment: occ.value(),
        bindings: firstSol ? firstSol.toObject() : {}
      });
    }
    return results;
  }
  /**
   * Replace all occurrences.
   * @param replacement - value or function (bindings) => value
   */
  replace(replacement) {
    const occSet = this._getOccSet();
    if (!occSet.hasMatch())
      return this._data;
    for (const occ of occSet) {
      const solCount = [...occ.solutions()].length;
      if (solCount > 1) {
        console.warn(
          `Tendril: occurrence at path ${JSON.stringify(occ.path())} has ${solCount} solutions; using first for replacement. Consider refining your pattern.`
        );
      }
    }
    return occSet.replaceAll(replacement, { mutate: false });
  }
  /**
   * Mutate (surgically edit) specific bindings across all occurrences.
   * @param mutation - {varName: value|fn, ...} or function (bindings) => {...}
   */
  mutate(mutation) {
    const occSet = this._getOccSet();
    if (!occSet.hasMatch())
      return this._data;
    return occSet.editAll(mutation, { mutate: false });
  }
};
var PatternImpl = class _PatternImpl {
  constructor(pattern) {
    this._pattern = String(pattern);
    this._ast = null;
    this._opts = {};
    this._debug = null;
  }
  withOptions(opts) {
    const p = new _PatternImpl(this._pattern);
    p._ast = this._ast;
    p._opts = { ...this._opts, ...opts };
    p._debug = this._debug;
    return p;
  }
  debug(listener) {
    const p = new _PatternImpl(this._pattern);
    p._ast = this._ast;
    p._opts = this._opts;
    p._debug = listener;
    return p;
  }
  _getAst() {
    if (!this._ast)
      this._ast = compile(this._pattern);
    return this._ast;
  }
  _buildOpts() {
    const opts = { ...this._opts };
    if (this._debug)
      opts.debug = this._debug;
    return opts;
  }
  // ==================== Simple API ====================
  /**
   * on(data): Simple anchored matching API.
   * Returns OnMatcher with .test(), .solve(), .solutions(), .replace(), .mutate()
   */
  on(input) {
    return new OnMatcher(this, input);
  }
  /**
   * in(data): Simple search-within API.
   * Returns InMatcher with .count(), .locations(), .replace(), .mutate()
   */
  in(input) {
    return new InMatcher(this, input);
  }
  // ==================== Advanced API ====================
  /**
   * advancedMatch(data): anchored match at the root.
   * Returns an OccurrenceSet (possibly empty; at most one occurrence: []).
   */
  advancedMatch(input) {
    const ast = this._getAst();
    if (ast._isSlicePattern) {
      throw new Error("Slice patterns (@{ } and @[ ]) require advancedFind() or first(), not advancedMatch()");
    }
    const rawSolutions = match(ast, input, this._buildOpts());
    const groups = groupByZeroPath(rawSolutions);
    return new OccurrenceSet(input, groups);
  }
  /**
   * advancedFind(data): scan for matches at any depth.
   * Returns an OccurrenceSet over all occurrences.
   */
  advancedFind(input) {
    const ast = this._getAst();
    const rawSolutions = scan(ast, input, this._buildOpts());
    const groups = groupByZeroPath(rawSolutions);
    return new OccurrenceSet(input, groups);
  }
  // Legacy aliases for backwards compatibility (will be deprecated)
  match(input) {
    return this.advancedMatch(input);
  }
  find(input) {
    return this.advancedFind(input);
  }
  /**
   * first(data): first occurrence only (scan + stop).
   * Returns OccurrenceSet with 0 or 1 occurrence.
   */
  first(input) {
    const ast = this._getAst();
    const rawSol = scanFirst(ast, input, this._buildOpts());
    if (!rawSol)
      return new OccurrenceSet(input, []);
    const zeroSites = rawSol.sites.get("0") || [];
    const path = zeroSites.length ? zeroSites[0].path : [];
    return new OccurrenceSet(input, [{ path, rawSolutions: [rawSol] }]);
  }
  // ------------- Short-circuit methods (fast paths) -------------
  hasMatch(input) {
    const ast = this._getAst();
    if (ast._isSlicePattern) {
      throw new Error("Slice patterns (@{ } and @[ ]) require in() or advancedFind(), not on()/advancedMatch()/hasMatch()");
    }
    return matchExists(ast, input, this._buildOpts());
  }
  hasAnyMatch(input) {
    const ast = this._getAst();
    return scanExists(ast, input, this._buildOpts());
  }
};
function Tendril(pattern) {
  if (typeof pattern !== "string") {
    throw new TypeError(`Tendril(): pattern must be a string, got ${typeof pattern}`);
  }
  return new PatternImpl(pattern);
}
function firstSolutionObject(solutionsIterable) {
  const it = solutionsIterable[Symbol.iterator]();
  const n = it.next();
  if (n.done)
    return null;
  return n.value.toObject();
}
function matches(pattern, input) {
  return Tendril(pattern).match(input).hasMatch();
}
function extract(pattern, input) {
  const mset = Tendril(pattern).match(input);
  const solObj = firstSolutionObject(mset.solutions());
  return solObj;
}
function extractAll(pattern, input) {
  const mset = Tendril(pattern).match(input);
  const out = [];
  for (const sol of mset.solutions())
    out.push(sol.toObject());
  return out;
}
function replace(pattern, input, builder) {
  const occ = Tendril(pattern).first(input).first();
  if (!occ)
    return input;
  return occ.replace(builder, { mutate: false });
}
function replaceAll(pattern, input, builder) {
  return Tendril(pattern).find(input).replaceAll(builder, { mutate: false });
}
function uniqueMatches(pattern, input, ...vars) {
  const mset = Tendril(pattern).match(input);
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const sol of mset.solutions()) {
    const obj = sol.toObject();
    const projected = {};
    for (const v of vars) {
      const key2 = v.startsWith("$") || v.startsWith("@") ? v.slice(1) : v;
      if (Object.prototype.hasOwnProperty.call(obj, key2))
        projected[key2] = obj[key2];
    }
    const key = stableKey(projected);
    if (seen.has(key))
      continue;
    seen.add(key);
    out.push(projected);
  }
  return out;
}
export {
  Group,
  Tendril,
  extract,
  extractAll,
  matches,
  replace,
  replaceAll,
  uniqueMatches
};
//# sourceMappingURL=tendril.esm.js.map
