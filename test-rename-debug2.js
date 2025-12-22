import {Tendril} from './src/tendril-api.js';

const data = {
  foo: "value1",
  other: "value2"
};

console.log("Original data:");
console.log(JSON.stringify(data, null, 2));
console.log();

console.log("What does {foo:$y (@r=remainder)} match?");
const matches = Tendril("{foo:$y (@r=remainder)}").occurrences(data).toArray();
matches.forEach((m, i) => {
  console.log(`Match ${i}:`);
  console.log(`  y:`, m.bindings.y);
  console.log(`  r:`, m.bindings.r);
  console.log(`  Keys in r:`, Object.keys(m.bindings.r));
});
console.log();

console.log("Replace it:");
const result = Tendril("{foo:$y (@r=remainder)}").replaceAll(data, _ => {
  console.log("Replacing with:", {bar: _.y, ..._.r});
  return {'0': {bar: _.y, ..._.r}};
});
console.log("Result:");
console.log(JSON.stringify(result, null, 2));
