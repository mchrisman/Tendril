// tendril-dsl.mjs
//
// Minimal Option-C DSL: rule`Name -> ...` with light annotations.
// Focus: readable authoring + a working regex compiler for demonstrations.

////////////////////////////////////////////////////////////////////////////////
// Utilities
////////////////////////////////////////////////////////////////////////////////

const stripComments = (s) =>
  s
  // preserve string and char classes while removing //... and /*...*/
  .replace(/("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|\/\*[\s\S]*?\*\/|\/\/[^\n]*|\[[^\]]*\])/g, (m) => {
    if (m.startsWith("/*") || m.startsWith("//")) return ""; // remove comments
    return m; // keep strings and char classes
  })
  .trim();

const collapseWhitespace = (s) =>
  s
  // collapse runs of whitespace outside of [] and quoted strings
  .replace(/("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|\[[^\]]*\])|(\s+)/g, (m, keep, _a, _b, ws) =>
    ws ? " " : keep
  )
  .trim();

const escapeRegexLiteral = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

////////////////////////////////////////////////////////////////////////////////
// Rule & Grammar API (authoring surface)
////////////////////////////////////////////////////////////////////////////////

class Rule {
  constructor(name, rhs, opts = {}) {
    this.name = name;       // e.g., "ISODate"
    this.src = rhs;         // raw RHS author wrote
    this.doc = opts.doc || null;
    this._expect = null;
    this._commits = [];     // e.g., ["="] for "commit after '='"
    this._maps = [];        // e.g., ["ToInt"]
    this._as = null;        // e.g., { node: "Array", fields: ... }
  }

  // Optional ergonomics (do not change matching here; just metadata)
  docstring(text) {
    this.doc = text;
    return this;
  }

  expect(text) {
    this._expect = text;
    return this;
  }

  commitAfter(tokenText) {
    this._commits.push(tokenText);
    return this;
  }

  map(named) {
    this._maps.push(named);
    return this;
  }

  as(node, fields) {
    this._as = {node, fields};
    return this;
  }

  ////////////////////////////////////////////////////////////////////////////
  // Compilation to RegExp
  //
  // For demonstration, we treat the RHS as a quasi-regex language and
  // translate it to a JS RegExp with ^(?: ... )$ anchoring by default.
  //
  // Supported in RHS:
  //   - Plain regex atoms: (), [], |, ?, +, *, {m,n}, groups
  //   - Character classes: [0-9], etc.
  //   - Literals in quotes: "foo" or 'bar' → auto-escaped
  //   - Hyphen '-' as literal when quoted, otherwise kept as-is
  //   - Whitespace between atoms is ignored unless inside [] or quotes
  //
  // Notes:
  //   - This is intentionally minimal to prove the DSL shape.
  //   - Expect/cut/AST annotations are recorded but not used by toRegExp().
  ////////////////////////////////////////////////////////////////////////////
  toRegExp(flags = "") {
    // 1) sanitize comments
    let rhs = stripComments(this.src);

    // 2) tokenize minimal forms to protect quotes/char-classes
    const parts = [];
    const rx = /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|\[[^\]]*\]|\/[^\/\\]*(?:\\.[^\/\\]*)*\/[a-z]*|[()]|\||\?|\+|\*|\{[^}]*\}|[^()\[\]{}|+*?\s]+|\s+/g;
    let m;
    while ((m = rx.exec(rhs))) parts.push(m[0]);

    // 3) transform tokens:
    //    - quoted strings -> regex escaped literals
    //    - everything else: keep as-is (operators), whitespace → remove
    const transformed = parts.map((tok) => {
      if (/^\s+$/.test(tok)) return ""; // drop whitespace between atoms
      if ((tok.startsWith('"') && tok.endsWith('"')) || (tok.startsWith("'") && tok.endsWith("'"))) {
        const inner = tok.group(1, -1);
        return escapeRegexLiteral(inner);
      }
      // Character classes or raw /.../flags (kept as-is)
      if (tok.startsWith("[") && tok.endsWith("]")) return tok;
      if (tok.startsWith("/") && /\/[a-z]*$/.test(tok)) {
        // inline raw regex literal: /.../flags → strip slashes, keep body; merge flags later
        const lastSlash = tok.lastIndexOf("/");
        const body = tok.group(1, lastSlash);
        const f = tok.group(lastSlash + 1);
        // We'll merge flags by unioning with provided flags
        // For now, embed body directly; caller can pass flags union manually if needed.
        return `(?:${body})`;
      }
      return tok; // operators, bare atoms like [0-9]{4}, etc.
    }).join("");

    // 4) anchor & compile
    return new RegExp(`^(?:${transformed})$`, flags);
  }
}

