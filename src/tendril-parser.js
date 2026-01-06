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
import {parseExpr} from './tendril-el.js';

// ---------- Public API ----------

export function parsePattern(src, opts = {}) {
  const p = new Parser(src, undefined, opts);
  try {
    const ast = parseRootPattern(p);
    if (!p.atEnd()) p.fail('trailing input after pattern');
    validateAST(ast, src);
    return ast;
  } catch (e) {
    // Attach debug report to error for better diagnostics
    if (p.farthest) {
      e.parseReport = p.formatReport();
    }
    throw e;
  }
}

// ---------- AST Node Constructors ----------

// Atoms
const Any = () => ({type: 'Any'});
const TypedAny = (kind) => ({type: 'TypedAny', kind}); // _string, _number, _boolean
const Lit = (v) => ({type: 'Lit', value: v});
const StringPattern = (kind, desc, matchFn) => ({type: 'StringPattern', kind, desc, matchFn});
const Bool = (v) => ({type: 'Bool', value: v});
const Null = () => ({type: 'Null'});
const Fail = () => ({type: 'Fail'}); // Always fails - used for 'else !' strong semantics
const RootKey = () => ({type: 'RootKey'}); // Special marker for leading ** in paths
const Guarded = (pat, guard) => ({type: 'Guarded', pat, guard}); // (PATTERN where EXPR) without binding

// Bindings
const SBind = (name, pat, guard = null) => ({type: 'SBind', name, pat, guard});  // $x=(pat) or $x=(pat where expr)
const GroupBind = (name, pat, sliceKind = 'array') => ({type: 'GroupBind', name, pat, sliceKind});  // @x=(pat) for array, %x for object
const Flow = (pat, bucket, labelRef = null, sliceKind = 'object') => ({type: 'Flow', pat, bucket, labelRef, sliceKind});  // ->%bucket (k:v pairs) or ->@bucket (values only)
// <collecting $k:$v in %bucket across ^L> or <collecting $v in @bucket across ^L>
const Collecting = (pat, collectExpr, bucket, sliceKind, labelRef) => ({
  type: 'Collecting',
  pat,           // the pattern this directive is attached to
  collectExpr,   // {key: varName, value: varName} for k:v or {value: varName} for value-only
  bucket,        // bucket name
  sliceKind,     // 'object' or 'array'
  labelRef       // required label reference
});

// Containers
const Arr = (items, label = null) => ({type: 'Arr', items, label});
const Obj = (terms, spread = null, label = null) => ({type: 'Obj', terms, spread, label});

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
const OTerm = (key, breadcrumbs, val, quant, optional = false, strong = false) => ({
  type: 'OTerm',
  key,           // ITEM
  breadcrumbs,   // Breadcrumb[]
  val,           // ITEM
  quant,         // null or {min, max}
  optional,      // true if '?' suffix (K:V?)
  strong         // true if 'else !' suffix - triggers strong semantics (no bad entries)
});

// Each clause: 'each' KEY ':' VALUE_CLAUSE ('else' VALUE_CLAUSE)* QUANT?
// Provides "validate all" semantics: for all k matching KEY, value must match one of the VALUE_CLAUSEs
const Each = (key, breadcrumbs, valueClauses, quant) => ({
  type: 'Each',
  key,            // ITEM - key pattern
  breadcrumbs,    // Breadcrumb[] - path navigation
  valueClauses,   // Array of {value, flow?} where flow is {bucket, sliceKind} or null
  quant           // null or {min, max} - quantifier on count of matching keys
});

const Spread = (quant) => ({type: 'Spread', quant});  // ... with optional #{...}

// Slice patterns at root level: %{ O_GROUP } (object) or @[ A_BODY ] (array)
const SlicePattern = (kind, content) => ({type: 'SlicePattern', kind, content});

const Breadcrumb = (kind, key, quant) => ({
  type: 'Breadcrumb',
  kind,   // 'dot' or 'bracket'
  key,    // ITEM
  quant   // null or {op: '?'|'+'|'*', min, max}
});

// Helper: eat a variable name (any identifier, including keywords like 'else')
// This allows $else, @else, $where, $as etc. as valid variable names
function eatVarName(p) {
  const t = p.peek('id');
  if (t) {
    p.eat('id');
    return t.v;
  }
  p.fail('expected variable name');
}

// ---------- Suffix Combinators ----------
// These factor out the repeated (INNER as $x where EXPR) pattern

