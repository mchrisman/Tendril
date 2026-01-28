After considerable thought and discussion, here is a rather large revised proposal.
It represents a significant rework of the language. (Nobody is using this language yet, so backward compatibility is not a concern. )

CURRENT SEMANTICS

object syntax

| Expression | Asserts a valid field exists       | Asserts all values are valid       |
|------------|------------------------------------|------------------------------------|
|            | `(∃(k,v) ∈ obj)(K ~= k && V ~= v)` | `(∀(k,v) ∈ obj)(K ~= k => V ~= v)` |
| `K:V`       | ✅                                  | ❌                                  |
| `each K:V`  | ✅                                  | ✅                                  |
| `K?:V`      | ❌                                  | ❌                                  |
| `each K?:V` | ❌                                  | ✅                                  |

- Cases that don't seem very useful. 
- Ambiguity about whether `{ _:$v }` forces all values to be the same (It doesn't because it branches on each key. )

There are a couple of bugs in how we handle matching of field keys. The first is that the optimization of doing a simple lookup if the key is '$var', an already bound variable or a literal, fails if it's a more complex structure like 'literal|$foo'.  The second is that matching of KEY is ad-hoc, repeats some but not all of the normal pattern-matching logic rather than using recursion to parse the sub-pattern properly.


Array syntax, regex-like

- Ambiguity about whether '[ $x* ]' forces all values to be the same (it does, currently). 
- How to write a pattern that matches '[ [foo,foo], [bar,bar], [baz,baz]]'?
- Inherited from regular expressions, conflation between search strategy: (lazy, greedy, possessive) and quantifiers.  The former is not very composable. 

General 

- Object operators and array operators are completely different, which is okay because they're different beasts in a sense, or at least they're used differently, but there are ways in which they could be unified in order to help make all of these options be more understandable. 


---
REVISED ANALYSIS 

The reason we can't unify arrays and objects is that we have a complete mismatch in ability and factoring.

Object field K:V matching is (see [^1])  

Array patterns don't branch when variables are bound, and there's only one way to make them branch, which is a construct like `[...$x...]`, which doesn't even work properly if the records span more than one item. Arrays have no sense of allowing both valid and invalid patterns in the same sequence (this is effectively impossible because an invalid pattern may be of unknown length). The remedy we selected for the `[[$x $x]*]` case is an attempt to make it work more like objects but does not unify the two models.

We absolutely need a branching K:V as the simplest default notation for objects, since joins are a major use case. We have no such mechanism for arrays, unless we revert to using path notation, but we want to support the normal non-path notation too.    
---

## NEW PROPOSAL

This proposal aims to 
(1) unify object pattern and array pattern semantics: "repeat the pattern, not the data";
(2) unify object and array quantifiers;
(4) use cut '!' to decouple 'possessive' from quantifiers;
(5) clarify quantification on path chains and decouple K from V;
 --- all while satisfying:
(6) The simplest syntax corresponds to the most common use case; most basic join examples work. 
(7) Retains the WYSIWYG flavor.
(8) Forward-thinking to future macro designs

This is a breaking change.

The following syntax and semantics REPLACES the original object operators K:V, K?:V, 'each K:V', and 'each K?:V'; and REPLACES the original array operators *, ?, +, and variants; and REPLACES the original '!', lookahead, and lookbehinds.

This is a draft, not a specification. Ignore underspecified pieces unless you see it going in a bad direction.

### Array local cuts 

`[ A >> B ]` Find the rightmost split point such that A and B both match and then commit it. You can backtrack into A and B, but not change the split point (unless you backtrack past the whole expression). The implementation will optimize the case that A is a repetition.

`[ A << B ]` Ditto, but find the *leftmost*.

The idiom `[ P* >> Q ]` then supercedes the greedy possessive `[ P*+ Q ]` (The two are not 100% equivalent, but close enough to support the same use cases with minimal tweaking.)


### Arrays


**Variables outside repetition patterns** behave as they do today. 

**Variables inside a repetition:**

For a P* in an array: 1. Treat the variables in `P` as local to each iteration. 2. Attempt to match a sequence of chunks on that basis.  As with normal array quantifiers, the length of that sequence is something you can backtrack over. Greedy versus lazy rules apply. Keep track of the slices associated with each chunk, and the throway local variables. There can be multiple solutions resulting in chunks of variable lengths and even resulting in the number of chunks being different.  3. As we do with objects, now iterate over the various chunks and treat each as a witness on a separate branch. Failure to unify over that witness will cause the branch to be pruned. (If the pattern actually contained no variables, then we're doing a simple match. This step does nothing at all other than succeed.) 

To state that shortly and more definitively: **We should be treating the set of chunks that matched P the same way we would treat the set of object fields that matched K.**

---

### Proposed introductory explanation

This offers an introductory explanation to how array repetitions work after we make them behave the same way as object fields.

#### Unification in repeating patterns.

A variable $x **unifies with** (is constrained to have the same value as) another $x *elsewhere* (in a different position, on paper, in the pattern code). It does not unify with *itself* across iterations of a loop. 
```
// Two occurrences of $x in a pattern must unify (must be the same):
[ $x 1 2 3 $x ] // matches [99 1 2 3 99], solution [{x:99}]

// But multiple iterations of the *same* $x (in the pattern code) are not constrained.
// Three repetitions of the subpattern; $x can be different in each one: 
[ (foo $x)* ] // matches [foo 8 foo 9 foo 10 ], solutions [{x:8}, {x:9}, {x:10}]  

// Two different occurrences inside the repetition must unify with each other - but they still needn't unify across repetitions.
[ ($x $x)* ] // matches [ 3, 3, "foo", "foo", [91,92], [91,92] ], solutions [{x:3},{x:'foo'],{x:[91,92}] 

// This one is subtle: the terminal $x appears outside the repetition, so it cannot have a 
// per-repetition value. It can have only one value. But the $x inside the repetition
// must unify with it, being in a "different position, on paper". The result is that $x
// must be the same across all iterations. 
[ $x* $x ]  // matches ["any", "any", "any", "any", "any" ], solutions [{x:"any"}]

// Object keys are a form of repetition too. You know this definitively because $k is only *written once* but is *used multiple times* to match against multiple keys.
{ (/foo/i as $k): $value } // matches { foo:1, Foo:2, FOO:3 }, solutions [{k:'foo',value:1},{k:'Foo',value:2},{k:'FOO',value:3}]
 
```
If there are two repetitions with different variables, both of them can vary independently, resulting in a Cartesian product of solutions.
```
[$x* '/' $y*]  // matches [1, 2, '/', 3, 4]
               // solutions [{x:1,y:3},{x:1,y:4},{x:2,y:3},{x:2,y:4},]
```
In general, be careful with such independent loops, no matter whether nested or separate. These will result in Cartesian products, potentially O(m*n) solutions or worse. Sometimes that's what you need, but usually you are looking for something like an inner join, where a common variable ties together the loops and collapses the Cartesian product:
```
{
    flowers: { $sku: $flower }  
    prices: [($sku, $price)*]   // the common variable $sku collapses the possibilities
}
// matches
//    { 
//       flowers: { "101":"rose", "102":"daffodil", "103":"tulip"},
//       prices: ["101", 10.99, "102", 14.99]
//    }
// Solutions:
// { sku: 101, flower:"rose", price:10.99 }
// { sku: 102, flower:"daffodil", price:14.99 }
```

A final remark: a different way to state this is that if some variable occurs only within a loop (and not outside it), it is treated as a per-iteration local variable, wiped clean on each iteration of the loop.

---

### Global unification

To force a variable to be global, when it would otherwise be a per-iteration local, use the postfix '^'.
```
[ $x* ]  // matches [1,2,3]
[ $x^* ] // matches [4,4,4]; does not match [1,2,3]
```

## Simplified array-context quantifiers
```
   [ P ]          // Exactly one
    
   [ P? ]         // Zero or one       
   [ P* ]         // Zero or more
   [ P+ ]         // One or more
   [ P{m,n} ]     // given count

   [ ... $x ... ]    // Branch per index (this is a consequence of ... === _*). No change.
            
```

### Objects

Object field matching is simplified, leaving only two forms:
```
   { K:V }          // "required field" - One or more keys match K, and for all keys matching K, the value matches V
   { K?:V }         // "optional field" - Zero or more keys match K, and for all keys matching K, the value matches V
```
Breadcrumbs in paths do not get their own quantifiers. Instead, the entire path is treated like a single compound key.
```
{ P.Q.R ?: V } // If there exist any unbroken paths `p.q.r`, then they must each have a value matching `V`. 
```

For any other counting needs, we have our standard categorization idiom, explained elsewhere, which is an advanced usage. But we add a new shortcut operator to make counting very easy in both arrays and object fields.
`#{m,n}` may be attached to anything within a repetition (an array repetition clause or an object field clause). It counts the number of times that it gets matched while looping over the repetition, and at the end, it fails if the count is not within the specified range.
```
[ (yes#{10,} | no) ]  // Matches an array with at least 10 'yes' votes
{ (password|Password)#{1}: _ }  // matches an object having password or Password, but not both.
```
A more complex counting example, done manually with the standard categorization idiom (*Advanced usage*) explained elsewhere. I mention it here to show that we have an escape hatch to handle uncommon cases. Note that we no longer need to use "each" for this idiom.
```   
   // 
   ({ $k : /foo/ -> %groupA 
          else /bar/ -> %groupB 
          else _->%others 
   } where size(%groupB) <= size(%groupA))
   
```


### Flow operator

Current behavior (to be kept)
```
The `->` operator collects matching key-value pairs into **buckets** during object iteration. This enables categorization and partitioning of object properties.

{ $k: 1 -> %ones }              // collect all k:v where value is 1 into %ones
{ $k: 1 -> %ones else 2 -> %twos }  // partition by value: 1s and 2s into separate buckets
{ $k: 1 -> %ones else _ -> %rest }  // collect 1s; everything else goes to %rest
```

New additional behavior: the same may now also be used in arrays:
```
[ (1 -> %ones else 2 -> %twos else _ -> %rest)* ...]   // This will iterate over the whole array. 
[ (1 -> %ones else 2 -> %twos)* ... ]                  // This will stop at the first item that isn't 1 or 2
```

### Other syntax changes

These additional changes are incidental but planned.

`[# ]` replaces `< >` as the syntax for directives.  (This is to free the angle brackets for other uses.)

'!' Is no longer used for "cut" nor for "emphasis/strong". To avoid confusion it will be reserved exclusively for negation.

`(A & B)` is a new consuming (non-zero-width) operator indicating that an item or slice matches A, but also matches B at the same position under the same bindings and consuming the same number of elements. 'fail' is a new operator that does what it says. 

Drop the positive lookahead and negative lookahead operators (?A) (!A). ????




It is similar to `(!B) else A`. (Is it identical? probably.)

This will have other uses later, but to start with, `(==>B)` can logically replace `(?B)` as a positive look ahead, and `fail if A` can replace `(!A)` as a negative lookahead.

`(A & B)` is a new consuming (non-zero-width) operator indicating that an item or sequence of items match a but also match B under the same bindings. Vars that only appear inside the construction are local.



# APPENDIX: [^1] CURRENT FIELD MATCH BEHAVIOR

Here’s what the **current engine actually does** for an object term `K:V` (and variants), including when `K` is “indeterminate” (contains free vars).

It runs in two phases per clause:

1. **Compute candidate keys, without committing any new bindings.**
   For a normal key pattern, it gets `matchingKeys = objectKeysMatching(obj, term.key, s0.env)` .
   Crucially: at this point it’s mostly doing “does this key *match* the key-pattern?”, not “bind my key variables now”.

There’s a special fast path when the key pattern is a binder like `$k` (internally `SBind`) **and `$k` is already bound**: `fastBoundKey(...)` can reduce the candidate set to `[thatOneKey]` (or `[]`) in O(1) by validating the inner key-pattern and checking existence . This same idea is reused for `**` navigation too .

2. **Partition those keys into “slice” vs “bad”, using a *throwaway* cloned solution.**
   For each candidate key `k`, it clones the current solution and tests whether the **value** (after breadcrumbs) matches `V`. If that test succeeds, `k` goes into `sliceKeys`; otherwise it goes into `badKeys` .

This is the subtle but important bit: because it tests `V` in `testSol = cloneSolution(s0)` and then throws the clone away, this pass **can be constrained by already-bound variables**, but it generally **does not “learn” new bindings** from `V`.

Then it applies the operator semantics:

* It enforces the slice-count bounds (defaulting to “at least one”, with the “optional” tweak for `K?:V`) .
* If it’s an `each`/strong clause, it enforces **no bad entries** (`badKeys` must be empty) .

Finally, it **enumerates solutions** by picking a witness from the slice:

* If `sliceKeys` is nonempty, it branches: **each `k ∈ sliceKeys` produces an independent solution** (“existential branching”) .
* In that branch, it now **binds key variables** (`$k` in key position) with `bindKeyVariables(term.key, k, s1, path)`, and *fails that branch* on unification conflict .
* Then it navigates breadcrumbs and matches `V` “for real”, producing the bindings for that branch .

### So what happens when the key is indeterminate?

If the key contains a free variable (e.g. `{ $k: V }`):

* The engine does **not** “bind `$k` first and reconcile later.”
  It first enumerates candidate keys, then after it has decided which keys are in the slice, it binds `$k` **per branch** (one branch per chosen witness key).

So `{ $k: $v }` on `{a:1,b:2}` will naturally produce two branches/solutions: `{k:"a", v:1}` and `{k:"b", v:2}`.

If `$k` is already bound from elsewhere, the fast path can collapse that to “check just that key” (or fail) .

### Why does `each /a.*/: $x` not force all values equal?

Because `each` is implemented as “no bad keys” + *still* existential witness selection for bindings. It does **not** attempt to bind `$x` simultaneously across *all* keys. That’s why the cheat-sheet truthfully says variables “are not required to unify across keys” for `each` .

And the idiom `{ /a.*/: $x, each /a.*/: $x }` works precisely because the first clause binds `$x` from *one* witness, and the second clause (strong) then re-tests values under that bound `$x`, turning mismatches into `badKeys` and failing if any exist .

### Extra detail: alternation in keys

If the key pattern has alternation with bindings, `bindKeyVariables` tries alts one by one using a cloned snapshot, and only commits the env if binding/unification succeeds . That’s “bind locally then commit”, but it’s still *within one branch*, not a later global reconciliation step.

---
