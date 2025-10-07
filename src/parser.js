// parser.js
// Pratt-style parser with explicit precedence:
// () > quantifiers > DOT > adjacency (space/comma) > & > |
// Arrays are anchored by default; "..." is lowered to sugar per spec.
// Vertical paths are right-to-left associative for kPat.kvPat.
// Produces an AST with spans carried from tokens.

import {lex, T, PatternSyntaxError} from "./lexer.js";

// AST node constructors
const node = (type, span, fields = {}) => ({type, span, ...fields});

/**
 * Parse entrypoint
 */
export function parse(source) {
  const tokens = lex(source);
  const p = new Parser(tokens, source);
  const ast = p.parsePattern();
  p.expect(T.EOF);
  return ast;
}

class Parser {
  constructor(tokens, source) {
    this.toks = tokens;
    this.src = source;
    this.i = 0;
    this.lastSpan = {start: 0, end: 0};
  }

  peek(k = 0) {
    return this.toks[this.i + k];
  }

  cur() {
    return this.peek(0);
  }

  at(kind) {
    return this.cur().kind === kind;
  }

  eat(kind) {
    const t = this.cur();
    if (t.kind !== kind) {
      throw this.err(`Expected ${kind} but got ${t.kind}`, t.span.start);
    }
    this.i++;
    this.lastSpan = t.span;
    return t;
  }

  opt(kind) {
    if (this.at(kind)) return this.eat(kind);
    return null;
  }

  err(msg, pos = this.cur().span.start) {
    return new PatternSyntaxError(msg, pos);
  }

  // ====== Grammar ======
  // pattern := expr_or
  parsePattern() {
    return this.parseOr();
  }

  // expr_or := expr_and ( '|' expr_and )*
  parseOr() {
    let left = this.parseAnd();
    while (this.opt(T.PIPE)) {
      const op = this.lastSpan;
      const right = this.parseAnd();
      const span = {start: left.span.start, end: right.span.end};
      left = node("Alt", span, {options: [left, right], op});
    }
    return left;
  }

  // expr_and := expr_adj ( '&' expr_adj )*
  parseAnd() {
    let left = this.parseAdj();
    while (this.opt(T.AMP)) {
      const op = this.lastSpan;
      const right = this.parseAdj();
      const span = {start: left.span.start, end: right.span.end};
      left = node("And", span, {parts: [left, right], op});
    }
    return left;
  }

  // expr_adj := expr_dot ( adj expr_dot )*
  // adjacency is implicit: we treat boundaries between units inside array/set/object contexts.
  // Here, we parse as a left-associative sequence node "Adj".
  parseAdj() {
    let left = this.parseDot();
    const elems = [left];
    while (this.canStartExprAfterAdj()) {
      const right = this.parseDot();
      elems.push(right);
    }
    if (elems.length === 1) return left;
    const span = {start: elems[0].span.start, end: elems[elems.length - 1].span.end};
    return node("Adj", span, {elems});
  }

  canStartExprAfterAdj() {
    const k = this.cur().kind;
    // A new expr starts if the next token begins an atom/group/path start
    return (
      k === T.LPAREN ||
      k === T.LBRACK ||
      k === T.LBRACE ||
      k === T.LDBRACE ||
      k === T.REPL_L ||
      k === T.ASSERT_POS ||
      k === T.ASSERT_NEG ||
      k === T.DOLLAR ||
      k === T.ANY ||
      k === T.BARE || k === T.STRING || k === T.REGEX || k === T.NUMBER || k === T.BOOL ||
      k === T.ELLIPSIS
    );
  }

  // expr_dot := expr_quant ( '.' expr_quant )*
  parseDot() {
    let left = this.parseQuant();
    while (this.opt(T.DOT)) {
      const right = this.parseQuant();
      const span = {start: left.span.start, end: right.span.end};
      left = node("Dot", span, {left, right});
    }
    return left;
  }

