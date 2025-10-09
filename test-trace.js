import { Pattern } from './src/engine.js';
import { createTracer } from './src/tracer.js';

const tracer = createTracer();
const p = new Pattern('[$x=1*? $y=1*]');

console.log('Pattern: [$x=1*? $y=1*]');
console.log('Input: [1, 1, 1]');

let count = 0;
for (const result of p.find([1, 1, 1], tracer)) {
  console.log(`\n>>> SOLUTION ${++count}: ${JSON.stringify(result.scope)}\n`);
  if (count >= 2) break; // Just show first 2 solutions
}
