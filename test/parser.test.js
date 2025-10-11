/**
 * Smoke tests for parser.js
 * Tests AST generation from pattern strings
 */

const { test, skip, assert, run, runner, group, setSourceFile } = require('./framework.js');

setSourceFile('parser.test.js');

// Import parser (using dynamic import for ES modules)
let parse, PatternSyntaxError;

// Load the parser module
async function loadParser() {
  const parserModule = await import('../src/parser.js');
  parse = parserModule.parse;
  const lexerModule = await import('../src/lexer.js');
  PatternSyntaxError = lexerModule.PatternSyntaxError;
}

// Helper to check AST node type
function isNode(ast, type) {
  return ast && ast.type === type;
}

// Atoms
group('atoms', () => {
  test('parse number', async () => {
    const ast = parse('123');
    assert.equal(ast.type, 'Number');
    assert.equal(ast.value, 123);
  }, { group: 'parser' });

  test('parse boolean true', async () => {
    const ast = parse('true');
    assert.equal(ast.type, 'Bool');
    assert.equal(ast.value, true);
  }, { group: 'parser' });

  test('parse boolean false', async () => {
    const ast = parse('false');
    assert.equal(ast.type, 'Bool');
    assert.equal(ast.value, false);
  }, { group: 'parser' });

  test('parse string literal', async () => {
    const ast = parse('"hello"');
    assert.equal(ast.type, 'String');
    assert.equal(ast.value, 'hello');
  }, { group: 'parser' });

  test('parse bareword as string', async () => {
    const ast = parse('foo');
    assert.equal(ast.type, 'String');
    assert.equal(ast.value, 'foo');
  }, { group: 'parser' });

  test('parse regex', async () => {
    const ast = parse('/abc/i');
    assert.equal(ast.type, 'Regex');
    assert.equal(ast.body, 'abc');
    assert.equal(ast.flags, 'i');
  }, { group: 'parser' });

  test('parse any (_)', async () => {
    const ast = parse('_');
    assert.equal(ast.type, 'Any');
  }, { group: 'parser' });
});

// Arrays
group('arrays', () => {
  test('parse empty array', async () => {
    const ast = parse('[]');
    assert.equal(ast.type, 'Array');
    assert.equal(ast.elems.length, 0);
    assert.equal(ast.anchored, true);
  }, { group: 'parser' });

  test('parse array with single element', async () => {
    const ast = parse('[a]');
    assert.equal(ast.type, 'Array');
    assert.equal(ast.elems.length, 1);
    assert.ok(isNode(ast.elems[0], 'String'));
  }, { group: 'parser' });

  test('parse array with multiple elements', async () => {
    const ast = parse('[a b c]');
    assert.equal(ast.type, 'Array');
    // Inside arrays, whitespace is a separator, not adjacency
    assert.equal(ast.elems.length, 3);
    assert.ok(isNode(ast.elems[0], 'String'));
    assert.ok(isNode(ast.elems[1], 'String'));
    assert.ok(isNode(ast.elems[2], 'String'));
  }, { group: 'parser' });

  test('parse array with spread', async () => {
    const ast = parse('[a ..]');
    assert.equal(ast.type, 'Array');
    assert.equal(ast.elems.length, 2);
    assert.ok(isNode(ast.elems[0], 'String'));
    assert.ok(isNode(ast.elems[1], 'Spread'));
  }, { group: 'parser' });

  test('parse nested arrays', async () => {
    const ast = parse('[ [a] [b] ]');
    assert.equal(ast.type, 'Array');
    assert.equal(ast.elems.length, 2);
    assert.ok(isNode(ast.elems[0], 'Array'));
    assert.ok(isNode(ast.elems[1], 'Array'));
  }, { group: 'parser' });
});

// Objects
group('objects', () => {
  test('parse empty object', async () => {
    const ast = parse('{}');
    assert.equal(ast.type, 'Object');
    assert.equal(ast.kvs.length, 0);
    assert.equal(ast.anchored, true);
  }, { group: 'parser' });

  test('parse object with single key-value', async () => {
    const ast = parse('{a=b}');
    assert.equal(ast.type, 'Object');
    assert.equal(ast.kvs.length, 1);
    assert.ok(isNode(ast.kvs[0].kPat, 'String'));
    assert.ok(isNode(ast.kvs[0].vPat, 'String'));
  }, { group: 'parser' });

  test('parse object with multiple key-values', async () => {
    const ast = parse('{ a=1 b=2 }');
    assert.equal(ast.type, 'Object');
    assert.equal(ast.kvs.length, 2);
  }, { group: 'parser' });

  test('parse object with spread', async () => {
    const ast = parse('{ a=b .. }');
    assert.equal(ast.type, 'Object');
    assert.equal(ast.anchored, false);
    assert.equal(ast.hasSpread, true);
  }, { group: 'parser' });

  test('parse Map (as Map creates Map node)', async () => {
    const ast = parse('{a=b} as Map');
    assert.equal(ast.type, 'Map');
    assert.equal(ast.kvs.length, 1);
    assert.ok(isNode(ast.kvs[0].kPat, 'String'));
    assert.ok(isNode(ast.kvs[0].vPat, 'String'));
  }, { group: 'parser' });

  test('parse object with count quantifier', async () => {
    const ast = parse('{a=b #{2,3}}');
    assert.equal(ast.type, 'Object');
    assert.ok(ast.kvs[0].count);
    assert.equal(ast.kvs[0].count.min, 2);
    assert.equal(ast.kvs[0].count.max, 3);
  }, { group: 'parser' });

  test('parse object with regex key', async () => {
    const ast = parse('{/[ab]/=_}');
    assert.equal(ast.type, 'Object');
    assert.ok(isNode(ast.kvs[0].kPat, 'Regex'));
  }, { group: 'parser' });
});