  // expr_quant := primary quantifier*
  parseQuant() {
    let base = this.parsePrimary();
    while (true) {
      const t = this.cur();
      if (t.kind === T.STAR || t.kind === T.PLUS || t.kind === T.QMARK) {
        this.i++;
        const greedy = this.opt(T.QMARK) ? false : true; // *?/+?/?? -> lazy
        const span = {start: base.span.start, end: this.lastSpan.end};
        const kind = t.kind;
        let min = 0, max = Infinity;
        if (kind === T.STAR) {
          min = 0;
          max = Infinity;
        } else if (kind === T.PLUS) {
          min = 1;
          max = Infinity;
        } else if (kind === T.QMARK) {
          min = 0;
          max = 1;
        }
        base = node("Quant", span, {sub: base, min, max, greedy});
        continue;
      }
      // explicit {m,n} after arrays segments/groups via STAR-like style: we allow trailing {m,n} after any primary
      if (t.kind === T.LBRACE && this.peek(1).kind === T.NUMBER) {
        // Parse {m,n} or {m}
        const l = this.eat(T.LBRACE);
        const mTok = this.eat(T.NUMBER);
        let min = mTok.value;
        let max = min;
        if (this.opt(T.COMMA)) {
          if (this.at(T.NUMBER)) {
            const nTok = this.eat(T.NUMBER);
            max = nTok.value;
          } else {
            max = Infinity; // {m,}
          }
        }
        this.eat(T.RBRACE);
        const greedy = this.opt(T.QMARK) ? false : true;
        const span = {start: base.span.start, end: this.lastSpan.end};
        base = node("Quant", span, {sub: base, min, max, greedy});
        continue;
      }
      break;
    }
    return base;
  }

  // primary := group | array | object | set | binding | lookahead | replacement | atom
  parsePrimary() {
    const t = this.cur();

    if (t.kind === T.LPAREN) {
      const start = this.eat(T.LPAREN).span.start;
      const inner = this.parseOr();
      const end = this.eat(T.RPAREN).span.end;
      return node("Group", {start, end}, {sub: inner});
    }

    if (t.kind === T.LBRACK) return this.parseArray();

    if (t.kind === T.LBRACE || t.kind === T.LDBRACE) {
      // distinguish set vs object
      if (t.kind === T.LDBRACE) return this.parseSet();
      return this.parseObject();
    }

    if (t.kind === T.REPL_L) return this.parseReplacement();

    if (t.kind === T.ASSERT_POS || t.kind === T.ASSERT_NEG) {
      return this.parseAssertion();
    }

    if (t.kind === T.DOLLAR) {
      return this.parseBindingOrVar();
    }

    if (t.kind === T.ELLIPSIS) {
      const tok = this.eat(T.ELLIPSIS);
      // sugar lowered later; keep as explicit AnySpread node here
      return node("Spread", tok.span, {});
    }

    return this.parseAtom();
  }

  parseArray() {
    const start = this.eat(T.LBRACK).span.start;
    const elems = [];
    while (!this.at(T.RBRACK)) {
      const pat = this.parseOr();
      elems.push(pat);
      // commas treated as whitespace by lexer, so no need to consume here
      if (this.at(T.EOF)) throw this.err("Unterminated array", start);
    }
    const end = this.eat(T.RBRACK).span.end;
    // arrays anchored by default; spread allowed as sugar
    return node("Array", {start, end}, {elems, anchored: true});
  }

  parseSet() {
    const start = this.eat(T.LDBRACE).span.start;
    const members = [];
    while (!this.at(T.RDBRACE)) {
      const pat = this.parseOr();
      members.push(pat);
      if (this.at(T.EOF)) throw this.err("Unterminated set", start);
    }
    const end = this.eat(T.RDBRACE).span.end;
    return node("Set", {start, end}, {members});
  }

  parseKV() {
    // kPat ':' vPat
    // Left side can be vertical chain (dot), with right-to-left associativity realized by our Dot nodes already.
    const kPat = this.parseDot();
    this.eat(T.COLON);
    const vPat = this.parseOr();
    return {kPat, vPat};
  }

