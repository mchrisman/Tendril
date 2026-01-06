// tendril-el.js — Expression Language for guard expressions
//
// Syntax: (PATTERN where $x > 100)
//
// Operators: < > <= >= == != && || ! + - * %
// Note: Division (/) excluded due to regex ambiguity; will be revisited (td-0012).
// Functions: number($x), string($x), boolean($x), size($x)
//
// Uses SameValueZero for equality comparisons.

import { sameValueZero } from './tendril-util.js';

// ==================== Expression AST ====================

const ELit = (value) => ({type: 'ELit', value});
const EVar = (name) => ({type: 'EVar', name});
const EUnary = (op, arg) => ({type: 'EUnary', op, arg});
const EBinary = (op, left, right) => ({type: 'EBinary', op, left, right});
const ECall = (fn, args) => ({type: 'ECall', fn, args});

// ==================== Expression Parser ====================

// Built-in function names recognized in expressions
const EL_FUNCTIONS = ['number', 'string', 'boolean', 'size'];

// Operator precedence (higher = binds tighter)
const PRECEDENCE = {
  '||': 1,
  '&&': 2,
  '==': 3, '!=': 3,
  '<': 4, '>': 4, '<=': 4, '>=': 4,
  '+': 5, '-': 5,
  '*': 6, '%': 6,
};

/**
 * Parse an expression from the shared token stream.
 * @param {Parser} p - Parser instance (from microparser.js)
 * @returns {Object} Expression AST
 */
export function parseExpr(p) {
  // Primary: literals, variables, function calls, parenthesized expressions
  function parsePrimary() {
    const tok = p.peek();
    if (!tok) p.fail('unexpected end of expression');

    // Unary not
    if (tok.k === '!') {
      p.eat('!');
      return EUnary('!', parsePrimary());
    }

    // Unary minus (at start of primary, so it's unary not binary)
    if (tok.k === '-') {
      p.eat('-');
      return EUnary('-', parsePrimary());
    }

    // Parenthesized expression
    if (p.maybe('(')) {
      const expr = parseExpression(0);
      p.eat(')');
      return expr;
    }

    // Number literal
    if (p.peek('num')) {
      return ELit(p.eat('num').v);
    }

    // Boolean literal
    if (p.peek('bool')) {
      return ELit(p.eat('bool').v);
    }

    // Null literal
    if (p.peek('null')) {
      p.eat('null');
      return ELit(null);
    }

    // String literal
    if (p.peek('str')) {
      return ELit(p.eat('str').v);
    }

    // Anonymous variable _ (tokenized as 'any')
    if (p.peek('any')) {
      p.eat('any');
      return EVar('_');
    }

    // Variable reference ($name)
    if (p.maybe('$')) {
      const t = p.peek('id');
      if (!t) p.fail('expected variable name after $');
      p.eat('id');
      return EVar(t.v);
    }

    // Function call or bareword - check for identifier
    if (p.peek('id')) {
      const name = p.cur().v;

      // Check if it's a known function followed by '('
      if (EL_FUNCTIONS.includes(name)) {
        p.eat('id');
        p.eat('(');
        const args = [];
        if (!p.peek(')')) {
          args.push(parseExpression(0));
          while (p.maybe(',')) {
            args.push(parseExpression(0));
          }
        }
        p.eat(')');
        return ECall(name, args);
      }

      // Unknown identifier in expression context - error
      p.fail(`unexpected identifier '${name}' in expression (variables must be prefixed with $)`);
    }

    p.fail(`unexpected token in expression: '${tok.v || tok.k}'`);
  }

  // Pratt parser for binary operators
  function parseExpression(minPrec) {
    let left = parsePrimary();

    while (true) {
      const t = p.peek();
      if (!t) break;

      const prec = PRECEDENCE[t.k];
      if (prec === undefined || prec < minPrec) break;

      const op = p.eat().k;
      const right = parseExpression(prec + 1); // left-associative
      left = EBinary(op, left, right);
    }

    return left;
  }

  return parseExpression(0);
}

// ==================== Expression Evaluator ====================

