import {Tendril} from './src/tendril-api.js';
import util from 'util';

const input = [
  {tag: 'div', children: 'before'},
  {tag: 'when', condition: true, children: 'show this'},
  {tag: 'else', children: 'or this'},
  {tag: 'span', children: 'after'}
];

console.log('Input:');
console.log(util.inspect(input, {depth: null, colors: true}));

const pattern = `[.. @whenelse:(
  {tag=/^when$/i @otherProps:(..)}
  {tag=/^else$/i children=$else ..}*{0,1}
) ..]`;

console.log('\nPattern:', pattern);

try {
  const solutions = Tendril(pattern).all(input);
  console.log('\nSolutions found:', solutions.length);
  for (let i = 0; i < Math.min(solutions.length, 3); i++) {
    console.log(`\nSolution ${i+1} bindings:`);
    console.log(util.inspect(solutions[i].bindings, {depth: null, colors: true}));
    console.log(`Solution ${i+1} sites for 'whenelse':`);
    console.log(util.inspect(solutions[i].at.whenelse, {depth: null, colors: true}));
  }

  console.log('\nTrying replace() directly:');
  const result = Tendril(pattern).replace(input, v => ({
    whenelse: { tag: 'when', children2: v.else, ...v.otherProps }
  }));

  console.log('\nResult:');
  console.log(util.inspect(result, {depth: null, colors: true}));
} catch (e) {
  console.log('\nError:', e.message);
  console.log('\nStack:', e.stack);
}
