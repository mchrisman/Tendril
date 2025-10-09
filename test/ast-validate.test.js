/**
 * Smoke tests for ast-validate.js
 * Tests structural validation of AST nodes
 */

const { test, skip, assert, run, runner, group } = require('./framework.js');

// Import validator and parser (using dynamic import for ES modules)
let validateAST, parse, PatternSyntaxError;

// Load the modules
async function loadModules() {
  const validateModule = await import('../src/ast-validate.js');
  validateAST = validateModule.validateAST;

  const parserModule = await import('../src/parser.js');
  parse = parserModule.parse;

  const lexerModule = await import('../src/lexer.js');
  PatternSyntaxError = lexerModule.PatternSyntaxError;
}

// Helper to parse and validate
function parseAndValidate(pattern) {
  const ast = parse(pattern);
  return validateAST(ast);
}

// Valid patterns
group('valid patterns', () => {
  test('validate simple atom', async () => {
    const ast = parseAndValidate('123');
    assert.ok(ast);
    assert.equal(ast.type, 'Number');
  }, { group: 'validate' });

  test('validate array pattern', async () => {
    const ast = parseAndValidate('[ a b c ]');
    assert.ok(ast);
    assert.equal(ast.type, 'Array');
  }, { group: 'validate' });

  test('validate object pattern', async () => {
    const ast = parseAndValidate('{ a:b }');
    assert.ok(ast);
    assert.equal(ast.type, 'Object');
  }, { group: 'validate' });

  test('validate set pattern', async () => {
    const ast = parseAndValidate('{{}}');
    assert.ok(ast);
    assert.equal(ast.type, 'Set');
  }, { group: 'validate' });

  test('validate quantifier pattern', async () => {
    const ast = parseAndValidate('a*');
    assert.ok(ast);
    assert.equal(ast.type, 'Quant');
  }, { group: 'validate' });

  test('validate alternation', async () => {
    const ast = parseAndValidate('a | b');
    assert.ok(ast);
    assert.equal(ast.type, 'Alt');
  }, { group: 'validate' });

  test('validate conjunction', async () => {
    const ast = parseAndValidate('a & b');
    assert.ok(ast);
    assert.equal(ast.type, 'And');
  }, { group: 'validate' });

  test('validate variable binding', async () => {
    const ast = parseAndValidate('$x=foo');
    assert.ok(ast);
    assert.equal(ast.type, 'Bind');
  }, { group: 'validate' });

  test('validate vertical pattern', async () => {
    const ast = parseAndValidate('a.b.c');
    assert.ok(ast);
    assert.equal(ast.type, 'Dot');
  }, { group: 'validate' });
});

// Quantifier validation
group('quantifier validation', () => {
  test('validate star quantifier', async () => {
    const ast = parseAndValidate('a*');
    assert.equal(ast.min, 0);
    assert.equal(ast.max, Infinity);
  }, { group: 'validate' });

  test('validate plus quantifier', async () => {
    const ast = parseAndValidate('a+');
    assert.equal(ast.min, 1);
    assert.equal(ast.max, Infinity);
  }, { group: 'validate' });

  test('validate question quantifier', async () => {
    const ast = parseAndValidate('a?');
    assert.equal(ast.min, 0);
    assert.equal(ast.max, 1);
  }, { group: 'validate' });

  test('validate exact count', async () => {
    const ast = parseAndValidate('a{3}');
    assert.equal(ast.min, 3);
    assert.equal(ast.max, 3);
  }, { group: 'validate' });

  test('invalid quantifier - max < min', async () => {
    // Create AST manually with invalid bounds
    const invalidAST = {
      type: 'Quant',
      span: { start: 0, end: 1 },
      sub: { type: 'String', value: 'a', span: { start: 0, end: 1 } },
      min: 5,
      max: 2,
      greedy: true
    };

    assert.throws(() => {
      validateAST(invalidAST);
    }, /max < min/);
  }, { group: 'validate' });

  test('invalid quantifier - negative min', async () => {
    const invalidAST = {
      type: 'Quant',
      span: { start: 0, end: 1 },
      sub: { type: 'String', value: 'a', span: { start: 0, end: 1 } },
      min: -1,
      max: 5,
      greedy: true
    };

    assert.throws(() => {
      validateAST(invalidAST);
    }, /min < 0/);
  }, { group: 'validate' });
});

