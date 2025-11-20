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

console.log("Test: Use {..foo:$y @r=(remainder)}");
const result = Tendril("{..foo:$y @r=(remainder)}").replaceAll(data, _ => ({
  '0': {bar: _.y, ..._.r}
}));
console.log("Result:");
console.log(JSON.stringify(result, null, 2));