class Grammar {
  constructor() {
    this.rules = new Map();
  }

  add(rule) {
    if (this.rules.has(rule.name)) {
      throw new Error(`Rule '${rule.name}' already defined`);
    }
    this.rules.set(rule.name, rule);
    return rule;
  }

  // optional: retrieve and compile by name
  toRegExp(name, flags = "") {
    const r = this.rules.get(name);
    if (!r) throw new Error(`Unknown rule '${name}'`);
    return r.toRegExp(flags);
  }
}

////////////////////////////////////////////////////////////////////////////////
// Tagged template: rule`Name -> ...`
////////////////////////////////////////////////////////////////////////////////

const grammar = () => new Grammar();

function rule(strings, ...subs) {
  const full = strings.reduce((acc, s, i) => acc + s + (i < subs.length ? String(subs[i]) : ""), "");
  const cleaned = stripComments(full);
  const m = cleaned.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*->\s*([\s\S]+)$/);
  if (!m) throw new Error(`rule\`...\` must look like: Name -> production`);
  const [, name, rhsRaw] = m;
  // keep author whitespace for readability, but compilation will ignore outside literals/[].
  const rhs = collapseWhitespace(rhsRaw);
  return new Rule(name, rhs);
}

////////////////////////////////////////////////////////////////////////////////
// DEMONSTRATION: compile a regex and test it
////////////////////////////////////////////////////////////////////////////////

if (import.meta.url === (typeof document === "undefined" ? `file://${process.argv[1]}` : "")) {
  const g = grammar();

  // Example 1: ISO date: YYYY-MM-DD
  g.add(
    rule`ISODate -> [0-9]{4} "-" [0-9]{2} "-" [0-9]{2}`
    .expect("ISO-8601 calendar date: 2025-10-12")
  );

  const ISO = g.toRegExp("ISODate");
  console.log("ISODate regex:", ISO);

  const samples = ["2025-10-12", "1999-01-01", "2025-1-1", "2025/10/12", "abcd-10-12"];
  for (const s of samples) {
    console.log(s.padEnd(12), "=>", ISO.test(s));
  }

  // Example 2: Email-ish (very simplified, just for demo)
  g.add(
    rule`Email -> /[A-Za-z0-9._%+-]+/ "@" /[A-Za-z0-9.-]+/ "." /[A-Za-z]{2,}/`
    .expect("an email-like identifier")
  );

  const Email = g.toRegExp("Email", "i");
  console.log("\nEmail regex:", Email);
  for (const s of ["a@b.co", "first.last+tag@sub.domain.com", "no-at", "@oops.com"]) {
    console.log(s.padEnd(28), "=>", Email.test(s));
  }

  // Example 3: Freeform via quotes and classes: US phone (very loose)
  g.add(
    rule`USPhone -> "(" [0-9]{3} ")" " " [0-9]{3} "-" [0-9]{4}`
    .expect("US phone like (415) 555-1212")
  );
  const USPhone = g.toRegExp("USPhone");
  console.log("\nUSPhone regex:", USPhone);
  for (const s of ["(415) 555-1212", "(415)555-1212", "(41) 555-1212"]) {
    console.log(s.padEnd(16), "=>", USPhone.test(s));
  }
}

////////////////////////////////////////////////////////////////////////////////
// Exports
////////////////////////////////////////////////////////////////////////////////

export {grammar, rule, Rule, Grammar};
