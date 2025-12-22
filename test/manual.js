
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Tendril} from '../src/tendril-api.js';

// console.log(Tendril('{a[$x:(_)]=$y}').occurrences({a: [1, 2, 3]}).forEach(o => console.log(JSON.stringify(o))))


console.log(
  Tendril('[/aBcd/i]')
  .find(["abcd"])
  .solutions()
  .toArray()
  .forEach(o => console.log(JSON.stringify(o.toObject(),null,4))))
/*

```
For all k, if k=~K then v=~V

"{ /[ab]/=/3/  $k:(/[cd]/)=/4/ }" ~= { a:30, c:40, d:50 }

 As a thought experiment. Let's try reimagining this data as an array of key-value pairs: [[a 30] [c 40] [d:50]].  How do we replicate the object constraints? Thus:
 
[
  (
    (![/ab/ _]       | (?[_ /3/]))
    (![$k(/[cd]/) _] | (?[_ /4/]))
    [_ _]
  )*
}  

Let's try a simpler one:


The lenient operator

"{ $x:(a)?=3 }"  ~=  { a:3 }

translates to

[(
   (! [$x:(a)) _] | (?[_ 3])
)*]

But

"{ $x:(a)=3 }"  ~=  { a:3 }

translates to

[(
   [$x:(a) 3] | (![$x:(a) _])
)*]

Which, if negative lookaheads don't bind, actually gives us what we want. 


{
   employees = { $empId = { name=$name, manager=$manId }}
   managers = { $manId = { name=$manName }}
}

Hm, maybe. thinking.

What if {K=V K2=V2} behaves semantically like 
   [ (?..[K V]) (?..[K2 V2]) ]
Then either (A) this solves the problem (but is weaker than our original assertion, or (B) it doesn't solve the problem, which means that our implementation of bindings inside lookaheads must also be suspect.   









Or,

"{ $x=3 }"  ~=  { a:3 }

translates to

[(
   (! [$x:(_) _] | (?[_ 3])
)]




Let's try a simpler two:'
// editAll is now PURE (returns copy)
// expected: {a:[99,100,101]}
console.log(Tendril('{a[($x=_)]:$y}').find({a: [1, 2, 3]}).editAll((v) => ({y: v.x + 99})));

//expected: {a:[undefined,undefined,2]}, or else error if replacing keys is not supported yet
console.log(Tendril('{a[($x=_)]:$y}').find({a: [1, 2, 3]}).editAll((v) => ({x: 2})));

// expected: { a: [ 1, 2, 3 ] } // 'out' binding does not exist, so is ignored'
console.log(Tendril('{a[($x=0)]:_}').find({a: [1, 2, 3]}).editAll(bindings => ({out: 99})));

// expected, { a: [ 1, 2, 3 ] } // no replacements specified
console.log(Tendril('{a[($x=0)]:_}').find({a: [1, 2, 3]}).editAll(bindings => ({})));

// expected: 99
console.log(Tendril('{a[($x=_)]:$y}').find({a: [1, 2, 3]}).replaceAll(() => 99));

// expected: 98
console.log(Tendril('{a[($x=_)]:$y}').find({a: [1, 2, 3]}).replaceAll(() => 98));

 
```



*/