import {Tendril} from './src/tendril-api.js';

// Simpler test
const simple = {a: "foo", b: "bar"};

console.log("Simple object:");
console.log(JSON.stringify(simple, null, 2));
console.log();

console.log("Matches for '{..:foo}':");
const matches = Tendril("{..:foo}").occurrences(simple).toArray();
console.log("Number of matches:", matches.length);
matches.forEach((m, i) => {
  console.log(`\nMatch ${i}:`);
  console.log(`  bindings:`, JSON.stringify(m.bindings));
  console.log(`  path:`, m.at['0']?.[0]?.path);
});

console.log("\n\nWhat about '{a:foo}'?");
const matches2 = Tendril("{a:foo}").occurrences(simple).toArray();
console.log("Number of matches:", matches2.length);
matches2.forEach((m, i) => {
  console.log(`\nMatch ${i}:`);
  console.log(`  bindings:`, JSON.stringify(m.bindings));
  console.log(`  path:`, m.at['0']?.[0]?.path);
});

console.log("\n\nReplaceAll with '{..:foo}':");
const result = Tendril("{..:foo}").replaceAll(simple, "REPLACED");
console.log(JSON.stringify(result, null, 2));
