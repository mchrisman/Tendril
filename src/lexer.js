// lexer.js
// Spec-driven lexer for Tendril patterns.
// - Treats spaces, tabs, newlines, and commas as whitespace.
// - Strips // and /* */ comments where whitespace is allowed.
// - Recognizes JS-like /regex/ with flags (ims supported; u assumed externally).
// - Keeps spans {start,end} (UTF-16 indices) for source mapping.
// - Annotates tokens with wsBefore/wsAfter flags to enforce no-WS-around '.'.
// - Does NOT validate semantic placement (parser & validator handle that).

/**
 * Token kinds
 */
export const T = {
  // Structure / punctuation
  LBRACK: "[",
  RBRACK: "]",
  LBRACE: "{",
  RBRACE: "}",
  LDBRACE: "{{",   // set-open
  RDBRACE: "}}",   // set-close
  LPAREN: "(",
  RPAREN: ")",

  COLON: ":",
  DOT: ".",
  PIPE: "|",
  AMP: "&",
  STAR: "*",
  PLUS: "+",
  QMARK: "?",
  HASH: "#",
  COMMA: ",", // treated as whitespace by parser

  // Quantifier braces after * or for #{m,n}: we reuse LQBRACE/RQBRACE tokens
  LQBRACE: "{#",
  RQBRACE: "#}",

  // Ellipsis sugar
  ELLIPSIS: "...",

  // Literals / atoms
  NUMBER: "NUMBER",
  BOOL: "BOOL",
  STRING: "STRING",
  BARE: "BARE",
  REGEX: "REGEX",
  ANY: "ANY", // _

  // Variables and binding
  DOLLAR: "$",
  EQ: "=", // used in $x=pattern and $x=$y

  // Assertions
  ASSERT_POS: "(?=",
  ASSERT_NEG: "(?!",

  // Keywords
  AS: "as",

  // End
  EOF: "EOF",
};

/**
 * Simple error type for syntax problems.
 */
export class PatternSyntaxError extends Error {
  constructor(message, pos) {
    super(message);
    this.name = "PatternSyntaxError";
    this.pos = pos;
  }
}

/**
 * Lex one pattern string into tokens with spans.
 * Each token has:
 *   - kind, value, span {start,end}
 *   - wsBefore: boolean (whitespace/comments before this token)
 *   - wsAfter:  boolean (whitespace/comments after this token) — set when the NEXT token is lexed
 */
