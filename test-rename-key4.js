import {Tendril, Group} from './src/tendril-api.js';

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

console.log("What does {foo:$y (@r=remainder)} match?");
const matches = Tendril("{foo:$y (@r=remainder)}").occurrences(data).toArray();
console.log("Number of matches:", matches.length);
matches.forEach((m, i) => {
  console.log(`\nMatch ${i}:`);
  console.log(`  $0:`, JSON.stringify(m.bindings['0']));
  console.log(`  $y:`, JSON.stringify(m.bindings.y));
  console.log(`  @r:`, m.bindings.r);
  console.log(`  path:`, m.at['0']?.[0]?.path);
});
console.log();

console.log("Now test replacement:");
const result = Tendril("{foo:$y (@r=remainder)}").replaceAll(data, _ => {
  console.log("  Replacement function called with:", _);
  console.log("  _.r is:", _.r);
  console.log("  Spreading _.r:", {..._.r});
  return {bar: _.y, ..._.r};
});
console.log("\nResult:");
console.log(JSON.stringify(result, null, 2));
