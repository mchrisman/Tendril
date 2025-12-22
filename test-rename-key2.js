import {Tendril} from './src/tendril-api.js';

const data = {
  foo: "value1",
  other: "value2",
  nested: {
    foo: "value3",
    another: "value4"
  }
};

console.log("Original data:");
console.log(JSON.stringify(data, null, 2));
console.log();

// Try with comma separator
console.log("Test 1: With comma - {foo:$y, (@r=remainder?)}");
try {
  const pattern = "{foo:$y, (@r=remainder?)}";
  console.log("Pattern:", pattern);
  const result = Tendril(pattern).replaceAll(data, _ => ({bar: _.y, ..._.r}));
  console.log("Result:");
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.log("Error:", e.message);
}
console.log();

console.log("Test 2: What if we use ..foo to find at any depth?");
try {
  const pattern = "{..foo:$y, (@r=remainder?)}";
  console.log("Pattern:", pattern);
  const result = Tendril(pattern).replaceAll(data, _ => ({bar: _.y, ..._.r}));
  console.log("Result:");
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.log("Error:", e.message);
}