export function evaluateExpr(ast, bindings) {
  // bindings: Map<string, value> or object with variable values

  function getVar(name) {
    if (bindings instanceof Map) {
      if (!bindings.has(name)) {
        throw new Error(`Unbound variable in guard: $${name}`);
      }
      const entry = bindings.get(name);
      return entry.kind === 'scalar' ? entry.value : entry.value;
    }
    if (!(name in bindings)) {
      throw new Error(`Unbound variable in guard: $${name}`);
    }
    return bindings[name];
  }

  function evaluate(node) {
    switch (node.type) {
      case 'ELit':
        return node.value;

      case 'EVar':
        return getVar(node.name);

      case 'EUnary':
        const arg = evaluate(node.arg);
        switch (node.op) {
          case '!': return !arg;
          case '-': return -arg;
          default: throw new Error(`Unknown unary operator: ${node.op}`);
        }

      case 'EBinary': {
        // Short-circuit evaluation for && and ||
        if (node.op === '&&') {
          const left = evaluate(node.left);
          if (!left) return false;
          return !!evaluate(node.right);
        }
        if (node.op === '||') {
          const left = evaluate(node.left);
          if (left) return true;
          return !!evaluate(node.right);
        }

        const left = evaluate(node.left);
        const right = evaluate(node.right);

        switch (node.op) {
          case '+':
            // String concatenation or numeric addition
            if (typeof left === 'string' && typeof right === 'string') {
              return left + right;
            }
            if (typeof left !== 'number' || typeof right !== 'number') {
              throw new Error(`Cannot add ${typeof left} and ${typeof right}`);
            }
            return left + right;
          case '-':
            if (typeof left !== 'number' || typeof right !== 'number') {
              throw new Error(`Cannot subtract ${typeof left} and ${typeof right}`);
            }
            return left - right;
          case '*':
            if (typeof left !== 'number' || typeof right !== 'number') {
              throw new Error(`Cannot multiply ${typeof left} and ${typeof right}`);
            }
            return left * right;
          case '%':
            if (typeof left !== 'number' || typeof right !== 'number') {
              throw new Error(`Cannot modulo ${typeof left} and ${typeof right}`);
            }
            if (right === 0) {
              throw new Error(`Modulo by zero`);
            }
            return left % right;
          case '<': return left < right;
          case '>': return left > right;
          case '<=': return left <= right;
          case '>=': return left >= right;
          case '==': return sameValueZero(left, right);
          case '!=': return !sameValueZero(left, right);
          default: throw new Error(`Unknown binary operator: ${node.op}`);
        }
      }

      case 'ECall': {
        const args = node.args.map(evaluate);
        switch (node.fn) {
          case 'number':
            if (args.length !== 1) throw new Error(`number() takes 1 argument`);
            const n = Number(args[0]);
            if (Number.isNaN(n) && typeof args[0] !== 'number') {
              throw new Error(`Cannot convert ${typeof args[0]} to number`);
            }
            return n;
          case 'string':
            if (args.length !== 1) throw new Error(`string() takes 1 argument`);
            return String(args[0]);
          case 'boolean':
            if (args.length !== 1) throw new Error(`boolean() takes 1 argument`);
            return Boolean(args[0]);
          case 'size':
            if (args.length !== 1) throw new Error(`size() takes 1 argument`);
            const val = args[0];
            if (typeof val === 'string') return val.length;
            if (Array.isArray(val)) return val.length;
            if (val && typeof val === 'object') return Object.keys(val).length;
            throw new Error(`size() requires string, array, or object`);
          default:
            throw new Error(`Unknown function: ${node.fn}`);
        }
      }

      default:
        throw new Error(`Unknown expression node type: ${node.type}`);
    }
  }

  return evaluate(ast);
}

// ==================== Guard Helpers ====================

// Extract all variable names referenced in an expression
export function getExprVariables(ast) {
  const vars = new Set();

  function walk(node) {
    switch (node.type) {
      case 'EVar':
        vars.add(node.name);
        break;
      case 'EUnary':
        walk(node.arg);
        break;
      case 'EBinary':
        walk(node.left);
        walk(node.right);
        break;
      case 'ECall':
        node.args.forEach(walk);
        break;
    }
  }

  walk(ast);
  return vars;
}

// Check if all required variables are bound
export function isGuardClosed(ast, boundVars) {
  const required = getExprVariables(ast);
  for (const v of required) {
    if (!boundVars.has(v)) return false;
  }
  return true;
}
