// tendril-parser.js — v5-A compliant parser
// Implements the v5-A grammar from README-v5-A.md exactly.
//
// Grammar structure:
//   ROOT_PATTERN := ITEM
//   ITEM := atoms, bindings, objects, arrays, alternations
//   A_SLICE := array slice patterns (with quantifiers, @x, $x)
//   O_SLICE := object slice patterns (with breadcrumbs, @x)
//
// AST Node Types:
//   Atoms: Any, Lit, Re, Bool, Null
//   Containers: Arr, Obj
//   Bindings: SBind (scalar $x), SliceBind (slice @x)
//   Operators: Alt, Look, Quant
//   Object: OTerm (with breadcrumbs), Spread (..)
//   Breadcrumbs: Breadcrumb with optional B_Quant

import {Parser, makeRegExp} from './microparser.js';

// ---------- Public API ----------

export function parsePattern(src) {
  const p = new Parser(src);
  const ast = parseRootPattern(p);
  if (!p.atEnd()) p.fail('trailing input after pattern');
  return ast;
}

// ---------- AST Node Constructors ----------

// Atoms
const Any = () => ({type: 'Any'});
const Lit = (v) => ({type: 'Lit', value: v});
const Re = (r) => ({type: 'Re', re: r});
const Bool = (v) => ({type: 'Bool', value: v});
const Null = () => ({type: 'Null'});

// Bindings
const SBind = (name, pat) => ({type: 'SBind', name, pat});  // $x:(pat)
const SliceBind = (name, pat) => ({type: 'SliceBind', name, pat});  // @x:(pat)

// Containers
const Arr = (items) => ({type: 'Arr', items});
const Obj = (terms, spread = null) => ({type: 'Obj', terms, spread});

// Operators
const Alt = (alts) => ({type: 'Alt', alts});
const Look = (neg, pat) => ({type: 'Look', neg, pat});
const Quant = (sub, op, min = null, max = null) => ({
  type: 'Quant',
  sub,
  op,  // '?', '??', '+', '++', '+?', '*', '*+', '*?', '*{...}'
  min,
  max
});

// Object terms
const OTerm = (key, breadcrumbs, op, val, quant) => ({
  type: 'OTerm',
  key,           // ITEM
  breadcrumbs,   // Breadcrumb[]
  op,            // '=' or '?='
  val,           // ITEM
  quant          // null or {min, max}
});

const Spread = (quant) => ({type: 'Spread', quant});  // .. with optional #{...}

const Breadcrumb = (kind, key, quant) => ({
  type: 'Breadcrumb',
  kind,   // 'dot' or 'bracket'
  key,    // ITEM
  quant   // null or {op: '?'|'+'|'*', min, max}
});

// ---------- ROOT_PATTERN ----------

function parseRootPattern(p) {
  return parseItem(p);
}

// ---------- ITEM ----------

function parseItem(p) {
  // Handle alternation at this level (lowest precedence)
  // ITEM := Term ('|' Term)*
  let left = parseItemTerm(p);

  if (p.peek('|')) {
    const alts = [left];
    while (p.maybe('|')) {
      alts.push(parseItemTerm(p));
    }
    return Alt(alts);
  }

  return left;
}

