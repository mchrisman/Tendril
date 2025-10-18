// tendril-parser.js — AST builder for Tendril patterns & paths
// Supports: alternation '|', lookaheads (?= / ?!), arrays with {m,n}, objects with K=V and K?=V.
// No sets/maps or replacement markers. Quantifiers allowed only on array items.
//
// AST overview (engine consumes this):
// Program { type:'Program', rules: Path[] }
// Path    { type:'Path', segs: Seg[] }
// Seg ∈ KeyLit | KeyVar | KeyPatVar | IdxAny | IdxLit | IdxVar | IdxVarLit | ValPat | ValVar | ValPatVar
// Patterns (used in ValPat, inside arrays/objects):
//   P := Alt { type:'Alt', alts: P[] }            // created by '|', flattened
//      | Any  { type:'Any' }
//      | Lit  { type:'Lit', value:any }
//      | Re   { type:'Re',  re:RegExp }           // constructed via makeRegExp()
//      | Arr  { type:'Arr', items: ArrItem[] }    // arrays are anchored sequences
//      | Obj  { type:'Obj', entries: ObjEntry[], rest:boolean }
//      | Look { type:'Look', neg:boolean, pat:P } // zero-width; may not bind (engine enforces)
// ArrItem := Spread {type:'Spread'} | Quant {type:'Quant', sub:P, min:number, max:number|null} | P
// ObjEntry { key: Atom, op:'='|'?=', val: P }     // key is an Atom (Any|Lit|Re); no key-vars here
//
// Grammar sketch (value context):
//   P := T ('|' T)*               // lowest precedence
//   T := Primary
//   Primary := Atom | Array | Object | '(' P ')' | '(' ('?='|'?!') P ')'
//   Array := '[' ( Item )* ']'    // Item := Spread | Quantified(Atom|Group|Array|Object)
//   Quantified(X) := X ('{' m (',' n)? '}')?
//   Spread := '..'                // not quantifiable
//
//   Atom := str | num | id | re | '_' (any)
//
// Path grammar:
//   Rules := Path ('AND' Path)*
//   Path  := Seg+
//   Seg   := KeySeg | IndexSeg | ValueSeg
//   KeySeg   := '.'? ( KeyLit | '$' id (':' Atom)? )
//   IndexSeg := '[' ( '_' | num | '$' id (':' num)? ) ']'
//   ValueSeg := '=' ( P | '$' id (':' P)? )
//
// Notes:
// - Alternation & lookaheads available only inside value patterns (P), arrays, objects.
// - Engine will enforce: no bindings inside lookaheads; no slice '@' (not in this minimal parser).
// - If you plan to add '@' later, extend tokenizer + add Val/Obj/Arr capture nodes.

import {Parser, makeRegExp} from './microparser.js';

// ---------- Public API ----------

export function parsePattern(patternSrc) {
  const p = new Parser(patternSrc);
  const ast = parseRules(p);
  if (!p.atEnd()) p.fail('trailing input');
  return ast;
}

// ---------- AST node builders (tiny, centralized) ----------

const Program = (rules) => ({type: 'Program', rules});
const Path = (segs) => ({type: 'Path', segs});

const KeyLit = (pat) => ({type: 'KeyLit', pat});
const KeyVar = (name) => ({type: 'KeyVar', name});
const KeyPatVar = (name, p) => ({type: 'KeyPatVar', name, pat: p});

const IdxAny = () => ({type: 'IdxAny'});
const IdxLit = (idx) => ({type: 'IdxLit', idx});
const IdxVar = (name) => ({type: 'IdxVar', name});
const IdxVarLit = (name, idx) => ({type: 'IdxVarLit', name, idx});

const ValPat = (pat) => ({type: 'ValPat', pat});
const ValVar = (name) => ({type: 'ValVar', name});
const ValPatVar = (name, pat) => ({type: 'ValPatVar', name, pat});

const Any = () => ({type: 'Any'});
const Lit = (v) => ({type: 'Lit', value: v});
const Re = (r) => ({type: 'Re', re: r});
const Alt = (alts) => ({type: 'Alt', alts});
const Look = (neg, pat) => ({type: 'Look', neg, pat});

const Arr = (items) => ({type: 'Arr', items});
const Spread = () => ({type: 'Spread'});
const Quant = (sub, m, n) => ({type: 'Quant', sub, min: m, max: n});

