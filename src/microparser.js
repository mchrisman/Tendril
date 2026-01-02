// microparser.js — minimal tokenizer + parser skeleton for Tendril
// Focus: correctness & brevity; serves as the base for parser/engine.

import { deepEqual } from './tendril-util.js';

// ---------- Tokenizer ----------

/**
 * Token: { k, v, pos }
 *  - k: kind (e.g., 'id','num','str','re','any', or a symbol literal '.' '[' '..' '|' '{' etc.)
 *  - v: value (e.g., number, string, RegExp parts, symbol literal)
 *  - pos: source index where token starts (used for errors)
 */
export function tokenize(src) {
  const toks = [];
  let i = 0;

  const push = (k, v, len) => { toks.push({ k, v, pos: i }); i += len; };
  const reWS = /\s+/y;
  const reNum = /-?\d+(\.\d+)?/y;
  const reId  = /[A-Za-z_][A-Za-z0-9_]*/y;

  // Track if we might be in a guard context: $x=(PATTERN; EXPR)
  // When we see ';' after '(' and before ')', capture rest as guard_expr
  let parenDepth = 0;
  let guardStartDepth = 0;
  let inGuardContext = false;

  while (i < src.length) {
    // whitespace (incl. newlines)
    reWS.lastIndex = i;
    if (reWS.test(src)) { i = reWS.lastIndex; continue; }

    const c = src[i], c2 = src.slice(i, i + 2), c3 = src.slice(i, i + 3);

    // comments //... to end-of-line (optional but handy)
    if (c2 === '//') {
      let j = i + 2;
      while (j < src.length && src[j] !== '\n') j++;
      i = j; continue;
    }

    // strings: "..." or '...' (with optional /i suffix for case-insensitive)
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1, out = '';
      while (j < src.length && src[j] !== q) {
        if (src[j] === '\\') {
          const { chr, adv } = readEsc(src, j + 1);
          out += chr; j += adv + 1;
        } else {
          out += src[j++];
        }
      }
      if (src[j] !== q) throw syntax(`unterminated string`, src, i);
      const strEnd = j + 1;
      // Check for /i suffix (case-insensitive string literal)
      if (src.slice(strEnd, strEnd + 2) === '/i') {
        push('ci', { lower: out.toLowerCase(), desc: src.slice(i, strEnd + 2) }, (strEnd + 2) - i);
      } else {
        push('str', out, strEnd - i);
      }
      continue;
    }

    // regex literal: /.../flags  (no division in this DSL; treat leading / as regex)
    if (c === '/' && src[i + 1] !== '/') {
      // Single-pass scan: handle escapes and character classes
      let j = i + 1, inClass = false;
      while (j < src.length) {
        const ch = src[j];
        if (ch === '\\') {
          j += 2; // skip escaped char
        } else if (ch === '[') {
          inClass = true;
          j++;
        } else if (ch === ']' && inClass) {
          inClass = false;
          j++;
        } else if (ch === '/' && !inClass) {
          break; // found terminator
        } else {
          j++;
        }
      }
      if (j >= src.length) throw syntax(`unterminated regex literal`, src, i);

      const pattern = src.slice(i + 1, j);
      j++; // skip closing /

      // Consume flags
      const flagStart = j;
      while (j < src.length && /[a-z]/i.test(src[j])) j++;
      const flags = src.slice(flagStart, j);

      // Validate the regex
      try {
        new RegExp(pattern, flags);
      } catch (e) {
        throw syntax(`invalid regex: /${pattern}/${flags}`, src, i);
      }

      // Disallow 'g' and 'y' flags - they cause stateful matching bugs
      if (flags.includes('g') || flags.includes('y')) {
        throw syntax(`Regex flags 'g' and 'y' are not allowed (found /${pattern}/${flags})`, src, i);
      }

      push('re', { source: pattern, flags: flags }, j - i);
      continue;
    }

    // number
    reNum.lastIndex = i;
    if (reNum.test(src)) {
      const j = reNum.lastIndex;
      push('num', Number(src.slice(i, j)), j - i);
      continue;
    }

    // identifier / keyword / ANY (with optional /i suffix for case-insensitive)
    reId.lastIndex = i;
    if (reId.test(src)) {
      const j = reId.lastIndex;
      const w = src.slice(i, j);
      // Check for /i suffix FIRST - case-insensitive bareword takes precedence over keywords
      if (src.slice(j, j + 2) === '/i') {
        push('ci', { lower: w.toLowerCase(), desc: src.slice(i, j + 2) }, (j + 2) - i);
        continue;
      }
      // Keywords and special tokens
      if (w === '_')        { push('any', '_', j - i); continue; }
      if (w === '_string')  { push('any_string', '_string', j - i); continue; }
      if (w === '_number')  { push('any_number', '_number', j - i); continue; }
      if (w === '_boolean') { push('any_boolean', '_boolean', j - i); continue; }
      if (w === 'true')     { push('bool', true, j - i); continue; }
      if (w === 'false')    { push('bool', false, j - i); continue; }
      if (w === 'null')     { push('null', null, j - i); continue; }
      if (w === 'else')     { push('else', 'else', j - i); continue; }
      if (w === 'as')       { push('as', 'as', j - i); continue; }
      if (w === 'where' && parenDepth > 0) {
        push('where', 'where', j - i);
        // Capture everything until the matching ')' as a guard_expr token
        // Need to handle nested parens, strings properly
        const exprStart = i;
        let depth = parenDepth;
        let k = i;
        while (k < src.length && depth > 0) {
          const ch = src[k];
          // Skip over string literals
          if (ch === '"' || ch === "'") {
            const quote = ch;
            k++;
            while (k < src.length && src[k] !== quote) {
              if (src[k] === '\\') k++; // Skip escaped char
              k++;
            }
            if (k < src.length) k++; // Skip closing quote
            continue;
          }
          if (ch === '(') depth++;
          else if (ch === ')') depth--;
          if (depth > 0) k++;
        }
        if (depth !== 0) throw syntax(`unmatched parenthesis in guard expression`, src, exprStart);
        const exprText = src.slice(exprStart, k).trim();
        if (exprText) {
          push('guard_expr', exprText, k - i);
        }
        continue;
      }
      // 'where' outside parens is just an identifier (variable name, etc.)
      if (w === 'where')    { push('id', w, j - i); continue; }
      // Reject other underscore-prefixed identifiers
      if (w[0] === '_') {
        throw syntax(`identifiers cannot start with underscore: ${w}`, src, i);
      }
      push('id', w, j - i);
      continue;
    }

    // multi-character punctuation/operators (order matters - check longer tokens first!)
    if (c2 === '(?') { push('(?', '(?', 2); continue; }   // positive lookahead
    if (c2 === '(!') { push('(!', '(!', 2); continue; }   // negative lookahead
    if (c3 === '...') { push('...', '...', 3); continue; }  // array spread (three dots)
    if (c === '…')    { push('...', '...', 1); continue; }  // Unicode ellipsis → array spread
    if (c2 === '**')  { push('**', '**', 2); continue; }    // path skip (glob-style)
    if (c2 === ':>')  { push(':>', ':>', 2); continue; }   // implication operator (K implies V)
    if (c2 === '??')  { push('??', '??', 2); continue; }   // lazy optional
    if (c2 === '?+')  { push('?+', '?+', 2); continue; }   // possessive optional
    if (c2 === '++')  { push('++', '++', 2); continue; }   // possessive plus
    if (c2 === '*+')  { push('*+', '*+', 2); continue; }   // possessive star
    if (c2 === '+?')  { push('+?', '+?', 2); continue; }   // lazy plus
    if (c2 === '*?')  { push('*?', '*?', 2); continue; }   // lazy star


    // Track paren depth for guard expression handling
    if (c === '(') {
      parenDepth++;
      push('(', '(', 1);
      continue;
    }
    if (c === ')') {
      parenDepth--;
      push(')', ')', 1);
      continue;
    }

    // one-character punctuation/operators (excluding parens, handled above)
    const single = '[]{}:,.$@=|*+?!-#%<>&/'.includes(c) ? c : null;
    if (single) { push(single, single, 1); continue; }

    throw syntax(`unexpected character '${c}'`, src, i);
  }
  return toks;
}