function parseItemTerm(p) {
  // ITEM := '(' ITEM ')'
  //       | S_ITEM
  //       | S_ITEM ':' '(' ITEM ')'
  //       | '_'
  //       | LITERAL
  //       | OBJ
  //       | ARR

  // Parenthesized item
  if (p.peek('(?=') || p.peek('(?!')) {
    // Lookahead: (?= or (?!
    return parseLookahead(p);
  }

  if (p.peek('(')) {
    // Could be grouping or binding with parens
    // Just grouping
    p.eat('(');
    const inner = parseItem(p);
    p.eat(')');
    return inner;
  }

  // Scalar binding: $x or $x:(...)
  if (p.peek('$')) {
    p.eat('$');
    const name = p.eat('id').v;
    if (p.maybe(':')) {
      p.eat('(');
      const pat = parseItem(p);
      p.eat(')');
      return SBind(name, pat);
    }
    // Bare $x means $x:(_)
    return SBind(name, Any());
  }

  // Slice binding: @x or @x:(...)
  if (p.peek('@')) {
    p.eat('@');
    const name = p.eat('id').v;
    if (p.maybe(':')) {
      p.eat('(');
      const pat = parseASlice(p);
      p.eat(')');
      return SliceBind(name, pat);
    }
    // Bare @x means @x:(_*)
    return SliceBind(name, Quant(Any(), '*', 0, Infinity));
  }

  // Wildcard
  if (p.maybe('any')) {
    return Any();
  }

  // Literals
  if (p.peek('num')) {
    return Lit(p.eat('num').v);
  }
  if (p.peek('bool')) {
    return Bool(p.eat('bool').v);
  }
  if (p.peek('null')) {
    p.eat('null');
    return Null();
  }
  if (p.peek('str')) {
    return Lit(p.eat('str').v);
  }
  if (p.peek('id')) {
    // Bareword string
    return Lit(p.eat('id').v);
  }
  if (p.peek('re')) {
    const {source, flags} = p.eat('re').v;
    return Re(makeRegExp({source, flags}));
  }

  // Object
  if (p.peek('{')) {
    return parseObj(p);
  }

  // Array
  if (p.peek('[')) {
    return parseArr(p);
  }

  p.fail('expected item (literal, wildcard, $var, @var, array, object, or parenthesized expression)');
}

function parseLookahead(p) {
  // (?= A_SLICE) or (?! A_SLICE)
  let neg = false;
  if (p.peek('(?=')) {
    p.eat('(?=');
  } else if (p.peek('(?!')) {
    p.eat('(?!');
    neg = true;
  } else {
    p.fail('expected (?= or (?! for lookahead');
  }
  const pat = parseASlice(p);
  p.eat(')');
  return Look(neg, pat);
}

function parseObjectLookahead(p) {
  // (?= O_SLICE) or (?! O_SLICE)
  let neg = false;
  if (p.peek('(?=')) {
    p.eat('(?=');
  } else if (p.peek('(?!')) {
    p.eat('(?!');
    neg = true;
  } else {
    p.fail('expected (?= or (?! for object lookahead');
  }
  const pat = parseOSlice(p);
  p.eat(')');
  return {type: 'OLook', neg, pat};
}

// ---------- ARRAYS ----------

// A_BODY := (A_SLICE (','? A_SLICE)*)?
function parseABody(p, stopToken) {
  const items = [];
  while (!p.peek(stopToken)) {
    items.push(parseASlice(p));
    p.maybe(',');  // Optional comma
  }
  return items;
}

function parseArr(p) {
  // ARR := '[' A_BODY ']'
  p.eat('[');
  const items = parseABody(p, ']');
  p.eat(']');
  return Arr(items);
}

function parseASlice(p) {
  // A_SLICE := '(' A_BODY ')'
  //          | S_SLICE
  //          | S_SLICE ':' '(' A_BODY ')'
  //          | S_ITEM
  //          | S_ITEM ':' '(' A_BODY ')'
  //          | ITEM
  //          | OBJ
  //          | ARR
  //          | A_SLICE A_QUANT
  //          | A_SLICE '|' A_SLICE
  //          | '(?=' A_SLICE ')'
  //          | '(?!' A_SLICE ')'

  // Special handling for .. (spread)
  if (p.peek('..')) {
    p.eat('..');
    // .. in array context is a Spread, optionally followed by quantifier
    const quant = isAQuant(p) ? parseAQuant(p) : null;
    return Spread(quant ? `${quant.op}` : null);
  }

  let base = parseASliceBase(p);

  // Handle quantifier
  if (isAQuant(p)) {
    const q = parseAQuant(p);
    base = Quant(base, q.op, q.min, q.max);
  }

  // Handle alternation
  if (p.peek('|')) {
    const alts = [base];
    while (p.maybe('|')) {
      let alt = parseASliceBase(p);
      if (isAQuant(p)) {
        const q = parseAQuant(p);
        alt = Quant(alt, q.op, q.min, q.max);
      }
      alts.push(alt);
    }
    return Alt(alts);
  }

  return base;
}

