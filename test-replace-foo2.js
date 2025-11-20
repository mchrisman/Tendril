import {Tendril} from './src/tendril-api.js';

const data2 = {
  user: {name: "foo"},
  admin: {name: "bar"}
};

console.log("Data2:");
console.log(JSON.stringify(data2, null, 2));
console.log();

console.log("What does '{..:foo}' match?");
const matches = Tendril("{..:foo}").occurrences(data2).toArray();
console.log("Number of matches:", matches.length);
matches.forEach((m, i) => {
  console.log(`Match ${i}:`, JSON.stringify(m.bindings));
  console.log(`  at path:`, m.at['0']?.[0]?.path);
});
console.log();

console.log("What does 'foo' match?");
const matches2 = Tendril("foo").occurrences(data2).toArray();
console.log("Number of matches:", matches2.length);
matches2.forEach((m, i) => {
  console.log(`Match ${i}:`, JSON.stringify(m.bindings));
  console.log(`  at path:`, m.at['0']?.[0]?.path);
});
console.log();

console.log("What about '{..name:$x}'?");
const matches3 = Tendril("{..name:$x}").occurrences(data2).toArray();
console.log("Number of matches:", matches3.length);
matches3.forEach((m, i) => {
  console.log(`Match ${i}:`, JSON.stringify(m.bindings));
  console.log(`  at path:`, m.at['0']?.[0]?.path);
});
