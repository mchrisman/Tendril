// syntax.js
// Facade for the syntax layer: lexer → parser → validator.
//
// Re-exports:
//   - PatternSyntaxError: consumer-visible syntax error type
//   - T: token kinds enum (handy for lexer unit tests)
//   - lex(source): tokenizes with spans and ws flags
//   - parse(source): builds AST (no semantic checks)
//   - validateAST(ast): structural validation / normalization
//   - parseAndValidate(source): convenience entrypoint (AST ready for compiler)
//
// This file intentionally contains no semantics, VM, or compiler logic.

import { lex, T, PatternSyntaxError } from "./lexer.js";
import { parse } from "./parser.js";
import { validateAST } from "./ast-validate.js";

/**
 * Convenience: lex → parse → validate.
 * @param {string} source pattern text
 * @returns {object} validated AST
 * @throws {PatternSyntaxError}
 */
export function parseAndValidate(source) {
  // parse() already calls lex() internally; we expose lex() separately
  // for tests, but keep the main pipeline minimal here.
  const ast = parse(source);
  return validateAST(ast);
}

// Named exports (keep surface small and explicit)
export { PatternSyntaxError, T, lex, parse, validateAST };

// No default export on purpose to avoid accidental wildcard imports.
// Downstream layers should import only what they need, e.g.:
//   import { parseAndValidate } from "./syntax.js";