function parseASliceBase(p) {
  // Base A_SLICE without quantifiers or alternation

  // Lookahead
  if (p.peek('(?=') || p.peek('(?!')) {
    return parseLookahead(p);
  }

  // Parenthesized A_BODY
  if (p.peek('(')) {
    p.eat('(');
    const items = parseABody(p, ')');
    p.eat(')');
    // If single item, return it; otherwise wrap in Seq node
    if (items.length === 1) return items[0];
    return {type: 'Seq', items};
  }

  // Slice binding: @x or @x:(...)
  if (p.peek('@')) {
    p.eat('@');
    const name = p.eat('id').v;
    if (p.maybe(':')) {
      p.eat('(');
      const items = parseABody(p, ')');
      p.eat(')');
      // If single item, use directly; otherwise create Seq
      const pat = items.length === 1 ? items[0] : {type: 'Seq', items};
      return SliceBind(name, pat);
    }
    return SliceBind(name, Quant(Any(), '*', 0, Infinity));
  }

  // Scalar binding: $x or $x:(...)
  if (p.peek('$')) {
    p.eat('$');
    const name = p.eat('id').v;
    if (p.maybe(':')) {
      p.eat('(');
      const items = parseABody(p, ')');
      p.eat(')');
      // If single item, use directly; otherwise create Seq
      const pat = items.length === 1 ? items[0] : {type: 'Seq', items};
      return SBind(name, pat);
    }
    return SBind(name, Any());
  }

  // Otherwise, parse as ITEM
  return parseItemTerm(p);
}

function isAQuant(p) {
  return p.peek('?') || p.peek('??') || p.peek('+') || p.peek('++') ||
         p.peek('+?') || p.peek('*') || p.peek('*+') || p.peek('*?');
}

function parseAQuant(p) {
  // A_QUANT := '?' | '??'
  //          | '+' | '+?' | '++'
  //          | '*' | '*?' | '*+'
  //          | '*{' INTEGER '}'
  //          | '*{' INTEGER ',' INTEGER? '}'
  //          | '*{' ',' INTEGER '}'

  if (p.maybe('??')) return {op: '??', min: 0, max: 1};
  if (p.maybe('?'))  return {op: '?', min: 0, max: 1};
  if (p.maybe('++')) return {op: '++', min: 1, max: null};
  if (p.maybe('+?')) return {op: '+?', min: 1, max: null};
  if (p.maybe('+'))  return {op: '+', min: 1, max: null};
  if (p.maybe('*+')) return {op: '*+', min: 0, max: null};
  if (p.maybe('*?')) return {op: '*?', min: 0, max: null};

  if (p.maybe('*')) {
    if (p.maybe('{')) {
      // *{m}, *{m,n}, *{m,}, *{,n}
      let min = null, max = null;

      if (p.maybe(',')) {
        // *{,n}
        min = 0;
        max = p.eat('num').v;
      } else {
        min = p.eat('num').v;
        if (p.maybe(',')) {
          if (p.peek('num')) {
            max = p.eat('num').v;
          } else {
            max = null;  // unbounded
          }
        } else {
          max = min;  // exact count
        }
      }

      p.eat('}');
      return {op: `*{${min},${max ?? ''}}`, min, max};
    }
    return {op: '*', min: 0, max: null};
  }

  p.fail('expected quantifier');
}

// ---------- OBJECTS ----------

function parseObj(p) {
  // OBJ := '{' O_BODY O_REMNANT? '}'
  // O_REMNANT := S_SLICE ':' '(' 'remainder' ')'
  //            | '(?!' 'remainder' ')'
  //            | 'remainder'
  p.eat('{');
  const terms = [];

  // Parse O_BODY: greedily parse O_SLICEs until we can't
  while (true) {
    const slice = p.backtrack(() => {
      if (p.peek('}')) return null;
      const s = parseOSlice(p);
      p.maybe(',');
      return s;
    });
    if (!slice) break;
    terms.push(slice);
  }

  // Now try to parse optional O_REMNANT
  const remnant = parseORemnant(p);

  p.eat('}');
  return Obj(terms, remnant);
}

