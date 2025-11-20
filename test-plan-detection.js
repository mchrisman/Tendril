import {Tendril} from './src/tendril-api.js';

const data = {foo: "value1", other: "value2"};

console.log("Original:", JSON.stringify(data));
console.log();

// Test 1: Return object with variable names
console.log("Test 1: Return {y: 'REPLACED_Y', r: 'IGNORED'}");
const result1 = Tendril("{foo:$y @r=(remainder)}").replaceAll(data, _ => ({
  y: 'REPLACED_Y',
  r: 'should be ignored since r is a group'
}));
console.log("Result:", JSON.stringify(result1));
console.log();

// Test 2: Return object without variable names
console.log("Test 2: Return {bar: _.y, ..._.r} (no matching vars)");
const result2 = Tendril("{foo:$y @r=(remainder)}").replaceAll(data, _ => ({
  bar: _.y,
  ..._.r
}));
console.log("Result:", JSON.stringify(result2));
console.log();

// Test 3: What variables are available?
console.log("Test 3: What's in sol.bindings?");
Tendril("{foo:$y @r=(remainder)}").replaceAll(data, bindings => {
  console.log("  bindings:", bindings);
  console.log("  Keys:", Object.keys(bindings));
  return {};
});