// Sets
group('sets', () => {
  test('parse empty set', async () => {
    const ast = parse('{{}}');
    assert.equal(ast.type, 'Set');
    assert.equal(ast.members.length, 0);
  }, { group: 'parser' });

  test('parse set with elements', async () => {
    const ast = parse('{{ a b c }}');
    assert.equal(ast.type, 'Set');
    assert.equal(ast.members.length, 3);
  }, { group: 'parser' });

  test('parse set with spread', async () => {
    const ast = parse('{{ a .. }}');
    assert.equal(ast.type, 'Set');
    assert.equal(ast.members.length, 2);
    assert.ok(isNode(ast.members[1], 'Spread'));
  }, { group: 'parser' });
});

// Quantifiers
group('quantifiers', () => {
  test('parse star quantifier', async () => {
    const ast = parse('a*');
    assert.equal(ast.type, 'Quant');
    assert.equal(ast.min, 0);
    assert.equal(ast.max, Infinity);
    assert.equal(ast.greedy, true);
    assert.ok(isNode(ast.sub, 'String'));
  }, { group: 'parser' });

  test('parse plus quantifier', async () => {
    const ast = parse('a+');
    assert.equal(ast.type, 'Quant');
    assert.equal(ast.min, 1);
    assert.equal(ast.max, Infinity);
  }, { group: 'parser' });

  test('parse question quantifier', async () => {
    const ast = parse('a?');
    assert.equal(ast.type, 'Quant');
    assert.equal(ast.min, 0);
    assert.equal(ast.max, 1);
  }, { group: 'parser' });

  test('parse lazy star', async () => {
    const ast = parse('a*?');
    assert.equal(ast.type, 'Quant');
    assert.equal(ast.greedy, false);
  }, { group: 'parser' });

  test('parse explicit range {m,n}', async () => {
    const ast = parse('a{2,5}');
    assert.equal(ast.type, 'Quant');
    assert.equal(ast.min, 2);
    assert.equal(ast.max, 5);
  }, { group: 'parser' });

  test('parse exact count {n}', async () => {
    const ast = parse('a{3}');
    assert.equal(ast.type, 'Quant');
    assert.equal(ast.min, 3);
    assert.equal(ast.max, 3);
  }, { group: 'parser' });

  test('parse open-ended {m,}', async () => {
    const ast = parse('a{2,}');
    assert.equal(ast.type, 'Quant');
    assert.equal(ast.min, 2);
    assert.equal(ast.max, Infinity);
  }, { group: 'parser' });

  test('parse lazy explicit range', async () => {
    const ast = parse('a{2,5}?');
    assert.equal(ast.type, 'Quant');
    assert.equal(ast.greedy, false);
  }, { group: 'parser' });
});

// Groups
group('groups', () => {
  test('parse simple group', async () => {
    const ast = parse('(a)');
    assert.equal(ast.type, 'Group');
    assert.ok(isNode(ast.sub, 'String'));
  }, { group: 'parser' });

  test('parse group with alternation', async () => {
    const ast = parse('(a|b)');
    assert.equal(ast.type, 'Group');
    assert.ok(isNode(ast.sub, 'Alt'));
  }, { group: 'parser' });

  test('parse nested groups', async () => {
    const ast = parse('((a))');
    assert.equal(ast.type, 'Group');
    assert.ok(isNode(ast.sub, 'Group'));
  }, { group: 'parser' });

  test('parse quantified group', async () => {
    const ast = parse('(a b)*');
    assert.equal(ast.type, 'Quant');
    assert.ok(isNode(ast.sub, 'Group'));
  }, { group: 'parser' });
});