function parseORemnant(p) {
  // O_REMNANT := S_SLICE ':' '(' 'remainder' ')'
  //            | '(?!' 'remainder' ')'
  //            | 'remainder'

  // Try @x:(remainder)
  const bindRemnant = p.backtrack(() => {
    if (!p.peek('@')) return null;
    p.eat('@');
    const name = p.eat('id').v;
    if (!p.maybe(':')) return null;
    p.eat('(');
    if (!(p.peek('id') && p.peek().v === 'remainder')) return null;
    p.eat('id');
    p.eat(')');
    p.maybe(',');
    return SliceBind(name, Spread(null));
  });
  if (bindRemnant) return bindRemnant;

  // Try bare 'remainder'
  const bareRemnant = p.backtrack(() => {
    if (!(p.peek('id') && p.peek().v === 'remainder')) return null;
    p.eat('id');
    p.maybe(',');
    return Spread(null);
  });
  if (bareRemnant) return bareRemnant;

  // Try (?!remainder)
  const negRemnant = p.backtrack(() => {
    if (!p.peek('(?!')) return null;
    p.eat('(?!');
    if (!(p.peek('id') && p.peek().v === 'remainder')) return null;
    p.eat('id');
    p.eat(')');
    p.maybe(',');
    return {type: 'OLook', neg: true, pat: Spread(null)};
  });
  if (negRemnant) return negRemnant;

  return null;
}

function parseOSlice(p) {
  // O_SLICE := '(' O_BODY ')'
  //          | S_SLICE
  //          | S_SLICE ':' '(' O_SLICE* ')'
  //          | O_TERM
  //          | '(?=' O_SLICE ')'
  //          | '(?!' O_SLICE ')'

  // Try lookahead first
  if (p.peek('(?=') || p.peek('(?!')) {
    return parseObjectLookahead(p);
  }

  // Try parenthesized O_BODY: '(' O_BODY ')'
  // Use backtracking because '(' could also be part of O_TERM's key pattern
  const groupResult = p.backtrack(() => {
    p.eat('(');
    const slices = [];
    while (!p.peek(')')) {
      slices.push(parseOSlice(p));
      p.maybe(',');
    }
    p.eat(')');
    return {type: 'OGroup', slices};
  });
  if (groupResult) return groupResult;

  // S_SLICE: Slice binding @x:(O_BODY)
  if (p.peek('@')) {
    p.eat('@');
    const name = p.eat('id').v;
    if (p.maybe(':')) {
      p.eat('(');
      // Parse O_BODY: @x:(pattern)
      const slices = [];
      while (!p.peek(')')) {
        slices.push(parseOSlice(p));
        p.maybe(',');
      }
      p.eat(')');
      return SliceBind(name, {type: 'OGroup', slices});
    }
    // Bare @x in object context is not allowed
    p.fail('bare @x not allowed in objects; use @x:(remainder) to bind residual keys');
  }

  // Reject bare '..' in object context (use 'remainder' instead)
  if (p.peek('..')) {
    p.fail('bare ".." not allowed in objects; use "remainder" or "@x:(remainder)" instead');
  }

  // Otherwise parse O_TERM
  // O_TERM will parse KEY (including $x:(ITEM) patterns) normally via parseItem
  return parseOTerm(p);
}

function parseOTerm(p) {
  // O_TERM := KEY BREADCRUMB* '?'? ('=' | '?=') VALUE O_QUANT?

  // KEY BREADCRUMB* op VALUE
  const key = parseItem(p);
  const breadcrumbs = [];

  // Parse breadcrumbs
  while (p.peek('.') || p.peek('[') || p.peek('(')) {
    const bc = parseBreadcrumb(p);
    if (bc) breadcrumbs.push(bc);
    else break;
  }

  // '?'? ('=' | '?=') → canonicalize to '?='
  // Try longer patterns first: '? ?=', '? =', '?=', '='
  let op = null;

  // Try '? ?=' or '? ='
  const questOp = p.backtrack(() => {
    if (!p.maybe('?')) return null;
    if (p.maybe('?=')) return '?=';
    if (p.maybe('=')) return '?='; // canonicalize '? =' to '?='
    return null;
  });
  if (questOp) {
    op = questOp;
  } else if (p.maybe('?=')) {
    op = '?=';
  } else if (p.maybe('=')) {
    op = '=';
  } else {
    p.fail('expected = or ?= in object term');
  }

  // VALUE
  const val = parseItem(p);

  // O_QUANT?
  const quant = parseOQuant(p);

  return OTerm(key, breadcrumbs, op, val, quant);
}

