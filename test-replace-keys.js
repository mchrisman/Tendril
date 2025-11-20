import {Tendril} from './src/tendril-api.js';

const data = {
  foo: "bar",
  name: "value",
  nested: {
    foo: "qux"
  }
};

console.log("Original data:");
console.log(JSON.stringify(data, null, 2));
console.log();

console.log("Can we match keys with '{foo:$x}'?");
const matches = Tendril("{foo:$x}").occurrences(data).toArray();
console.log("Number of matches:", matches.length);
matches.forEach((m, i) => {
  console.log(`Match ${i}:`, JSON.stringify(m.bindings));
  console.log(`  path:`, m.at['0']?.[0]?.path);
});
console.log();

console.log("What about '{..foo:$x}' to find all 'foo' keys at any depth?");
const matches2 = Tendril("{..foo:$x}").occurrences(data).toArray();
console.log("Number of matches:", matches2.length);
matches2.forEach((m, i) => {
  console.log(`Match ${i}:`, JSON.stringify(m.bindings));
  console.log(`  path:`, m.at['0']?.[0]?.path);
});