export function lex(source) {
  const s = String(source);
  const tokens = [];
  let i = 0;
  let lastTok = null; // to set wsAfter on the previously emitted token

  const push = (kind, value = null, start = i, end = i, wsBefore = false) => {
    const tok = {kind, value, span: {start, end}, wsBefore, wsAfter: false};
    tokens.push(tok);
    lastTok = tok;
  };

  const peek = () => s[i];
  const eat = () => s[i++];

  const isWSChar = c => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f";
  const isDigit = c => c >= "0" && c <= "9";
  const isAlpha = c => (c >= "A" && c <= "Z") || (c >= "a" && c <= "z");
  const isBareStart = c => isAlpha(c) || c === "_";
  const isBareCont = c => isBareStart(c) || isDigit(c);

  /**
   * Skip whitespace and comments.
   * Returns true if ANY was skipped.
   */
  const skipWSAndComments = () => {
    let skipped = false;
    while (i < s.length) {
      const c = peek();
      // Whitespace (but NOT comma - comma is a real token)
      if (isWSChar(c)) {
        i++;
        skipped = true;
        continue;
      }
      // // comment
      if (c === "/" && s[i + 1] === "/") {
        i += 2;
        skipped = true;
        while (i < s.length && s[i] !== "\n") i++;
        continue;
      }
      // /* block */
      if (c === "/" && s[i + 1] === "*") {
        i += 2;
        skipped = true;
        while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) {
          i++;
        }
        if (i >= s.length) throw new PatternSyntaxError("Unterminated block comment", i);
        i += 2;
        continue;
      }
      break;
    }
    return skipped;
  };

  const lexNumber = (wsBefore) => {
    const start = i;
    if ((s[i] === "+" || s[i] === "-") && isDigit(s[i + 1])) i++;
    while (isDigit(s[i])) i++;
    if (s[i] === "." && isDigit(s[i + 1])) {
      i++;
      while (isDigit(s[i])) i++;
    }
    if ((s[i] === "e" || s[i] === "E") && ((s[i + 1] === "+" || s[i + 1] === "-" || isDigit(s[i + 1])))) {
      i++;
      if (s[i] === "+" || s[i] === "-") i++;
      if (!isDigit(s[i])) throw new PatternSyntaxError("Bad numeric exponent", i);
      while (isDigit(s[i])) i++;
    }
    const text = s.slice(start, i);
    const num = Number(text);
    if (!Number.isFinite(num)) throw new PatternSyntaxError("Invalid number", start);
    push(T.NUMBER, num, start, i, wsBefore);
  };

  const lexString = (wsBefore) => {
    const quote = eat(); // "
    const start = i - 1;
    let out = "";
    while (i < s.length) {
      const c = eat();
      if (c === "\\") {
        if (i >= s.length) throw new PatternSyntaxError("Unterminated string escape", i);
        const e = eat();
        if (e === "n") out += "\n";
        else if (e === "r") out += "\r";
        else if (e === "t") out += "\t";
        else if (e === '"') out += '"';
        else if (e === "\\") out += "\\";
        else out += e;
        continue;
      }
      if (c === quote) {
        push(T.STRING, out, start, i, wsBefore);
        return;
      }
      out += c;
    }
    throw new PatternSyntaxError("Unterminated string", start);
  };

  const lexRegex = (wsBefore) => {
    const start = i;
    eat(); // '/'
    let body = "";
    let closed = false;
    while (i < s.length) {
      const c = eat();
      if (c === "\\") {
        if (i >= s.length) throw new PatternSyntaxError("Unterminated regex escape", i);
        body += c + eat();
        continue;
      }
      if (c === "/") {
        closed = true;
        break;
      }
      body += c;
    }
    if (!closed) throw new PatternSyntaxError("Unterminated regex", start);
    let flags = "";
    while (i < s.length && /[a-z]/i.test(s[i])) flags += s[i++];
    try {
      new RegExp(body, flags);
    } catch (e) {
      throw new PatternSyntaxError("Invalid regex: " + e.message, start);
    }
    push(T.REGEX, {body, flags}, start, i, wsBefore);
  };

  const lexBareOrKeywordOrBool = (wsBefore) => {
    const start = i;
    i++;
    while (i < s.length && isBareCont(s[i])) i++;
    const txt = s.slice(start, i);
    if (txt === "true" || txt === "false") {
      push(T.BOOL, txt === "true", start, i, wsBefore);
      return;
    }
    if (txt === "as") {
      push(T.AS, txt, start, i, wsBefore);
      return;
    }
    push(T.BARE, txt, start, i, wsBefore);
  };

  const tryTwoChar = (a, b) => s[i] === a && s[i + 1] === b;
  const tryThreeChar = (a, b, c) => s[i] === a && s[i + 1] === b && s[i + 2] === c;

  while (true) {
    const skipped = skipWSAndComments();
    if (lastTok) lastTok.wsAfter = skipped;

    if (i >= s.length) {
      push(T.EOF, null, i, i, skipped);
      break;
    }
    const c = peek();


    // Note: {{ and }} are handled by the parser as consecutive { { or } }
    // The lexer stays context-free by only emitting single-char tokens

    // ellipsis
    if (tryTwoChar(".", ".")) {
      const start = i;
      i += 2;
      push(T.ELLIPSIS, "..", start, i, skipped);
      continue;
    }

    // assertions
    if (tryThreeChar("(", "?", "=")) {
      const start = i;
      i += 3;
      push(T.ASSERT_POS, "(?=", start, i, skipped);
      continue;
    }
    if (tryThreeChar("(", "?", "!")) {
      const start = i;
      i += 3;
      push(T.ASSERT_NEG, "(?!", start, i, skipped);
      continue;
    }

    // single char punctuation
    if (c === "[") {
      push(T.LBRACK, "[", i, ++i, skipped);
      continue;
    }
    if (c === "]") {
      push(T.RBRACK, "]", i, ++i, skipped);
      continue;
    }
    if (c === "{") {
      push(T.LBRACE, "{", i, ++i, skipped);
      continue;
    }
    if (c === "}") {
      push(T.RBRACE, "}", i, ++i, skipped);
      continue;
    }
    if (c === "(") {
      push(T.LPAREN, "(", i, ++i, skipped);
      continue;
    }
    if (c === ")") {
      push(T.RPAREN, ")", i, ++i, skipped);
      continue;
    }
    if (c === ":") {
      push(T.COLON, ":", i, ++i, skipped);
      continue;
    }
    if (c === ".") {
      push(T.DOT, ".", i, ++i, skipped);
      continue;
    }
    if (c === "|") {
      push(T.PIPE, "|", i, ++i, skipped);
      continue;
    }
    if (c === "&") {
      push(T.AMP, "&", i, ++i, skipped);
      continue;
    }
    if (c === "*") {
      push(T.STAR, "*", i, ++i, skipped);
      continue;
    }
    if (c === "+") {
      push(T.PLUS, "+", i, ++i, skipped);
      continue;
    }
    if (c === "?") {
      push(T.QMARK, "?", i, ++i, skipped);
      continue;
    }
    if (c === "#") {
      push(T.HASH, "#", i, ++i, skipped);
      continue;
    }
    if (c === ",") {
      push(T.COMMA, ",", i, ++i, skipped);
      continue;
    }
    if (c === "=") {
      push(T.EQ, "=", i, ++i, skipped);
      continue;
    }
    if (c === "$") {
      push(T.DOLLAR, "$", i, ++i, skipped);
      continue;
    }
    if (c === "_") {
      push(T.ANY, "_", i, ++i, skipped);
      continue;
    }

    // Strings
    if (c === '"') {
      lexString(skipped);
      continue;
    }

    // Regex literal
    if (c === "/") {
      lexRegex(skipped);
      continue;
    }

    // Number
    if (isDigit(c) || ((c === "+" || c === "-") && isDigit(s[i + 1]))) {
      lexNumber(skipped);
      continue;
    }

    // Bareword or keyword
    if (isBareStart(c)) {
      lexBareOrKeywordOrBool(skipped);
      continue;
    }

    throw new PatternSyntaxError(`Unexpected character '${c}'`, i);
  }

  return tokens;
}
