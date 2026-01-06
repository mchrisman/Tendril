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

  const push = (k, v, len) => { toks.push({ k, v, pos: i, len }); i += len; };
  const reWS = /\s+/y;
  const reNum = /-?\d+(\.\d+)?/y;
  const reId  = /[A-Za-z_][A-Za-z0-9_]*/y;

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

    // regex literal: /.../flags
    // Division was removed from the expression language (see commit 41de539),
    // so `/` is always a regex start (except `//` which is a comment)
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
      // Wildcards and typed wildcards (start with _, not valid identifiers)
      if (w === '_')        { push('any', '_', j - i); continue; }
      if (w === '_string')  { push('any_string', '_string', j - i); continue; }
      if (w === '_number')  { push('any_number', '_number', j - i); continue; }
      if (w === '_boolean') { push('any_boolean', '_boolean', j - i); continue; }
      // Literals (not keywords — these are values)
      if (w === 'true')     { push('bool', true, j - i); continue; }
      if (w === 'false')    { push('bool', false, j - i); continue; }
      if (w === 'null')     { push('null', null, j - i); continue; }
      // Reject other underscore-prefixed identifiers
      if (w[0] === '_') {
        throw syntax(`identifiers cannot start with underscore: ${w}`, src, i);
      }
      // All other words are identifiers (keywords like 'else', 'as', 'where'
      // are recognized by the parser in context, not by the tokenizer)
      push('id', w, j - i);
      continue;
    }

    // multi-character punctuation/operators (order matters - check longer tokens first!)
    if (c2 === '(?') { push('(?', '(?', 2); continue; }   // positive lookahead
    if (c2 === '(!') { push('(!', '(!', 2); continue; }   // negative lookahead
    if (c3 === '...') { push('...', '...', 3); continue; }  // ellipsis (three dots)
    if (c === '…')    { push('...', '...', 1); continue; }  // ellipsis (Unicode U+2026)
    if (c2 === '**')  { push('**', '**', 2); continue; }    // path skip (glob-style)
    if (c2 === '->')  { push('->', '->', 2); continue; }   // flow operator (collect into bucket)
    if (c2 === '??')  { push('??', '??', 2); continue; }   // lazy optional
    if (c2 === '?+')  { push('?+', '?+', 2); continue; }   // possessive optional
    if (c2 === '++')  { push('++', '++', 2); continue; }   // possessive plus
    if (c2 === '*+')  { push('*+', '*+', 2); continue; }   // possessive star
    if (c2 === '+?')  { push('+?', '+?', 2); continue; }   // lazy plus
    if (c2 === '*?')  { push('*?', '*?', 2); continue; }   // lazy star
    // Expression language operators (must check before single-char versions)
    if (c2 === '<=')  { push('<=', '<=', 2); continue; }
    if (c2 === '>=')  { push('>=', '>=', 2); continue; }
    if (c2 === '==')  { push('==', '==', 2); continue; }
    if (c2 === '!=')  { push('!=', '!=', 2); continue; }
    if (c2 === '&&')  { push('&&', '&&', 2); continue; }
    if (c2 === '||')  { push('||', '||', 2); continue; }

    // one-character punctuation/operators
    // § (U+00A7) is for label declarations, ^ is for label references
    // Note: / is NOT here - it's always a regex start (division was removed from EL)
    const single = '()[]{}<>:,.$@=|*+?!-#%&§^'.includes(c) ? c : null;
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
  constructor(src, tokens = tokenize(src), opts = {}) {
    this.src = src;
    this.toks = tokens;
    this.i = 0;
    this._cut = null;
    // Debug hook object (mirrors tendril-engine's ctx.debug pattern)
    // Methods: onEnter(label, idx), onExit(label, idx, success), onEat(tok, idx),
    //          onBacktrack(label, startIdx, success), onFail(msg, idx, contextStack)
    this.debug = opts.debug || null;
    // Context stack for rule tracing
    this.ctxStack = [];
    // Enhanced farthest tracking
    this.farthest = { i: 0, exp: new Set(), ctx: null, attempts: [] };
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
    this.debug?.onEat?.(t, this.i);
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
      if (this.i > this.farthest.i) {
        // New farthest position - reset tracking
        this.farthest = { i: this.i, exp: new Set(), ctx: null, attempts: [] };
      }
      this.farthest.exp.add(msg);
      this.farthest.ctx = [...this.ctxStack]; // snapshot context stack
    }
    this.debug?.onFail?.(msg, this.i, [...this.ctxStack]);
    const pos = this.toks[this.i]?.pos ?? this.src.length;
    throw syntax(msg, this.src, pos);
  }

  // ifPeek('{', parseobject)
  // Peek first then try fn,
  // return the output or null if it failed
  ifPeek(next, fn) {
     return this.peek(next)
    ? this.backtrack(fn) : null
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
    }
    catch (e) {
      if (this._cut != null && save.i >= this._cut) throw e; // committed
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
      if (this._cut != null && save.i >= this._cut) throw e;
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
    // Only record failed attempts that reached the farthest position
    if (!success && startIdx >= this.farthest.i) {
      if (startIdx > this.farthest.i) {
        this.farthest.attempts = [];
        this.farthest.i = startIdx;
      }
      // Avoid duplicates
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
    if (result && typeof result === 'object') {
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

    // Line/column calculation
    let line = 1, col = 1;
    for (let i = 0; i < pos; i++) {
      if (this.src[i] === '\n') { line++; col = 1; }
      else col++;
    }

    // Token window around failure (±3 tokens)
    const windowStart = Math.max(0, f.i - 3);
    const windowEnd = Math.min(this.toks.length, f.i + 4);
    const tokenWindow = this.toks.slice(windowStart, windowEnd).map((t, j) => {
      const idx = windowStart + j;
      const marker = idx === f.i ? '>>>' : '   ';
      const val = typeof t.v === 'string' ? `"${t.v}"` : t.v;
      return `${marker} [${idx}] ${t.k}: ${val}`;
    }).join('\n');

    // Source snippet with caret
    const lineStart = this.src.lastIndexOf('\n', pos - 1) + 1;
    const lineEnd = this.src.indexOf('\n', pos);
    const sourceLine = this.src.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    const caret = ' '.repeat(pos - lineStart) + '^';

    const parts = [
      `Parse error at line ${line}, column ${col}:`,
      `  ${sourceLine}`,
      `  ${caret}`,
      '',
      `Expected: ${[...f.exp].join(' | ')}`,
    ];

    if (f.ctx && f.ctx.length > 0) {
      parts.push(`Context: ${f.ctx.join(' > ')}`);
    }

    if (f.attempts && f.attempts.length > 0) {
      parts.push(`Tried: ${f.attempts.join(', ')}`);
    }

    parts.push('', 'Token window:', tokenWindow);

    return parts.join('\n');
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

// ---------- Debugger Implementations ----------

/**
 * Creates a trace debugger that logs parsing activity to console.
 * Usage: parsePattern(src, { debug: createTraceDebugger() })
 *
 * Options:
 *   showTokens: boolean - log each token consumed (default: false)
 *   showFailures: boolean - log internal parse failures (default: false, very verbose)
 *   filter: (label) => boolean - only trace matching labels (default: all)
 */
export function createTraceDebugger(opts = {}) {
  const { showTokens = false, showFailures = false, filter = null } = opts;
  let depth = 0;

  const indent = () => '  '.repeat(depth);
  const shouldTrace = (label) => !filter || filter(label);

  return {
    onEnter(label, idx) {
      if (shouldTrace(label)) {
        console.log(`${indent()}→ ${label} @${idx}`);
        depth++;
      }
    },
    onExit(label, idx, success) {
      if (shouldTrace(label)) {
        depth = Math.max(0, depth - 1);
        console.log(`${indent()}${success ? '✓' : '✗'} ${label} @${idx}`);
      }
    },
    onEat(tok, idx) {
      if (showTokens) {
        const val = typeof tok.v === 'string' ? `"${tok.v}"` : tok.v;
        console.log(`${indent()}  ← ${tok.k}: ${val}`);
      }
    },
    onBacktrack(label, startIdx, success) {
      // Covered by onExit
    },
    onFail(msg, idx, contextStack) {
      if (showFailures) {
        console.log(`${indent()}  ✗ ${msg} @${idx}`);
      }
    }
  };
}

/**
 * Creates a report debugger that silently collects parsing data.
 * Call getReport() after parsing to get a summary.
 * Usage:
 *   const dbg = createReportDebugger();
 *   try { parsePattern(src, { debug: dbg }); } catch(e) {}
 *   console.log(dbg.getReport());
 */
export function createReportDebugger() {
  const attempts = new Map();  // idx -> {label -> count}
  const failures = [];         // [{msg, idx, context}]
  let maxDepth = 0;
  let currentDepth = 0;
  let tokenCount = 0;
  let farthestIdx = 0;
  let farthestContext = [];

  return {
    onEnter(label, idx) {
      currentDepth++;
      maxDepth = Math.max(maxDepth, currentDepth);
    },
    onExit(label, idx, success) {
      currentDepth = Math.max(0, currentDepth - 1);
      if (!success) {
        if (!attempts.has(idx)) attempts.set(idx, new Map());
        const atIdx = attempts.get(idx);
        atIdx.set(label, (atIdx.get(label) || 0) + 1);
      }
    },
    onEat(tok, idx) {
      tokenCount++;
    },
    onBacktrack(label, startIdx, success) {
      // Tracked via onExit
    },
    onFail(msg, idx, contextStack) {
      failures.push({ msg, idx, context: [...contextStack] });
      if (idx >= farthestIdx) {
        farthestIdx = idx;
        farthestContext = [...contextStack];
      }
    },

    // Analysis methods
    getReport() {
      const lines = [
        `Tokens consumed: ${tokenCount}`,
        `Max parse depth: ${maxDepth}`,
        `Farthest position: ${farthestIdx}`,
      ];

      if (farthestContext.length) {
        lines.push(`Farthest context: ${farthestContext.join(' > ')}`);
      }

      // Most-tried positions (backtracking hotspots)
      const hotspots = [...attempts.entries()]
        .map(([idx, labels]) => ({
          idx,
          total: [...labels.values()].reduce((a, b) => a + b, 0),
          labels: [...labels.entries()].sort((a, b) => b[1] - a[1])
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

      if (hotspots.length) {
        lines.push('', 'Backtracking hotspots:');
        for (const h of hotspots) {
          const top3 = h.labels.slice(0, 3).map(([l, c]) => `${l}:${c}`).join(', ');
          lines.push(`  @${h.idx}: ${h.total} attempts (${top3})`);
        }
      }

      if (failures.length) {
        lines.push('', `Total failures: ${failures.length}`);
        const lastFew = failures.slice(-3);
        for (const f of lastFew) {
          lines.push(`  @${f.idx}: ${f.msg}`);
        }
      }

      return lines.join('\n');
    },

    // Raw data access
    getData() {
      return { attempts, failures, maxDepth, tokenCount, farthestIdx, farthestContext };
    }
  };
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
