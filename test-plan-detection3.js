import {Tendril, Group} from './src/tendril-api.js';

const makeData = () => ({foo: "value1", other: "value2"});

console.log("Original:", JSON.stringify(makeData()));
console.log();

// Test 1: Return object with variable names
console.log("Test 1: Return {y: 'REPLACED_Y'} - replaces just $y");
const result1 = Tendril("{foo:$y (@r=remainder)}").replaceAll(makeData(), _ => ({
  y: 'REPLACED_Y'
}));
console.log("Result:", JSON.stringify(result1));
console.log();

// Test 2: What if we return {0: ...}?
console.log("Test 2: Return {'0': {bar: _.y, ..._.r}} - replaces whole match");
const result2 = Tendril("{foo:$y (@r=remainder)}").replaceAll(makeData(), _ => ({
  '0': {bar: _.y, ..._.r}
}));
console.log("Result:", JSON.stringify(result2));
console.log();

// Test 3: Return nothing that matches
console.log("Test 3: Return {nonexistent: 'value'} - should do nothing");
const result3 = Tendril("{foo:$y (@r=remainder)}").replaceAll(makeData(), _ => ({
  nonexistent: 'value'
}));
console.log("Result:", JSON.stringify(result3));
console.log();

// Test 4: Just return a plain object (not a plan)
console.log("Test 4: Return {bar: 'baz'} directly - what happens?");
const result4 = Tendril("{foo:$y (@r=remainder)}").replaceAll(makeData(), _ => {
  return {bar: 'baz', qux: 'quux'};
});
console.log("Result:", JSON.stringify(result4));
