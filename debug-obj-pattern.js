// Test V5 object pattern syntax
import {parsePattern} from './src/tendril-parser.js';
import {matchProgram} from './src/tendril-engine.js';

// V5 style: object pattern with multiple entries
const pattern = '{a=$x b=$y}';
const input = {a: 1, b: 2};

console.log('\n=== Pattern ===');
console.log(pattern);

console.log('\n=== AST ===');
const ast = parsePattern(pattern);
console.log(JSON.stringify(ast, null, 2));

console.log('\n=== Matching ===');
const solutions = matchProgram(ast, input);
console.log('Solutions:', JSON.stringify(solutions, null, 2));
