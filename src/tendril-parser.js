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
//   Object: OTerm (with breadcrumbs), Spread (...)
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
const StringPattern = (kind, desc, matchFn) => ({type: 'StringPattern', kind, desc, matchFn});
const Bool = (v) => ({type: 'Bool', value: v});
const Null = () => ({type: 'Null'});
const RootKey = () => ({type: 'RootKey'}); // Special marker for leading ** in paths

// Bindings
const SBind = (name, pat) => ({type: 'SBind', name, pat});  // $x=(pat)
const GroupBind = (name, pat) => ({type: 'GroupBind', name, pat});  // @x=(pat)

// Containers
const Arr = (items) => ({type: 'Arr', items});
const Obj = (terms, spread = null) => ({type: 'Obj', terms, spread});

// Operators
// Alt: alternation. prioritized=false means enumerate all (|), prioritized=true means first-match-wins (else)
const Alt = (alts, prioritized = false) => ({type: 'Alt', alts, prioritized});
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

const Spread = (quant) => ({type: 'Spread', quant});  // ... with optional #{...}

// Slice patterns at root level: @{ O_GROUP } or @[ A_BODY ]
const SlicePattern = (kind, content) => ({type: 'SlicePattern', kind, content});

const Breadcrumb = (kind, key, quant) => ({
  type: 'Breadcrumb',
  kind,   // 'dot' or 'bracket'
  key,    // ITEM
  quant   // null or {op: '?'|'+'|'*', min, max}
});

// Helper: eat a variable name (identifier or keyword like 'else')
// This allows $else, @else etc. as valid variable names
function eatVarName(p) {
  const t = p.peek();
  if (t && (t.k === 'id' || t.k === 'else')) {
    p.eat(t.k);
    return t.v;
  }
  p.fail('expected variable name');
}

// ---------- ROOT_PATTERN ----------

function parseRootPattern(p) {
  // Check for slice patterns: @{ O_GROUP } or @[ A_BODY ]
  if (p.peek('@')) {
    const next = p.toks[p.i + 1];
    if (next && next.k === '{') {
      return parseObjectSlicePattern(p);
    }
    if (next && next.k === '[') {
      return parseArraySlicePattern(p);
    }
  }
  return parseItem(p);
}

function parseObjectSlicePattern(p) {
  // @{ O_GROUP+ }
  p.eat('@');
  p.eat('{');
  const groups = [];
  while (!p.peek('}')) {
    groups.push(parseOGroup(p));
    p.maybe(',');
  }
  if (groups.length === 0) {
    p.fail('empty object slice pattern @{ } is not allowed');
  }
  p.eat('}');
  return SlicePattern('object', {type: 'OGroup', groups});
}

function parseArraySlicePattern(p) {
  // @[ A_BODY ]
  p.eat('@');
  p.eat('[');
  const items = parseABody(p, ']');
  if (items.length === 0) {
    p.fail('empty array slice pattern @[ ] is not allowed');
  }
  p.eat(']');
  // Wrap in Seq if multiple items, otherwise just the single item
  const content = items.length === 1 ? items[0] : {type: 'Seq', items};
  return SlicePattern('array', content);
}

// ---------- ITEM ----------