function parseBreadcrumb(p) {
  // BREADCRUMB := '.' KEY
  //             | '[' KEY ']'
  //             | '(' '.' KEY ')' B_QUANT
  //             | '[' KEY ']' B_QUANT

  // Quantified breadcrumb: (. KEY) B_QUANT
  if (p.peek('(')) {
    const start = p.i;
    p.eat('(');

    // Must be '.' KEY ')' B_QUANT or '[' KEY ']' B_QUANT
    let kind = null;
    if (p.peek('.')) {
      p.eat('.');
      kind = 'dot';
      const key = parseItem(p);
      p.eat(')');
      const quant = parseBQuant(p);
      if (!quant) {
        // No quantifier, this is just (. KEY) which is weird
        // Backtrack? Or error?
        p.fail('expected B_QUANT after (. KEY)');
      }
      return Breadcrumb(kind, key, quant);
    } else if (p.peek('[')) {
      // ( [ KEY ] ) B_QUANT
      p.eat('[');
      kind = 'bracket';
      const key = parseItem(p);
      p.eat(']');
      p.eat(')');
      const quant = parseBQuant(p);
      if (!quant) {
        p.fail('expected B_QUANT after ([ KEY ])');
      }
      return Breadcrumb(kind, key, quant);
    }

    // Not a valid breadcrumb, backtrack
    p.i = start;
    return null;
  }

  // Simple breadcrumb: . KEY
  if (p.peek('.')) {
    p.eat('.');
    const key = parseItem(p);
    return Breadcrumb('dot', key, null);
  }

  // [ KEY ] (without paren, check for optional quantifier)
  if (p.peek('[')) {
    p.eat('[');
    const key = parseItem(p);
    p.eat(']');
    // Check for optional B_QUANT
    const quant = parseBQuant(p);
    return Breadcrumb('bracket', key, quant);
  }

  return null;
}

function parseBQuant(p) {
  // B_QUANT := '?' | '+' | '*'
  // These must be single-char to avoid conflict with A_QUANT
  if (p.peek('?')) {
    p.eat('?');
    return {op: '?', min: 0, max: 1};
  }
  if (p.peek('+') && !p.peekAt(1, '?') && !p.peekAt(1, '+')) {
    p.eat('+');
    return {op: '+', min: 1, max: null};
  }
  if (p.peek('*') && !p.peekAt(1, '{') && !p.peekAt(1, '+') && !p.peekAt(1, '?')) {
    p.eat('*');
    return {op: '*', min: 0, max: null};
  }
  return null;
}

function parseOQuant(p) {
  // O_QUANT := '#' ( '?' | '{' INTEGER (',' INTEGER?)? '}' )
  if (!p.peek('#')) return null;

  p.eat('#');
  if (p.maybe('?')) {
    return {min: 0, max: null};  // #{0,∞}
  }

  if (!p.peek('{')) p.fail('expected { or ? after #');
  p.eat('{');

  const min = p.eat('num').v;
  let max = min;

  if (p.maybe(',')) {
    if (p.peek('num')) {
      max = p.eat('num').v;
    } else {
      max = null;  // unbounded
    }
  }

  p.eat('}');

  if (max !== null && max < min) p.fail('O_QUANT upper < lower');
  return {min, max};
}

// ---------- Parser Utilities ----------

// Add peekAt helper if not in Parser class
Parser.prototype.peekAt = function(offset, kind) {
  const idx = this.i + offset;
  if (idx >= this.toks.length) return false;
  return this.toks[idx].k === kind;
};

// ---------- Exports ----------

export const AST = {
  // Atoms
  Any, Lit, Re, Bool, Null,
  // Bindings
  SBind, SliceBind,
  // Containers
  Arr, Obj,
  // Operators
  Alt, Look, Quant,
  // Object
  OTerm, Spread, Breadcrumb,
};