// Operators
group('operators', () => {
  test('parse alternation', async () => {
    const ast = parse('a | b');
    assert.equal(ast.type, 'Alt');
    assert.equal(ast.options.length, 2);
    assert.ok(isNode(ast.options[0], 'String'));
    assert.ok(isNode(ast.options[1], 'String'));
  }, { group: 'parser' });

  test('parse multiple alternations', async () => {
    const ast = parse('a | b | c');
    assert.equal(ast.type, 'Alt');
    // Should be left-associative: (a | b) | c
    assert.ok(isNode(ast.options[0], 'Alt'));
  }, { group: 'parser' });

  test('parse conjunction', async () => {
    const ast = parse('a & b');
    assert.equal(ast.type, 'And');
    assert.equal(ast.parts.length, 2);
  }, { group: 'parser' });

  test('parse adjacency', async () => {
    const ast = parse('a b c');
    assert.equal(ast.type, 'Adj');
    assert.equal(ast.elems.length, 3);
  }, { group: 'parser' });
});

// Precedence
group('precedence', () => {
  test('quantifiers bind tighter than adjacency', async () => {
    const ast = parse('a* b');
    assert.equal(ast.type, 'Adj');
    assert.ok(isNode(ast.elems[0], 'Quant'));
    assert.ok(isNode(ast.elems[1], 'String'));
  }, { group: 'parser' });

  test('adjacency binds tighter than alternation', async () => {
    const ast = parse('a b | c');
    assert.equal(ast.type, 'Alt');
    assert.ok(isNode(ast.options[0], 'Adj'));
  }, { group: 'parser' });

  test('and binds tighter than or', async () => {
    const ast = parse('a & b | c');
    assert.equal(ast.type, 'Alt');
    assert.ok(isNode(ast.options[0], 'And'));
  }, { group: 'parser' });

  test('parentheses override precedence', async () => {
    const ast = parse('(a | b) c');
    assert.equal(ast.type, 'Adj');
    assert.ok(isNode(ast.elems[0], 'Group'));
    assert.ok(isNode(ast.elems[0].sub, 'Alt'));
  }, { group: 'parser' });

});

// Vertical patterns (only valid in object keys)
group('vertical patterns', () => {
  test('parse vertical in object', async () => {
    const ast = parse('{a.b.c=d}');
    assert.equal(ast.type, 'Object');
    assert.ok(isNode(ast.kvs[0].kPat, 'Dot'));
  }, { group: 'parser' });
});

// Variables and binding
group('variables and binding', () => {
  test('parse variable reference', async () => {
    const ast = parse('$x');
    assert.equal(ast.type, 'Var');
    assert.equal(ast.name, 'x');
  }, { group: 'parser' });

  test('parse binding', async () => {
    const ast = parse('$x:foo');
    assert.equal(ast.type, 'Bind');
    assert.equal(ast.name, 'x');
    assert.ok(isNode(ast.pat, 'String'));
  }, { group: 'parser' });

  test('parse binding with pattern', async () => {
    const ast = parse('$x:/[ab]/');
    assert.equal(ast.type, 'Bind');
    assert.ok(isNode(ast.pat, 'Regex'));
  }, { group: 'parser' });

  test('parse binding equality', async () => {
    const ast = parse('$x:$y');
    assert.equal(ast.type, 'BindEq');
    assert.ok(isNode(ast.left, 'Var'));
    assert.ok(isNode(ast.right, 'Var'));
  }, { group: 'parser' });

  test('parse binding in array', async () => {
    const ast = parse('[ $x $x ]');
    assert.equal(ast.type, 'Array');
    assert.ok(isNode(ast.elems[0], 'Var'));
    assert.ok(isNode(ast.elems[1], 'Var'));
  }, { group: 'parser' });
});

// Assertions
group('assertions', () => {
  test('parse positive lookahead', async () => {
    const ast = parse('(?=foo)');
    assert.equal(ast.type, 'Assert');
    assert.equal(ast.kind, 'pos');
    assert.ok(isNode(ast.pat, 'String'));
  }, { group: 'parser' });

  test('parse negative lookahead', async () => {
    const ast = parse('(?!bar)');
    assert.equal(ast.type, 'Assert');
    assert.equal(ast.kind, 'neg');
    assert.ok(isNode(ast.pat, 'String'));
  }, { group: 'parser' });

  test('parse lookahead with complex pattern', async () => {
    const ast = parse('(?=a|b)');
    assert.equal(ast.type, 'Assert');
    assert.ok(isNode(ast.pat, 'Alt'));
  }, { group: 'parser' });
});

