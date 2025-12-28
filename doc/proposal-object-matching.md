5. Objects semantics cleanup proposal

**This proposal would replace the existing spec about how object matching works, Which was confusing and somewhat incoherent. .**

Object patterns are conjunctions of K:V assertions, where K and V are patterns. For example:

    `{ status:good userId:$id } 
     // match all good users, enumerating userIds`

### `K:V` - existential match

Meaning:  It asserts that there is at least one k:v in the object such that (k~K AND v~V).

Bound to an object slice, as in `@foo=( K:V)`, the slice comprises all k:v where k~K AND v~V. For example, @s=(/a/:1) matching {a1:1, a2:2} binds s to {a1:1, a2:2}.

It is a domain-wide generator: it iterates all properties k:v, attempting to match (k~K AND v~V), ignoring failures, and may bind fresh variables per property. Variables unbound at entry may be bound independently for each k:v. Variables already bound before the term are effectively constants, and must unify across all keys.

### `K:V !!` - no counterexamples

Meaning:

1. It asserts that there is at least one k:v in the object such that (k~K AND v~V).
2. It asserts that for all k:v in the object, (k~K implies v~V).

Each value is matched independently against V. This does not require that all values are identical, only that each individually satisfies V.

Bound to an object slice, as in `@foo=( K:V)`, the slice comprises all k:v in the object such that k~K AND v~V

It is a domain-wide generator: it iterates all properties k:v, attempting to match (k~K AND v~V), and may bind fresh variables per property. Variables unbound at entry may be bound independently for each k:v. Variables already bound before the term are effectively constants, and must unify across all keys.

### `K:V?` - optional

This form makes no assertions. It binds like `K:V`. If no (k,v) satisfy the match, the term produces exactly one solution with no new bindings.

### `K:V!!?` - optional, no counterexample

The optional form of `K:V!!`. It asserts that for all k:v in the object, (k~K implies v~V), but does not assert the existence of such k:v. It binds like `K:V!!`. If any k:v fails the assertion, the term fails.

The combination `!!?` is canonical but `?!!` is equivalent.

| Short form | Meaning                                                               |
|------------|-----------------------------------------------------------------------|
| `K:V`      | At least one matching k, and of those, at least one matching v        |
| `K:V!!`    | At least one matching k, and for all k~K, v~V (fresh bindings per key) |
| `K:V?`     | Zero or more matching k (no assertion, used only for binding)         |
| `K:V!!?`   | Zero or more matching k, and for all k~K, v~V (fresh bindings per key) |

Example:

```
    "{ /a/:1 }" ~= {ab:1, ac:1} // => true
    "{ /a/:1 }" ~= {ab:1, ac:1, ad:0} // => true
    "{ /a/:1 }" ~= {ab:1, ac:1, d:0} // => true
    "{ /a/:1 !! }" ~= {ab:1, ac:1} // => true
    "{ /a/:1 !! }" ~= {ab:1, ac:1, ad:0} // => false
    "{ /a/:1 !! }" ~= {ab:1, ac:1, d:0} // => true
```

Or as another illustration of the above definition,

```
    K:V   ≡ K:V#{1,}
    K:V?  ≡ K:V#{0,}
    K:V!!  ≡ (! (K:(!V)) ) K:V#{1,} 
    K:V!!? ≡ (! (K:(!V)) ) K:V#{0,} 
```

Unbound variables in K:V create separate solutions per key, as before. Slice variables in objects denote sets of K:V pairs, as before.

```
    "{ @X=(/a/:_ /b/:_) $y=(/c/):_ } ~= {a1:1,a2:2,b:3,c1:4,c2:5,d:6} 
     // ==> True, solutions:
     // {X:{a1:1,a2:2,b:3},y:'c1'}, {X:{a1:1,a2:2,b:3},y:'c2'}, 
```     

Unification happens normally:

```
  "{ _: [$x $x]}" ~= {a: [3,3], b:[3,3] }   // ==> true, 
       // one solution {x:3} deduped from multiple locations 
  "{ a: [$x $x]}" ~= {a: [3,4]}   // ==> false
  "{ $x: [$x $x]}" ~= {a: ['a','a']}   // ==> true, one solution {x:'a'}
```

Variables unify across terms:

```
    { name:$name creditCard:{name:$name} } 
    // => Matches if the person's name is equal to the name on their credit card. 
```

Variables unify between K and V:

```
    // Reminder: bare $id is shorthand for $id=(_)
    { $id:{id:$id} }  // The items are correctly indexed by ID
    
    matches { "3", {name='Mark', id:3},
              "4", {name='Sue', id:4}}
    doesn't match  { "3", {name='Mark', id:3},
                     "4", {name='Sue', id:3}}      
```

### "Same-values" idiom

❌ "K:V!!" does not mean all values are the same; it merely means all values (individually) match V.

```
    // Does not demand that all the colors are the same.
    "{ $k=(/color/):$c !! }" matches {backgroundColor:"green", color:"white"}
    // => Solutions = [{k:"backgroundColor", c:"green"}, {k:"color",c:"white"}] 
```

✅ Use this idiom to enforce universal equality over values:

```
    "{ $k=(/color/):$c  $k=(/color/):$c!! }"
```

It works because variables unify across terms.

### More examples:

```
    `{ _:$x }`  // Todo: lint this as a probable bug
                // With $x unbound: cannot fail 
                // and will cause every value to become a solution.
                // With $x previously bound: all props have the same value
    `{ $x:$x }` // All keys must have values equal to the keys
```

**Remainder**

The "remainder", symbolized '%', is the slice containing all *keys* that don't fall into any of the "domains". The *values* are immaterial. Example:

```
   "{ /a/:1 /b/:1 % }" ~= { a1:1 a2:2 b:3 c:4 } => true; remainder is {c:4}
```

Syntax:

```
   "{ KV_TERMS % }" - Asserts the remainder is not empty.  
   "{ KV_TERMS (!%) }" - Asserts the remainder is empty, i.e. "anchored" pattern.  
   "{ KV_TERMS @S=(%) }" - Binds the remainder to @S and asserts not empty
   "{ KV_TERMS @S=(%?) }" - Binds the remainder to @S, may be empty
   
```

END object semantics cleanup proposal
