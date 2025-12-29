// tendril-el.js — Expression Language for guard expressions
//
// Syntax: $x=(_number; $x > 100)
//
// Operators: < > <= >= == != && || ! + - * / %
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

// ==================== Expression Tokenizer ====================

const EL_OPERATORS = ['<=', '>=', '==', '!=', '&&', '||', '<', '>', '+', '-', '*', '/', '%', '!'];
const EL_KEYWORDS = ['true', 'false', 'null'];
const EL_FUNCTIONS = ['number', 'string', 'boolean', 'size'];

export function tokenizeExpr(src) {
  const toks = [];
  let i = 0;

  const push = (k, v, len) => { toks.push({k, v, pos: i}); i += len; };
  const reWS = /\s+/y;
  const reNum = /-?\d+(\.\d+)?/y;
  const reId = /[A-Za-z_][A-Za-z0-9_]*/y;

  while (i < src.length) {
    // Whitespace
    reWS.lastIndex = i;
    if (reWS.test(src)) { i = reWS.lastIndex; continue; }

    const c = src[i], c2 = src.slice(i, i + 2);

    // String literals: "..." or '...'
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1, out = '';
      while (j < src.length && src[j] !== q) {
        if (src[j] === '\\' && j + 1 < src.length) {
          const next = src[j + 1];
          if (next === 'n') { out += '\n'; j += 2; }
          else if (next === 't') { out += '\t'; j += 2; }
          else if (next === 'r') { out += '\r'; j += 2; }
          else { out += next; j += 2; }
        } else {
          out += src[j++];
        }
      }
      if (src[j] !== q) throw new Error(`Unterminated string at position ${i}`);
      push('str', out, (j + 1) - i);
      continue;
    }

    // Two-character operators
    if (['<=', '>=', '==', '!=', '&&', '||'].includes(c2)) {
      push(c2, c2, 2);
      continue;
    }

    // Single-character operators and punctuation
    if ('<>+-*/%!(),$'.includes(c)) {
      push(c, c, 1);
      continue;
    }

    // Numbers
    reNum.lastIndex = i;
    if (reNum.test(src)) {
      const j = reNum.lastIndex;
      push('num', Number(src.slice(i, j)), j - i);
      continue;
    }

    // Identifiers, keywords, functions
    reId.lastIndex = i;
    if (reId.test(src)) {
      const j = reId.lastIndex;
      const w = src.slice(i, j);
      if (w === 'true') { push('bool', true, j - i); continue; }
      if (w === 'false') { push('bool', false, j - i); continue; }
      if (w === 'null') { push('null', null, j - i); continue; }
      if (EL_FUNCTIONS.includes(w)) { push('fn', w, j - i); continue; }
      push('id', w, j - i);
      continue;
    }

    throw new Error(`Unexpected character in expression: '${c}' at position ${i}`);
  }

  return toks;
}

// ==================== Expression Parser ====================

// Operator precedence (higher = binds tighter)
const PRECEDENCE = {
  '||': 1,
  '&&': 2,
  '==': 3, '!=': 3,
  '<': 4, '>': 4, '<=': 4, '>=': 4,
  '+': 5, '-': 5,
  '*': 6, '/': 6, '%': 6,
};

export function parseExpr(src) {
  const toks = typeof src === 'string' ? tokenizeExpr(src) : src;
  let i = 0;

  function peek(k) {
    const t = toks[i];
    if (!t) return null;
    if (!k) return t;
    return (t.k === k || t.v === k) ? t : null;
  }

  function eat(k) {
    const t = toks[i];
    if (!t) throw new Error(`Unexpected end of expression`);
    if (k && t.k !== k && t.v !== k) {
      throw new Error(`Expected '${k}' but got '${t.v}' at position ${t.pos}`);
    }
    i++;
    return t;
  }

  function maybe(k) {
    if (peek(k)) { i++; return true; }
    return false;
  }

  // Primary: literals, variables, function calls, parenthesized expressions
  function parsePrimary() {
    // Unary operators - check token kind explicitly to avoid matching string values
    const tok = peek();
    if (tok && tok.k === '!') {
      eat('!');
      return EUnary('!', parsePrimary());
    }
    if (tok && tok.k === '-' && (!toks[i-1] || ['(', ',', '||', '&&', '==', '!=', '<', '>', '<=', '>=', '+', '-', '*', '/', '%', '!'].includes(toks[i-1].k))) {
      eat('-');
      return EUnary('-', parsePrimary());
    }

    // Parenthesized expression
    if (maybe('(')) {
      const expr = parseExpression(0);
      eat(')');
      return expr;
    }

    // Number literal
    if (peek('num')) {
      return ELit(eat('num').v);
    }

    // Boolean literal
    if (peek('bool')) {
      return ELit(eat('bool').v);
    }

    // Null literal
    if (peek('null')) {
      eat('null');
      return ELit(null);
    }

    // Function call
    if (peek('fn')) {
      const fn = eat('fn').v;
      eat('(');
      const args = [];
      if (!peek(')')) {
        args.push(parseExpression(0));
        while (maybe(',')) {
          args.push(parseExpression(0));
        }
      }
      eat(')');
      return ECall(fn, args);
    }

    // Variable reference ($x)
    if (maybe('$')) {
      const t = peek('id');
      if (!t) throw new Error(`Expected variable name after $`);
      eat('id');
      return EVar(t.v);
    }

    // String literal (for future extension)
    if (peek('str')) {
      return ELit(eat('str').v);
    }

    throw new Error(`Unexpected token in expression: '${peek()?.v || 'EOF'}'`);
  }

  // Pratt parser for binary operators
  function parseExpression(minPrec) {
    let left = parsePrimary();

    while (true) {
      const t = peek();
      if (!t) break;

      const prec = PRECEDENCE[t.v];
      if (prec === undefined || prec < minPrec) break;

      const op = eat().v;
      const right = parseExpression(prec + 1); // left-associative
      left = EBinary(op, left, right);
    }

    return left;
  }

  const ast = parseExpression(0);
  if (i < toks.length) {
    throw new Error(`Unexpected token after expression: '${toks[i].v}'`);
  }
  return ast;
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
          case '/':
            if (typeof left !== 'number' || typeof right !== 'number') {
              throw new Error(`Cannot divide ${typeof left} and ${typeof right}`);
            }
            if (right === 0) {
              throw new Error(`Division by zero`);
            }
            return left / right;
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