function parseItem(p) {
  // Handle alternation and else at this level (same precedence, but cannot mix)
  // ITEM := Term ('|' Term)* | Term ('else' Term)*
  // Both produce Alt nodes; else sets prioritized=true
  let left = parseItemTerm(p);

  if (p.peek('|')) {
    // Parse alternation chain: A | B | C → Alt([A,B,C], false)
    const alts = [left];
    while (p.maybe('|')) {
      alts.push(parseItemTerm(p));
    }
    if (p.peek('else')) {
      p.fail("cannot mix '|' and 'else' without parentheses");
    }
    return Alt(alts, false);
  }

  if (p.peek('else')) {
    // Parse else chain: A else B else C → Alt([A,B,C], true)
    const alts = [left];
    while (p.maybe('else')) {
      alts.push(parseItemTerm(p));
      if (p.peek('|')) {
        p.fail("cannot mix '|' and 'else' without parentheses");
      }
    }
    return Alt(alts, true);
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

  // Lookahead: (? or (!
  if (p.peek('(?') || p.peek('(!')) {
    return parseLookahead(p);
  }

  // Parenthesized grouping
  if (p.peek('(')) {
    p.eat('(');
    const inner = parseItem(p);
    p.eat(')');
    return inner;
  }

  // Scalar variable: $x or $x=(pattern)
  if (p.peek('$')) {
    p.eat('$');
    const name = eatVarName(p);
    if (p.maybe('=')) {
      p.eat('(');
      const pat = parseItem(p);
      p.eat(')');
      return SBind(name, pat);
    }
    return SBind(name, Any());
  }

  // Group variable: @x or @x=(pattern)
  if (p.peek('@')) {
    p.eat('@');
    const name = eatVarName(p);
    if (p.maybe('=')) {
      p.eat('(');
      const pat = parseAGroup(p);
      p.eat(')');
      return GroupBind(name, pat);
    }
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
    const re = makeRegExp({source, flags});
    return StringPattern('regex', `/${source}/${flags}`, s => typeof s === 'string' && re.test(s));
  }
  if (p.peek('ci')) {
    const {lower, desc} = p.eat('ci').v;
    return StringPattern('ci', desc, s => typeof s === 'string' && s.toLowerCase() === lower);
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
  // (? A_GROUP) or (! A_GROUP)
  let neg = false;
  if (p.peek('(?')) {
    p.eat('(?');
  } else if (p.peek('(!')) {
    p.eat('(!');
    neg = true;
  } else {
    p.fail('expected (? or (! for lookahead');
  }
  const pat = parseAGroup(p);
  p.eat(')');
  return Look(neg, pat);
}

function parseObjectLookahead(p) {
  // (? O_GROUP) or (! O_GROUP)
  let neg = false;
  if (p.peek('(?')) {
    p.eat('(?');
  } else if (p.peek('(!')) {
    p.eat('(!');
    neg = true;
  } else {
    p.fail('expected (? or (! for object lookahead');
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
  //          | '(?' A_GROUP ')'
  //          | '(!' A_GROUP ')'

  // Special handling for ... (spread)
  if (p.peek('...')) {
    p.eat('...');
    // Quantifiers on ... are disallowed - they're either meaningless or a performance bomb
    const quant = p.backtrack(() => parseAQuant(p));
    if (quant) {
      p.fail(`Quantifiers on '...' are not allowed (found '...${quant.op}')`);
    }
    return Spread(null);
  }

  let base = parseAGroupBase(p);

  // Handle quantifier
  const q = p.backtrack(() => parseAQuant(p));
  if (q) {
    base = Quant(base, q.op, q.min, q.max);
  }

  // Handle alternation or else (same precedence, cannot mix)
  // Both produce Alt nodes; else sets prioritized=true
  if (p.peek('|')) {
    // Parse alternation chain: A | B | C → Alt([A,B,C], false)
    const alts = [base];
    while (p.maybe('|')) {
      let alt = parseAGroupBase(p);
      const q = p.backtrack(() => parseAQuant(p));
      if (q) {
        alt = Quant(alt, q.op, q.min, q.max);
      }
      alts.push(alt);
    }
    if (p.peek('else')) {
      p.fail("cannot mix '|' and 'else' without parentheses");
    }
    return Alt(alts, false);
  }

  if (p.peek('else')) {
    // Parse else chain: A else B else C → Alt([A,B,C], true)
    const alts = [base];
    while (p.maybe('else')) {
      let alt = parseAGroupBase(p);
      const q = p.backtrack(() => parseAQuant(p));
      if (q) {
        alt = Quant(alt, q.op, q.min, q.max);
      }
      alts.push(alt);
      if (p.peek('|')) {
        p.fail("cannot mix '|' and 'else' without parentheses");
      }
    }
    return Alt(alts, true);
  }

  return base;
}

function parseAGroupBase(p) {
  // Base A_GROUP without quantifiers or alternation

  // Lookahead
  if (p.peek('(?') || p.peek('(!')) {
    return parseLookahead(p);
  }

  // Parenthesized A_BODY (grouping)
  if (p.peek('(')) {
    p.eat('(');
    const items = parseABody(p, ')');
    p.eat(')');
    if (items.length === 1) return items[0];
    return {type: 'Seq', items};
  }

  // Group variable: @x or @x=(pattern)
  if (p.peek('@')) {
    p.eat('@');
    const name = eatVarName(p);
    if (p.maybe('=')) {
      p.eat('(');
      const items = parseABody(p, ')');
      p.eat(')');
      const pat = items.length === 1 ? items[0] : {type: 'Seq', items};
      return GroupBind(name, pat);
    }
    return GroupBind(name, Quant(Any(), '*', 0, Infinity));
  }

  // Scalar variable: $x or $x=(pattern)
  if (p.peek('$')) {
    p.eat('$');
    const name = eatVarName(p);
    if (p.maybe('=')) {
      p.eat('(');
      const items = parseABody(p, ')');
      p.eat(')');
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
  // A_QUANT := '?' | '??' | '?+'
  //          | '+' | '+?' | '++'
  //          | '*' | '*?' | '*+'
  //          | '{' INTEGER '}'
  //          | '{' INTEGER ',' INTEGER? '}'
  //          | '{' ',' INTEGER '}'

  if (p.maybe('?+')) return {op: '?+', min: 0, max: 1};
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
  //            | '(!' 'remainder' ')'
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
  // O_REMNANT := '@' IDENT '=' '(' '%' ')' O_REM_QUANT?
  //            | '%' O_REM_QUANT?
  //            | '(!' '%' ')'                             // closed-object assertion

  // Helper to check if current token is remainder marker (%)
  const isRemainderMarker = () => p.peek('%');

  const eatRemainderMarker = () => {
    if (p.peek('%')) return p.eat('%');
    return null;
  };

  // Try @x=(%) or @x=(%?) with optional quantifier
  // Syntax: @x=(%) - variable, equals, then parens around %
  const bindRemnant = p.backtrack(() => {
    if (!p.peek('@')) return null;
    p.eat('@');
    const name = eatVarName(p);
    if (!p.maybe('=')) return null;
    if (!p.maybe('(')) return null;
    if (!isRemainderMarker()) return null;
    eatRemainderMarker();
    // Handle %? inside parens (shorthand for optional remainder)
    let quant = null;
    if (p.maybe('?')) {
      quant = {min: 0, max: null}; // %? means 0..∞ (can be empty)
    }
    // Also check for quantifier before closing paren
    if (!quant) {
      quant = parseRemainderQuant(p);
    }
    p.eat(')');
    p.maybe(',');
    return GroupBind(name, Spread(quant));
  });
  if (bindRemnant) return bindRemnant;

  // Try bare '%' with optional quantifier
  const bareRemnant = p.backtrack(() => {
    if (!isRemainderMarker()) return null;
    eatRemainderMarker();
    // Handle %? shorthand for optional (can be empty)
    let quant = null;
    if (p.maybe('?')) {
      quant = {min: 0, max: null}; // %? means 0..∞
    } else {
      quant = parseRemainderQuant(p);
    }
    p.maybe(',');
    return Spread(quant);
  });
  if (bareRemnant) return bareRemnant;

  // Try (!%)
  const negRemnant = p.backtrack(() => {
    if (!p.peek('(!')) return null;
    p.eat('(!');
    if (!isRemainderMarker()) return null;
    eatRemainderMarker();
    p.eat(')');
    p.maybe(',');
    return {type: 'OLook', neg: true, pat: Spread(null)};
  });
  if (negRemnant) return negRemnant;

  // Check for common mistake: using old '..' syntax
  // Note: '...' is not valid in objects (it's for arrays); '**' is for path skip
  // This case shouldn't happen now that '..' isn't tokenized, but keep for safety

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
  // O_GROUP := '(' O_GROUP* ')'
  //          | '@' IDENT '=' '(' O_GROUP* ')'
  //          | O_TERM
  //          | '(?' O_GROUP ')'
  //          | '(!' O_GROUP ')'

  // Try lookahead first
  if (p.peek('(?') || p.peek('(!')) {
    return parseObjectLookahead(p);
  }

  // Group variable binding: @x=(...)
  if (p.peek('@')) {
    const bindingResult = p.backtrack(() => {
      p.eat('@');
      const name = eatVarName(p);
      p.eat('=');  // throws if not '=', triggering backtrack
      p.eat('(');
      const groups = [];
      while (!p.peek(')')) {
        groups.push(parseOGroup(p));
        p.maybe(',');
      }
      p.eat(')');
      return GroupBind(name, {type: 'OGroup', groups});
    });
    if (bindingResult) return bindingResult;
    // If backtrack failed, @ might be part of O_TERM key - fall through
  }

  // Try parenthesized O_BODY (grouping)
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

  // Otherwise parse O_TERM
  // O_TERM will parse KEY (including $x=(ITEM) patterns) normally via parseItem
  // Leading ** is allowed in OTerm for paths like {**.password:$x}
  return parseOTerm(p);
}

function parseOTerm(p) {
  // O_TERM := KEY BREADCRUMB* (':' | ':>') VALUE O_KV_QUANT? '?'?
  //         | '**' BREADCRUMB* (':' | ':>') VALUE O_KV_QUANT? '?'?

  // Check for leading ** (e.g., {**.password:$x})
  let key;
  const breadcrumbs = [];

  if (p.peek('**')) {
    // Leading ** means "start from root, match at any depth including zero"
    // Use special RootKey marker
    key = RootKey();
    // Don't consume the '**' yet - it will be parsed as first breadcrumb
  } else {
    // KEY BREADCRUMB* op VALUE
    key = parseItem(p);
  }

  // Parse breadcrumbs (. ** or [)
  while (p.peek('.') || p.peek('**') || p.peek('[')) {
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
  // BREADCRUMB := '**' KEY          // skip levels (glob-style)
  //             | '**' ':' or ':>'  // skip to any key (use _ as key)
  //             | '.' KEY            // single level
  //             | '[' KEY ']'        // array index

  // Skip levels: ** or **.KEY (glob-style)
  if (p.peek('**')) {
    p.eat('**');
    // Special case: '**' immediately followed by ':' or ':>' means "any key at any depth"
    if (p.peek(':') || p.peek(':>')) {
      return Breadcrumb('skip', Any(), null);
    }
    // Consume optional separator dot (supports both **.foo and **foo syntax)
    p.maybe('.');
    const key = parseItem(p);
    return Breadcrumb('skip', key, null);
  }

  // Dot notation: . KEY
  // But if . is followed by **, it's a skip breadcrumb (e.g., foo.**.bar)
  if (p.peek('.')) {
    p.eat('.');
    // Check if this is actually .** (skip via dot-star-star)
    if (p.peek('**')) {
      p.eat('**');
      if (p.peek(':') || p.peek(':>')) {
        return Breadcrumb('skip', Any(), null);
      }
      p.maybe('.');
      const key = parseItem(p);
      return Breadcrumb('skip', key, null);
    }
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
  Any, Lit, StringPattern, Bool, Null, RootKey,
  // Bindings
  SBind, GroupBind,
  // Containers
  Arr, Obj,
  // Operators
  Alt, Look, Quant,
  // Object
  OTerm, Spread, Breadcrumb,
};
