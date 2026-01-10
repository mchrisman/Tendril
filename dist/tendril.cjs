/**
 * Tendril v0.1.0
 * Structural pattern matching + relational logic for JSON-like graphs
 * @license MIT
 */
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/tendril-api.js
var tendril_api_exports = {};
__export(tendril_api_exports, {
  Group: () => Group,
  Tendril: () => Tendril,
  extract: () => extract,
  extractAll: () => extractAll,
  matches: () => matches,
  replace: () => replace,
  replaceAll: () => replaceAll,
  uniqueMatches: () => uniqueMatches
});
module.exports = __toCommonJS(tendril_api_exports);

// src/tendril-util.js
function deepEqual(a, b) {
  if (a === b)
    return true;
  if (a === null || b === null)
    return false;
  if (typeof a !== typeof b)
    return false;
  if (typeof a !== "object")
    return Object.is(a, b);
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
    toks.push({ k, v, pos: i });
    i += len;
  };
  const reWS = /\s+/y;
  const reNum = /\d+/y;
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
      push("str", out, j + 1 - i);
      continue;
    }
    if (c === "/" && src[i + 1] !== "/") {
      let found = false;
      for (let j = i + 1; j < src.length && !found; ) {
        j = src.indexOf("/", j);
        if (j < 0)
          break;
        let k = j + 1;
        while (k < src.length && /[a-z]/i.test(src[k]))
          k++;
        const pattern = src.slice(i + 1, j);
        const flags = src.slice(j + 1, k);
        try {
          new RegExp(pattern, flags);
          push("re", { source: pattern, flags }, k - i);
          found = true;
        } catch {
          j++;
        }
      }
      if (!found)
        throw syntax(`unterminated or invalid regex`, src, i);
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
      if (w === "_") {
        push("any", "_", j - i);
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
      push("id", w, j - i);
      continue;
    }
    if (c3 === "(?=") {
      push("(?=", "(?=", 3);
      continue;
    }
    if (c3 === "(?!") {
      push("(?!", "(?!", 3);
      continue;
    }
    if (c2 === "..") {
      push("..", "..", 2);
      continue;
    }
    if (c2 === "?:") {
      push("?:", "?:", 2);
      continue;
    }
    if (c2 === "??") {
      push("??", "??", 2);
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
    const single = "[](){}:,.$@=|*+?!-#".includes(c) ? c : null;
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
  constructor(src, tokens = tokenize(src)) {
    this.src = src;
    this.toks = tokens;
    this.i = 0;
    this._cut = null;
    this.farthest = { i: 0, exp: /* @__PURE__ */ new Set() };
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
    var _a;
    if (this.i >= this.farthest.i) {
      const set = new Set(this.farthest.exp);
      set.add(msg);
      this.farthest = { i: this.i, exp: set };
    }
    const pos = ((_a = this.toks[this.i]) == null ? void 0 : _a.pos) ?? this.src.length;
    throw syntax(msg, this.src, pos);
  }
  // --- backtracking
  backtrack(fn) {
    const save = this.mark();
    try {
      return fn();
    } catch (e) {
      if (this._cut != null && save.i >= this._cut)
        throw e;
      this.restore(save);
      return null;
    }
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

// src/tendril-parser.js
function parsePattern(src) {
  const p = new Parser(src);
  const ast = parseRootPattern(p);
  if (!p.atEnd())
    p.fail("trailing input after pattern");
  return ast;
}
var Any = () => ({ type: "Any" });
var Lit = (v) => ({ type: "Lit", value: v });
var Re = (r) => ({ type: "Re", re: r });
var Bool = (v) => ({ type: "Bool", value: v });
var Null = () => ({ type: "Null" });
var RootKey = () => ({ type: "RootKey" });
var SBind = (name, pat) => ({ type: "SBind", name, pat });
var GroupBind = (name, pat) => ({ type: "GroupBind", name, pat });
var Arr = (items) => ({ type: "Arr", items });
var Obj = (terms, spread = null) => ({ type: "Obj", terms, spread });
var Alt = (alts) => ({ type: "Alt", alts });
var Look = (neg, pat) => ({ type: "Look", neg, pat });
var Quant = (sub, op, min = null, max = null) => ({
  type: "Quant",
  sub,
  op,
  // '?', '??', '+', '++', '+?', '*', '*+', '*?', '*{...}'
  min,
  max
});
var OTerm = (key, breadcrumbs, op, val, quant) => ({
  type: "OTerm",
  key,
  // ITEM
  breadcrumbs,
  // Breadcrumb[]
  op,
  // '=' or '?='
  val,
  // ITEM
  quant
  // null or {min, max}
});
var Spread = (quant) => ({ type: "Spread", quant });
var Breadcrumb = (kind, key, quant) => ({
  type: "Breadcrumb",
  kind,
  // 'dot' or 'bracket'
  key,
  // ITEM
  quant
  // null or {op: '?'|'+'|'*', min, max}
});
function parseRootPattern(p) {
  return parseItem(p);
}
function parseItem(p) {
  let left = parseItemTerm(p);
  if (p.peek("|")) {
    const alts = [left];
    while (p.maybe("|")) {
      alts.push(parseItemTerm(p));
    }
    return Alt(alts);
  }
  return left;
}
function parseItemTerm(p) {
  if (p.peek("(?=") || p.peek("(?!")) {
    return parseLookahead(p);
  }
  if (p.peek("(")) {
    p.eat("(");
    const inner = parseItem(p);
    p.eat(")");
    return inner;
  }
  if (p.peek("$")) {
    p.eat("$");
    const name = p.eat("id").v;
    if (p.maybe("=")) {
      p.eat("(");
      const pat = parseItem(p);
      p.eat(")");
      return SBind(name, pat);
    }
    return SBind(name, Any());
  }
  if (p.peek("@")) {
    p.eat("@");
    const name = p.eat("id").v;
    if (p.maybe("=")) {
      p.eat("(");
      const pat = parseAGroup(p);
      p.eat(")");
      return GroupBind(name, pat);
    }
    return GroupBind(name, Quant(Any(), "*", 0, Infinity));
  }
  if (p.maybe("any")) {
    return Any();
  }
  if (p.peek("num")) {
    return Lit(p.eat("num").v);
  }
  if (p.peek("bool")) {
    return Bool(p.eat("bool").v);
  }
  if (p.peek("null")) {
    p.eat("null");
    return Null();
  }
  if (p.peek("str")) {
    return Lit(p.eat("str").v);
  }
  if (p.peek("id")) {
    return Lit(p.eat("id").v);
  }
  if (p.peek("re")) {
    const { source, flags } = p.eat("re").v;
    return Re(makeRegExp({ source, flags }));
  }
  if (p.peek("{")) {
    return parseObj(p);
  }
  if (p.peek("[")) {
    return parseArr(p);
  }
  p.fail("expected item (literal, wildcard, $var, @var, array, object, or parenthesized expression)");
}
function parseLookahead(p) {
  let neg = false;
  if (p.peek("(?=")) {
    p.eat("(?=");
  } else if (p.peek("(?!")) {
    p.eat("(?!");
    neg = true;
  } else {
    p.fail("expected (?= or (?! for lookahead");
  }
  const pat = parseAGroup(p);
  p.eat(")");
  return Look(neg, pat);
}
function parseObjectLookahead(p) {
  let neg = false;
  if (p.peek("(?=")) {
    p.eat("(?=");
  } else if (p.peek("(?!")) {
    p.eat("(?!");
    neg = true;
  } else {
    p.fail("expected (?= or (?! for object lookahead");
  }
  const pat = parseOGroup(p);
  p.eat(")");
  return { type: "OLook", neg, pat };
}
function parseABody(p, stopToken) {
  const items = [];
  while (!p.peek(stopToken)) {
    items.push(parseAGroup(p));
    p.maybe(",");
  }
  return items;
}
function parseArr(p) {
  p.eat("[");
  const items = parseABody(p, "]");
  p.eat("]");
  return Arr(items);
}
function parseAGroup(p) {
  if (p.peek("..")) {
    p.eat("..");
    const quant = p.backtrack(() => parseAQuant(p));
    return Spread(quant ? `${quant.op}` : null);
  }
  let base = parseAGroupBase(p);
  const q = p.backtrack(() => parseAQuant(p));
  if (q) {
    base = Quant(base, q.op, q.min, q.max);
  }
  if (p.peek("|")) {
    const alts = [base];
    while (p.maybe("|")) {
      let alt = parseAGroupBase(p);
      const q2 = p.backtrack(() => parseAQuant(p));
      if (q2) {
        alt = Quant(alt, q2.op, q2.min, q2.max);
      }
      alts.push(alt);
    }
    return Alt(alts);
  }
  return base;
}
function parseAGroupBase(p) {
  if (p.peek("(?=") || p.peek("(?!")) {
    return parseLookahead(p);
  }
  if (p.peek("(")) {
    p.eat("(");
    const items = parseABody(p, ")");
    p.eat(")");
    if (items.length === 1)
      return items[0];
    return { type: "Seq", items };
  }
  if (p.peek("@")) {
    p.eat("@");
    const name = p.eat("id").v;
    if (p.maybe("=")) {
      p.eat("(");
      const items = parseABody(p, ")");
      p.eat(")");
      const pat = items.length === 1 ? items[0] : { type: "Seq", items };
      return GroupBind(name, pat);
    }
    return GroupBind(name, Quant(Any(), "*", 0, Infinity));
  }
  if (p.peek("$")) {
    p.eat("$");
    const name = p.eat("id").v;
    if (p.maybe("=")) {
      p.eat("(");
      const items = parseABody(p, ")");
      p.eat(")");
      const pat = items.length === 1 ? items[0] : { type: "Seq", items };
      return SBind(name, pat);
    }
    return SBind(name, Any());
  }
  return parseItemTerm(p);
}
function parseAQuant(p) {
  if (p.maybe("??"))
    return { op: "??", min: 0, max: 1 };
  if (p.maybe("?"))
    return { op: "?", min: 0, max: 1 };
  if (p.maybe("++"))
    return { op: "++", min: 1, max: null };
  if (p.maybe("+?"))
    return { op: "+?", min: 1, max: null };
  if (p.maybe("+"))
    return { op: "+", min: 1, max: null };
  if (p.maybe("*+"))
    return { op: "*+", min: 0, max: null };
  if (p.maybe("*?"))
    return { op: "*?", min: 0, max: null };
  if (p.maybe("*"))
    return { op: "*", min: 0, max: null };
  if (p.maybe("{")) {
    let min = null, max = null;
    if (p.maybe(",")) {
      min = 0;
      max = p.eat("num").v;
    } else {
      min = p.eat("num").v;
      if (p.maybe(",")) {
        if (p.peek("num")) {
          max = p.eat("num").v;
        } else {
          max = null;
        }
      } else {
        max = min;
      }
    }
    p.eat("}");
    return { op: `{${min},${max ?? ""}}`, min, max };
  }
  p.fail("expected quantifier");
}
function parseObj(p) {
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
  return Obj(terms, remnant);
}
function parseORemnant(p) {
  const bindRemnant = p.backtrack(() => {
    if (!p.peek("@"))
      return null;
    p.eat("@");
    const name = p.eat("id").v;
    if (!p.maybe("="))
      return null;
    p.eat("(");
    if (!(p.peek("id") && p.peek().v === "remainder"))
      return null;
    p.eat("id");
    const quant = p.maybe("?") ? "?" : null;
    p.eat(")");
    p.maybe(",");
    return GroupBind(name, Spread(quant));
  });
  if (bindRemnant)
    return bindRemnant;
  const bareRemnant = p.backtrack(() => {
    if (!(p.peek("id") && p.peek().v === "remainder"))
      return null;
    p.eat("id");
    const quant = p.maybe("?") ? "?" : null;
    p.maybe(",");
    return Spread(quant);
  });
  if (bareRemnant)
    return bareRemnant;
  const negRemnant = p.backtrack(() => {
    if (!p.peek("(?!"))
      return null;
    p.eat("(?!");
    if (!(p.peek("id") && p.peek().v === "remainder"))
      return null;
    p.eat("id");
    p.eat(")");
    p.maybe(",");
    return { type: "OLook", neg: true, pat: Spread(null) };
  });
  if (negRemnant)
    return negRemnant;
  if (p.peek("..")) {
    p.fail('bare ".." not allowed in objects; use "remainder" or "@x=(remainder)" instead');
  }
  return null;
}
function parseOGroup(p) {
  if (p.peek("(?=") || p.peek("(?!")) {
    return parseObjectLookahead(p);
  }
  const groupResult = p.backtrack(() => {
    p.eat("(");
    const groups = [];
    while (!p.peek(")")) {
      groups.push(parseOGroup(p));
      p.maybe(",");
    }
    p.eat(")");
    return { type: "OGroup", groups };
  });
  if (groupResult)
    return groupResult;
  if (p.peek("@")) {
    p.eat("@");
    const name = p.eat("id").v;
    if (p.maybe("=")) {
      p.eat("(");
      const groups = [];
      while (!p.peek(")")) {
        groups.push(parseOGroup(p));
        p.maybe(",");
      }
      p.eat(")");
      return GroupBind(name, { type: "OGroup", groups });
    }
    p.fail("bare @x not allowed in objects; use @x=(remainder) to bind residual keys");
  }
  return parseOTerm(p);
}
function parseOTerm(p) {
  let key;
  const breadcrumbs = [];
  if (p.peek("..")) {
    key = RootKey();
  } else {
    key = parseItem(p);
  }
  while (p.peek(".") || p.peek("..") || p.peek("[")) {
    const bc = parseBreadcrumb(p);
    if (bc)
      breadcrumbs.push(bc);
    else
      break;
  }
  let op = null;
  const questOp = p.backtrack(() => {
    if (!p.maybe("?"))
      return null;
    if (p.maybe("?:"))
      return "?:";
    if (p.maybe(":"))
      return "?:";
    return null;
  });
  if (questOp) {
    op = questOp;
  } else if (p.maybe("?:")) {
    op = "?:";
  } else if (p.maybe(":")) {
    op = ":";
  } else {
    p.fail("expected : or ?: in object term");
  }
  const val = parseItem(p);
  const quant = parseOQuant(p);
  return OTerm(key, breadcrumbs, op, val, quant);
}
function parseBreadcrumb(p) {
  if (p.peek("..")) {
    p.eat("..");
    if (p.peek(":") || p.peek("?:") || p.peek("?")) {
      return Breadcrumb("skip", Any(), null);
    }
    const key = parseItem(p);
    return Breadcrumb("skip", key, null);
  }
  if (p.peek(".")) {
    p.eat(".");
    const key = parseItem(p);
    return Breadcrumb("dot", key, null);
  }
  if (p.peek("[")) {
    p.eat("[");
    const key = parseItem(p);
    p.eat("]");
    return Breadcrumb("bracket", key, null);
  }
  return null;
}
function parseOQuant(p) {
  if (!p.peek("#"))
    return null;
  p.eat("#");
  if (p.maybe("?")) {
    return { min: 0, max: null };
  }
  if (!p.peek("{"))
    p.fail("expected { or ? after #");
  p.eat("{");
  const min = p.eat("num").v;
  let max = min;
  if (p.maybe(",")) {
    if (p.peek("num")) {
      max = p.eat("num").v;
    } else {
      max = null;
    }
  }
  p.eat("}");
  if (max !== null && max < min)
    p.fail("O_QUANT upper < lower");
  return { min, max };
}
Parser.prototype.peekAt = function(offset, kind) {
  const idx = this.i + offset;
  if (idx >= this.toks.length)
    return false;
  return this.toks[idx].k === kind;
};

// src/tendril-engine.js
function newSolution() {
  return { env: /* @__PURE__ */ new Map(), sites: /* @__PURE__ */ new Map() };
}
function cloneSolution(sol) {
  const sites = /* @__PURE__ */ new Map();
  for (const [k, v] of sol.sites) {
    sites.set(k, [...v]);
  }
  return { env: cloneEnv(sol.env), sites };
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
function match(ast, input, opts = {}) {
  const maxSteps = opts.maxSteps ?? 2e6;
  const debug = opts.debug;
  const ctx = { steps: 0, maxSteps, debug };
  const solutions = [];
  matchItem(ast, input, [], newSolution(), (sol) => solutions.push(sol), ctx);
  return solutions.map((sol) => {
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
  return solutions.map((sol) => {
    const bindings = Object.fromEntries(
      Array.from(sol.env.entries()).map(([k, v]) => [k, v.value])
    );
    return { bindings, sites: sol.sites };
  });
}
function matchItem(item, node, path, sol, emit, ctx) {
  var _a, _b;
  guard(ctx);
  if ((_a = ctx.debug) == null ? void 0 : _a.onEnter) {
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
    if ((_b = ctx.debug) == null ? void 0 : _b.onExit) {
      ctx.debug.onExit(item.type, node, path, matched);
    }
  }
  function doMatch() {
    switch (item.type) {
      case "Any":
        emit(cloneSolution(sol));
        return;
      case "Lit":
        if (Object.is(node, item.value))
          emit(cloneSolution(sol));
        return;
      case "Re":
        if (item.re.test(String(node)))
          emit(cloneSolution(sol));
        return;
      case "Bool":
        if (Object.is(node, item.value))
          emit(cloneSolution(sol));
        return;
      case "Null":
        if (node === null)
          emit(cloneSolution(sol));
        return;
      case "Alt": {
        for (const sub of item.alts) {
          matchItem(sub, node, path, sol, emit, ctx);
          guard(ctx);
        }
        return;
      }
      case "Look": {
        let matchedSol = null;
        matchItem(item.pat, node, path, cloneSolution(sol), (s2) => {
          if (!matchedSol)
            matchedSol = s2;
        }, ctx);
        const matched2 = matchedSol !== null;
        if (matched2 && !item.neg || !matched2 && item.neg) {
          emit(matched2 ? matchedSol : cloneSolution(sol));
        }
        return;
      }
      case "SBind": {
        if (item.pat.type === "Seq") {
          return;
        }
        matchItem(item.pat, node, path, sol, (s2) => {
          var _a2;
          const s3 = cloneSolution(s2);
          if (bindScalar(s3.env, item.name, node)) {
            recordScalarSite(s3, item.name, path, node);
            if ((_a2 = ctx.debug) == null ? void 0 : _a2.onBind) {
              ctx.debug.onBind("scalar", item.name, node);
            }
            emit(s3);
          }
        }, ctx);
        return;
      }
      case "GroupBind": {
        throw new Error("Group binding @x cannot appear at top level");
      }
      case "Arr": {
        if (!Array.isArray(node))
          return;
        matchArray(item.items, node, path, sol, emit, ctx);
        return;
      }
      case "Obj": {
        if (!isObject(node))
          return;
        matchObject(item.terms, item.spread, node, path, sol, emit, ctx);
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
function matchArray(items, arr, path, sol, emit, ctx) {
  const last = items[items.length - 1];
  const hadTrailingSpread = last && last.type === "Spread" && last.quant == null;
  if (hadTrailingSpread) {
    items = items.slice(0, -1);
  }
  stepItems(0, 0, sol);
  function stepItems(ixItem, ixArr, sIn) {
    guard(ctx);
    if (ixItem === items.length) {
      if (hadTrailingSpread || ixArr === arr.length) {
        emit(cloneSolution(sIn));
      }
      return;
    }
    const it = items[ixItem];
    if (it.type === "Spread") {
      const { min, max } = parseQuantRange(it.quant);
      const maxK = Math.min(max, arr.length - ixArr);
      for (let k = min; k <= maxK; k++) {
        stepItems(ixItem + 1, ixArr + k, sIn);
        if (ctx.steps > ctx.maxSteps)
          break;
      }
      return;
    }
    if (it.type === "GroupBind") {
      return matchArrayGroupBind(it, ixItem, ixArr, sIn);
    }
    if (it.type === "Quant") {
      const min = it.min !== null ? it.min : 0;
      const max = it.max !== null ? it.max : Infinity;
      const op = it.op || "?";
      return quantOnArray(it.sub, min, max, op, ixItem, ixArr, sIn);
    }
    if (it.type === "Look") {
      let matchedSol = null;
      const remainingGroup = arr.slice(ixArr);
      const testSol = it.neg ? cloneSolution(sIn) : sIn;
      const patternItems = [it.pat];
      const lastItem = patternItems[patternItems.length - 1];
      const alreadyUnanchored = lastItem && lastItem.type === "Spread";
      if (!alreadyUnanchored) {
        patternItems.push({ type: "Spread", quant: null });
      }
      matchArray(patternItems, remainingGroup, [...path, ixArr], testSol, (s2) => {
        if (!matchedSol)
          matchedSol = s2;
      }, ctx);
      const matched = matchedSol !== null;
      if (matched && !it.neg || !matched && it.neg) {
        const continueSol = matched && !it.neg ? matchedSol : sIn;
        stepItems(ixItem + 1, ixArr, continueSol);
      }
      return;
    }
    if (ixArr >= arr.length)
      return;
    matchItem(it, arr[ixArr], [...path, ixArr], sIn, (s2) => {
      stepItems(ixItem + 1, ixArr + 1, s2);
    }, ctx);
  }
  function matchArrayGroupBind(groupBind, ixItem, ixArr, sIn) {
    const maxK = arr.length - ixArr;
    if (groupBind.pat.type === "Seq") {
      for (let k = maxK; k >= 0; k--) {
        const testGroup = arr.slice(ixArr, ixArr + k);
        matchArray(groupBind.pat.items, testGroup, [...path, ixArr], sIn, (s2) => {
          var _a;
          const group = testGroup;
          const s3 = cloneSolution(s2);
          const groupValue = Group.array(...group);
          if (bindGroup(s3.env, groupBind.name, groupValue)) {
            recordGroupSite(s3, groupBind.name, path, ixArr, ixArr + k, group);
            if ((_a = ctx.debug) == null ? void 0 : _a.onBind) {
              ctx.debug.onBind("group", groupBind.name, groupValue);
            }
            stepItems(ixItem + 1, ixArr + k, s3);
          }
        }, ctx);
      }
      return;
    }
    if (groupBind.pat.type === "Quant") {
      const { sub, min, max, op } = groupBind.pat;
      const m = min !== null ? min : 0;
      const n = max !== null ? max : Infinity;
      const quantOp = op || "?";
      return quantOnArray(sub, m, n, quantOp, ixItem, ixArr, sIn, (st) => {
        var _a;
        const start = ixArr;
        const end = st.idx;
        const group = arr.slice(start, end);
        const s2 = cloneSolution(st.sol);
        const groupValue = Group.array(...group);
        if (bindGroup(s2.env, groupBind.name, groupValue)) {
          recordGroupSite(s2, groupBind.name, path, start, end, group);
          if ((_a = ctx.debug) == null ? void 0 : _a.onBind) {
            ctx.debug.onBind("group", groupBind.name, groupValue);
          }
          stepItems(ixItem + 1, end, s2);
        }
      });
    } else {
      if (ixArr < arr.length) {
        matchItem(groupBind.pat, arr[ixArr], [...path, ixArr], sIn, (s2) => {
          var _a;
          const group = [arr[ixArr]];
          const s3 = cloneSolution(s2);
          const groupValue = Group.array(...group);
          if (bindGroup(s3.env, groupBind.name, groupValue)) {
            recordGroupSite(s3, groupBind.name, path, ixArr, ixArr + 1, group);
            if ((_a = ctx.debug) == null ? void 0 : _a.onBind) {
              ctx.debug.onBind("group", groupBind.name, groupValue);
            }
            stepItems(ixItem + 1, ixArr + 1, s3);
          }
        }, ctx);
      }
    }
  }
  function quantOnArray(sub, m, n, op, ixItem, ixArr, sIn, cont) {
    const maxRep = Math.min(n, arr.length - ixArr);
    const isPossessive = op && (op.startsWith("*{") || op.endsWith("+"));
    const continueWith = cont ? (st) => cont(st) : (st) => stepItems(ixItem + 1, st.idx, st.sol);
    let frontier = [{ idx: ixArr, sol: cloneSolution(sIn), reps: 0 }];
    for (let r = 0; r < m; r++) {
      const next = [];
      for (const st of frontier) {
        const { idx, sol: sol2 } = st;
        if (idx >= arr.length)
          continue;
        matchItem(sub, arr[idx], [...path, idx], sol2, (s2) => {
          next.push({ idx: idx + 1, sol: s2, reps: st.reps + 1 });
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
          const { idx, sol: sol2 } = st;
          if (idx >= arr.length)
            continue;
          matchItem(sub, arr[idx], [...path, idx], sol2, (s2) => {
            grown.push({ idx: idx + 1, sol: s2, reps: st.reps + 1 });
          }, ctx);
        }
        if (!grown.length)
          break;
        frontier = grown;
      }
      for (const st of frontier) {
        continueWith(st);
      }
    } else {
      const allFrontiers = [frontier];
      for (let r = m; r < maxRep; r++) {
        const grown = [];
        for (const st of frontier) {
          const { idx, sol: sol2 } = st;
          if (idx >= arr.length)
            continue;
          matchItem(sub, arr[idx], [...path, idx], sol2, (s2) => {
            grown.push({ idx: idx + 1, sol: s2, reps: st.reps + 1 });
          }, ctx);
        }
        if (!grown.length)
          break;
        frontier = grown;
        allFrontiers.push(frontier);
      }
      for (let i = allFrontiers.length - 1; i >= 0; i--) {
        for (const st of allFrontiers[i]) {
          continueWith(st);
        }
      }
    }
  }
}
function matchObject(terms, spread, obj, path, sol, emit, ctx, outMatchedKeys = null) {
  var _a, _b, _c, _d, _e;
  guard(ctx);
  const DEBUG = false;
  let solutions = [{ sol: cloneSolution(sol), testedKeys: /* @__PURE__ */ new Set() }];
  if (DEBUG)
    console.log(`[matchObject] obj keys:`, Object.keys(obj), `terms:`, terms.length);
  for (const term of terms) {
    if (term.type === "GroupBind") {
      const isSpread = term.pat.type === "Spread";
      const next2 = [];
      for (const state of solutions) {
        const { sol: s0, testedKeys } = state;
        if (isSpread) {
          const residualKeys = Object.keys(obj).filter((k) => !testedKeys.has(k));
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
            if ((_a = ctx.debug) == null ? void 0 : _a.onBind) {
              ctx.debug.onBind("group", term.name, groupValue);
            }
            next2.push({ sol: s2, testedKeys: new Set(testedKeys) });
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
              var _a2;
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
                if ((_a2 = ctx.debug) == null ? void 0 : _a2.onBind) {
                  ctx.debug.onBind("group", term.name, groupValue);
                }
                const newTestedKeys = new Set(testedKeys);
                for (const k of matchedKeys) {
                  newTestedKeys.add(k);
                }
                next2.push({ sol: s3, testedKeys: newTestedKeys });
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
        matchObject(term.groups, null, obj, path, state.sol, (s2) => {
          next2.push({ sol: s2, testedKeys: new Set(state.testedKeys) });
        }, ctx);
      }
      solutions = next2;
      continue;
    }
    if (term.type === "OLook") {
      const next2 = [];
      for (const state of solutions) {
        const { sol: s0, testedKeys } = state;
        if (term.neg && term.pat.type === "Spread") {
          const residualKeys = Object.keys(obj).filter((k) => !testedKeys.has(k));
          const noResiduals = residualKeys.length === 0;
          if (noResiduals) {
            next2.push({ sol: cloneSolution(s0), testedKeys: new Set(testedKeys) });
          }
        } else {
          let matchedSol = null;
          const lookaheadTestedKeys = new Set(testedKeys);
          matchObjectGroup(term.pat, obj, path, cloneSolution(s0), (s2) => {
            if (!matchedSol)
              matchedSol = s2;
          }, ctx, lookaheadTestedKeys);
          const matched = matchedSol !== null;
          if (matched && !term.neg || !matched && term.neg) {
            next2.push({
              sol: matched ? matchedSol : cloneSolution(s0),
              testedKeys: new Set(testedKeys)
            });
          }
        }
      }
      solutions = next2;
      continue;
    }
    if (term.type !== "OTerm") {
      throw new Error(`Expected OTerm, GroupBind, OLook, or OGroup, got ${term.type}`);
    }
    if (term.op === "?:") {
      const next2 = [];
      for (const state of solutions) {
        const { sol: s0, testedKeys } = state;
        if (term.key.type === "RootKey") {
          const s1 = cloneSolution(s0);
          navigateBreadcrumbs(
            term.breadcrumbs,
            obj,
            path,
            s1,
            (finalNode, finalPath, s2) => {
              matchItem(term.val, finalNode, finalPath, s2, (s3) => {
                next2.push({ sol: s3, testedKeys: new Set(testedKeys) });
              }, ctx);
            },
            ctx
          );
          continue;
        }
        const keys = objectKeysMatching(obj, term.key, s0.env);
        if (keys.length > 0) {
          for (const k of keys) {
            const s1 = cloneSolution(s0);
            const newTestedKeys = new Set(testedKeys);
            newTestedKeys.add(k);
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
                  next2.push({ sol: s3, testedKeys: newTestedKeys });
                }, ctx);
              },
              ctx
            );
          }
        } else {
          next2.push({ sol: cloneSolution(s0), testedKeys: new Set(testedKeys) });
        }
      }
      solutions = next2;
      continue;
    }
    let next = [];
    for (const state of solutions) {
      const { sol: s0, testedKeys } = state;
      if (term.key.type === "RootKey") {
        const s1 = cloneSolution(s0);
        navigateBreadcrumbs(
          term.breadcrumbs,
          obj,
          path,
          s1,
          (finalNode, finalPath, s2) => {
            matchItem(term.val, finalNode, finalPath, s2, (s3) => {
              next.push({ sol: s3, testedKeys: new Set(testedKeys) });
            }, ctx);
          },
          ctx
        );
        continue;
      }
      const keys = objectKeysMatching(obj, term.key, s0.env);
      if (DEBUG)
        console.log(`[matchObject] term.key:`, term.key, `matched keys:`, keys);
      if (term.op === ":" && keys.length === 0) {
        continue;
      }
      for (const k of keys) {
        if (DEBUG)
          console.log(`[matchObject] processing key '${k}', breadcrumbs:`, ((_b = term.breadcrumbs) == null ? void 0 : _b.length) || 0);
        const s1 = cloneSolution(s0);
        const newTestedKeys = new Set(testedKeys);
        newTestedKeys.add(k);
        if (!bindKeyVariables(term.key, k, s1, path)) {
          continue;
        }
        if (DEBUG)
          console.log(`[matchObject] obj[${k}]:`, obj[k]);
        navigateBreadcrumbs(
          term.breadcrumbs,
          obj[k],
          [...path, k],
          s1,
          (finalNode, finalPath, s2) => {
            if (DEBUG)
              console.log(`[matchObject] reached final node:`, finalNode, `matching against:`, term.val);
            matchItem(term.val, finalNode, finalPath, s2, (s3) => {
              if (DEBUG)
                console.log(`[matchObject] value matched!`);
              next.push({ sol: s3, testedKeys: newTestedKeys });
            }, ctx);
          },
          ctx
        );
      }
    }
    solutions = next;
    if (!solutions.length)
      break;
  }
  if (spread && solutions.length > 0) {
    if (spread.type === "OLook") {
      const next = [];
      for (const state of solutions) {
        const { sol: s0, testedKeys } = state;
        if (spread.neg && spread.pat.type === "Spread") {
          const residualKeys = Object.keys(obj).filter((k) => !testedKeys.has(k));
          const noResiduals = residualKeys.length === 0;
          if (noResiduals) {
            next.push({ sol: cloneSolution(s0), testedKeys: new Set(testedKeys) });
          }
        } else {
          throw new Error("General lookahead on remainder not yet implemented");
        }
      }
      solutions = next;
    } else if (spread.type === "GroupBind") {
      const next = [];
      for (const state of solutions) {
        const { sol: s0, testedKeys } = state;
        const residualKeys = Object.keys(obj).filter((k) => !testedKeys.has(k));
        let { min, max } = parseQuantRange((_c = spread.pat) == null ? void 0 : _c.quant);
        if (!((_d = spread.pat) == null ? void 0 : _d.quant)) {
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
          if ((_e = ctx.debug) == null ? void 0 : _e.onBind) {
            ctx.debug.onBind("group", spread.name, groupValue);
          }
          next.push({ sol: s2, testedKeys });
        }
      }
      solutions = next;
    } else {
      const next = [];
      for (const state of solutions) {
        const { sol: s0, testedKeys } = state;
        let { min, max } = parseQuantRange(spread.quant);
        if (!spread.quant)
          min = 1;
        const untestedCount = Object.keys(obj).filter((k) => !testedKeys.has(k)).length;
        if (untestedCount >= min && (max === null || untestedCount <= max)) {
          next.push(state);
        }
      }
      solutions = next;
    }
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
    if (isObject(child)) {
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
    case "Lit":
      return Object.is(String(key), String(pat.value));
    case "Re":
      return pat.re.test(String(key));
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
      return true;
    case "Alt":
      for (const alt of keyPat.alts) {
        if (keyMatches(alt, key)) {
          return bindKeyVariables(alt, key, sol, path);
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
    return { min: quant.min, max: quant.max === null ? Infinity : quant.max };
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
  ast = { type: "SBind", name: "0", pat: ast };
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
function groupToPublicValue(v) {
  if (!v || typeof v !== "object" || !v._type || !v._value)
    return v;
  if (v._type === "array") {
    return v._value.slice ? v._value.slice() : [...v._value];
  }
  if (v._type === "object") {
    return { ...v._value };
  }
  return v;
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
function getAt(root, path) {
  let current = root;
  for (const key of path) {
    current = current[key];
  }
  return current;
}
function setAtMutate(root, path, value) {
  let current = root;
  for (let i = 0; i < path.length - 1; i++) {
    current = current[path[i]];
  }
  current[path[path.length - 1]] = value;
}
function projectBindings(b, vars) {
  const out = {};
  for (const v of vars) {
    const key = v.startsWith("$") ? v.slice(1) : v;
    if (Object.prototype.hasOwnProperty.call(b, key))
      out[key] = b[key];
  }
  return out;
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
function applyEdits(root, edits) {
  if (edits.length === 0)
    return root;
  let result = root;
  const editsByPath = /* @__PURE__ */ new Map();
  for (const edit of edits) {
    const pathKey = JSON.stringify(edit.site.path);
    if (!editsByPath.has(pathKey)) {
      editsByPath.set(pathKey, []);
    }
    editsByPath.get(pathKey).push(edit);
  }
  for (const [, pathEdits] of editsByPath) {
    const sets = pathEdits.filter((e) => e.site.kind === "scalar");
    const splices = pathEdits.filter((e) => e.site.kind === "group");
    for (const edit of sets) {
      const current = getAt(result, edit.site.path);
      if (deepEqual(current, edit.site.valueRef)) {
        if (edit.site.path.length === 0) {
          result = edit.to;
        } else {
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
          let allMatch = true;
          for (let i = 0; i < edit.site.valueRefs.length; i++) {
            if (!deepEqual(arr[start + i], edit.site.valueRefs[i])) {
              allMatch = false;
              break;
            }
          }
          if (allMatch) {
            if (!edit.to || !(edit.to instanceof Group) || edit.to._type !== "array") {
              throw new Error(
                "Array group variable replacement must use Group.array() internally."
              );
            }
            const elements = edit.to._value;
            const oldLength = end - start;
            const newLength = elements.length;
            arr.splice(start, oldLength, ...elements);
            offset += newLength - oldLength;
          }
        }
      }
      for (const edit of objectSplices) {
        const obj = getAt(result, edit.site.path);
        if (typeof obj !== "object" || obj === null || Array.isArray(obj))
          continue;
        let allMatch = true;
        for (const key of edit.site.keys) {
          if (!deepEqual(obj[key], edit.site.valueRefs[key])) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) {
          if (!edit.to || !(edit.to instanceof Group) || edit.to._type !== "object") {
            throw new Error(
              "Object group variable replacement must use Group.object() internally."
            );
          }
          const newProps = edit.to._value;
          for (const key of edit.site.keys) {
            delete obj[key];
          }
          Object.assign(obj, newProps);
        }
      }
    }
  }
  return result;
}
var Match = class {
  constructor(root, path, rawSolutions, matchSet) {
    var _a;
    this._root = root;
    this._path = path;
    this._rawSolutions = rawSolutions;
    this._matchSet = matchSet;
    this._solutions = rawSolutions.map((raw) => new Solution(raw, this, matchSet));
    const zeroSites = ((_a = rawSolutions[0]) == null ? void 0 : _a.sites.get("0")) || [];
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
  /**
   * Iterator of Solution objects for this match.
   */
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
   * Pure replace: returns a NEW root with this match replaced.
   * Uses first solution of this match.
   */
  replace(replOrFn) {
    if (!this._zeroSite)
      return this._root;
    const firstSol = this._solutions[0] || null;
    const to = typeof replOrFn === "function" ? replOrFn(firstSol) : replOrFn;
    const edits = [{ site: this._zeroSite, to }];
    const cloned = cloneDeep(this._root);
    return applyEdits(cloned, edits);
  }
  /**
   * Mutating edit: modifies variables in-place for this match.
   *
   * Forms:
   *   edit("x", $ => $.x * 2)
   *   edit($ => ({ x: $.y, y: $.x }))
   *   edit({ x: $ => $.y, y: $ => $.x })
   */
  edit(arg1, arg2) {
    const { planFactory } = normalizeEditArgs(arg1, arg2);
    const edits = [];
    for (const sol of this._solutions) {
      const plan = planFactory(sol) || {};
      const sitesMap = sol._sites;
      for (const [varNameRaw, valueSpec] of Object.entries(plan)) {
        const varName = varNameRaw.startsWith("$") ? varNameRaw.slice(1) : varNameRaw;
        const sites = sitesMap.get(varName) || [];
        for (const site of sites) {
          const to = convertValueForSite(site, valueSpec);
          edits.push({ site, to });
        }
      }
    }
    return applyEdits(this._root, edits);
  }
};
var Solution = class {
  constructor(rawSolution, match2, matchSet) {
    this._match = match2;
    this._matchSet = matchSet;
    this._rawSolution = rawSolution;
    this._sites = rawSolution.sites;
    const publicBindings = normalizeBindings(rawSolution.bindings, { includeWhole: false });
    this._bindings = publicBindings;
    for (const [k, v] of Object.entries(publicBindings)) {
      this[k] = v;
    }
    Object.defineProperty(this, "toObject", {
      value: () => ({ ...this._bindings }),
      enumerable: false
    });
  }
  /**
   * Iterator of Match objects with these bindings.
   * Searches across all matches in the MatchSet for equivalent bindings.
   */
  matches() {
    const myKey = stableKey(this._bindings);
    const matchSet = this._matchSet;
    return {
      [Symbol.iterator]() {
        const allMatches = [];
        for (const m of matchSet) {
          for (const s of m._solutions) {
            if (stableKey(s._bindings) === myKey) {
              allMatches.push(m);
              break;
            }
          }
        }
        let i = 0;
        return {
          next() {
            if (i >= allMatches.length)
              return { done: true };
            return { value: allMatches[i++], done: false };
          }
        };
      }
    };
  }
};
var SolutionSet = class {
  constructor(matchSet) {
    this._matchSet = matchSet;
  }
  [Symbol.iterator]() {
    const matches2 = this._matchSet._matches;
    const seen = /* @__PURE__ */ new Set();
    let mi = 0;
    let si = 0;
    let currentMatch = matches2[0] || null;
    return {
      next() {
        while (true) {
          if (!currentMatch)
            return { done: true };
          if (si >= currentMatch._solutions.length) {
            mi++;
            if (mi >= matches2.length)
              return { done: true };
            currentMatch = matches2[mi];
            si = 0;
            continue;
          }
          const sol = currentMatch._solutions[si++];
          const key = stableKey(sol._bindings);
          if (seen.has(key))
            continue;
          seen.add(key);
          return { value: sol, done: false };
        }
      }
    };
  }
  filter(pred) {
    const filtered = [];
    for (const sol of this) {
      if (pred(sol))
        filtered.push(sol);
    }
    return new FilteredSolutionSet(filtered);
  }
  take(n) {
    const limited = [];
    let count = 0;
    for (const sol of this) {
      if (count >= n)
        break;
      limited.push(sol);
      count++;
    }
    return new FilteredSolutionSet(limited);
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
};
var FilteredSolutionSet = class _FilteredSolutionSet {
  constructor(solutions) {
    this._solutions = solutions;
  }
  [Symbol.iterator]() {
    return this._solutions[Symbol.iterator]();
  }
  filter(pred) {
    const filtered = this._solutions.filter(pred);
    return new _FilteredSolutionSet(filtered);
  }
  take(n) {
    const limited = this._solutions.slice(0, n);
    return new _FilteredSolutionSet(limited);
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
};
var MatchSet = class _MatchSet {
  constructor(root, matchGroups) {
    this._root = root;
    this._matches = matchGroups.map(
      (g) => new Match(root, g.path, g.rawSolutions, this)
    );
  }
  // Iterable of Match
  [Symbol.iterator]() {
    return this._matches[Symbol.iterator]();
  }
  matches() {
    return this;
  }
  hasMatch() {
    return this._matches.length > 0;
  }
  /**
   * Returns a SolutionSet of unique Solution objects across all matches.
   * "Uniqueness" is based on structural equality of bindings.
   */
  solutions() {
    return new SolutionSet(this);
  }
  /**
   * Filter matches by predicate.
   * Returns a new MatchSet containing only matches that satisfy the predicate.
   */
  filter(pred) {
    const filtered = this._matches.filter(pred);
    return new _MatchSet(
      this._root,
      filtered.map((m) => ({ path: m._path, rawSolutions: m._rawSolutions }))
    );
  }
  /**
   * Take first n matches.
   * Returns a new MatchSet containing at most n matches.
   */
  take(n) {
    const limited = this._matches.slice(0, n);
    return new _MatchSet(
      this._root,
      limited.map((m) => ({ path: m._path, rawSolutions: m._rawSolutions }))
    );
  }
  /**
   * Get the first match, or null if none.
   */
  first() {
    return this._matches[0] || null;
  }
  /**
   * Count the number of matches.
   */
  count() {
    return this._matches.length;
  }
  /**
   * Convert matches to array.
   */
  toArray() {
    return [...this._matches];
  }
  /**
   * Pure replaceAll: returns a NEW root with replacements applied.
   *
   * Overloads:
   *   replaceAll(value)               // replace each $0 with value
   *   replaceAll(solution => value)   // value derived from first solution of each match
   */
  replaceAll(replOrFn) {
    if (!this._matches.length)
      return this._root;
    const edits = [];
    for (const match2 of this._matches) {
      if (!match2._zeroSite)
        continue;
      const firstSol = match2._solutions[0] || null;
      const to = typeof replOrFn === "function" ? replOrFn(firstSol) : replOrFn;
      edits.push({ site: match2._zeroSite, to });
    }
    const cloned = cloneDeep(this._root);
    return applyEdits(cloned, edits);
  }
  /**
   * Mutating editAll.
   *
   * Forms:
   *   editAll("x", $ => $.x * 2)
   *   editAll($ => ({ x: $.y, y: $.x }))
   *   editAll({ x: $ => $.y, y: $ => $.x })
   *
   * Replacements apply to variable sites ($ and @),
   * with @-bindings exposed as plain arrays/objects.
   */
  editAll(arg1, arg2) {
    const { planFactory } = normalizeEditArgs(arg1, arg2);
    const edits = [];
    for (const match2 of this._matches) {
      for (const sol of match2._solutions) {
        const plan = planFactory(sol) || {};
        const sitesMap = sol._sites;
        for (const [varNameRaw, valueSpec] of Object.entries(plan)) {
          const varName = varNameRaw.startsWith("$") ? varNameRaw.slice(1) : varNameRaw;
          const sites = sitesMap.get(varName) || [];
          if (!sites.length)
            continue;
          for (const site of sites) {
            const to = convertValueForSite(site, valueSpec);
            edits.push({ site, to });
          }
        }
      }
    }
    return applyEdits(this._root, edits);
  }
};
function normalizeEditArgs(arg1, arg2) {
  if (typeof arg1 === "string" && typeof arg2 === "function") {
    const name = arg1;
    const fn = arg2;
    return {
      planFactory: (sol) => ({ [name]: fn(sol) })
    };
  }
  if (typeof arg1 === "function" && arg2 === void 0) {
    const fn = arg1;
    return {
      planFactory: (sol) => fn(sol) || {}
    };
  }
  if (arg1 && typeof arg1 === "object" && arg2 === void 0) {
    const template = arg1;
    return {
      planFactory: (sol) => {
        const out = {};
        for (const [k, v] of Object.entries(template)) {
          out[k] = typeof v === "function" ? v(sol) : v;
        }
        return out;
      }
    };
  }
  throw new TypeError('editAll expects ("var", fn) | (fn) | (planObject)');
}
function convertValueForSite(site, value) {
  if (site.kind === "scalar") {
    return value;
  }
  const isArrayGroup = site.groupStart !== void 0;
  const isObjectGroup = site.keys !== void 0;
  if (isArrayGroup) {
    if (value instanceof Group && value._type === "array") {
      return value;
    }
    if (Array.isArray(value)) {
      return Group.array(...value);
    }
    return Group.array(value);
  }
  if (isObjectGroup) {
    if (value instanceof Group && value._type === "object") {
      return value;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Group.object(value);
    }
    throw new TypeError("Object group replacement expects a plain object or internal Group.object()");
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
    if (!this._ast) {
      this._ast = compile(this._pattern);
    }
    return this._ast;
  }
  _buildOpts() {
    const opts = { ...this._opts };
    if (this._debug)
      opts.debug = this._debug;
    return opts;
  }
  /**
   * match(data): anchored match at the root.
   * Returns a MatchSet (possibly empty; at most one distinct path: []).
   */
  match(input) {
    const ast = this._getAst();
    const rawSolutions = match(ast, input, this._buildOpts());
    const groups = groupByZeroPath(rawSolutions);
    return new MatchSet(input, groups);
  }
  /**
   * find(data): scan for matches at any depth.
   * Returns a MatchSet over all occurrences.
   */
  find(input) {
    const ast = this._getAst();
    const rawSolutions = scan(ast, input, this._buildOpts());
    const groups = groupByZeroPath(rawSolutions);
    return new MatchSet(input, groups);
  }
  /**
   * first(data): convenience — MatchSet restricted to the first found match (if any).
   */
  first(input) {
    const all = this.find(input);
    if (!all._matches.length)
      return new MatchSet(input, []);
    const firstGroup = [{
      path: all._matches[0]._path,
      rawSolutions: all._matches[0]._rawSolutions
    }];
    return new MatchSet(input, firstGroup);
  }
};
function Tendril(pattern) {
  if (typeof pattern !== "string") {
    throw new TypeError(
      `Tendril(): pattern must be a string, got ${typeof pattern}`
    );
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
  const mset = Tendril(pattern).match(input);
  return mset.hasMatch();
}
function extract(pattern, input) {
  const mset = Tendril(pattern).match(input);
  const solObj = firstSolutionObject(mset.solutions());
  return solObj;
}
function extractAll(pattern, input) {
  const mset = Tendril(pattern).match(input);
  const out = [];
  for (const sol of mset.solutions()) {
    out.push(sol.toObject());
  }
  return out;
}
function replace(pattern, input, builder) {
  return Tendril(pattern).first(input).replaceAll(builder);
}
function replaceAll(pattern, input, builder) {
  return Tendril(pattern).find(input).replaceAll(builder);
}
function uniqueMatches(pattern, input, ...vars) {
  const mset = Tendril(pattern).match(input);
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const sol of mset.solutions()) {
    const projected = projectBindings(sol._bindings, vars);
    const key = stableKey(projected);
    if (seen.has(key))
      continue;
    seen.add(key);
    out.push(projected);
  }
  return out;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Group,
  Tendril,
  extract,
  extractAll,
  matches,
  replace,
  replaceAll,
  uniqueMatches
});
//# sourceMappingURL=tendril.cjs.map
