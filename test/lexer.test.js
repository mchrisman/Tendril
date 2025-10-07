/**
 * Smoke tests for lexer.js
 * Tests basic tokenization functionality
 */

const { test, assert, run, runner, group } = require('./framework.js');

// Import lexer (using dynamic import for ES modules)
let lex, T, PatternSyntaxError;

// Load the lexer module
async function loadLexer() {
  const lexerModule = await import('../src/lexer.js');
  lex = lexerModule.lex;
  T = lexerModule.T;
  PatternSyntaxError = lexerModule.PatternSyntaxError;
}

// Helper to get token kinds only (for simpler assertions)
function kinds(tokens) {
  return tokens.filter(t => t.kind !== T.EOF).map(t => t.kind);
}

// Helper to get token values
function values(tokens) {
  return tokens.filter(t => t.kind !== T.EOF).map(t => t.value);
}

// Basic literals
group('literals', () => {
  test('lex number - integer', async () => {
    const tokens = lex('123');
    assert.equal(kinds(tokens)[0], T.NUMBER);
    assert.equal(values(tokens)[0], 123);
  }, { group: 'lexer' });

  test('lex number - decimal', async () => {
    const tokens = lex('123.456');
    assert.equal(kinds(tokens)[0], T.NUMBER);
    assert.equal(values(tokens)[0], 123.456);
  }, { group: 'lexer' });

  test('lex number - negative', async () => {
    const tokens = lex('-42');
    assert.equal(kinds(tokens)[0], T.NUMBER);
    assert.equal(values(tokens)[0], -42);
  }, { group: 'lexer' });

  test('lex number - with exponent', async () => {
    const tokens = lex('1.5e10');
    assert.equal(kinds(tokens)[0], T.NUMBER);
    assert.equal(values(tokens)[0], 1.5e10);
  }, { group: 'lexer' });

  test('lex boolean - true', async () => {
    const tokens = lex('true');
    assert.equal(kinds(tokens)[0], T.BOOL);
    assert.equal(values(tokens)[0], true);
  }, { group: 'lexer' });

  test('lex boolean - false', async () => {
    const tokens = lex('false');
    assert.equal(kinds(tokens)[0], T.BOOL);
    assert.equal(values(tokens)[0], false);
  }, { group: 'lexer' });

  test('lex string - double quoted', async () => {
    const tokens = lex('"hello"');
    assert.equal(kinds(tokens)[0], T.STRING);
    assert.equal(values(tokens)[0], 'hello');
  }, { group: 'lexer' });

  test('lex string - with escapes', async () => {
    const tokens = lex('"hello\\nworld"');
    assert.equal(kinds(tokens)[0], T.STRING);
    assert.equal(values(tokens)[0], 'hello\nworld');
  }, { group: 'lexer' });

  test('lex bareword', async () => {
    const tokens = lex('fooBar');
    assert.equal(kinds(tokens)[0], T.BARE);
    assert.equal(values(tokens)[0], 'fooBar');
  }, { group: 'lexer' });

  test('lex bareword with underscore', async () => {
    const tokens = lex('foo_bar');
    assert.equal(kinds(tokens)[0], T.BARE);
    assert.equal(values(tokens)[0], 'foo_bar');
  }, { group: 'lexer' });

  test('lex bareword starting with underscore', async () => {
    // Note: a single _ is T.ANY, but _foo is T.ANY followed by T.BARE
    const tokens = lex('_foo');
    assert.equal(kinds(tokens)[0], T.ANY);
    assert.equal(kinds(tokens)[1], T.BARE);
  }, { group: 'lexer' });

  test('lex regex - simple', async () => {
    const tokens = lex('/abc/');
    assert.equal(kinds(tokens)[0], T.REGEX);
    assert.equal(values(tokens)[0].body, 'abc');
    assert.equal(values(tokens)[0].flags, '');
  }, { group: 'lexer' });

  test('lex regex - with flags', async () => {
    const tokens = lex('/test/ims');
    assert.equal(kinds(tokens)[0], T.REGEX);
    assert.equal(values(tokens)[0].body, 'test');
    assert.equal(values(tokens)[0].flags, 'ims');
  }, { group: 'lexer' });

  test('lex regex - with escaped slash', async () => {
    const tokens = lex('/a\\/b/');
    assert.equal(kinds(tokens)[0], T.REGEX);
    assert.equal(values(tokens)[0].body, 'a\\/b');
  }, { group: 'lexer' });

  test('lex underscore (any)', async () => {
    const tokens = lex('_');
    assert.equal(kinds(tokens)[0], T.ANY);
  }, { group: 'lexer' });
});