const Obj = (entries, rest = false) => ({type: 'Obj', entries, rest});
const ObjEntry = (key, op, val) => ({type: 'ObjEntry', key, op, val});

// ---------- Rules / Paths ----------

function parseRules(p) {
  const rules = [];
  while (!p.atEnd()) {
    rules.push(parsePath(p));
    // optional AND separator
    if (p.peek('kw') && p.cur().v === 'AND') {
      p.eat('kw');
    }
  }
  return Program(rules);
}

function parsePath(p) {
  const segs = [];
  // A rule ends at 'AND' or end-of-input
  while (!p.atEnd() && !(p.peek('kw') && p.cur().v === 'AND')) {
    segs.push(parseSeg(p));
  }
  if (segs.length === 0) p.fail('expected path segment');
  return Path(segs);
}

function parseSeg(p) {
  if (p.maybe('.')) return parseKeySeg(p, true);
  if (p.peek('[')) return parseIndexSeg(p);
  if (p.maybe('=')) return parseValueSeg(p);
  // leading dot optional for key segs
  return parseKeySeg(p, false);
}

// KeySeg: '.'? ( KeyLit | '$' id (':' Atom)? )
function parseKeySeg(p, hadDot) {
  if (p.peek('$')) {
    p.eat('$');
    const name = p.eat('id').v;
    if (p.maybe(':')) {
      const pat = parseAtom(p);
      return KeyPatVar(name, pat);
    }
    return KeyVar(name);
  }
  // literal/pattern key
  const pat = parseAtom(p);
  return KeyLit(pat);
}

// IndexSeg: '[' ( '_' | num | '$' id (':' num)? ) ']'
function parseIndexSeg(p) {
  p.eat('[');
  if (p.maybe('any')) {
    p.eat(']');
    return IdxAny();
  }
  if (p.peek('num')) {
    const n = p.eat('num').v;
    p.eat(']');
    return IdxLit(n);
  }
  if (p.peek('$')) {
    p.eat('$');
    const name = p.eat('id').v;
    if (p.maybe(':')) {
      const n = p.eat('num').v;
      p.eat(']');
      return IdxVarLit(name, n);
    }
    p.eat(']');
    return IdxVar(name);
  }
  p.fail('expected _, number, or $var in index');
}

// ValueSeg: '=' ( P | '$' id (':' P)? )
function parseValueSeg(p) {
  // we arrive here after eating '='
  if (p.peek('$')) {
    p.eat('$');
    const name = p.eat('id').v;
    if (p.maybe(':')) {
      const pat = parsePatternExpr(p);
      return ValPatVar(name, pat);
    }
    return ValVar(name);
  }
  const pat = parsePatternExpr(p);
  return ValPat(pat);
}

// ---------- Pattern expressions (value context) ----------

// Alternation with Pratt (lowest precedence)
function parsePatternExpr(p) {
  const spec = {
    primary: parsePrimary,
    peekOp: (p2) => (p2.peek('|') ? '|' : null),
    info: (_op) => ({prec: 1, assoc: 'left', kind: 'infix'}),
    buildInfix: (_op, a, b) => mergeAlt(a, b),
    buildPostfix: () => {
      throw new Error('no postfix ops');
    },
  };
  return p.parseExpr(spec, 0);
}

// Primary := Atom | Array | Object | '(' P ')' | '(' ('?='|'?!') P ')'
function parsePrimary(p) {
  if (p.peek('str', 'num', 'id', 're', 'any')) return parseAtom(p);
  if (p.peek('[')) return parseArray(p);
  if (p.peek('{')) return parseObject(p);
  if (p.peek('(')) {
    p.eat('(');
    if (p.peek('?=', '?!')) {
      const neg = p.maybe('?!') ? true : (p.eat('?='), false);
      const pat = parsePatternExpr(p);
      p.eat(')');
      return Look(neg, pat);
    } else {
      const inner = parsePatternExpr(p);
      p.eat(')');
      return inner;
    }
  }
  p.fail('expected pattern');
}

// Atom := str | num | id | re | '_'
function parseAtom(p) {
  if (p.peek('any')) return (p.eat('any'), Any());
  if (p.peek('str')) return (Lit(p.eat('str').v));
  if (p.peek('num')) return (Lit(p.eat('num').v));
  if (p.peek('re')) {
    const spec = p.eat('re').v;
    return Re(makeRegExp(spec));
  }
  if (p.peek('id')) return (Lit(p.eat('id').v));
  p.fail('expected atom');
}

