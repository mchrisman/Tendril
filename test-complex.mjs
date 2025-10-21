import {Tendril, Slice} from './dist/tendril.esm.js';

function deepEquals(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEquals(a[i], b[i])) return false;
    }
    return true;
  }

  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return false;
  if (!deepEquals(keysA, keysB)) return false;

  for (const key of keysA) {
    if (!deepEquals(a[key], b[key])) return false;
  }
  return true;
}

console.log('Test 1: Complex When/Else pattern with slices\n');

const test3 = [
  {tag: 'div', children: ['before']},
  {tag: 'When', attrs: {'a:test': '{x}'}, children: ['A'], srcId: 'w1'},
  {tag: 'Else', children: ['B']},
  {tag: 'div', children: ['after']}
];

const pattern3 = Tendril(`[
  ..
  @whenelse:(
    {tag = /^[Ww]hen$/, @attrs:(attrs./(a:)?test/=_), children = $then, @other:(..)}
    {tag = /^[Ee]lse$/, children = $else, ..}?
  )
  ..
]`);

const sol3 = pattern3.solutions(test3).first();
if (sol3) {
  console.log('✓ Matched with surrounding nodes!');
  console.log('Bindings:', sol3.bindings);
  console.log('\nDetailed slice contents:');
  console.log('$.attrs keys:', Object.keys(sol3.bindings.attrs));
  console.log('$.attrs:', sol3.bindings.attrs);
  console.log('$.other keys:', Object.keys(sol3.bindings.other));
  console.log('$.other:', sol3.bindings.other);
  console.log('');
} else {
  console.log('✗ No match\n');
}

if (pattern3.replaceAll) {
  console.log('Test 2: Trying replaceAll\n');
  try {
    const result = pattern3.replaceAll(test3, $ => {
      // Exclude 'children' from attrs spread since we're renaming it to thenChildren
      const {children: _, ...attrsRest} = $.attrs || {};
      return {
        whenelse: Slice.array({
          tag: 'If',
          ...attrsRest,
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
      console.log('\n✓ replaceAll produced expected result!');
    } else {
      console.log('\n✗ Result does not match expected');
      console.log('Expected:', JSON.stringify(expected, null, 2));
    }
  } catch (e) {
    console.log('replaceAll error:', e.message);
    console.log(e.stack);
  }
}
