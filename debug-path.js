// Quick debug script
import {parsePattern} from './src/tendril-parser.js';
import {matchProgram} from './src/tendril-engine.js';

const pattern = '.a=$x .b=$y';
const input = {a: 1, b: 2};

console.log('\n=== Pattern ===');
console.log(pattern);

console.log('\n=== AST ===');
const ast = parsePattern(pattern);
console.log(JSON.stringify(ast, null, 2));

console.log('\n=== Number of rules ===');
console.log(ast.rules.length);

console.log('\n=== Rule 0 segments ===');
for (let i = 0; i < ast.rules[0].segs.length; i++) {
  const seg = ast.rules[0].segs[i];
  console.log(`Segment ${i}:`, seg.type, JSON.stringify(seg));
}

console.log('\n=== Matching ===');
const solutions = matchProgram(ast, input);
console.log('Solutions:', JSON.stringify(solutions, null, 2));
