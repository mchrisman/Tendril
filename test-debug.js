import {Tendril} from './src/tendril-api.js';

// Test with AND
const t1 = Tendril('.a=$x AND .b=$y');
const result1 = t1.match({a: 1, b: 2});
console.log('With AND:', result1 ? result1.bindings : null);

// Test without AND  
const t2 = Tendril('.a=$x .b=$y');
const result2 = t2.match({a: 1, b: 2});
console.log('Without AND:', result2 ? result2.bindings : null);

// Test swap
const t3 = Tendril('.x=$a AND .y=$b');
const swap = t3.replace({x: 3, y: 4}, (v) => ({a: v.b, b: v.a}));
console.log('Swap result:', swap);
