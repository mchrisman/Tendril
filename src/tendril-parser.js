// tendril-parser.js — v5-A compliant parser
// Implements the v5-A grammar from README-v5-A.md exactly.
//
// Grammar structure:
//   ROOT_PATTERN := ITEM
//   ITEM := atoms, bindings, objects, arrays, alternations
//   A_GROUP := array group patterns (with quantifiers, @x, $x)
//   O_GROUP := object group patterns (with breadcrumbs, @x)
//
// AST Node Types:
//   Atoms: Any, Lit, Re, Bool, Null
//   Containers: Arr, Obj
//   Bindings: SBind (scalar $x), GroupBind (group @x)
//   Operators: Alt, Look, Quant
//   Object: OTerm (with breadcrumbs), Spread (..)
//   Breadcrumbs: Breadcrumb (no quantifiers in v5)

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
const RootKey = () => ({type: 'RootKey'}); // Special marker for leading .. in paths

// Bindings
const SBind = (name, pat) => ({type: 'SBind', name, pat});  // $x=(pat)
const GroupBind = (name, pat) => ({type: 'GroupBind', name, pat});  // @x=(pat)

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
const OTerm = (key, breadcrumbs, op, val, quant, optional = false) => ({
  type: 'OTerm',
  key,           // ITEM
  breadcrumbs,   // Breadcrumb[]
  op,            // ':' or ':>' (implication)
  val,           // ITEM
  quant,         // null or {min, max}
  optional       // true if '?' suffix (K:V? or K:>V?)
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
  //       | S_ITEM '=' '(' ITEM ')'
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

  // Scalar binding: $x or $x=(...)
  if (p.peek('$')) {
    p.eat('$');
    const name = p.eat('id').v;
    if (p.maybe('=')) {
      p.eat('(');
      const pat = parseItem(p);
      p.eat(')');
      return SBind(name, pat);
    }
    // Bare $x means $x=(_)
    return SBind(name, Any());
  }

  // Group binding: @x or @x=(...)
  if (p.peek('@')) {
    p.eat('@');
    const name = p.eat('id').v;
    if (p.maybe('=')) {
      p.eat('(');
      const pat = parseAGroup(p);
      p.eat(')');
      return GroupBind(name, pat);
    }
    // Bare @x means @x=(_*)
    return GroupBind(name, Quant(Any(), '*', 0, Infinity));
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
  // (?= A_GROUP) or (?! A_GROUP)
  let neg = false;
  if (p.peek('(?=')) {
    p.eat('(?=');
  } else if (p.peek('(?!')) {
    p.eat('(?!');
    neg = true;
  } else {
    p.fail('expected (?= or (?! for lookahead');
  }
  const pat = parseAGroup(p);
  p.eat(')');
  return Look(neg, pat);
}

function parseObjectLookahead(p) {
  // (?= O_GROUP) or (?! O_GROUP)
  let neg = false;
  if (p.peek('(?=')) {
    p.eat('(?=');
  } else if (p.peek('(?!')) {
    p.eat('(?!');
    neg = true;
  } else {
    p.fail('expected (?= or (?! for object lookahead');
  }
  const pat = parseOGroup(p);
  p.eat(')');
  return {type: 'OLook', neg, pat};
}

// ---------- ARRAYS ----------

// A_BODY := (A_GROUP (','? A_GROUP)*)?
function parseABody(p, stopToken) {
  const items = [];
  while (!p.peek(stopToken)) {
    items.push(parseAGroup(p));
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

function parseAGroup(p) {
  // A_GROUP := '(' A_BODY ')'
  //          | S_GROUP
  //          | S_GROUP '=' '(' A_BODY ')'
  //          | S_ITEM
  //          | S_ITEM '=' '(' A_BODY ')'
  //          | ITEM
  //          | OBJ
  //          | ARR
  //          | A_GROUP A_QUANT
  //          | A_GROUP '|' A_GROUP
  //          | '(?=' A_GROUP ')'
  //          | '(?!' A_GROUP ')'

  // Special handling for .. (spread)
  if (p.peek('..')) {
    p.eat('..');
    // Quantifiers on .. are disallowed - they're either meaningless or a performance bomb
    const quant = p.backtrack(() => parseAQuant(p));
    if (quant) {
      p.fail(`Quantifiers on '..' are not allowed (found '..${quant.op}')`);
    }
    return Spread(null);
  }

  let base = parseAGroupBase(p);

  // Handle quantifier
  const q = p.backtrack(() => parseAQuant(p));
  if (q) {
    base = Quant(base, q.op, q.min, q.max);
  }

  // Handle alternation
  if (p.peek('|')) {
    const alts = [base];
    while (p.maybe('|')) {
      let alt = parseAGroupBase(p);
      const q = p.backtrack(() => parseAQuant(p));
      if (q) {
        alt = Quant(alt, q.op, q.min, q.max);
      }
      alts.push(alt);
    }
    return Alt(alts);
  }

  return base;
}

function parseAGroupBase(p) {
  // Base A_GROUP without quantifiers or alternation

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

  // Group binding: @x or @x=(...)
  if (p.peek('@')) {
    p.eat('@');
    const name = p.eat('id').v;
    if (p.maybe('=')) {
      p.eat('(');
      const items = parseABody(p, ')');
      p.eat(')');
      // If single item, use directly; otherwise create Seq
      const pat = items.length === 1 ? items[0] : {type: 'Seq', items};
      return GroupBind(name, pat);
    }
    return GroupBind(name, Quant(Any(), '*', 0, Infinity));
  }

  // Scalar binding: $x or $x=(...)
  if (p.peek('$')) {
    p.eat('$');
    const name = p.eat('id').v;
    if (p.maybe('=')) {
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

// isAQuant removed - use backtracking with parseAQuant instead

function parseAQuant(p) {
  // A_QUANT := '?' | '??'
  //          | '+' | '+?' | '++'
  //          | '*' | '*?' | '*+'
  //          | '{' INTEGER '}'
  //          | '{' INTEGER ',' INTEGER? '}'
  //          | '{' ',' INTEGER '}'

  if (p.maybe('??')) return {op: '??', min: 0, max: 1};
  if (p.maybe('?'))  return {op: '?', min: 0, max: 1};
  if (p.maybe('++')) return {op: '++', min: 1, max: null};
  if (p.maybe('+?')) return {op: '+?', min: 1, max: null};
  if (p.maybe('+'))  return {op: '+', min: 1, max: null};
  if (p.maybe('*+')) return {op: '*+', min: 0, max: null};
  if (p.maybe('*?')) return {op: '*?', min: 0, max: null};
  if (p.maybe('*'))  return {op: '*', min: 0, max: null};

  // {m}, {m,n}, {m,}, {,n}
  if (p.maybe('{')) {
    let min = null, max = null;

    if (p.maybe(',')) {
      // {,n}
      min = 0;
      max = eatNonNegInt(p, 'array quantifier');
    } else {
      min = eatNonNegInt(p, 'array quantifier');
      if (p.maybe(',')) {
        if (p.peek('num')) {
          max = eatNonNegInt(p, 'array quantifier');
        } else {
          max = null;  // unbounded
        }
      } else {
        max = min;  // exact count
      }
    }

    p.eat('}');
    return {op: `{${min},${max ?? ''}}`, min, max};
  }

  p.fail('expected quantifier');
}

// ---------- OBJECTS ----------

function parseObj(p) {
  // OBJ := '{' O_BODY O_REMNANT? '}'
  // O_REMNANT := S_GROUP ':' '(' 'remainder' ')'
  //            | '(?!' 'remainder' ')'
  //            | 'remainder'
  p.eat('{');
  const terms = [];

  // Parse O_BODY: greedily parse O_GROUPs until we can't
  while (true) {
    const group = p.backtrack(() => {
      if (p.peek('}')) return null;
      const s = parseOGroup(p);
      p.maybe(',');
      return s;
    });
    if (!group) break;
    terms.push(group);
  }

  // Now try to parse optional O_REMNANT
  const remnant = parseORemnant(p);

  p.eat('}');
  return Obj(terms, remnant);
}

function parseORemnant(p) {
  // O_REMNANT := '@' IDENT '=' '(' ('%' | 'remainder') ')' O_REM_QUANT?
  //            | ('%' | 'remainder') O_REM_QUANT?
  //            | '$'                                      // shortcut for %#{0}
  //            | '(?!' ('%' | 'remainder') ')'            // closed-object assertion

  // Helper to check if current token is remainder marker (% or 'remainder')
  const isRemainderMarker = () =>
    p.peek('%') || (p.peek('id') && p.peek().v === 'remainder');

  const eatRemainderMarker = () => {
    if (p.peek('%')) return p.eat('%');
    if (p.peek('id') && p.peek().v === 'remainder') return p.eat('id');
    return null;
  };

  // Try $ (closed object shortcut = %#{0})
  const closedObj = p.backtrack(() => {
    if (!p.peek('$')) return null;
    // Make sure this isn't a variable binding like $x
    // Check if next token after $ is an identifier (which would make it $varname)
    const next = p.toks[p.i + 1];
    if (next && next.k === 'id') return null; // It's $varname, not standalone $
    p.eat('$');
    p.maybe(',');
    // $ is equivalent to %#{0} (empty remainder required)
    return Spread({min: 0, max: 0});
  });
  if (closedObj) return closedObj;

  // Try @x=(%) or @x=(%?) or @x=(remainder) with optional quantifier
  const bindRemnant = p.backtrack(() => {
    if (!p.peek('@')) return null;
    p.eat('@');
    const name = p.eat('id').v;
    if (!p.maybe('=')) return null;
    p.eat('(');
    if (!isRemainderMarker()) return null;
    eatRemainderMarker();
    // Handle %? inside parens (shorthand for optional remainder)
    let quant = null;
    if (p.maybe('?')) {
      quant = {min: 0, max: null}; // %? means 0..∞ (can be empty)
    }
    p.eat(')');
    // Also check for quantifier after closing paren
    if (!quant) {
      quant = parseRemainderQuant(p);
    }
    p.maybe(',');
    return GroupBind(name, Spread(quant));
  });
  if (bindRemnant) return bindRemnant;

  // Try bare '%' or 'remainder' with optional quantifier
  const bareRemnant = p.backtrack(() => {
    if (!isRemainderMarker()) return null;
    eatRemainderMarker();
    // Handle %? or remainder? shorthand for optional (can be empty)
    let quant = null;
    if (p.maybe('?')) {
      quant = {min: 0, max: null}; // %? or remainder? means 0..∞
    } else {
      quant = parseRemainderQuant(p);
    }
    p.maybe(',');
    return Spread(quant);
  });
  if (bareRemnant) return bareRemnant;

  // Try (?!%) or (?!remainder)
  const negRemnant = p.backtrack(() => {
    if (!p.peek('(?!')) return null;
    p.eat('(?!');
    if (!isRemainderMarker()) return null;
    eatRemainderMarker();
    p.eat(')');
    p.maybe(',');
    return {type: 'OLook', neg: true, pat: Spread(null)};
  });
  if (negRemnant) return negRemnant;

  // Check for common mistake: using '..' instead of '%' or 'remainder'
  if (p.peek('..')) {
    p.fail('bare ".." not allowed in objects; use "%" or "remainder" instead');
  }

  return null;
}

// Parse remainder quantifier: #{n}, #{n,m}, #{n,}, #?
function parseRemainderQuant(p) {
  if (!p.peek('#')) return null;
  p.eat('#');

  if (p.maybe('?')) {
    // #? means 0..∞ (any count)
    return {min: 0, max: null};
  }

  if (!p.peek('{')) p.fail('expected { or ? after # in remainder quantifier');
  p.eat('{');

  const min = eatNonNegInt(p, 'remainder quantifier');
  let max = min;

  if (p.maybe(',')) {
    if (p.peek('num')) {
      max = eatNonNegInt(p, 'remainder quantifier');
    } else {
      max = null; // unbounded
    }
  }

  p.eat('}');

  if (max !== null && max < min) p.fail('remainder quantifier upper < lower');
  return {min, max};
}

function parseOGroup(p) {
  // O_GROUP := '(' O_BODY ')'
  //          | S_GROUP
  //          | S_GROUP '=' '(' O_GROUP* ')'
  //          | O_TERM
  //          | '(?=' O_GROUP ')'
  //          | '(?!' O_GROUP ')'

  // Try lookahead first
  if (p.peek('(?=') || p.peek('(?!')) {
    return parseObjectLookahead(p);
  }

  // Try parenthesized O_BODY: '(' O_BODY ')'
  // Use backtracking because '(' could also be part of O_TERM's key pattern
  const groupResult = p.backtrack(() => {
    p.eat('(');
    const groups = [];
    while (!p.peek(')')) {
      groups.push(parseOGroup(p));
      p.maybe(',');
    }
    p.eat(')');
    return {type: 'OGroup', groups};
  });
  if (groupResult) return groupResult;

  // S_GROUP: Group binding @x=(O_BODY)
  if (p.peek('@')) {
    p.eat('@');
    const name = p.eat('id').v;
    if (p.maybe('=')) {
      p.eat('(');
      // Parse O_BODY: @x=(pattern)
      const groups = [];
      while (!p.peek(')')) {
        groups.push(parseOGroup(p));
        p.maybe(',');
      }
      p.eat(')');
      return GroupBind(name, {type: 'OGroup', groups});
    }
    // Bare @x in object context is not allowed
    p.fail('bare @x not allowed in objects; use @x=(remainder) to bind residual keys');
  }

  // Otherwise parse O_TERM
  // O_TERM will parse KEY (including $x=(ITEM) patterns) normally via parseItem
  // Leading .. is now allowed in OTerm for paths like {..password:$x}
  return parseOTerm(p);
}

function parseOTerm(p) {
  // O_TERM := KEY BREADCRUMB* (':' | ':>') VALUE O_KV_QUANT? '?'?
  //         | '..' BREADCRUMB* (':' | ':>') VALUE O_KV_QUANT? '?'?

  // Check for leading .. (e.g., {..password:$x})
  let key;
  const breadcrumbs = [];

  if (p.peek('..')) {
    // Leading .. means "start from root, match at any depth including zero"
    // Use special RootKey marker
    key = RootKey();
    // Don't consume the '..' yet - it will be parsed as first breadcrumb
  } else {
    // KEY BREADCRUMB* op VALUE
    key = parseItem(p);
  }

  // Parse breadcrumbs (. .. or [)
  while (p.peek('.') || p.peek('..') || p.peek('[')) {
    const bc = parseBreadcrumb(p);
    if (bc) breadcrumbs.push(bc);
    else break;
  }

  // ':' or ':>' operator
  let op = null;
  if (p.maybe(':>')) {
    op = ':>';
  } else if (p.maybe(':')) {
    op = ':';
  } else {
    p.fail('expected : or :> in object term');
  }

  // VALUE
  const val = parseItem(p);

  // O_KV_QUANT? (e.g., #{2,3})
  const quant = parseOQuant(p);

  // '?' suffix for optional existence (K:V? or K:>V?)
  const optional = !!p.maybe('?');

  return OTerm(key, breadcrumbs, op, val, quant, optional);
}

function parseBreadcrumb(p) {
  // BREADCRUMB := '..' KEY          // skip levels
  //             | '..' ':' or ':>'  // skip to any key (use _ as key)
  //             | '.' KEY            // single level
  //             | '[' KEY ']'        // array index

  // Skip levels: .. KEY
  if (p.peek('..')) {
    p.eat('..');
    // Special case: '..' immediately followed by ':' or ':>' means "any key at any depth"
    if (p.peek(':') || p.peek(':>')) {
      return Breadcrumb('skip', Any(), null);
    }
    const key = parseItem(p);
    return Breadcrumb('skip', key, null);
  }

  // Dot notation: . KEY
  if (p.peek('.')) {
    p.eat('.');
    const key = parseItem(p);
    return Breadcrumb('dot', key, null);
  }

  // Bracket notation: [ KEY ]
  if (p.peek('[')) {
    p.eat('[');
    const key = parseItem(p);
    p.eat(']');
    return Breadcrumb('bracket', key, null);
  }

  return null;
}

// parseBQuant removed - breadcrumbs no longer support quantifiers in v5

function parseOQuant(p) {
  // O_QUANT := '#' ( '?' | '{' INTEGER (',' INTEGER?)? '}' )
  if (!p.peek('#')) return null;

  p.eat('#');
  if (p.maybe('?')) {
    return {min: 0, max: null};  // #{0,∞}
  }

  if (!p.peek('{')) p.fail('expected { or ? after #');
  p.eat('{');

  const min = eatNonNegInt(p, 'object quantifier');
  let max = min;

  if (p.maybe(',')) {
    if (p.peek('num')) {
      max = eatNonNegInt(p, 'object quantifier');
    } else {
      max = null;  // unbounded
    }
  }

  p.eat('}');

  if (max !== null && max < min) p.fail('O_QUANT upper < lower');
  return {min, max};
}

// ---------- Parser Utilities ----------

// Eat a non-negative integer (for quantifier counts)
function eatNonNegInt(p, context = 'quantifier') {
  const tok = p.eat('num', `expected non-negative integer in ${context}`);
  const v = tok.v;
  if (!Number.isInteger(v) || v < 0) {
    p.fail(`${context} requires non-negative integer, got ${v}`);
  }
  return v;
}

// Add peekAt helper if not in Parser class
Parser.prototype.peekAt = function(offset, kind) {
  const idx = this.i + offset;
  if (idx >= this.toks.length) return false;
  return this.toks[idx].k === kind;
};

// ---------- Exports ----------

export const AST = {
  // Atoms
  Any, Lit, Re, Bool, Null, RootKey,
  // Bindings
  SBind, GroupBind,
  // Containers
  Arr, Obj,
  // Operators
  Alt, Look, Quant,
  // Object
  OTerm, Spread, Breadcrumb,
};