// Escapes inside strings: \n \r \t \" \' \\ \uXXXX \u{...}
function readEsc(s, i) {
  const ch = s[i];
  if (ch === 'n')  return { chr: '\n', adv: 1 };
  if (ch === 'r')  return { chr: '\r', adv: 1 };
  if (ch === 't')  return { chr: '\t', adv: 1 };
  if (ch === '"' || ch === "'" || ch === '\\') return { chr: ch, adv: 1 };
  if (ch === 'u') {
    if (s[i + 1] === '{') {
      let j = i + 2, hex = '';
      while (j < s.length && s[j] !== '}') hex += s[j++];
      if (s[j] !== '}') return { chr: 'u', adv: 1 }; // fallback
      return { chr: String.fromCodePoint(parseInt(hex, 16) || 0), adv: (j + 1) - i };
    } else {
      const hex = s.slice(i + 1, i + 5);
      return { chr: String.fromCharCode(parseInt(hex, 16) || 0), adv: 5 };
    }
  }
  // default: identity (e.g., \x => 'x')
  return { chr: ch, adv: 1 };
}

function syntax(msg, src, pos) {
  const caret = `${src}\n${' '.repeat(pos)}^`;
  const err = new Error(`${msg}\n${caret}`);
  err.pos = pos;
  return err;
}