// Punctuation and operators
group('punctuation', () => {
  test('lex brackets', async () => {
    const tokens = lex('[ ]');
    assert.deepEqual(kinds(tokens), [T.LBRACK, T.RBRACK]);
  }, { group: 'lexer' });

  test('lex braces', async () => {
    const tokens = lex('{ }');
    assert.deepEqual(kinds(tokens), [T.LBRACE, T.RBRACE]);
  }, { group: 'lexer' });

  test('lex double braces (set)', async () => {
    const tokens = lex('{{ }}');
    assert.deepEqual(kinds(tokens), [T.LDBRACE, T.RDBRACE]);
  }, { group: 'lexer' });

  test('lex parentheses', async () => {
    const tokens = lex('( )');
    assert.deepEqual(kinds(tokens), [T.LPAREN, T.RPAREN]);
  }, { group: 'lexer' });

  test('lex colon', async () => {
    const tokens = lex(':');
    assert.equal(kinds(tokens)[0], T.COLON);
  }, { group: 'lexer' });

  test('lex dot', async () => {
    const tokens = lex('.');
    assert.equal(kinds(tokens)[0], T.DOT);
  }, { group: 'lexer' });

  test('lex pipe', async () => {
    const tokens = lex('|');
    assert.equal(kinds(tokens)[0], T.PIPE);
  }, { group: 'lexer' });

  test('lex ampersand', async () => {
    const tokens = lex('&');
    assert.equal(kinds(tokens)[0], T.AMP);
  }, { group: 'lexer' });

  test('lex star', async () => {
    const tokens = lex('*');
    assert.equal(kinds(tokens)[0], T.STAR);
  }, { group: 'lexer' });

  test('lex plus', async () => {
    const tokens = lex('+');
    assert.equal(kinds(tokens)[0], T.PLUS);
  }, { group: 'lexer' });

  test('lex question mark', async () => {
    const tokens = lex('?');
    assert.equal(kinds(tokens)[0], T.QMARK);
  }, { group: 'lexer' });

  test('lex hash', async () => {
    const tokens = lex('#');
    assert.equal(kinds(tokens)[0], T.HASH);
  }, { group: 'lexer' });

  test('lex equals', async () => {
    const tokens = lex('=');
    assert.equal(kinds(tokens)[0], T.EQ);
  }, { group: 'lexer' });

  test('lex dollar', async () => {
    const tokens = lex('$');
    assert.equal(kinds(tokens)[0], T.DOLLAR);
  }, { group: 'lexer' });
});

// Special constructs
group('special constructs', () => {
  test('lex ellipsis', async () => {
    const tokens = lex('...');
    assert.equal(kinds(tokens)[0], T.ELLIPSIS);
  }, { group: 'lexer' });

  test('lex replacement markers', async () => {
    const tokens = lex('>> <<');
    assert.deepEqual(kinds(tokens), [T.REPL_L, T.REPL_R]);
  }, { group: 'lexer' });

  test('lex positive lookahead', async () => {
    const tokens = lex('(?=');
    assert.equal(kinds(tokens)[0], T.ASSERT_POS);
  }, { group: 'lexer' });

  test('lex negative lookahead', async () => {
    const tokens = lex('(?!');
    assert.equal(kinds(tokens)[0], T.ASSERT_NEG);
  }, { group: 'lexer' });

  test('lex as keyword', async () => {
    const tokens = lex('as');
    assert.equal(kinds(tokens)[0], T.AS);
  }, { group: 'lexer' });

  test('lex variable binding', async () => {
    const tokens = lex('$x');
    assert.deepEqual(kinds(tokens), [T.DOLLAR, T.BARE]);
  }, { group: 'lexer' });

  test('lex variable with equals', async () => {
    const tokens = lex('$x=foo');
    assert.deepEqual(kinds(tokens), [T.DOLLAR, T.BARE, T.EQ, T.BARE]);
  }, { group: 'lexer' });
});

// Whitespace and comments
group('whitespace and comments', () => {
  test('whitespace is skipped', async () => {
    const tokens = lex('  a   b  ');
    assert.deepEqual(kinds(tokens), [T.BARE, T.BARE]);
  }, { group: 'lexer' });

  test('newlines are treated as whitespace', async () => {
    const tokens = lex('a\nb\nc');
    assert.deepEqual(kinds(tokens), [T.BARE, T.BARE, T.BARE]);
  }, { group: 'lexer' });

  test('commas are treated as whitespace', async () => {
    const tokens = lex('a,b,c');
    assert.deepEqual(kinds(tokens), [T.BARE, T.BARE, T.BARE]);
  }, { group: 'lexer' });

  test('line comment is skipped', async () => {
    const tokens = lex('a // comment\nb');
    assert.deepEqual(kinds(tokens), [T.BARE, T.BARE]);
  }, { group: 'lexer' });

  test('block comment is skipped', async () => {
    const tokens = lex('a /* comment */ b');
    assert.deepEqual(kinds(tokens), [T.BARE, T.BARE]);
  }, { group: 'lexer' });

  test('block comment multiline', async () => {
    const tokens = lex('a /* multi\nline\ncomment */ b');
    assert.deepEqual(kinds(tokens), [T.BARE, T.BARE]);
  }, { group: 'lexer' });
});

