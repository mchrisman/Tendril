import {Tendril} from './src/tendril-api.js';

const data = {
  name: "foo",
  items: ["foo", "bar"],
  config: {setting: "foo"}
};

console.log("Data:");
console.log(JSON.stringify(data, null, 2));
console.log();

console.log("What does '{..:foo}' match in data?");
const matches = Tendril("{..:foo}").occurrences(data).toArray();
console.log("Number of matches:", matches.length);
matches.forEach((m, i) => {
  console.log(`Match ${i}:`, JSON.stringify(m.bindings));
  console.log(`  at path:`, m.at['0']?.[0]?.path);
  console.log(`  value:`, JSON.stringify(m.bindings['0']));
});
