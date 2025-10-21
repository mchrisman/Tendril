// Quick test of v5-A parser
import {parsePattern} from './src/tendril-parser.js';
import util from 'util';

function test(name, src) {
  console.log(`\n=== ${name} ===`);
  console.log(`Pattern: ${src}`);
  try {
    const ast = parsePattern(src);
    console.log('AST:', util.inspect(ast, {depth: null, colors: true}));
  } catch (e) {
    console.error('ERROR:', e.message);
  }
}

// Basic literals
test('Number literal', '42');
test('String literal', '"hello"');
test('Bareword', 'foo');
test('Wildcard', '_');
test('Boolean', 'true');

// Arrays
test('Empty array', '[]');
test('Simple array', '[1 2 3]');
test('Array with spread', '[1 .. 3]');
test('Array with quantifier', '[a+]');

// Objects
test('Empty object', '{}');
test('Simple object', '{a=1}');
test('Object with breadcrumb', '{a.b=1}');
test('Complex breadcrumb', '{a.b.c=1}');
test('Object with spread', '{a=1 ..}');

// Bindings
test('Scalar binding', '$x');
test('Scalar binding with pattern', '$x:(_)');
test('Slice binding', '@x');
test('Slice binding with pattern', '@x:(_*)');

// The v5-A opening example
test('v5-A opening example', `{
  planets.$name.size=$size
  aka[$idx][_]=$alias
  aka[$idx][0]=$name
}`);

// Nested example
test('Nested structure', '{a.b.c=[a {complex=$structure}]}');

console.log('\n✅ All parsing tests completed');
