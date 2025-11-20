import {Tendril} from './src/tendril-api.js';

const makeData = () => ({
  name: "foo",
  items: ["foo", "bar"],
  config: {setting: "foo"}
});

console.log("Original data:");
console.log(JSON.stringify(makeData(), null, 2));
console.log();

console.log("Test 1: Tendril('foo').replaceAll(data, 'REPLACED')");
const result1 = Tendril("foo").replaceAll(makeData(), "REPLACED");
console.log(JSON.stringify(result1, null, 2));
console.log();

console.log("Test 2: Tendril('{..:foo}').replaceAll(data, 'REPLACED')");
const result2 = Tendril("{..:foo}").replaceAll(makeData(), "REPLACED");
console.log(JSON.stringify(result2, null, 2));
console.log();

const data2 = {
  user: {name: "foo"},
  admin: {name: "bar"}
};

console.log("Data2:");
console.log(JSON.stringify(data2, null, 2));
console.log();

console.log("Test 3: Tendril('{..:foo}').replaceAll(data2, 'REPLACED')");
const result3 = Tendril("{..:foo}").replaceAll(data2, "REPLACED");
console.log(JSON.stringify(result3, null, 2));