/**
 * Parse a parenthesized expression with optional binding and guard.
 * Handles: (INNER), (INNER as $x), (INNER as $x where EXPR), (INNER as @x), (INNER where EXPR)
 * @param {Parser} p - Parser instance
 * @param {Function} parseInner - Function to parse the inner content (returns AST node)
 * @param {Array<string>} stopTokens - Tokens that signal end of inner (besides 'as', 'where', ')')
 * @returns {Object|null} - AST node (SBind, GroupBind, Guarded, or plain inner), or null if no '('
 */
function parseParenWithBindingAndGuard(p, parseInner, stopTokens = []) {
  if (!p.maybe('(')) return null;

  const inner = parseInner(p, [')', 'as', 'where', ...stopTokens]);

  // Check for 'as $x' or 'as @x' binding suffix
  if (p.maybe('as')) {
    if (p.peek('$')) {
      p.eat('$');
      const name = eatVarName(p);
      let guard = null;
      if (p.maybe('where')) {
        guard = parseExpr(p);
      }
      p.eat(')');
      return SBind(name, inner, guard);
    }
    if (p.peek('@')) {
      p.eat('@');
      const name = eatVarName(p);
      if (p.peek('where')) {
        p.fail('guard expressions are not supported on group bindings (@var)');
      }
      p.eat(')');
      return GroupBind(name, inner);
    }
    p.fail('expected $var or @var after "as"');
  }

  // Check for 'where EXPR' guard without binding (creates Guarded node)
  if (p.maybe('where')) {
    const guard = parseExpr(p);
    p.eat(')');
    return Guarded(inner, guard);
  }

  p.eat(')');
  return inner;
}

/**
 * Parse optional flow suffix: '->' ('@'|'%') IDENT ('<^' IDENT '>')?
 * - ->%bucket collects key:value pairs (object slice)
 * - ->@bucket collects values only (array slice)
 * @param {Parser} p - Parser instance
 * @param {Object} node - The node to potentially wrap in a Flow
 * @returns {Object} - Original node or Flow-wrapped node
 */
function withOptionalFlow(p, node) {
  if (!p.peek('->')) return node;

  // Wrap in span to capture source location for validation error messages
  return p.span(() => {
    p.eat('->');

    // Determine slice kind: % for object (k:v pairs), @ for array (values only)
    let sliceKind;
    if (p.peek('%')) {
      p.eat('%');
      sliceKind = 'object';
    } else {
      p.eat('@');
      sliceKind = 'array';
    }

    const bucket = eatVarName(p);

    // Check for optional <^label> suffix
    let labelRef = null;
    if (p.peek('<')) {
      p.eat('<');
      p.eat('^');
      labelRef = eatVarName(p);
      p.eat('>');
    }

    return Flow(node, bucket, labelRef, sliceKind);
  });
}

/**
 * Parse optional <collecting> directive suffix:
 * <collecting COLLECT_EXPR in ('%'|'@') IDENT across '^' IDENT>
 *
 * COLLECT_EXPR := '$' IDENT ':' '$' IDENT   (for k:v pairs -> %bucket)
 *               | '$' IDENT                  (for values only -> @bucket)
 *
 * The 'across ^label' clause is required - there is no default scope.
 *
 * @param {Parser} p - Parser instance
 * @param {Object} node - The node to potentially wrap in a Collecting
 * @returns {Object} - Original node or Collecting-wrapped node
 */
function withOptionalCollecting(p, node) {
  if (!p.peek('<')) return node;

  // Check if it's <collecting (not just any <)
  const next = p.toks[p.i + 1];
  if (!next || next.k !== 'id' || next.v !== 'collecting') return node;

  return p.span(() => {
    p.eat('<');
    p.eat('id'); // 'collecting'

    // Parse COLLECT_EXPR: either '$key:$val' or just '$val'
    p.eat('$');
    const firstVar = eatVarName(p);

    let collectExpr;
    if (p.peek(':')) {
      // Key:value form
      p.eat(':');
      p.eat('$');
      const valueVar = eatVarName(p);
      collectExpr = {key: firstVar, value: valueVar};
    } else {
      // Value-only form
      collectExpr = {value: firstVar};
    }

    // Parse 'in' ('%'|'@') IDENT
    if (!p.peek('id') || p.toks[p.i].v !== 'in') {
      p.fail("expected 'in' after collecting expression");
    }
    p.eat('id'); // 'in'

    let sliceKind;
    if (p.peek('%')) {
      p.eat('%');
      sliceKind = 'object';
    } else if (p.peek('@')) {
      p.eat('@');
      sliceKind = 'array';
    } else {
      p.fail("expected '%' or '@' after 'in'");
    }
    const bucket = eatVarName(p);

    // Parse 'across' '^' IDENT (required)
    if (!p.peek('id') || p.toks[p.i].v !== 'across') {
      p.fail("expected 'across ^label' - the across clause is required");
    }
    p.eat('id'); // 'across'
    p.eat('^');
    const labelRef = eatVarName(p);

    p.eat('>');

    // Type enforcement validation is done in the AST validation phase
    // (after parsing completes, outside of backtracking context)

    return Collecting(node, collectExpr, bucket, sliceKind, labelRef);
  });
}

