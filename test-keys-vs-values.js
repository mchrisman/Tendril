import {Tendril} from './src/tendril-api.js';

const data = {
  foo: "bar",           // key is "foo"
  name: "foo",          // value is "foo"
  items: ["foo", "baz"],
  nested: {
    foo: "qux",         // key is "foo"
    setting: "foo"      // value is "foo"
  }
};

console.log("Original data:");
console.log(JSON.stringify(data, null, 2));
console.log();

console.log("Tendril('foo').replaceAll(data, 'REPLACED'):");
const result = Tendril("foo").replaceAll(data, "REPLACED");
console.log(JSON.stringify(result, null, 2));
console.log();

console.log("Did it replace keys? Let's check if 'foo' key still exists:");
console.log("result.foo =", result.foo);
console.log("result.REPLACED =", result.REPLACED);
console.log("result.nested.foo =", result.nested?.foo);
console.log("result.nested.REPLACED =", result.nested?.REPLACED);