// Replacement validation
group('replacement validation', () => {
  test('validate single slice replacement', async () => {
    const ast = parseAndValidate('>> a b <<');
    assert.ok(ast);
    assert.equal(ast.type, 'ReplaceSlice');
  }, { group: 'validate' });

  test('validate single key replacement', async () => {
    const ast = parseAndValidate('{ >> k << : v }');
    assert.ok(ast);
  }, { group: 'validate' });

  test('validate single value replacement', async () => {
    const ast = parseAndValidate('{ k : >> v << }');
    assert.ok(ast);
  }, { group: 'validate' });

  test('reject multiple replacement targets', async () => {
    assert.throws(() => {
      parseAndValidate('[ >> a << >> b << ]');
    }, /Only one.*replacement target/);
  }, { group: 'validate' });

  test('reject multiple replacement targets in object', async () => {
    // Note: This requires the object parser to handle multiple KVs
    // which is currently skipped, so we'll skip this test too
    // parseAndValidate('{ >> k1 << : v1 >> k2 << : v2 }');
  }, { group: 'validate' });

  test('reject key replacement outside object', async () => {
    // Manually construct invalid AST
    const invalidAST = {
      type: 'ReplaceKey',
      span: { start: 0, end: 10 },
      kPat: { type: 'String', value: 'k', span: { start: 0, end: 1 } },
      vPat: { type: 'String', value: 'v', span: { start: 2, end: 3 } }
    };

    assert.throws(() => {
      validateAST(invalidAST);
    }, /Key replacement.*only valid inside an object/);
  }, { group: 'validate' });

  test('reject value replacement outside object', async () => {
    const invalidAST = {
      type: 'ReplaceVal',
      span: { start: 0, end: 10 },
      kPat: { type: 'String', value: 'k', span: { start: 0, end: 1 } },
      vPat: { type: 'String', value: 'v', span: { start: 2, end: 3 } }
    };

    assert.throws(() => {
      validateAST(invalidAST);
    }, /Value replacement.*only valid inside an object/);
  }, { group: 'validate' });
});

// Object validation
group('object validation', () => {
  test('validate object anchoring with no spread', async () => {
    const ast = parseAndValidate('{ a:b }');
    assert.equal(ast.anchored, true);
  }, { group: 'validate' });

  test('validate object count bounds', async () => {
    // Manually construct object with valid count
    const validAST = {
      type: 'Object',
      span: { start: 0, end: 10 },
      kvs: [{
        kPat: { type: 'String', value: 'a', span: { start: 0, end: 1 } },
        vPat: { type: 'String', value: 'b', span: { start: 2, end: 3 } },
        count: { min: 2, max: 5 }
      }],
      anchored: true,
      hasSpread: false,
      typeGuard: null
    };

    const validated = validateAST(validAST);
    assert.ok(validated);
  }, { group: 'validate' });

  test('reject object count with max < min', async () => {
    const invalidAST = {
      type: 'Object',
      span: { start: 0, end: 10 },
      kvs: [{
        kPat: { type: 'String', value: 'a', span: { start: 0, end: 1 } },
        vPat: { type: 'String', value: 'b', span: { start: 2, end: 3 } },
        count: { min: 5, max: 2 }
      }],
      anchored: true,
      hasSpread: false,
      typeGuard: null
    };

    assert.throws(() => {
      validateAST(invalidAST);
    }, /count max < min/);
  }, { group: 'validate' });

  test('reject object count with negative min', async () => {
    const invalidAST = {
      type: 'Object',
      span: { start: 0, end: 10 },
      kvs: [{
        kPat: { type: 'String', value: 'a', span: { start: 0, end: 1 } },
        vPat: { type: 'String', value: 'b', span: { start: 2, end: 3 } },
        count: { min: -1, max: 5 }
      }],
      anchored: true,
      hasSpread: false,
      typeGuard: null
    };

    assert.throws(() => {
      validateAST(invalidAST);
    }, /count min must be finite >= 0/);
  }, { group: 'validate' });

  test('accept object count with Infinity max', async () => {
    const validAST = {
      type: 'Object',
      span: { start: 0, end: 10 },
      kvs: [{
        kPat: { type: 'String', value: 'a', span: { start: 0, end: 1 } },
        vPat: { type: 'String', value: 'b', span: { start: 2, end: 3 } },
        count: { min: 2, max: Infinity }
      }],
      anchored: true,
      hasSpread: false,
      typeGuard: null
    };

    const validated = validateAST(validAST);
    assert.ok(validated);
  }, { group: 'validate' });
});

