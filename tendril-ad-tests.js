// Test Tendril patterns for AppDown macro transformations

import {Tendril,Group} from './dist/tendril.esm.js';

console.log('Testing Tendril patterns for AppDown\n');
function deepEquals(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return Object.is(a, b); // handles NaN

  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEquals(a[i], b[i])) return false;
    }
    return true;
  }

  if (Array.isArray(b)) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEquals(a[key], b[key])) return false;
  }

  return true;
}


// Test 1: Simple match to understand the API
const test1 = [
  {tag: 'When', attrs: {'a:test': '{x > 5}'}, children: ['Yes'], srcId: 'w1'},
  {tag: 'Else', children: ['No'], srcId: 'e1'}
];

console.log('Test 1: Match When+Else pair');
console.log('Input:', JSON.stringify(test1, null, 2));

try {
  // Try matching the pattern
  const pattern1 = Tendril(`[
    {tag = "When", attrs = {$testKey = $testAttr, remainder}, children = $then, srcId = $id, remainder}
    {tag = "Else", children = $else, remainder}?
  ]`);

  const solutions = pattern1.solutions(test1);
  const sol = solutions.first();

  if (sol) {
    console.log('✓ Matched!');
    console.log('Bindings:', sol.bindings);
    console.log('');
  } else {
    console.log('✗ No match\n');
  }

  // Test 2: Try with case-insensitive tag match
  console.log('Test 2: Case-insensitive tag match');
  const pattern2 = Tendril(`[
    {tag = /^[Ww]hen$/, attrs = $attrs, children = $then, srcId = $id, remainder}
    {tag = /^[Ee]lse$/, children = $else, remainder}?
  ]`);

  const sol2 = pattern2.solutions(test1).first();
  if (sol2) {
    console.log('✓ Matched!');
    console.log('Bindings:', sol2.bindings);

    // Now try to extract test attribute
    const attrs = sol2.bindings.attrs;  // no $ prefix in bindings
    console.log('Attrs object:', attrs);
    const testAttr = attrs['a:test'] || attrs['test'];
    console.log('Extracted test attr:', testAttr);
    console.log('');
  } else {
    console.log('✗ No match\n');
  }

  // Test 3: With surrounding nodes (checking .. works)
  console.log('Test 3: With surrounding nodes');
  const test3 = [
    {tag: 'div', children: ['before']},
    {tag: 'When', attrs: {'a:test': '{x}'}, children: ['A'], srcId: 'w1'},
    {tag: 'Else', children: ['B']},
    {tag: 'div', children: ['after']}
  ];

  const pattern3 = Tendril(`[
    ..
    @whenelse:(
      {tag = /^[Ww]hen$/, @attrs:(attrs=_), children = $then, @other:(remainder)}
      {tag = /^[Ee]lse$/, children = $else, remainder}?
    )
    ..
  ]`);

  const sol3 = pattern3.solutions(test3).first();
  if (sol3) {
    console.log('✓ Matched with surrounding nodes!');
    console.log('Bindings:', sol3.bindings);
    console.log('');
  } else {
    console.log('✗ No match\n');
  }

  if (pattern3.replaceAll) {
    console.log('Test 4: Trying replaceAll');
    try {
      const result = pattern3.replaceAll(test3, $ => {
        // Exclude 'children' from attrs since we're renaming it to thenChildren
//        const {children: _, remainder.attrsRest} = $.attrs || {};
        return {
          whenelse: Group.array({
            tag: 'If',
            ...($.attrs||{}),// attrsRest,
            ...($.other || {}),
            thenChildren: $.then,
            elseChildren: $.else || [],
            bindingName: null
          })
        };
      });
      console.log('Result:', JSON.stringify(result, null, 2));

      const expected = [
        {tag: 'div', children: ['before']},
        {tag: 'If', attrs: {'a:test': '{x}'}, thenChildren: ['A'], srcId: 'w1', elseChildren: ['B'], bindingName: null},
        {tag: 'div', children: ['after']}
      ];

      if (deepEquals(result, expected)) {
        console.log('✓ replaceAll produced expected result!');
      } else {
        console.log('✗ Result does not match expected');
        console.log('Expected:', JSON.stringify(expected, null, 2));
      }
    } catch (e) {
      console.log('replaceAll error:', e.message);
      console.log(e.stack);
    }
  } else {
    console.log('Test 4: replaceAll not available on pattern object');
  }

} catch (e) {
  console.error('Error:', e.message);
  console.error(e.stack);
}
