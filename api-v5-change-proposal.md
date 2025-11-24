api proposal:

1. Group wrappers: even though it's logical, it seems to add to the confusion rather than subtracting from it.

We need to simply trust that the user understands that @ variables are always slices and are always treated as such. Get rid of 'Group' wrappers, do the expected thing conceptually depending on whether $ or @ was used:

```
    // n.b. These examples use the existing API methods, not the proposed ones. Ignore that and just pay attention to how we treat single values versus slices. 
    Tendril("[1 $x 9]").solutions([1, 2, 9])        // → [{x: 2}]
    Tendril("[1 $x 9]").solutions([1, 2, [3], 9])   // → []   // no solution in which $x is a single value
    Tendril("[1 $x 9]").solutions([1, [2, [3]], 9]) // → [{x: [2 [3]]}]                
    
    Tendril("[1 @x 9]").solutions([1, 2, 9])        // → [{x: [2]}]
    Tendril("[1 @x 9]").solutions([1, 2, [3], 9])   // → [{x: [2 [3]]}]
    Tendril("[1 @x 9]").solutions([1, [2, [3]], 9]) // → [{x: [[2 [3]]]}]
    
    Tendril("[_ $x _]").replace([1 2 9], vars=>{x:10})        //  → [1, 10, 9]
    Tendril("[_ $x _]").replace([1 2 9], vars=>{x:[10,11]})   //  → [1, [10,11], 9]
    Tendril("[_ @x _]").replace([1 2 9], vars=>{x:[10,11]})   //  → [1, 10, 11, 9]
```

We can still use Group internally or bookkeeping, we just don't expose it.

2. Expose the automatic group $0 in the edit/replace APIs, where it's useful, but not in the "solutions" Where it would add noise to Prolog-style logic programming.

3. "replace" apis don't modify the original data, they produce altered clones.  "edit" apis do modify the original data. This distinction is validated by the chosen verbs and is desirable according to the anticipated use cases, but needs to be clearly documented.

4. Rewrite the API structure for clarity and use of use:

```
let pattern = Tendril(p)

let matcher = pattern.match(data) // -> Matcher // match whole data
let matcher = pattern.find(data)  // -> Matcher
let matcher = pattern.first(data) // -> Matcher

// Now we can focus on either occurrences or solutions.
let matches = matcher.matches()   // -> iterator of unique Match (location)
let solutions = matcher.solutions() // -> iterator of unique Solution

type MatchSet // itself is iterable of Match
    replaceAll(expr /* not depending on bindings*/)  // uses first solution of match
    replaceAll(bindings=>expr)                       // uses first solution of match
    editAll("x", $=>($.x * 2))  // string,func: replace $x only
    editAll($=>{x:$.y, y:$.x})  // (=>plan)
    editAll({x:$=>$.y, y:$=>$.x})  // plan = obj<key,replacement>; replacement = (vars=>any) | any

type Match:
    path()          // breadcrumb locating the match point from root
    value()         // $0
    solutions()     // iterator of Solution for this match

type Solution // itself, is an object representing bindings
    matches()       // iterator of Match with this solution

Everything else can just be convenience wrappers(?)

