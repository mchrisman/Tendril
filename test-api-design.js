import {Tendril} from './src/tendril-api.js';

const data = {
  foo: "value1",
  other: "value2"
};

console.log("Original data:");
console.log(JSON.stringify(data, null, 2));
console.log();

console.log("Test 1: Return {bar: _.y, ..._.r} WITHOUT '0' wrapper:");
const result1 = Tendril("{foo:$y @r=(remainder)}").replaceAll(data, _ => {
  return {bar: _.y, ..._.r};
});
console.log(JSON.stringify(result1, null, 2));
console.log();

console.log("Test 2: Return {'0': {bar: _.y, ..._.r}} WITH '0' wrapper:");
const result2 = Tendril("{foo:$y @r=(remainder)}").replaceAll(data, _ => {
  return {'0': {bar: _.y, ..._.r}};
});
console.log(JSON.stringify(result2, null, 2));
console.log();

console.log("Test 3: Return just a value (not a function):");
const result3 = Tendril("foo").replaceAll({a: "foo", b: "bar"}, "REPLACED");
console.log(JSON.stringify(result3, null, 2));
