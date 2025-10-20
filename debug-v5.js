// Debug V5 syntax parsing
import {parsePattern} from './src/tendril-parser.js';
import {matchProgram} from './src/tendril-engine.js';

console.log('\n=== Test 1: a=$x b=$y ===');
let pattern = 'a=$x b=$y';
let input = {a: 1, b: 2};
let ast = parsePattern(pattern);
console.log('AST:', JSON.stringify(ast, null, 2));
let solutions = matchProgram(ast, input);
console.log('Solutions:', JSON.stringify(solutions, null, 2));

console.log('\n=== Test 2: a.b=$x c[2]=$y ===');
pattern = 'a.b=$x c[2]=$y';
input = {a: {b: 1}, c: [1, 2, 3]};
ast = parsePattern(pattern);
console.log('AST:', JSON.stringify(ast, null, 2));
solutions = matchProgram(ast, input);
console.log('Solutions:', JSON.stringify(solutions, null, 2));