// Replacement
group('replacement', () => {
  test('parse slice replacement', async () => {
    const ast = parse('>> a b <<');
    assert.equal(ast.type, 'ReplaceSlice');
    assert.ok(isNode(ast.target, 'Adj'));
  }, { group: 'parser' });

  test('parse key replacement in object', async () => {
    const ast = parse('{>>k<< = v}');
    assert.equal(ast.type, 'Object');
    assert.equal(ast.kvs[0].type, 'ReplaceKey');
    assert.ok(ast.kvs[0].kPat);
    assert.ok(ast.kvs[0].vPat);
  }, { group: 'parser' });

  test('parse value replacement in object', async () => {
    const ast = parse('{k = >>v<<}');
    assert.equal(ast.type, 'Object');
    assert.equal(ast.kvs[0].type, 'ReplaceVal');
    assert.ok(ast.kvs[0].kPat);
    assert.ok(ast.kvs[0].vPat);
  }, { group: 'parser' });

  test('parse replacement in array', async () => {
    const ast = parse('[ a >> b << c ]');
    assert.equal(ast.type, 'Array');
    assert.ok(isNode(ast.elems[1], 'ReplaceSlice'));
  }, { group: 'parser' });
});

// Spread (ellipsis)
group('spread', () => {
  test('parse spread in array', async () => {
    const ast = parse('[ a b .. ]');
    assert.equal(ast.type, 'Array');
    assert.ok(isNode(ast.elems[2], 'Spread'));
  }, { group: 'parser' });

  test('parse spread in object', async () => {
    const ast = parse('{ a=b .. }');
    assert.equal(ast.type, 'Object');
    assert.equal(ast.hasSpread, true);
  }, { group: 'parser' });

  test('parse spread in set', async () => {
    const ast = parse('{{ a .. }}');
    assert.equal(ast.type, 'Set');
    assert.ok(isNode(ast.members[1], 'Spread'));
  }, { group: 'parser' });
});

// Complex patterns from spec
group('complex patterns from spec', () => {
  test('parse example from spec - user data', async () => {
    const ast = parse('{ users.$userId.contact = [$userName _ _ $userPhone] }');
    assert.equal(ast.type, 'Object');
    assert.ok(isNode(ast.kvs[0].kPat, 'Dot'));
    assert.ok(isNode(ast.kvs[0].vPat, 'Array'));
  }, { group: 'parser' });

  test('parse quantified group', async () => {
    const ast = parse('a (b c)*2');
    assert.equal(ast.type, 'Adj');
    assert.ok(isNode(ast.elems[1], 'Quant'));
  }, { group: 'parser' });

  test('parse password redaction pattern', async () => {
    const ast = parse('{ (_.)*password = >>value<< }');
    assert.equal(ast.type, 'Object');
  }, { group: 'parser' });

  test('parse nested vertical', async () => {
    const ast = parse('{ a.b.c=d }');
    assert.equal(ast.type, 'Object');
    const kPat = ast.kvs[0].kPat;
    assert.equal(kPat.type, 'Dot');
    assert.equal(kPat.left.type, 'Dot');
  }, { group: 'parser' });
});

// Span information
group('span tracking', () => {
  test('spans are present on nodes', async () => {
    const ast = parse('abc');
    assert.ok(ast.span);
    assert.ok(typeof ast.span.start === 'number');
    assert.ok(typeof ast.span.end === 'number');
  }, { group: 'parser' });

  test('spans cover correct range', async () => {
    const ast = parse('  abc  ');
    assert.equal(ast.span.start, 2);
    assert.equal(ast.span.end, 5);
  }, { group: 'parser' });

  test('spans track complex expressions', async () => {
    const ast = parse('[a b]');
    assert.equal(ast.span.start, 0);
    assert.equal(ast.span.end, 5);
  }, { group: 'parser' });
});

// Error cases
group('error cases', () => {
  test('unterminated array throws', async () => {
    assert.throws(() => {
      parse('[a b');
    }, PatternSyntaxError);
  }, { group: 'parser' });

  test('unterminated object throws', async () => {
    assert.throws(() => {
      parse('{a=b');
    }, PatternSyntaxError);
  }, { group: 'parser' });

  test('unterminated set throws', async () => {
    assert.throws(() => {
      parse('{{a b');
    }, PatternSyntaxError);
  }, { group: 'parser' });

  test('unterminated group throws', async () => {
    assert.throws(() => {
      parse('(a b');
    }, PatternSyntaxError);
  }, { group: 'parser' });

  test('missing closing paren in assertion', async () => {
    assert.throws(() => {
      parse('(?=foo');
    }, PatternSyntaxError);
  }, { group: 'parser' });

  test('unexpected token throws', async () => {
    assert.throws(() => {
      parse(']');
    }, PatternSyntaxError);
  }, { group: 'parser' });

  test('missing variable name after $', async () => {
    assert.throws(() => {
      parse('$');
    }, PatternSyntaxError);
  }, { group: 'parser' });
});

// Run tests if this is the main module
if (require.main === module) {
  loadParser().then(() => {
    return run();
  }).then((results) => {
    process.exit(results.failed.length > 0 ? 1 : 0);
  }).catch(error => {
    console.error('Failed to load parser:', error);
    process.exit(1);
  });
}
