// parser.js
// Pratt-style parser with explicit precedence:
// () > quantifiers > DOT > adjacency (space/comma) > & > |
// Arrays are anchored by default; ".." is lowered to sugar per spec.
// Vertical paths are right-to-left associative for kPat.kvPat.
// Produces an AST with spans carried from tokens.

import {lex, T, PatternSyntaxError} from "./lexer.js";

// AST node constructors
const node = (type, span, fields = {}) => ({type, span, ...fields});

// Utilities to handle "trailing dot" propagation/merging
const withTrailingDot = (n, dotTok) => {
  // return a shallow-cloned node carrying trailingDot=true and span extended to include '.'
  return {...n, trailingDot: true, span: { start: n.span.start, end: dotTok.span.end }};
};
const stripTrailingDot = (n) => {
  if (!n || !n.trailingDot) return n;
  // Clear the flag without changing structure
  const { trailingDot, ...rest } = n;
  // Recursively clear on wrappers that only shuttle the flag (Group/Quant)
  if (rest.type === "Group") {
    return {...rest, sub: stripTrailingDot(rest.sub)};
  }
  if (rest.type === "Quant") {
    return {...rest, sub: stripTrailingDot(rest.sub)};
  }
  return rest;
};

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
    this._noAdjDepth = 0;
    this._inObjectKey = false;
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
  // Special rule: if the previous element carries trailingDot, adjacency is upgraded
  // to a DOT merge: Dot(prev-without-trailing, next).
  parseAdj() {
    let left = this.parseDot();
    const elems = [left];
    while (this.canStartExprAfterAdj()) {
      const next = this.parseDot();
      const prev = elems[elems.length - 1];
      if (prev && prev.trailingDot) {
        const lhs = stripTrailingDot(prev);
        const span = { start: lhs.span.start, end: next.span.end };
        elems[elems.length - 1] = node("Dot", span, { left: lhs, right: next });
      } else {
        elems.push(next);
    }
    }
    if (elems.length === 1) return elems[0];
    const span = {start: elems[0].span.start, end: elems[elems.length - 1].span.end};
    return node("Adj", span, {elems});
  }

  canStartExprAfterAdj() {
    const k = this.cur().kind;
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

  // ====== No-adjacency variants (for inside containers) ======
  // expr_or_noadj := expr_and_noadj ( '|' expr_and_noadj )*
  parseOrNoAdj() {
    this._noAdjDepth++;
    try {
      let left = this.parseAndNoAdj();
      while (this.opt(T.PIPE)) {
        const right = this.parseAndNoAdj();
        const span = {start: left.span.start, end: right.span.end};
        left = node("Alt", span, {options: [left, right]});
      }
      return left;
    } finally {
      this._noAdjDepth--;
    }
  }

  // expr_and_noadj := expr_dot ( '&' expr_dot )*
  parseAndNoAdj() {
    let left = this.parseDot();

    // Handle trailingDot merge (like parseAdj does)
    if (left.trailingDot && this.canStartExprAfterAdj()) {
      const lhs = stripTrailingDot(left);
      const next = this.parseDot();
      const span = { start: lhs.span.start, end: next.span.end };
      left = node("Dot", span, { left: lhs, right: next });
    }

    while (this.opt(T.AMP)) {
      const right = this.parseDot();
      const span = {start: left.span.start, end: right.span.end};
      left = node("And", span, {parts: [left, right]});
    }
    return left;
  }

  // Note: no "adjacency" combiner here; parseDot() already handles '.' with
  // the strict no-whitespace rule. Whitespace inside containers acts as a
  // separator (handled by container loops below), not an operator.

  // expr_dot := expr_quant ( '.' expr_quant )*
  // Trailing-dot support: if '.' is followed by a closer or '<<', we mark the current
  // left as {trailingDot:true} and extend its span to include '.'. The merge to a real
  // Dot happens in parseAdj() when the next token appears.
  parseDot() {
    let left = this.parseQuant();
    while (true) {
      // Check for indexed path: [pat] (only in object key context)
      if (this._inObjectKey && this.at(T.LBRACK)) {
        const lbrack = this.eat(T.LBRACK);
        const index = this.parseOrNoAdj();
        this.eat(T.RBRACK);
        const span = {start: left.span.start, end: this.lastSpan.end};
        left = node("IndexedPath", span, {obj: left, index});
        continue;
      }

      const dotTok = this.opt(T.DOT);
      if (!dotTok) break;

      // Dot chaining only allowed in object key context
      if (!this._inObjectKey) break;

      // Enforce NO whitespace/comments around '.'
      if (dotTok.wsBefore || dotTok.wsAfter) {
        throw this.err("No whitespace or comments around '.'", dotTok.span.start);
      }

      const k = this.cur().kind;
      const rhsWouldTerminate =
        k === T.RPAREN || k === T.RBRACK || k === T.RBRACE || k === T.RDBRACE || k === T.REPL_R;
      if (rhsWouldTerminate) {
        // Produce a trailing-dot marker on the left node
        left = withTrailingDot(left, dotTok);
        // Do not attempt to consume a rhs here; parseAdj() will attach it later
        continue;
      }

      const right = this.parseQuant();

      const span = {start: left.span.start, end: right.span.end};
      left = node("Dot", span, {left, right});
    }
    return left;
  }

  // expr_quant := primary quantifier*
  // Propagate trailingDot flag through Group/Quant wrappers.
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
        const q = node("Quant", span, {sub: base, min, max, greedy});
        if (base.trailingDot) q.trailingDot = true;
        base = q;
        continue;
      }
      // explicit {m,n}
      if (t.kind === T.LBRACE && this.peek(1).kind === T.NUMBER) {
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
        const q = node("Quant", span, {sub: base, min, max, greedy});
        if (base.trailingDot) q.trailingDot = true;
        base = q;
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
      const g = node("Group", {start, end}, {sub: inner});
      if (inner.trailingDot) g.trailingDot = true;
      return g;
    }

    if (t.kind === T.LBRACK) return this.parseArray();

    if (t.kind === T.LBRACE) {
      // Check if it's {{ (set) or just { (object)
      if (this.peek(1).kind === T.LBRACE) {
        return this.parseSet();
      }
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
      return node("Spread", tok.span, {});
    }

    return this.parseAtom();
  }

  parseArray() {
    const start = this.eat(T.LBRACK).span.start;
    const elems = [];
    while (!this.at(T.RBRACK)) {
      const pat = this.parseOrNoAdj(); // adjacency = separator inside arrays
      elems.push(pat);
      this.opt(T.COMMA); // optional comma separator
      if (this.at(T.EOF)) throw this.err("Unterminated array", start);
    }
    const end = this.eat(T.RBRACK).span.end;
    return node("Array", {start, end}, {elems, anchored: true});
  }

  parseSet() {
    const start = this.eat(T.LBRACE).span.start;
    this.eat(T.LBRACE); // {{ opens a set
    const members = [];
    while (!(this.at(T.RBRACE) && this.peek(1).kind === T.RBRACE)) {
      const pat = this.parseOrNoAdj();  // adjacency = separator inside sets
      members.push(pat);
      this.opt(T.COMMA); // optional comma separator
      if (this.at(T.EOF)) throw this.err("Unterminated set", start);
    }
    this.eat(T.RBRACE);
    const end = this.eat(T.RBRACE).span.end; // }} closes a set
    return node("Set", {start, end}, {members});
  }

  parseKV_NormalOrReplacement() {
    // Handles:
    //   >> k << : v      → ReplaceKey
    //   k : >> v <<      → ReplaceVal
    //   k : v            → normal KV (possibly with #count)
    if (this.at(T.REPL_L)) {
      const start = this.eat(T.REPL_L).span.start;
      this._inObjectKey = true;
      const kPat = this.parseOrNoAdj();       // ⟵ no adjacency in object key
      this._inObjectKey = false;
      this.eat(T.REPL_R);
      this.eat(T.COLON);
      const vPat = this.parseOrNoAdj();       // ⟵ no adjacency in object value
      const span = {start, end: vPat.span.end};
      return {kind: "ReplaceKey", node: node("ReplaceKey", span, {kPat, vPat})};
    }

    this._inObjectKey = true;
    const kPat = this.parseOrNoAdj();         // ⟵ no adjacency in object key
    this._inObjectKey = false;
    this.eat(T.COLON);

    if (this.at(T.REPL_L)) {
      const start = kPat.span.start;
      this.eat(T.REPL_L);
      const vPat = this.parseOrNoAdj();       // ⟵ no adjacency in object value
      const r = this.eat(T.REPL_R);
      const span = {start, end: r.span.end};
      return {kind: "ReplaceVal", node: node("ReplaceVal", span, {kPat, vPat})};
    }

    const vPat = this.parseOrNoAdj();         // ⟵ no adjacency in object value
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
    return {kind: "KV", node: {kPat, vPat, count}};
  }

  parseObject() {
    const start = this.eat(T.LBRACE).span.start;
    const kvs = [];
    let typeGuard = null;
    let hasSpread = false;
    let spreadCount = 0;

    while (!this.at(T.RBRACE)) {
      if (this.at(T.ELLIPSIS)) {
        this.eat(T.ELLIPSIS);
        hasSpread = true;
        spreadCount++;
      } else {
        const res = this.parseKV_NormalOrReplacement();
        if (res.kind === "KV" || res.kind === "ReplaceKey" || res.kind === "ReplaceVal") {
          kvs.push(res.node);
        } else {
          throw this.err("Unexpected KV form", this.cur().span.start);
        }
      }
      this.opt(T.COMMA); // optional comma separator
      if (this.at(T.EOF)) throw this.err("Unterminated object", start);
    }
    const end = this.eat(T.RBRACE).span.end;

    if (this.at(T.AS)) {
      const asTok = this.eat(T.AS);
      const ident = this.eat(T.BARE);
      typeGuard = {name: ident.value, span: {start: asTok.span.start, end: ident.span.end}};
    }

    return node("Object", {start, end}, {kvs, anchored: !hasSpread, hasSpread, spreadCount, typeGuard});
  }

  parseReplacement() {
    // >> a b c <<   (slice replacement target, typically in arrays)
    const leftTok = this.eat(T.REPL_L);
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
      this.eat(T.EQ);
      if (this.at(T.DOLLAR)) {
        const other = this.parseBindingOrVar();
        const span = {start: varNode.span.start, end: other.span.end};
        return node("BindEq", span, {left: varNode, right: other}); // $x=$y
      } else {
        // Bind: $x=pattern — RHS is a primary only (binding has higher precedence than quantifiers)
        // For complex patterns, use parens: $x=(_*), $x=(a.b)
        const rhs = this.parsePrimary();
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
    throw new PatternSyntaxError(`Unexpected token ${t.kind}`);
  }

  expect(kind) {
    const t = this.cur();
    if (t.kind !== kind) {
      throw new PatternSyntaxError(`Expected ${kind}, got ${t.kind}`, t.span.start);
    }
    this.i++;
    return t;
  }
}
