// lexer.js
// Spec-driven lexer for Tendril patterns.
// - Treats spaces, tabs, newlines, and commas as whitespace.
// - Strips // and /* */ comments where whitespace is allowed.
// - Recognizes JS-like /regex/ with flags (ims supported; u assumed externally).
// - Keeps spans {start,end} (UTF-16 indices) for source mapping.
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

  // Replacement markers
  REPL_L: ">>",
  REPL_R: "<<",

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
 */
export function lex(source) {
  const s = String(source);
  const tokens = [];
  let i = 0;

  const push = (kind, value = null, start = i, end = i) => {
    tokens.push({kind, value, span: {start, end}});
  };

  const peek = () => s[i];
  const eat = () => s[i++];

  const isWS = c => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f";
  const isDigit = c => c >= "0" && c <= "9";
  const isAlpha = c => (c >= "A" && c <= "Z") || (c >= "a" && c <= "z");
  const isBareStart = c => isAlpha(c) || c === "_";
  const isBareCont = c => isBareStart(c) || isDigit(c);

  // Treat commas as whitespace (spec) — we won't emit COMMA tokens; we skip them like WS.
  const skipWSAndComments = () => {
    while (i < s.length) {
      const c = peek();
      // Whitespace or comma
      if (isWS(c) || c === ",") {
        i++;
        continue;
      }
      // // comment
      if (c === "/" && s[i + 1] === "/") {
        i += 2;
        while (i < s.length && s[i] !== "\n") i++;
        continue;
      }
      // /* block */
      if (c === "/" && s[i + 1] === "*") {
        i += 2;
        while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) {
          i++;
        }
        if (i >= s.length) throw new PatternSyntaxError("Unterminated block comment", i);
        i += 2;
        continue;
      }
      break;
    }
  };

  const lexNumber = () => {
    const start = i;
    // optional sign
    if ((s[i] === "+" || s[i] === "-") && isDigit(s[i + 1])) i++;
    while (isDigit(s[i])) i++;
    // decimal
    if (s[i] === "." && isDigit(s[i + 1])) {
      i++;
      while (isDigit(s[i])) i++;
    }
    // exponent
    if ((s[i] === "e" || s[i] === "E") && ((s[i + 1] === "+" || s[i + 1] === "-" || isDigit(s[i + 1])))) {
      i++;
      if (s[i] === "+" || s[i] === "-") i++;
      if (!isDigit(s[i])) throw new PatternSyntaxError("Bad numeric exponent", i);
      while (isDigit(s[i])) i++;
    }
    const text = s.slice(start, i);
    const num = Number(text);
    if (!Number.isFinite(num)) throw new PatternSyntaxError("Invalid number", start);
    push(T.NUMBER, num, start, i);
  };

  const lexString = () => {
    const quote = eat(); // "
    const start = i - 1;
    let out = "";
    while (i < s.length) {
      const c = eat();
      if (c === "\\") {
        if (i >= s.length) throw new PatternSyntaxError("Unterminated string escape", i);
        const e = eat();
        // Minimal escapes; delegate more to JS unescape semantics if needed
        if (e === "n") out += "\n";
        else if (e === "r") out += "\r";
        else if (e === "t") out += "\t";
        else if (e === '"') out += '"';
        else if (e === "\\") out += "\\";
        else out += e; // keep as-is
        continue;
      }
      if (c === quote) {
        push(T.STRING, out, start, i);
        return;
      }
      out += c;
    }
    throw new PatternSyntaxError("Unterminated string", start);
  };

  // Regex literal: /.../flags
  // Heuristic: scan forward for a slash that, together with subsequent [a-z]* flags, forms a compilable JS regex.
  const lexRegex = () => {
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
    // Flags: only ims accepted; others present are not fatal here—we store flags; runtime may ignore or complain.
    let flags = "";
    while (i < s.length && /[a-z]/i.test(s[i])) {
      flags += s[i++];
    }
    // try compile to ensure correctness (spec: bad regex → syntax error)
    try {
      // Always include 'u' semantics conceptually; we keep user flags as provided.
      /* eslint no-new: 0 */
      new RegExp(body, flags);
    } catch (e) {
      throw new PatternSyntaxError("Invalid regex: " + e.message, start);
    }
    push(T.REGEX, {body, flags}, start, i);
  };

  const lexBareOrKeywordOrBool = () => {
    const start = i;
    i++; // first char already ensured bare-start
    while (i < s.length && isBareCont(s[i])) i++;
    const txt = s.slice(start, i);
    if (txt === "true" || txt === "false") {
      push(T.BOOL, txt === "true", start, i);
      return;
    }
    if (txt === "as") {
      push(T.AS, txt, start, i);
      return;
    }
    // bareword literal (string)
    push(T.BARE, txt, start, i);
  };

  const tryTwoChar = (a, b) => s[i] === a && s[i + 1] === b;
  const tryThreeChar = (a, b, c) => s[i] === a && s[i + 1] === b && s[i + 2] === c;

  while (true) {
    skipWSAndComments();
    if (i >= s.length) {
      push(T.EOF, null, i, i);
      break;
    }
    const c = peek();

    // replacement markers
    if (tryTwoChar(">", ">")) {
      const start = i;
      i += 2;
      push(T.REPL_L, ">>", start, i);
      continue;
    }
    if (tryTwoChar("<", "<")) {
      const start = i;
      i += 2;
      push(T.REPL_R, "<<", start, i);
      continue;
    }

    // set braces
    if (tryTwoChar("{", "{")) {
      const start = i;
      i += 2;
      push(T.LDBRACE, "{{", start, i);
      continue;
    }
    if (tryTwoChar("}", "}")) {
      const start = i;
      i += 2;
      push(T.RDBRACE, "}}", start, i);
      continue;
    }

    // ellipsis
    if (tryThreeChar(".", ".", ".")) {
      const start = i;
      i += 3;
      push(T.ELLIPSIS, "...", start, i);
      continue;
    }

    // assertions
    if (tryThreeChar("(", "?", "=")) {
      const start = i;
      i += 3;
      push(T.ASSERT_POS, "(?=", start, i);
      continue;
    }
    if (tryThreeChar("(", "?", "!")) {
      const start = i;
      i += 3;
      push(T.ASSERT_NEG, "(?!", start, i);
      continue;
    }

    // single char punctuation
    if (c === "[") {
      push(T.LBRACK, "[", i, ++i);
      continue;
    }
    if (c === "]") {
      push(T.RBRACK, "]", i, ++i);
      continue;
    }
    if (c === "{") {
      push(T.LBRACE, "{", i, ++i);
      continue;
    }
    if (c === "}") {
      push(T.RBRACE, "}", i, ++i);
      continue;
    }
    if (c === "(") {
      push(T.LPAREN, "(", i, ++i);
      continue;
    }
    if (c === ")") {
      push(T.RPAREN, ")", i, ++i);
      continue;
    }
    if (c === ":") {
      push(T.COLON, ":", i, ++i);
      continue;
    }
    if (c === ".") {
      push(T.DOT, ".", i, ++i);
      continue;
    }
    if (c === "|") {
      push(T.PIPE, "|", i, ++i);
      continue;
    }
    if (c === "&") {
      push(T.AMP, "&", i, ++i);
      continue;
    }
    if (c === "*") {
      push(T.STAR, "*", i, ++i);
      continue;
    }
    if (c === "+") {
      push(T.PLUS, "+", i, ++i);
      continue;
    }
    if (c === "?") {
      push(T.QMARK, "?", i, ++i);
      continue;
    }
    if (c === "#") {
      push(T.HASH, "#", i, ++i);
      continue;
    }
    if (c === "=") {
      push(T.EQ, "=", i, ++i);
      continue;
    }
    if (c === "$") {
      push(T.DOLLAR, "$", i, ++i);
      continue;
    }
    if (c === "_") {
      push(T.ANY, "_", i, ++i);
      continue;
    }

    // Strings
    if (c === '"') {
      lexString();
      continue;
    }

    // Regex literal
    if (c === "/") {
      lexRegex();
      continue;
    }

    // Number
    if (isDigit(c) || ((c === "+" || c === "-") && isDigit(s[i + 1]))) {
      lexNumber();
      continue;
    }

    // Bareword or keyword
    if (isBareStart(c)) {
      lexBareOrKeywordOrBool();
      continue;
    }

    throw new PatternSyntaxError(`Unexpected character '${c}'`, i);
  }

  return tokens;
}