// ---------- Parser skeleton ----------

export class Parser {
  constructor(src, tokens = tokenize(src)) {
    this.src = src;
    this.toks = tokens;
    this.i = 0;
    this._cut = null;
    this.farthest = { i: 0, exp: new Set() };
  }

  // --- cursor
  atEnd() { return this.i >= this.toks.length; }
  cur()   { return this.toks[this.i]; }

  /**
   * peek(...alts): if no args, returns current token or null.
   * If args given, returns truthy if current token matches any by kind or value.
   */
  peek(...alts) {
    const t = this.toks[this.i];
    if (!t) return null;
    if (!alts.length) return t;
    for (const a of alts) if (t.k === a || t.v === a) return t;
    return null;
  }

  // eat specific kind/value; when kind omitted, consumes current
  eat(kind, msg) {
    const t = this.toks[this.i];
    if (!t) return this.fail(msg || `unexpected end of input`);
    if (kind && !(t.k === kind || t.v === kind))
      return this.fail(msg || `expected ${kind}`);
    this.i++;
    return t;
  }

  maybe(kindOrVal) {
    const t = this.toks[this.i];
    if (t && (t.k === kindOrVal || t.v === kindOrVal)) { this.i++; return t; }
    return null;
  }

  expect(...alts) {
    const t = this.peek(...alts);
    if (!t) this.fail(`expected ${alts.join('|')}`);
    // prefer consuming by exact match for better messages
    return this.eat(t.k);
  }

  // --- error control
  cut() { this._cut = this.i; }              // commit to branch to localize errors
  mark() { return { i: this.i, cut: this._cut }; }
  restore(m) { this.i = m.i; this._cut = m.cut; }

  fail(msg = 'syntax error') {
    // record farthest error (for tooling, if desired)
    if (this.i >= this.farthest.i) {
      const set = new Set(this.farthest.exp);
      set.add(msg);
      this.farthest = { i: this.i, exp: set };
    }
    const pos = this.toks[this.i]?.pos ?? this.src.length;
    throw syntax(msg, this.src, pos);
  }

  // --- backtracking
  backtrack(fn) {
    const save = this.mark();
    try { return fn(); }
    catch (e) {
      if (this._cut != null && save.i >= this._cut) throw e; // committed
      this.restore(save);
      return null;
    }
  }

  many(parseOne) {
    const out = [];
    for (;;) {
      const save = this.mark();
      const node = this.backtrack(parseOne);
      if (node == null) { this.restore(save); break; }
      out.push(node);
    }
    return out;
  }

  until(parseOne, stopPred) {
    const out = [];
    while (!this.atEnd() && !stopPred()) out.push(parseOne());
    return out;
  }

  // --- Pratt machinery (used for low-precedence '|')
  parseExpr(spec, minPrec = 0) {
    let lhs = spec.primary(this);
    for (;;) {
      const op = spec.peekOp(this);
      if (!op) break;
      const { prec, assoc, kind } = spec.info(op);
      if (prec < minPrec) break;

      if (kind === 'postfix') {
        this.eat(op);
        lhs = spec.buildPostfix(op, lhs);
        continue;
      }
      // infix
      this.eat(op);
      const rhs = this.parseExpr(spec, assoc === 'right' ? prec : prec + 1);
      lhs = spec.buildInfix(op, lhs, rhs);
    }
    return lhs;
  }
}

// ---------- Binding helpers (shared across engine/parser) ----------

/**
 * env: Map<string, {kind:'scalar'|'group', value:any}>
 * We keep it simple and explicit; engine will ensure no accidental mutation.
 */
export function cloneEnv(env) {
  const e = new Map();
  for (const [k, v] of env) e.set(k, v);
  return e;
}

export function isBound(env, name) {
  return env.has(name);
}

export function bindScalar(env, name, val) {
  const cur = env.get(name);
  if (!cur) { env.set(name, { kind: 'scalar', value: val }); return true; }
  return cur.kind === 'scalar' && deepEqual(cur.value, val);
}

export function bindGroup(env, name, group) {
  const cur = env.get(name);
  if (!cur) { env.set(name, { kind: 'group', value: group }); return true; }
  if (cur.kind !== 'group') return false; // Never group<->scalar
  // Unify groups using structural equality
  return deepEqual(cur.value, group);
}

// Utilities to build real RegExp at parse-time when convenient
export function makeRegExp(spec) {
  // spec: { source, flags }
  try { return new RegExp(spec.source, spec.flags || ''); }
  catch (e) { throw new Error(`invalid regex: /${spec.source}/${spec.flags||''}`); }
}

// Pretty location (optional; parse errors already caret-print)
export function where(p) {
  const t = p.cur();
  const pos = t ? t.pos : p.src.length;
  return { pos };
}
