// test.js
const fs = require('fs');
const {parse} = require('./parser.js');

const cases = [
  ['simple symbol', 'foo'],
  ['wildcard', '_'],
  ['binding', 'x: foo'],
  ['array adjacency', '[ a b c ]'],
  ['array group + quant', '[(a b) +]'],
  ['array lazy any + count', '[ .. *{2,} ]'],
  ['lookahead singleton', '(?= foo) bar'],
  ['lookahead group', '[ (?= a b) c d ]'],
  ['object kv + spread + count', '{ foo = bar # {1,3} .. }'],
  ['map with as Map', '{ foo = bar } as Map'],
  ['set double brace', '{{ a b }}'],
  ['indexed path', '{ [i] x = y }'],
  ['path assertion', '{ base . foo = bar }'],
  ['comments + whitespace', '/*c*/ [ a  /*x*/ b // y\n c ] /*z*/'],
];

for (const [name, input] of cases) {
  try {
    const ast = parse(input);
    console.log(`✓ ${name}`);
    console.log(JSON.stringify(ast, null, 2));
  } catch (e) {
    console.error(`✗ ${name}\n  Input: ${input}\n  Error: ${e.message}`);
    process.exitCode = 1;
  }
}