// Array := '[' ( Item )* ']'
// Item := Spread | Quantified(Atom|Group|Array|Object)
// Group := '(' P ')'
// Quantified: '{m,n}' allowed; '{m}' allowed; '{m,}' disallowed.
function parseArray(p) {
  p.eat('[');
  const items = [];
  while (!p.peek(']')) {
    if (p.peek('..')) {
      p.eat('..');
      // spread cannot be quantified
      items.push(Spread());
    } else {
      // one item possibly with quantifier
      const base = parseArrayItemPrimary(p);
      const quant = maybeQuantifier(p);
      if (quant) {
        // forbid quantifying Look or Spread (Spread handled above)
        if (base.type === 'Look') p.fail('cannot quantify lookahead');
        items.push(Quant(base, quant.m, quant.n));
      } else {
        items.push(base);
      }
    }
    // commas optional inside arrays? Keep strict: optional separators are not used; space-separated.
    // If you prefer commas, uncomment next line and allow optional ','
    if (p.maybe(',')) { /* allow commas between items */
    }
  }
  p.eat(']');
  return Arr(items);
}

function parseArrayItemPrimary(p) {
  if (p.peek('(')) {
    p.eat('(');
    // group can also be a lookahead if next token is ?= or ?!
    if (p.peek('?=', '?!')) {
      const neg = p.maybe('?!') ? true : (p.eat('?='), false);
      const pat = parsePatternExpr(p);
      p.eat(')');
      return Look(neg, pat);
    } else {
      const inner = parsePatternExpr(p);
      p.eat(')');
      return inner;
    }
  }
  if (p.peek('[')) return parseArray(p);   // nested arrays allowed as items
  if (p.peek('{')) return parseObject(p);  // objects as items
  // default: atom
  return parseAtom(p);
}

// Parse '{m,n}' / '{m}' following an array item
function maybeQuantifier(p) {
  if (!p.peek('{')) return null;
  const m = p.mark();
  p.eat('{');
  if (!p.peek('num')) {
    p.restore(m);
    return null;
  } // not a quantifier; could be object start (but we only call here after array item)
  const lo = p.eat('num').v;
  let hi = null;
  if (p.maybe(',')) {
    if (p.peek('num')) {
      hi = p.eat('num').v;
    } else {
      p.fail('open-ended {m,} not allowed');
    }
  } else {
    hi = lo;
  }
  p.eat('}');
  if (hi < lo) p.fail('quantifier upper < lower');
  return {m: lo, n: hi};
}

// Object := '{' ( ObjKV (',' ObjKV)* )? (','?) ( '..' )?  '}'
// ObjKV  := KeyPat ( '?=' | '=' ) ValPat
// KeyPat := Atom
// ValPat := P               // full pattern in value position
function parseObject(p) {
  p.eat('{');
  const entries = [];
  let rest = false;
  // allow empty object
  while (!p.peek('}')) {
    if (p.peek('..')) {
      p.eat('..');
      rest = true;
      break;
    }
    // KeyPat
    const keyPat = parseAtom(p);
    // op
    let op = null;
    if (p.maybe('?=')) op = '?=';
    else if (p.maybe('=')) op = '=';
    else p.fail('expected = or ?=');
    // ValPat
    const val = parsePatternExpr(p);
    entries.push(ObjEntry(keyPat, op, val));
    // comma-separated KVs
    if (!p.maybe(',')) {
      // allow whitespace separation; next could be '..' or '}'
      if (p.peek('..')) { /* handled at top of loop */
      } else if (!p.peek('}')) p.fail('expected , or }');
    }
  }
  p.eat('}');
  return Obj(entries, rest);
}

// ---------- Alternation helpers ----------

// Merge two nodes into an alternation; flatten nested alts
function mergeAlt(a, b) {
  const left = (a.type === 'Alt') ? a.alts : [a];
  const right = (b.type === 'Alt') ? b.alts : [b];
  return Alt(left.concat(right));
}

// ---------- Exports for engine/tests ----------

export const AST = {
  Program, Path,
  KeyLit, KeyVar, KeyPatVar,
  IdxAny, IdxLit, IdxVar, IdxVarLit,
  ValPat, ValVar, ValPatVar,
  Any, Lit, Re, Alt, Look,
  Arr, Spread, Quant,
  Obj, ObjEntry,
};
