Does this definition make sense and clarify everything?

Object patterns are conjunctions of K:V assertions, where K and V are patterns. For example:

    `{ status:good userId:$id } // match all good users, enumerating userIds`

Syntax:

    `K:V` matches all k,v in the object such that (k~K and v~V), and asserts there is at least one such.

    `K::V` matches all k,v in the object such that (k~K), and asserts that there is at least one such, and that k~K implies v~V.

    `K:V ?` or `K::V ?` is the same, without the 'at least one such' assertion

More formally

    Objects are matched by predicates over key/value pairs. Let O be an object. A predicate has a key pattern K and value pattern V.
    
    **Domain.** Dom(O,K,E) = { (k,v) ∈ entries(O) | k matches K is satisfiable in environment E }. Computation of the domain involves testing each k individually, discarding any bindings created (bindings do not persist/unify between keys).

    **Else.**  `A else B` matches an item X in environment E if (x~A is satisfiable in some extension of E (such extensions are then enumerated)) OR (x~A is not satisfiable in any extension of E AND x~B is satisfiable in some extension of E (such extensions are then enumerated))

    **Plain predicate `K::V`** matches O in environment E iff Dom(O,K,E) is nonempty and for every (k,v) in Dom(O,K,E), the match (k~K ∧ v~V) is satisfiable in some extension of E.
    Solutions are enumerated by enumerating each witness (k,v) ∈ Dom(O,K,E) and returning the bindings produced by matching (k~K ∧ v~V) on that witness, then continuing left-to-right with unification against E.
    
    **Plain lenient predicate `K:V`** matches O in environment E iff Dom(O,K,E) is nonempty and there exists (k,v) in Dom(O,K,E) such that (k~K ∧ v~V) is satisfiable in some extension of E.
    Solutions are enumerated by enumerating each (k,v) ∈ Dom(O,K,E) and returning the bindings produced by matching (k~K ∧ v~V) on that witness, then continuing left-to-right with unification against E.

    **predicates `K::V?' and 'K:V?'** are similar except that they do not assert that at least one such key exists; the slice they define may be empty.

Example:

```
    "{ /a/:1 }" ~= {ab:1, ac:1} // => true
    "{ /a/:1 }" ~= {ab:1, ac:1, ad:0} // => true
    "{ /a/:1 }" ~= {ab:1, ac:1, d:0} // => true
    "{ /a/::1 }" ~= {ab:1, ac:1} // => true
    "{ /a/::1 }" ~= {ab:1, ac:1, ad:0} // => false
    "{ /a/::1 }" ~= {ab:1, ac:1, d:0} // => true
```

Unbound variables in K:V create branches, as usual. Slice variables in objects denote sets of K:V pairs, as before.

```
    "{ @X=(/a/:_ /b/:_) ($y=/c/):_ } ~= {a1:1,a2:2,b:3,c1:4,c2:5,d:6} 
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
    // Reminder: bare $id is shorthand for ($id=_)
    { $id:{id:$id} }  // The items are correctly indexed by ID
    
    matches { "3", {name='Mark', id:3},
              "4", {name='Sue', id:4}}
    doesn't match  { "3", {name='Mark', id:3},
                     "4", {name='Sue', id:3}}      
```
Variables do not unify across keys (we always iterate over properties):
```
    { ($k=/color/):$c }  // Does not demand that all the IDs are the same.
    // => matches {backgroundColor:"green", color:"white"}
    // => Solutions = [{k:"backgroundColor", c:"green"}, {k:"color",c:"white"}] 
```


More examples:

```
    `{ _:$x }`  // Todo: lint this as a probable bug
                // With $x unbound: cannot fail 
                // and will cause every value to become a solution.
                // With $x previously bound: all props have the same value
    `{ $x:$x }` // All keys must have values equal to the keys
```

And the idiom for categorization/fallback is

    `K:A else B` - rules of precedence make this `K:(A else B)`

And while the idiom for binding a slice generally and logically encompasses *sets of k,v pairs*,

    `{ (@s= K1:V1 K2:V2) }`, if it matches, defines the slice of all properties k,v matching (k~K1 AND v~V1 OR k~K2 AND v~V2)

This idiosyncratic idiom is for binding slices defined by the 'else' branches:

    `{ K: @S1=V1 else @S2=V2 }`

for example,

```
    { _: @goodStatus=OK|perfect @others=_ }
    // matches { proc1:"OK", proc2:"perfect", proc3:"bad"}
    // with solution = 
    // {
    //    goodStatus: { proc1:"OK", proc2:"perfect"}
    //    others:     { proc3:"bad"}
    // }

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
   "{ KV_TERMS (@S=%) }" - Binds the remainder to @S and asserts not empty
   "{ KV_TERMS (@S=%?) }" - Binds the remainder to @S, may be empty
   
```