  parseObject() {
    const start = this.eat(T.LBRACE).span.start;
    const kvs = [];
    let typeGuard = null; // "as SomeClass" optional after }
    let hasSpread = false;

    while (!this.at(T.RBRACE)) {
      // object allows ... sugar (= _:_ #?) — we don't lower here; validator/compiler can.
      if (this.at(T.ELLIPSIS)) {
        const sp = this.eat(T.ELLIPSIS);
        hasSpread = true;
        // syntactically it's allowed to appear alongside kvs; no kv added
      } else {
        const {kPat, vPat} = this.parseKV();
        // optional counting constraint k:v #{m,n}
        let count = null;
        if (this.at(T.HASH)) {
          this.eat(T.HASH);
          this.eat(T.LBRACE);
          const mTok = this.eat(T.NUMBER);
          let min = mTok.value;
          let max = min;
          if (this.opt(T.COMMA)) {
            if (this.at(T.NUMBER)) {
              const nTok = this.eat(T.NUMBER);
              max = nTok.value;
            } else {
              max = Infinity;
            }
          }
          this.eat(T.RBRACE);
          count = {min, max};
        }
        kvs.push({kPat, vPat, count});
      }
      if (this.at(T.EOF)) throw this.err("Unterminated object", start);
    }
    const end = this.eat(T.RBRACE).span.end;

    // optional "as Type"
    if (this.at(T.AS)) {
      const asTok = this.eat(T.AS);
      const ident = this.eat(T.BARE); // simple ident; could also allow string
      typeGuard = {name: ident.value, span: {start: asTok.span.start, end: ident.span.end}};
    }

    return node("Object", {start, end}, {kvs, anchored: !hasSpread, hasSpread, typeGuard});
  }

  parseReplacement() {
    // >> a b c <<    or >> k << : v  or k : >> v <<
    const leftTok = this.eat(T.REPL_L);
    // We don't know context until we see ':' or '<<'
    if (this.at(T.RBRACE) || this.at(T.RBRACK) || this.at(T.RDBRACE)) {
      throw this.err("Empty replacement slice not allowed", leftTok.span.start);
    }
    // Try to parse a general pattern until we see REPL_R
    const inner = this.parseOr();
    const rightTok = this.eat(T.REPL_R);
    const span = {start: leftTok.span.start, end: rightTok.span.end};
    return node("ReplaceSlice", span, {target: inner});
  }

  parseAssertion() {
    if (this.at(T.ASSERT_POS)) {
      const start = this.eat(T.ASSERT_POS).span.start;
      const pat = this.parseOr();
      const end = this.eat(T.RPAREN).span.end;
      return node("Assert", {start, end}, {kind: "pos", pat});
    } else {
      const start = this.eat(T.ASSERT_NEG).span.start;
      const pat = this.parseOr();
      const end = this.eat(T.RPAREN).span.end;
      return node("Assert", {start, end}, {kind: "neg", pat});
    }
  }

  parseBindingOrVar() {
    const dollar = this.eat(T.DOLLAR);
    const nameTok = this.eat(T.BARE);
    const varNode = node("Var", {start: dollar.span.start, end: nameTok.span.end}, {name: nameTok.value});

    if (this.at(T.EQ)) {
      // $x = pattern | $x = $y
      this.eat(T.EQ);
      if (this.at(T.DOLLAR)) {
        const other = this.parseBindingOrVar();
        const span = {start: varNode.span.start, end: other.span.end};
        return node("BindEq", span, {left: varNode, right: other}); // $x=$y
      } else {
        const rhs = this.parseOr();
        const span = {start: varNode.span.start, end: rhs.span.end};
        return node("Bind", span, {name: varNode.name, pat: rhs});
      }
    }
    return varNode; // $x === $x:_
  }

  parseAtom() {
    const t = this.cur();
    if (t.kind === T.NUMBER) {
      const tok = this.eat(T.NUMBER);
      return node("Number", tok.span, {value: tok.value});
    }
    if (t.kind === T.BOOL) {
      const tok = this.eat(T.BOOL);
      return node("Bool", tok.span, {value: tok.value});
    }
    if (t.kind === T.STRING) {
      const tok = this.eat(T.STRING);
      return node("String", tok.span, {value: tok.value});
    }
    if (t.kind === T.BARE) {
      const tok = this.eat(T.BARE);
      // Barewords are string literals per spec
      return node("String", tok.span, {value: tok.value});
    }
    if (t.kind === T.REGEX) {
      const tok = this.eat(T.REGEX);
      return node("Regex", tok.span, {body: tok.value.body, flags: tok.value.flags});
    }
    if (t.kind === T.ANY) {
      const tok = this.eat(T.ANY);
      return node("Any", tok.span, {});
    }
    throw this.err(`Unexpected token ${t.kind}`);
  }

  expect(kind) {
    const t = this.cur();
    if (t.kind !== kind) {
      throw this.err(`Expected ${kind}, got ${t.kind}`, t.span.start);
    }
    this.i++;
    return t;
  }
}