// Complex patterns
group('complex patterns', () => {
  test('array pattern', async () => {
    const tokens = lex('[ a b c ]');
    assert.deepEqual(kinds(tokens), [T.LBRACK, T.BARE, T.BARE, T.BARE, T.RBRACK]);
  }, { group: 'lexer' });

  test('object pattern', async () => {
    const tokens = lex('{ a:b }');
    assert.deepEqual(kinds(tokens), [T.LBRACE, T.BARE, T.COLON, T.BARE, T.RBRACE]);
  }, { group: 'lexer' });

  test('set pattern', async () => {
    const tokens = lex('{{ a b }}');
    assert.deepEqual(kinds(tokens), [T.LDBRACE, T.BARE, T.BARE, T.RDBRACE]);
  }, { group: 'lexer' });

  test('quantifier pattern', async () => {
    const tokens = lex('a*');
    assert.deepEqual(kinds(tokens), [T.BARE, T.STAR]);
  }, { group: 'lexer' });

  test('alternation pattern', async () => {
    const tokens = lex('a | b');
    assert.deepEqual(kinds(tokens), [T.BARE, T.PIPE, T.BARE]);
  }, { group: 'lexer' });

  test('vertical pattern', async () => {
    const tokens = lex('a.b.c');
    assert.deepEqual(kinds(tokens), [T.BARE, T.DOT, T.BARE, T.DOT, T.BARE]);
  }, { group: 'lexer' });
});

// Token spans
group('token spans', () => {
  test('spans are correct for simple token', async () => {
    const tokens = lex('abc');
    assert.equal(tokens[0].span.start, 0);
    assert.equal(tokens[0].span.end, 3);
  }, { group: 'lexer' });

  test('spans are correct with whitespace', async () => {
    const tokens = lex('  abc  ');
    assert.equal(tokens[0].span.start, 2);
    assert.equal(tokens[0].span.end, 5);
  }, { group: 'lexer' });

  test('spans are correct for multiple tokens', async () => {
    const tokens = lex('a b c');
    assert.equal(tokens[0].span.start, 0);
    assert.equal(tokens[0].span.end, 1);
    assert.equal(tokens[1].span.start, 2);
    assert.equal(tokens[1].span.end, 3);
    assert.equal(tokens[2].span.start, 4);
    assert.equal(tokens[2].span.end, 5);
  }, { group: 'lexer' });
});

// Error cases
group('error cases', () => {
  test('unterminated string throws', async () => {
    assert.throws(() => {
      lex('"unterminated');
    }, PatternSyntaxError);
  }, { group: 'lexer' });

  test('unterminated regex throws', async () => {
    assert.throws(() => {
      lex('/unterminated');
    }, PatternSyntaxError);
  }, { group: 'lexer' });

  test('invalid regex throws', async () => {
    assert.throws(() => {
      lex('/[invalid/');
    }, PatternSyntaxError);
  }, { group: 'lexer' });

  test('unterminated block comment throws', async () => {
    assert.throws(() => {
      lex('/* unterminated');
    }, PatternSyntaxError);
  }, { group: 'lexer' });

  test('invalid character throws', async () => {
    assert.throws(() => {
      lex('@invalid');
    }, PatternSyntaxError);
  }, { group: 'lexer' });

  test('invalid number throws', async () => {
    assert.throws(() => {
      lex('1e+');
    }, PatternSyntaxError);
  }, { group: 'lexer' });
});

// EOF token
group('EOF handling', () => {
  test('empty string produces EOF', async () => {
    const tokens = lex('');
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].kind, T.EOF);
  }, { group: 'lexer' });

  test('EOF is always last token', async () => {
    const tokens = lex('a b c');
    assert.equal(tokens[tokens.length - 1].kind, T.EOF);
  }, { group: 'lexer' });
});

// Run tests if this is the main module
if (require.main === module) {
  loadLexer().then(() => {
    return run();
  }).then((results) => {
    process.exit(results.failed.length > 0 ? 1 : 0);
  }).catch(error => {
    console.error('Failed to load lexer:', error);
    process.exit(1);
  });
}
