import {Tendril, Group} from './src/tendril-api.js';

const data = {foo: "value1", other: "value2"};

console.log("Original:", JSON.stringify(data));
console.log();

// Test 1: Return object with variable names (correctly using Group for @r)
console.log("Test 1: Return {y: 'REPLACED_Y'}");
const result1 = Tendril("{foo:$y (@r=remainder)}").replaceAll(data, _ => ({
  y: 'REPLACED_Y'
}));
console.log("Result:", JSON.stringify(result1));
console.log();

// Test 2: What if we return {0: ...}?
console.log("Test 2: Return {'0': {bar: _.y, ..._.r}}");
const result2 = Tendril("{foo:$y (@r=remainder)}").replaceAll(data, _ => ({
  '0': {bar: _.y, ..._.r}
}));
console.log("Result:", JSON.stringify(result2));
console.log();

// Test 3: Return nothing that matches
console.log("Test 3: Return {nonexistent: 'value'}");
const result3 = Tendril("{foo:$y (@r=remainder)}").replaceAll(data, _ => ({
  nonexistent: 'value'
}));
console.log("Result:", JSON.stringify(result3));