// ---------- ROOT_PATTERN ----------

function parseRootPattern(p) {
  // Check for slice patterns: %{ O_GROUP } (object) or @[ A_BODY ] (array)
  if (p.peek('%')) {
    const next = p.toks[p.i + 1];
    if (next && next.k === '{') {
      return parseObjectSlicePattern(p);
    }
  }
  if (p.peek('@')) {
    const next = p.toks[p.i + 1];
    if (next && next.k === '[') {
      return parseArraySlicePattern(p);
    }
  }
  return parseItem(p);
}

function parseObjectSlicePattern(p) {
  // %{ O_GROUP+ }
  p.eat('%');
  p.eat('{');
  const groups = [];
  while (!p.peek('}')) {
    groups.push(parseOGroup(p));
    p.maybe(',');
  }
  if (groups.length === 0) {
    p.fail('empty object slice pattern %{ } is not allowed');
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
  // ITEM := ITEM_TERM ('|' ITEM_TERM)* | ITEM_TERM ('else' ITEM_TERM)*
  // Both produce Alt nodes; else sets prioritized=true; cannot mix.
  return p.span(() => parseItemInner(p));
}

function parseItemInner(p) {
  const first = parseItemTerm(p);

  // Try alternation: A | B | C  (entire chain must succeed or we abandon it)
  const altChain = p.backtrack(() => {
    p.eat('|');
    const alts = [first, parseItemTerm(p)];
    while (p.backtrack(() => { p.eat('|'); return true; })) {
      alts.push(parseItemTerm(p));
    }
    return Alt(alts, false);
  });
  if (altChain) {
    if (p.backtrack(() => { p.eat('else'); return true; })) {
      p.fail("cannot mix '|' and 'else' without parentheses");
    }
    return altChain;
  }

  // Try else chain: A else B else C  (entire chain must succeed or we abandon it)
  // But 'else !' and 'else !?' are reserved for object strong semantics, don't consume
  const elseChain = p.backtrack(() => {
    p.eat('else');
    if (p.peek('!')) return null;  // 'else !' is for object strong semantics
    const alts = [first, parseItemTerm(p)];
    // Continue eating 'else' unless followed by '!' (object strong semantics)
    while (p.backtrack(() => { p.eat('else'); if (p.peek('!')) return null; return true; })) {
      alts.push(parseItemTerm(p));
    }
    return Alt(alts, true);
  });
  if (elseChain) {
    if (p.backtrack(() => { p.eat('|'); return true; })) {
      p.fail("cannot mix '|' and 'else' without parentheses");
    }
    return elseChain;
  }

  return first;
}

function parseItemTerm(p) {
  // ITEM_TERM := ITEM_TERM_CORE ('->' S_GROUP FLOW_MOD?)? DIRECTIVE*
  // DIRECTIVE := '<collecting' COLLECT_EXPR 'in' ('%'|'@') IDENT 'across' '^' IDENT '>'
  const core = parseItemTermCore(p);
  // First check for flow operator (will be deprecated outside 'each' clauses)
  const withFlow = withOptionalFlow(p, core);
  // Then check for <collecting> directive
  return withOptionalCollecting(p, withFlow);
}

function parseItemTermCore(p) {
  // ITEM_TERM_CORE := LOOK_AHEAD
  //                 | '(' ITEM ')' | '(' ITEM 'as' ... ')' | '(' ITEM 'where' ... ')'
  //                 | S_ITEM | S_GROUP | TYPED_WILD | '_' | LITERAL | OBJ | ARR
  //
  // Uses ordered backtracking: try each alternative, return first success.

  return p.bt('lookahead', () => parseLookahead(p))
      || parseParenWithBindingAndGuard(p, () => parseItem(p))
      || p.bt('$bind', () => { p.eat('$'); return SBind(eatVarName(p), Any()); })
      || p.bt('@bind', () => { p.eat('@'); return GroupBind(eatVarName(p), Quant(Any(), '*', 0, Infinity)); })
      || p.bt('any', () => { p.eat('any'); return Any(); })
      || p.bt('any_string', () => { p.eat('any_string'); return TypedAny('string'); })
      || p.bt('any_number', () => { p.eat('any_number'); return TypedAny('number'); })
      || p.bt('any_boolean', () => { p.eat('any_boolean'); return TypedAny('boolean'); })
      || p.bt('number', () => Lit(p.eat('num').v))
      || p.bt('boolean', () => Bool(p.eat('bool').v))
      || p.bt('null', () => { p.eat('null'); return Null(); })
      || p.bt('string', () => Lit(p.eat('str').v))
      || p.bt('identifier', () => Lit(p.eat('id').v))
      || p.bt('regex', () => {
           const {source, flags} = p.eat('re').v;
           const re = makeRegExp({source, flags});
           return StringPattern('regex', `/${source}/${flags}`, s => typeof s === 'string' && re.test(s));
         })
      || p.bt('case-insensitive', () => {
           const {lower, desc} = p.eat('ci').v;
           return StringPattern('ci', desc, s => typeof s === 'string' && s.toLowerCase() === lower);
         })
      || p.bt('labeled-obj', () => { p.eat('§'); const label = eatVarName(p); return parseObj(p, label); })
      || p.bt('labeled-arr', () => { p.eat('§'); const label = eatVarName(p); return parseArr(p, label); })
      || p.bt('object', () => parseObj(p))
      || p.bt('array', () => parseArr(p))
      || p.fail('expected item');
}

function parseLookahead(p) {
  // (? A_GROUP) or (! A_GROUP)
  return p.backtrack(() => { p.eat('(?'); const pat = parseAGroup(p); p.eat(')'); return Look(false, pat); })
      || p.backtrack(() => { p.eat('(!'); const pat = parseAGroup(p); p.eat(')'); return Look(true, pat); });
}

function parseObjectLookahead(p) {
  // (? O_GROUP) or (! O_GROUP)
  return p.backtrack(() => { p.eat('(?'); const pat = parseOGroup(p); p.eat(')'); return {type: 'OLook', neg: false, pat}; })
      || p.backtrack(() => { p.eat('(!'); const pat = parseOGroup(p); p.eat(')'); return {type: 'OLook', neg: true, pat}; });
}

// ---------- ARRAYS ----------

// A_BODY := (A_GROUP (','? A_GROUP)*)?
function parseABody(p, ...stopTokens) {
  const items = [];
  while (!stopTokens.some(t => p.peek(t))) {
    items.push(parseAGroup(p));
    p.maybe(',');  // Optional comma
  }
  return items;
}

function parseArr(p, label = null) {
  // ARR := '[' A_BODY ']'
  return p.span(() => {
    p.eat('[');
    const items = parseABody(p, ']');
    p.eat(']');
    return Arr(items, label);
  });
}

function parseAGroup(p) {
  // A_GROUP := '...' | A_GROUP_BASE A_QUANT? ('|' A_GROUP_BASE A_QUANT?)* | A_GROUP_BASE A_QUANT? ('else' A_GROUP_BASE A_QUANT?)*

  // Spread (quantifiers disallowed)
  const spread = p.backtrack(() => {
    p.eat('...');
    const q = parseAQuant(p);
    if (q) p.fail(`Quantifiers on '...' are not allowed (found '...${q.op}')`);
    return Spread(null);
  });
  if (spread) return spread;

  // Parse base with optional quantifier
  const parseBaseWithQuant = () => {
    const base = parseAGroupBase(p);
    const q = parseAQuant(p);
    return q ? Quant(base, q.op, q.min, q.max) : base;
  };

  const first = parseBaseWithQuant();

  // Try alternation: A | B | C
  if (p.backtrack(() => { p.eat('|'); return true; })) {
    const alts = [first, parseBaseWithQuant()];
    while (p.backtrack(() => { p.eat('|'); return true; })) {
      alts.push(parseBaseWithQuant());
    }
    if (p.backtrack(() => { p.eat('else'); return true; })) {
      p.fail("cannot mix '|' and 'else' without parentheses");
    }
    return Alt(alts, false);
  }

  // Try else chain: A else B else C
  if (p.backtrack(() => { p.eat('else'); return true; })) {
    const alts = [first, parseBaseWithQuant()];
    while (p.backtrack(() => { p.eat('else'); return true; })) {
      alts.push(parseBaseWithQuant());
    }
    if (p.backtrack(() => { p.eat('|'); return true; })) {
      p.fail("cannot mix '|' and 'else' without parentheses");
    }
    return Alt(alts, true);
  }

  return first;
}

function parseAGroupBase(p) {
  // Base A_GROUP without quantifiers or alternation
  // Uses ordered backtracking: try each alternative, return first success.
  return p.bt('arr-lookahead', () => parseLookahead(p))
      || parseParenWithBindingAndGuard(p, (p, stopTokens) => {
           const items = parseABody(p, ...stopTokens);
           return items.length === 1 ? items[0] : {type: 'Seq', items};
         })
      || p.bt('arr-@bind', () => { p.eat('@'); return GroupBind(eatVarName(p), Quant(Any(), '*', 0, Infinity)); })
      || p.bt('arr-$bind', () => { p.eat('$'); return SBind(eatVarName(p), Any()); })
      || parseItemTerm(p);
}

// isAQuant removed - use backtracking with parseAQuant instead

function parseAQuant(p) {
  // A_QUANT := '?' | '??' | '?+' | '+' | '+?' | '++' | '*' | '*?' | '*+'
  //          | '{' INTEGER '}' | '{' INTEGER ',' INTEGER? '}' | '{' ',' INTEGER '}'
  return p.backtrack(() => { p.eat('?+'); return {op: '?+', min: 0, max: 1}; })
      || p.backtrack(() => { p.eat('??'); return {op: '??', min: 0, max: 1}; })
      || p.backtrack(() => { p.eat('?');  return {op: '?',  min: 0, max: 1}; })
      || p.backtrack(() => { p.eat('++'); return {op: '++', min: 1, max: Infinity}; })
      || p.backtrack(() => { p.eat('+?'); return {op: '+?', min: 1, max: Infinity}; })
      || p.backtrack(() => { p.eat('+');  return {op: '+',  min: 1, max: Infinity}; })
      || p.backtrack(() => { p.eat('*+'); return {op: '*+', min: 0, max: Infinity}; })
      || p.backtrack(() => { p.eat('*?'); return {op: '*?', min: 0, max: Infinity}; })
      || p.backtrack(() => { p.eat('*');  return {op: '*',  min: 0, max: Infinity}; })
      || p.backtrack(() => { p.eat('{'); p.eat(','); const max = eatNonNegInt(p, 'quantifier'); p.eat('}'); return {op: `{0,${max}}`, min: 0, max}; })
      || p.backtrack(() => { p.eat('{'); const min = eatNonNegInt(p, 'quantifier'); p.eat(','); const max = eatNonNegInt(p, 'quantifier'); p.eat('}'); return {op: `{${min},${max}}`, min, max}; })
      || p.backtrack(() => { p.eat('{'); const min = eatNonNegInt(p, 'quantifier'); p.eat(','); p.eat('}'); return {op: `{${min},}`, min, max: Infinity}; })
      || p.backtrack(() => { p.eat('{'); const n = eatNonNegInt(p, 'quantifier'); p.eat('}'); return {op: `{${n}}`, min: n, max: n}; });
}

// ---------- OBJECTS ----------

function parseObj(p, label = null) {
  // OBJ := '{' O_BODY O_REMNANT? '}'
  // O_REMNANT := S_GROUP ':' '(' 'remainder' ')'
  //            | '(!' 'remainder' ')'
  //            | 'remainder'
  return p.span(() => {
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
    return Obj(terms, remnant, label);
  });
}

function parseORemnant(p) {
  // O_REMNANT := '(' '%' QUANT? 'as' '%' IDENT ')' | '%' QUANT? | '(!' '%' ')'
  // Uses ordered backtracking.
  return p.bt('remainder-bind', () => {
           p.eat('('); p.eat('%');
           const q = p.backtrack(() => { p.eat('?'); return {min: 0, max: Infinity}; }) || parseRemainderQuant(p);
           p.eat('as'); p.eat('%');
           const name = eatVarName(p);
           p.eat(')'); p.maybe(',');
           return GroupBind(name, Spread(q), 'object');
         })
      || p.bt('remainder', () => {
           p.eat('%');
           const q = p.backtrack(() => { p.eat('?'); return {min: 0, max: Infinity}; }) || parseRemainderQuant(p);
           p.maybe(',');
           return Spread(q);
         })
      || p.bt('no-remainder', () => { p.eat('(!'); p.eat('%'); p.eat(')'); p.maybe(','); return {type: 'OLook', neg: true, pat: Spread(null)}; });
}

function parseRemainderQuant(p) {
  // QUANT := '#?' | '#{' ',' INTEGER '}' | '#{' INTEGER '}' | '#{' INTEGER ',' INTEGER? '}'
  return p.backtrack(() => { p.eat('#'); p.eat('?'); return {min: 0, max: Infinity}; })
      || p.backtrack(() => { p.eat('#'); p.eat('{'); p.eat(','); const max = eatNonNegInt(p, '%'); p.eat('}'); return {min: 0, max}; })
      || p.backtrack(() => { p.eat('#'); p.eat('{'); const min = eatNonNegInt(p, '%'); p.eat(','); const max = eatNonNegInt(p, '%'); p.eat('}'); if (max < min) p.fail('% quantifier upper < lower'); return {min, max}; })
      || p.backtrack(() => { p.eat('#'); p.eat('{'); const min = eatNonNegInt(p, '%'); p.eat(','); p.eat('}'); return {min, max: Infinity}; })
      || p.backtrack(() => { p.eat('#'); p.eat('{'); const n = eatNonNegInt(p, '%'); p.eat('}'); return {min: n, max: n}; });
}

function parseOGroup(p) {
  // O_GROUP := 'each' EACH_CLAUSE | '(?' O_GROUP ')' | '(!' O_GROUP ')' | '(' O_GROUP* ')' | '(' O_GROUP* 'as' '%' IDENT ')' | O_TERM
  // Uses ordered backtracking.

  // 'each' clause - validate all semantics (replaces 'K:V else !')
  const eachClause = p.bt('each-clause', () => parseEach(p));
  if (eachClause) return eachClause;

  // Lookahead
  const look = p.bt('obj-lookahead', () => parseObjectLookahead(p));
  if (look) return look;

  // Parenthesized grouping with optional 'as %x' binding (object slice)
  const groupWithBind = p.bt('obj-group-bind', () => {
    p.eat('(');
    const groups = parseOBodyUntil(p, ')', 'as');
    p.eat('as');
    p.eat('%');
    const name = eatVarName(p);
    p.eat(')');
    return GroupBind(name, {type: 'OGroup', groups}, 'object');
  });
  if (groupWithBind) return groupWithBind;

  const groupPlain = p.bt('obj-group', () => {
    p.eat('(');
    const groups = parseOBodyUntil(p, ')');
    p.eat(')');
    return {type: 'OGroup', groups};
  });
  if (groupPlain) return groupPlain;

  // O_TERM with possible 'else !' suffix and '?' suffix (legacy - prefer 'each' for new code)
  const strongTerm = p.bt('obj-strong-term', () => {
    const term = parseOTerm(p);
    p.eat('else');
    p.eat('!');
    const optional = !!p.backtrack(() => { p.eat('?'); return true; });
    const result = OTerm(term.key, term.breadcrumbs, term.val, term.quant, optional, true);
    if (term.loc) result.loc = term.loc;  // preserve source location
    return result;
  });
  if (strongTerm) return strongTerm;

  const term = parseOTerm(p);
  const optional = !!p.backtrack(() => { p.eat('?'); return true; });
  const result = OTerm(term.key, term.breadcrumbs, term.val, term.quant, optional, false);
  if (term.loc) result.loc = term.loc;  // preserve source location
  return result;
}

// Parse 'each' clause: 'each' KEY BREADCRUMB* ':' VALUE_CLAUSE ('else' VALUE_CLAUSE)* QUANT?
// VALUE_CLAUSE := VALUE ('->' ('@'|'%') IDENT)?
function parseEach(p) {
  // Check for 'each' keyword
  if (!p.peek('id') || p.cur().v !== 'each') return null;

  return p.span(() => {
    p.eat('id'); // 'each'

    // Parse KEY
    const key = parseItem(p);

    // Parse breadcrumbs
    const breadcrumbs = [];
    for (let bc; (bc = parseBreadcrumb(p)); ) breadcrumbs.push(bc);

    p.eat(':');

    // Parse first VALUE_CLAUSE
    const valueClauses = [parseValueClause(p)];

    // Parse ('else' VALUE_CLAUSE)*
    while (p.backtrack(() => { p.eat('else'); return true; })) {
      valueClauses.push(parseValueClause(p));
    }

    // Parse optional quantifier
    const quant = parseOQuant(p);

    return Each(key, breadcrumbs, valueClauses, quant);
  });
}

// VALUE_CLAUSE := VALUE ('->' ('@'|'%') IDENT)?
function parseValueClause(p) {
  const value = parseItem(p);

  // Check for optional flow operator
  const flow = p.backtrack(() => {
    p.eat('->');
    let sliceKind;
    if (p.peek('%')) {
      p.eat('%');
      sliceKind = 'object';
    } else if (p.peek('@')) {
      p.eat('@');
      sliceKind = 'array';
    } else {
      p.fail("expected '%' or '@' after '->'");
    }
    const bucket = eatVarName(p);
    return {bucket, sliceKind};
  });

  return {value, flow};
}

// Helper: parse O_GROUP* until one of stopTokens
function parseOBodyUntil(p, ...stopTokens) {
  const groups = [];
  while (!stopTokens.some(t => p.peek(t))) {
    groups.push(parseOGroup(p));
    p.maybe(',');
  }
  return groups;
}

function parseOTerm(p) {
  // O_TERM := KEY BREADCRUMB* ':' VALUE O_KV_QUANT?
  // Note: 'else !' suffix and '?' suffix are handled by parseOGroup
  return p.span(() => {
    // Leading ** means "start from root, match at any depth within the object".
    // Design: We peek (not eat) the ** here to set RootKey, then let parseBreadcrumb
    // consume it as a 'skip' breadcrumb. This is intentional - RootKey signals "don't
    // match an initial key", while the breadcrumb does the actual depth navigation.
    // Example: { **:1 } → key=RootKey, breadcrumbs=[skip:Any], matches {x:{y:1}}.
    // Note: This does NOT match root-as-leaf (e.g., { **:1 } doesn't match bare 1).
    const key = p.peek('**') ? RootKey() : parseItem(p);

    // Parse breadcrumbs
    const breadcrumbs = [];
    for (let bc; (bc = parseBreadcrumb(p)); ) breadcrumbs.push(bc);

    p.eat(':');
    const val = parseItem(p);
    const quant = parseOQuant(p);

    return OTerm(key, breadcrumbs, val, quant, false, false);
  });
}

function parseBreadcrumb(p) {
  // BREADCRUMB := '**' ':'? | '**' '.'? KEY | '.' '**' ':'? | '.' '**' '.'? KEY | '.' KEY | '[' KEY ']'
  return p.bt('bc-skip', () => { p.eat('**'); if (p.peek(':')) return Breadcrumb('skip', Any(), null); p.maybe('.'); return Breadcrumb('skip', parseItem(p), null); })
      || p.bt('bc-dot-skip', () => { p.eat('.'); p.eat('**'); if (p.peek(':')) return Breadcrumb('skip', Any(), null); p.maybe('.'); return Breadcrumb('skip', parseItem(p), null); })
      || p.bt('bc-dot', () => { p.eat('.'); return Breadcrumb('dot', parseItem(p), null); })
      || p.bt('bc-bracket', () => { p.eat('['); const key = parseItem(p); p.eat(']'); return Breadcrumb('bracket', key, null); });
}

// parseBQuant removed - breadcrumbs no longer support quantifiers in v5

function parseOQuant(p) {
  // O_QUANT := '#?' | '#{' ',' INTEGER '}' | '#{' INTEGER '}' | '#{' INTEGER ',' INTEGER? '}'
  return p.backtrack(() => { p.eat('#'); p.eat('?'); return {min: 0, max: Infinity}; })
      || p.backtrack(() => { p.eat('#'); p.eat('{'); p.eat(','); const max = eatNonNegInt(p, 'O_QUANT'); p.eat('}'); return {min: 0, max}; })
      || p.backtrack(() => { p.eat('#'); p.eat('{'); const min = eatNonNegInt(p, 'O_QUANT'); p.eat(','); const max = eatNonNegInt(p, 'O_QUANT'); p.eat('}'); if (max < min) p.fail('O_QUANT upper < lower'); return {min, max}; })
      || p.backtrack(() => { p.eat('#'); p.eat('{'); const min = eatNonNegInt(p, 'O_QUANT'); p.eat(','); p.eat('}'); return {min, max: Infinity}; })
      || p.backtrack(() => { p.eat('#'); p.eat('{'); const n = eatNonNegInt(p, 'O_QUANT'); p.eat('}'); return {min: n, max: n}; });
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

// ---------- AST Validation ----------

// Validate AST: Flow node placement and slice name conflicts
function validateAST(ast, src = null) {
  // Track slice names and their kinds to detect conflicts
  // Map: name -> {kind: 'array'|'object', loc: {start, end}}
  const sliceBindings = new Map();

  // src is captured in closure - it's constant context for error messages
  // inContainer changes during traversal - it's structural context
  function check(node, inContainer) {
    if (!node || typeof node !== 'object') return;

    // Check Flow nodes are inside containers and track their bucket kinds
    if (node.type === 'Flow') {
      if (!inContainer) {
        const sigil = node.sliceKind === 'object' ? '%' : '@';
        let msg = `Flow operator ->${sigil}${node.bucket} can only be used inside an object or array pattern`;
        if (src && node.loc) {
          msg += `\n  at: ${src.slice(node.loc.start, node.loc.end)}`;
        }
        throw new Error(msg);
      }
      // Track bucket slice kind
      checkSliceConflict(node.bucket, node.sliceKind || 'object', node.loc);
    }

    // Check Collecting directive nodes are inside containers and validate type enforcement
    if (node.type === 'Collecting') {
      if (!inContainer) {
        const sigil = node.sliceKind === 'object' ? '%' : '@';
        let msg = `<collecting> directive can only be used inside an object or array pattern`;
        if (src && node.loc) {
          msg += `\n  at: ${src.slice(node.loc.start, node.loc.end)}`;
        }
        throw new Error(msg);
      }
      // Type enforcement: k:v form requires %bucket, value-only form requires @bucket
      if (node.collectExpr.key !== undefined && node.sliceKind !== 'object') {
        let msg = `key:value collection requires %bucket (object slice), not @bucket`;
        if (src && node.loc) {
          msg += `\n  at: ${src.slice(node.loc.start, node.loc.end)}`;
        }
        throw new Error(msg);
      }
      if (node.collectExpr.key === undefined && node.sliceKind !== 'array') {
        let msg = `value-only collection requires @bucket (array slice), not %bucket`;
        if (src && node.loc) {
          msg += `\n  at: ${src.slice(node.loc.start, node.loc.end)}`;
        }
        throw new Error(msg);
      }
      // Track bucket slice kind
      checkSliceConflict(node.bucket, node.sliceKind, node.loc);
    }

    // Check GroupBind slice kinds
    if (node.type === 'GroupBind') {
      checkSliceConflict(node.name, node.sliceKind || 'array', node.loc);
    }

    // Obj and Arr establish container context
    const inChild = inContainer || node.type === 'Obj' || node.type === 'Arr';

    // Recurse into children based on node type
    switch (node.type) {
      case 'Obj':
        for (const term of node.terms || []) check(term, inChild);
        if (node.spread) check(node.spread, inChild);
        break;
      case 'Arr':
        for (const item of node.items || []) check(item, inChild);
        break;
      case 'OTerm':
        check(node.key, inChild);
        check(node.val, inChild);
        for (const bc of node.breadcrumbs || []) check(bc.key, inChild);
        break;
      case 'Each':
        check(node.key, inChild);
        for (const bc of node.breadcrumbs || []) check(bc.key, inChild);
        for (const clause of node.valueClauses || []) {
          check(clause.value, inChild);
          // Track bucket slice kind if flow is present
          if (clause.flow) {
            checkSliceConflict(clause.flow.bucket, clause.flow.sliceKind, node.loc);
          }
        }
        break;
      case 'Alt':
        for (const alt of node.alts || []) check(alt, inChild);
        break;
      case 'Quant':
      case 'Look':
      case 'SBind':
      case 'GroupBind':
      case 'Flow':
      case 'Collecting':
      case 'Guarded':
        check(node.pat || node.sub, inChild);
        break;
      case 'Seq':
        for (const item of node.items || []) check(item, inChild);
        break;
      case 'OGroup':
        for (const g of node.groups || []) check(g, inChild);
        break;
      case 'SlicePattern':
        check(node.content, true); // Slice patterns are container-like
        break;
    }
  }

  // Check for slice name conflicts (same name with different kinds)
  function checkSliceConflict(name, kind, loc) {
    const existing = sliceBindings.get(name);
    if (existing) {
      if (existing.kind !== kind) {
        const existingSigil = existing.kind === 'object' ? '%' : '@';
        const newSigil = kind === 'object' ? '%' : '@';
        let msg = `Slice name conflict: '${name}' used as both ${existingSigil}${name} and ${newSigil}${name}`;
        if (src && loc) {
          msg += `\n  at: ${src.slice(loc.start, loc.end)}`;
        }
        throw new Error(msg);
      }
    } else {
      sliceBindings.set(name, {kind, loc});
    }
  }

  check(ast, false);
}

// ---------- Exports ----------

export const AST = {
  // Atoms
  Any, Lit, StringPattern, Bool, Null, Fail, RootKey,
  // Bindings
  SBind, GroupBind, Guarded,
  // Containers
  Arr, Obj,
  // Operators
  Alt, Look, Quant,
  // Object
  OTerm, Spread, Breadcrumb,
};
