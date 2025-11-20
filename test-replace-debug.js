import {Tendril} from './src/tendril-api.js';

const data = {
  name: "foo",
  items: ["foo", "bar"],
  config: {setting: "foo"}
};

console.log("Data:");
console.log(JSON.stringify(data, null, 2));
console.log();

console.log("Detailed matches for '{..:foo}':");
const matches = Tendril("{..:foo}").occurrences(data).toArray();
console.log("Number of matches:", matches.length);
matches.forEach((m, i) => {
  console.log(`\nMatch ${i}:`);
  console.log(`  $0 value:`, JSON.stringify(m.bindings['0']));
  console.log(`  $0 path:`, JSON.stringify(m.at['0']?.[0]?.path));
  console.log(`  Full site info:`, JSON.stringify(m.at['0'], null, 2));
});

console.log("\n\n=== REPLACEMENT ===");
const result = Tendril("{..:foo}").replaceAll(data, "REPLACED");
console.log(JSON.stringify(result, null, 2));