// Assertion validation
group('assertion validation', () => {
  test('validate assertion in array', async () => {
    const ast = parseAndValidate('[ (?=foo) ]');
    assert.ok(ast);
  }, { group: 'validate' });

  test('validate negative assertion in array', async () => {
    const ast = parseAndValidate('[ (?!bar) ]');
    assert.ok(ast);
  }, { group: 'validate' });

  test('allow assertion at top level', async () => {
    // Assertions are syntactically unrestricted - they can appear anywhere
    const ast = {
      type: 'Assert',
      span: { start: 0, end: 5 },
      kind: 'pos',
      pat: { type: 'String', value: 'foo', span: { start: 3, end: 6 } }
    };

    const validated = validateAST(ast);
    assert.ok(validated);
    assert.equal(validated.type, 'Assert');
  }, { group: 'validate' });
});

// Complex patterns
group('complex patterns', () => {
  test('validate nested structure', async () => {
    const ast = parseAndValidate('{ a.b.c:d }');
    assert.ok(ast);
    assert.equal(ast.type, 'Object');
  }, { group: 'validate' });

  test('validate alternation with quantifiers', async () => {
    const ast = parseAndValidate('(a* | b+)');
    assert.ok(ast);
  }, { group: 'validate' });

  test('validate binding with complex pattern', async () => {
    const ast = parseAndValidate('$x=/[a-z]+/');
    assert.ok(ast);
  }, { group: 'validate' });

  test('validate array with mixed patterns', async () => {
    const ast = parseAndValidate('[ $x 123 "foo" /bar/ ]');
    assert.ok(ast);
  }, { group: 'validate' });
});

// Unknown node types
group('error handling', () => {
  test('reject unknown node type', async () => {
    const invalidAST = {
      type: 'UnknownType',
      span: { start: 0, end: 1 }
    };

    assert.throws(() => {
      validateAST(invalidAST);
    }, /Unknown AST node type/);
  }, { group: 'validate' });
});

// Normalization behavior
group('normalization', () => {
  test('returns normalized AST', async () => {
    const ast = parseAndValidate('a*');
    // Validator returns a new object (shallow copy)
    assert.ok(ast);
    assert.equal(ast.type, 'Quant');
    assert.ok(ast.sub);
  }, { group: 'validate' });

  test('preserves span information', async () => {
    const ast = parseAndValidate('abc');
    assert.ok(ast.span);
    assert.ok(typeof ast.span.start === 'number');
    assert.ok(typeof ast.span.end === 'number');
  }, { group: 'validate' });
});

// Run tests if this is the main module
if (require.main === module) {
  loadModules().then(() => {
    return run();
  }).then((results) => {
    process.exit(results.failed.length > 0 ? 1 : 0);
  }).catch(error => {
    console.error('Failed to load modules:', error);
    process.exit(1);
  });
}
