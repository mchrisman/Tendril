
# Tendril: Pattern Matching for Tree Structures

## Status

**Beta** - subject to change.

---
# Core Concepts

Tendril works by trying to **match** a **pattern** to some data. If the pattern matches, you can extract data from it using **variables**. (If you have ever used back-references or named groups in regexes, this will be familiar.)

```javascript
// Extract a value
Tendril("{ name: $x }")
  .match({name: "Alice", age: 30})
  .solutions()
  .first()
// → {x: "Alice"}

// Match array patterns
Tendril("[1 2 $x]")
  .match([1, 2, 3])
  .solutions()
  .first()
// → {x: 3}

// Use wildcards
Tendril("[1 .. 5]")
  .match([1, 2, 3, 4, 5])
  .hasMatch()
// → true
```

You will not fully understand these examples until you read further, but they will give you a sense of the overall shape of the language and illustrate some of its capabilities.

## Example: Data extraction and joins (Kubernetes)

This example joins container *specs* with container *runtime status* by container name $c.

```js
const pod = {
  metadata: { name: "api-7d9c9b8c6f-abcde", namespace: "prod" },
  spec: {
    containers: [
      { name: "api",  image: "ghcr.io/acme/api:1.42.0" },
      { name: "side", image: "ghcr.io/acme/sidecar:3.1.0" }
    ]
  },
  status: {
    containerStatuses: [
      { name: "api",  ready: true,  restartCount: 0 },
      { name: "side", ready: false, restartCount: 7 }
    ]
  }
};

Tendril(`{
  metadata:{ name:$pod namespace:$ns }
  spec.containers[_]: { name:$c image:$img } 
  status.containerStatuses[_]: { name:$c ready:$ready restartCount:$restarts }
}`)
.match(pod)
.solutions()  // e.g. 
.toArray().map(({pod, ns, c, img, ready, restarts}) =>
  `${ns}/${pod}  ${c}  ${img}  ready=${ready}  restarts=${restarts}`
);
```

```txt
// Raw solution objects look like this:
//    {
//      pod: "api-7d9c9b8c6f-abcde",
//      ns: "prod", 
//      c: "api",
//      img: "ghcr.io/acme/api:1.42.0",
//      ready: true,
//      restarts: 0
//    }
// Final output:
[
  "prod/api-7d9c9b8c6f-abcde  api   ghcr.io/acme/api:1.42.0      ready=true  restarts=0",
  "prod/api-7d9c9b8c6f-abcde  side  ghcr.io/acme/sidecar:3.1.0  ready=false restarts=7"
]
```

---

## Example: Transformation (VDOM manipulation)

Replace a `<label>` tag with a `placeholder` on the associated `<input>` tag,
regardless of how distant the two nodes are in the tree.

```js
Tendril(`{
  .. $L=( { tag:'label', props:{for:$id}, children:[$text]   } )
  ..      { tag:'input', props:{id:$id @p=(placeholder:_?) } }
}`)
.find(vdom)
.editAll({
  L: undefined,                    // delete the <label>  
  p: $ => ({placeholder: $.text})  // move its text into the <input>
});
```

---

## Example: joins across separate datasets.

Bringing datasets together is trivial.

```javascript
const users = [{id: 1, name: "Alice"}, {id: 2, name: "Bob"}];
const orders = [
  {user_id: 1, item: "laptop"},
  {user_id: 2, items: ["mouse", "mousepad"]}
];

Tendril(`{
  users[$i].id: $userId
  users[$i].name: $name
  orders[$j].user_id: $userId
  orders[$j].item: $item?
  orders[$j].items[_]: $item?
}`)
.match({users, orders})
.solutions(["name", "item"])
// → [{name: "Alice", item: "laptop"},
//    {name: "Bob", item: "mouse"},
//    {name: "Bob", item: "mousepad"}]
```

# Reference

## Primitives

Tendril matches primitives using literal values or patterns:

```javascript
foo            // matches the exact string "foo" (bare identifier)
"foo bar"      // quoted strings match strings containing spaces or punctuation

foo/i          // case-insensitive bare identifier, matches "Foo", not "foobar"
"f$b"/i        // case-insensitive quoted string, matches "F$B", not "f$bar"

/foo/          // regex matches any substring — "seafood" matches (contains "foo")
/foo/i         // case-insensitive regex — "FOOdish", "seaFOOd" both match
/^[A-Z]{2,}$/  // regex anchors match whole string — "NASA", "OK", not "Ok!"

123            // matches numeric value 123 (123 and 123.0 equivalent)
-42            // negative numbers supported
3.14           // decimal numbers supported
true           // matches Boolean true only
false          // matches Boolean false only
null           // matches null only

_              // wildcard matches any single value
```

Strings can be written as barewords (alphanumeric identifiers) or quoted. The `/i` suffix on literals matches case-insensitively but requires exact match (unlike regex which matches substrings). 

Regex patterns use JavaScript regex syntax and match against string values only. Don't forget that JavaScript regexes match on substrings.

## Arrays

Square brackets indicate arrays. Items in arrays match in sequence left to right (just as characters in regexes do).

```javascript
[1 2 3]        // matches [1,2,3] exactly
[1 2]          // does NOT match [1,2,3] — too short
[1 2 _]        // matches [1,2,3] — wildcard _ matches the third item
[1 .. 3]       // matches [1,2,3] — .. matches any subsequence
[1 ..]         // matches [1,2,3] and [1] and [1,99,100]
[.. 1 2 3 ..]  // matches [1,2,3] — .. can match zero elements
```

Commas are optional. Whitespace separates items but is otherwise insignificant. Whitespace acts as a delimiter: `[foobar]` matches a one-element array containing the string "foobar", while `[foo bar]` matches a two-element array.

### Array Operators

Tendril borrows quantifiers from regex, applying them to array elements rather than characters:

```javascript
[a c* d]           // matches ['a', 'c', 'c', 'c', 'd']
                   // * repeats the item 'c', not characters in a string
[a c* d]           // does NOT match ['a', 'ccc', 'd']
                   // 'ccc' is a different string, not three 'c' items
[a /c*/ d]         // matches ['a', 'ccc', 'd']
                   // regex /c*/ matches the string 'ccc'

?, ??, ?+          // optional (greedy, lazy, possessive)
*, *?, *+          // zero or more (greedy, lazy, possessive)
+, +?, ++          // one or more (greedy, lazy, possessive)
{m,n}, {m,}, {m}   // specific repetitions (greedy, possessive)

..                 // lazy wildcard group (equivalent to _*?)
```

Parentheses group elements for operators:

```javascript
[1 (2 3)*]         // matches [1, 2, 3, 2, 3, 2, 3]
[(3 (4|5)?)*]      // matches [3, 4, 3, 5, 3, 3, 3, 5, 3, 4]
[1 2 (3 4|5 6)]    // matches [1, 2, 5, 6] — alternation
```

The `|` operator creates alternatives (all matches enumerated). The `else` operator creates prioritized alternatives (first match wins):

```javascript
[1 (2|3) 4]            // matches [1,2,4] and [1,3,4] — both alternatives
[1 (2 else 3) 4]       // matches [1,2,4] (if 2 matches) or [1,3,4] (only if 2 fails)
```

Quantifiers bind tighter than adjacency. Lookaheads test without consuming:

```javascript
[(! .. 3 4) ..]   // matches arrays NOT containing subsequence [3,4]
                   // e.g., [4, 3, 2, 1] matches, [1, 2, 3, 4] doesn't
```

## Objects

Object patterns differ fundamentally from array patterns. Rather than matching positionally, object patterns are sets of assertions about key-value pairs (called "slices").

### Slice-Based Semantics

Each `K:V` term defines a **slice**: the set of key-value pairs where the key matches K AND the value matches V. It also implicitly defines a **bad** set: pairs where the key matches K but the value does NOT match V.

| Short form | Meaning |
|------------|---------|
| `K:V`      | At least one matching k:v pair exists |
| `K:>V`     | At least one matching k:v pair exists, AND no bad entries (implication: all keys matching K must have values matching V) |
| `K:V?`     | No assertion (use for optional binding) |
| `K:>V?`    | No bad entries allowed (but key doesn't need to exist) |

The `:>` operator adds an implication constraint: if a key matches K, its value MUST match V.

```javascript
{ a:1 }            // matches {"a":1} and {"a":1, "b":2}
                   // At least one 'a' with value 1

{ /a.*/:1 }        // matches {"ab":1, "ac":2}
                   // At least one /a.*/ key with value 1 (bad entries allowed)

{ /a.*/:1! }       // does NOT match {"ab":1, "ac":2}
                   // "ac":2 is a bad entry (key matches /a.*/, value doesn't match 1)

{ /a.*/:1! }       // matches {"ab":1, "xyz":99}
                   // "xyz" doesn't match /a.*/, so it's not a bad entry

{ a:1? }           // matches {} and {"a":1} and {"a":2}
                   // No assertion - just for binding

{ a:1?!}            // matches {} and {"a":1}, but NOT {"a":2}
                   // No existence required, the value must be 1.
```

Commas are optional. Multiple assertions can match the same key-value pair. 
Terms are evaluated left-to-right, so bindings from earlier terms are visible 
to later terms.

```javascript
{ /a|b/:/x/ /b|c/:/y/ }  // matches {"b":"xy"} - "b":"xy" satisfies both assertions
```

### Remainder

The **remainder** (`%` or `remainder`) consists of keys NOT covered by any key pattern K. A key is "covered" if it matches ANY K in the pattern, regardless of whether the value matched V.

```
{ a:b }            // matches {"a":"b", "c":"d"}
                   // remainder is {"c":"d"} (uncovered keys)

{ a:b % }          // matches {"a":"b", "c":"d"}
                   // '%' asserts a nonempty remainder

{ a:b $ }          // does NOT match {"a":"b", "c":"d"}
                   // '$' requires empty remainder (short for %#{0})

{ a:_ $ }          // matches iff 'a' is the only key

{ /a.*/:1 %#{0} }  // matches {"ab":1, "ac":2}
                   // Both 'ab' and 'ac' are covered by /a.*/
                   // Bad entries (ac:2) are covered, just not in slice
```

Bind the remainder to capture it:

```
{ a:b @rest=(%) }    // matches {"a":"b", "c":"d"}, binds {"c":"d"} to @rest
                     // Note: requires nonempty remainder

{ a:b @rest=(%?) }   // also matches {"a":"b"}, binds {} to @rest
                     // %? allows empty remainder
```

### Operators on Predicates

Alternation applies to keys, values, or entire predicates:

```
{ (a|b):c }        // key is 'a' or 'b', value is 'c'
{ a:(b|c) }        // key is 'a', value is 'b' or 'c'
{ a:b | c:d }      // either predicate (or both)
```

Negation uses lookahead syntax:

```
{ (! a:1) }           // key 'a' must not have value 1
{ (! a:>1?) }         // if 'a' exists, its value must not be 1.
{ (! a:1 b:2) }       // can't have BOTH a:1 and b:2 (one is OK)
{ (! a:1) (! b:2) }  // can't have a:1 AND can't have b:2
```

## Binding Variables

Tendril has two kinds of variables. **Scalar variables** (prefix `$`) capture single values.  **Group variables** (prefix `@`) capture contiguous subsequences in arrays (**array slices**), or subsets of properties of objects (**object slices**). 

The syntax for variable binding is `$x=(pattern)` or `@x=(pattern)`. **Parentheses are mandatory**. 
```
Tendril([1 2 3 4 5]).match("[.. $x=(2|4) $y=(_) ..]"  // two solutions: {x:2,y:3} and {x:4,y:5}
```

`$x` (without the pattern) is short for `$x=(_)`, and `@x` is short for `@x=(_*)`.  

```
Tendril("[3 4 $x $y]").match([3,4,5,6])  // one match, with bindings {x:5, y:6}
Tendril("[3 4 $x]").match([3,4,5,6])     // Does not match; scalar $x must match exactly one element
Tendril("[3 4 @x]").match([3,4,5,6])     // one match, with {x:[5,6]} interpreted as a slice because x is a group variable
Tendril("[3 4 $x]").match([3,4,[5,6]])   // one match, with {x:[5,6]} interpreted as a single item because x is a scalar

Tendril("[$x @y]").match([3,4,5,6])      // one match, with {x:3, y:[4,5,6]}
Tendril("[@x @y]").match([3,4,5,6])      // five matches, {x:[], y:[3,4,5,6]}, {x:[3], y:[4,5,6]}, {x:[3,4], y:[5,6]}, etc.

```
The type of variable matters **when performing replacements/edits**:
```
Tendril("[$x $x]").find([1, [2, 2]]).editAll({x:_=>['the','replacement']) // ['the','replacement'] treated as a scalar 
   // -> [1, ['the','replacement'],['the','replacement']]]
    
Tendril("[@x @x]").find([1, [2, 2]]).editAll({x:_=>['the','replacement'])  // ['the','replacement'] treated as a group/slice
   // -> [1, ['the','replacement', 'the','replacement']]]
```

**Groups in object patterns**

Object patterns only support group variables. Group one or more predicates, and the variable will bind to the set of key-value pairs that match at least one of them.
```
Tendril("{ @x=(/a/:_, /b/:_) /c/:_ }").match({Big:1, Cute:2, Alice:3}) // matches with binding {x:{Big:1, Alice:3}}
Tendril("{ @x=(/a/:_, /b/:_) /c/:_ }").match({Big:1, Cute:2, Alice:3}).edit({x:_=>{foo:"bar"}}) // -> {foo:"bar",Cute:2}
```

### Scalars

Scalars capture exactly one item. In arrays, this means one element. In objects, one key or one value.

```javascript
// Multiple solutions
Tendril("[ .. $x .. ]")
  .match(["a", "b"])
  .solutions()
// → SolutionSet with {x: "a"}, {x: "b"}

// First solution only
Tendril("[ $x .. ]")
  .match(["a", "b"])
  .solutions()
// → SolutionSet with {x: "a"}
```

Each possible binding creates a separate **solution**. The scalar `$x` must bind to a single value, so the first pattern generates two solutions (one for each element), while the second generates only one (binding to the first element).

### Groups

Groups capture zero or more items. In arrays, they capture subsequences. In objects, they capture sets of key-value pairs:

```javascript
Tendril("[ @x .. ]")
  .match(["a", "b"])
  .solutions()
  .toArray()
// → [
//   {x: []},
//   {x: ["a"]},
//   {x: ["a", "b"]}
// ]

Tendril("[ $x @y ]")
  .match([[1,2], [3,4]])
  .solutions()
  .first()
// → {x: [1,2], y: [[3,4]]}
```

Groups are exposed as plain arrays (for array slices) or plain objects (for object subsets). The **pattern** determines whether a binding is scalar (`$x`) or group (`@x`), which affects replacement semantics.

### Unification

When the same variable appears multiple times, all occurrences must match the same value (structural equality):

```javascript
[ $x .. $x ]       // matches ["a", "stuff", "stuff", "a"]
                   // $x unifies to "a"

[ $x .. $x ]       // does NOT match ["a", "other", "b"]
                   // $x can't be both "a" and "b"

[ $x $x=(/[ab]/) $y ]  // matches ['a', 'a', 'y']
                       // $x binds to 'a', matches /[ab]/, unifies

[ $x $x=(/[ab]/) $y ]  // does NOT match ['a', 'b', 'y']
                       // $x='a' doesn't unify with $x='b'
```

The syntax `$x=(PATTERN)` binds variable `$x` if `PATTERN` matches and the matched value is a single item. Bare `$x` is shorthand for `$x=(_)`.

### Using scalars to force single-item matches

Scalar variables are constrained to match only single items, not groups. This effectively adds another constraint:
```
[1? 2?]            // matches [], [1], [2], [1,2]

[@x=(1? 2?)]       // matches [], [1], [2], [1,2]
                   // solutionSet = [ {x:[]}, {x:[1]}, {x:[2]}, {x:[1,2]} ]
                   
// $x must bind to a scalar, so this can't match [] nor [1,2]
[$x=(1? 2?)]       // matches only [1] or [2]
                   // solutionSet = [ {x:1}, {x:2} ]
```

## Paths (breadcrumb notation)

Object assertions can navigate through nested structures using breadcrumb notation:

```javascript
{ a.b.c:d }        // equivalent to { a:{ b:{ c:d } } }
                   // descends through nested objects

{ a[3].c:d }       // equivalent to { a:[_ _ _ { c:d } ..] }
                   // array index then object key

Tendril("{ a.b.c[3].e:f }").match(object).hasMatch()   
                   // similar to Javascript (object?.a?.b?.c?.[3]?.e === "f")
```
The `..` operator skips arbitrary levels of nesting:

```javascript
{ a.b..c:d }       // matches 'c' at any depth under a.b
                   // e.g., {a: {b: {p: {q: {c: "d"}}}}}

{ ..password:$p }  // matches 'password' at any depth (including top-level)
                   // e.g., {password: "x"} or {user: {password: "x"}}

{ ..:$node }           // matches every node (Both leaves and internal nodes.)
```

Leading `..` means "start from root, navigate to any depth." Paths can combine dots, brackets, and skip operators freely.

### Propositional idiom

In addition to offering a concise notation, breadcrumbs enable a completely different idiom. Instead of creating a pattern that is structured like the data it is supposed to represent, you can create a pattern that looks like a sequence of propositions.

Both forms may be considered good idiomatic Tendril. But beware of mixing them, which may be confusing.)

To demonstrate with our "Hello worlds" example:

```
const data = {
  planets: {
    Jupiter: {size: "big"},
    Earth: {size: "small"},
    Ceres: {size: "tiny"}
  },
  aka: [
    ["Jupiter", "Jove", "Zeus"],
    ["Earth", "Terra"],
    ["Ceres", "Demeter"]
  ]
}

// Both of the following do the same job; both rely on 
// unification of symbols to perform relational joins. 

// Structural imitation idiom (regex-like)
const pattern = `{
  planets: { $name: { size: $size } }
  aka: [
    ..
    [ (?$name) .. $alias .. ]
    ..
  ]
}`

// Propositional idiom (like a list of propositions).
{
    planets.$name.size: $size
    aka[$i][0]: $name
    aka[$i][_]: $alias
}
```

The propositional idiom feels like a completely different language, but if you look carefully, you can see that it's just an object pattern `{ K1:V1 K2:V2 ... }` with some breadcrumbs thrown in.

## Quantifiers on Objects

Object quantifiers count matching key-value pairs after all matches are found (no backtracking):

```javascript
{ /a.*/:_#{2, 4} }     // object has 2-4 keys matching /a.*/
{ /a.*/:_ #{0} }       // object has no keys matching /a.*/
{ a:b remainder #{0} } // require no residual pairs (closed object)
```

The `#` quantifier follows an assertion and requires a specific count range. Unlike array quantifiers, object quantifiers operate globally over all key-value pairs, not sequentially.

## Lookaheads

Lookaheads test conditions without consuming data:

```javascript
(?PATTERN)        // positive lookahead (must match)
(!PATTERN)        // negative lookahead (must not match)
```

**Binding behavior:**
- Positive lookaheads (`(?P)`) commit bindings on success. If the pattern can match multiple ways (e.g., with wildcard keys), all binding possibilities are enumerated.
- Negative lookaheads (`(!P)`) never commit bindings, since the pattern must fail to match.

In arrays:

```javascript
[ (? $x=(/[ab]/)) $x .. ]  // first element must match /[ab]/, bind to $x

[ (! .. 3 4) .. ]           // array must not contain [3,4] subsequence
```

In objects:

```javascript
{ (? a:$x) b:$x }           // assert a exists, bind its value, require b equals it
{ (! secret:_) .. }         // assert no key named 'secret' exists
```

## Precedence

**High to low:**

1. Binding `=`
2. Optional `?`, quantifiers `+`, `*`, etc.
3. Breadcrumb operators `.`, `..`, `[]`
4. Adjacency/commas (in arrays and objects)
5. Alternation `|`, prioritized choice `else`
6. Key-value separator `:`, `:>`

Parentheses override precedence. Lookaheads always require parentheses.

Note: `|` and `else` have the same precedence but cannot be mixed without parentheses. Use `((A|B) else C)` or `(A else (B|C))` to combine them.

---

# API Overview

## Query API

The API uses a fluent, chainable interface:

```javascript
// Start by compiling your pattern.
const pattern = Tendril(patternString);

// Match pattern to data - returns an OccurrenceSet
let occSet = pattern.match(data)  // anchored match at root
let occSet = pattern.find(data)   // find at any depth (recursive scan)
let occSet = pattern.first(data)  // first occurrence only (short-circuits)

// Short-circuit methods (stop after first solution found):
if (pattern.hasMatch(data)) { ... }        // boolean: anchored match exists?
if (pattern.hasAnyMatch(data)) { ... }     // boolean: match exists anywhere? (scan)
```

## Occurrences and Solutions

An **Occurrence** is a location (path) where the pattern matched.
A **Solution** is a set of variable bindings at that location.

One occurrence can have multiple solutions (different ways to bind variables at that location).

```javascript
// OccurrenceSet: iterate over occurrences (locations)
for (const occ of pattern.find(data)) {
  console.log(occ.path(), occ.value());

  // Each occurrence has one or more solutions
  for (const sol of occ.solutions()) {
    console.log(sol.x, sol.y);  // bindings are properties
  }
}

// Get unique solutions across all occurrences
for (const sol of pattern.find(data).solutions()) {
  console.log(sol.toObject());  // {x: ..., y: ...}
}

// Convenience methods
occSet.first()              // first Occurrence or null
occSet.count()              // number of occurrences
occSet.solutions().first()  // first unique Solution or null
occSet.solutions().count()  // number of unique solutions
```

## Replacement and Editing

All edit/replace operations are **pure by default** — they return a new copy of the data.

```javascript
// replaceAll: replace $0 (entire match) at each occurrence
const result = pattern.find(data).replaceAll(99);
const result = pattern.find(data).replaceAll($ => $.x * 2);

// editAll: replace named variables at each occurrence
const result = pattern.find(data).editAll({x: 99});
const result = pattern.find(data).editAll($ => ({x: $.y, y: $.x}));
const result = pattern.find(data).editAll({x: $ => $.x * 2});

// Per-occurrence or per-solution editing
const result = occSet.first().edit({x: 99});
const result = occSet.solutions().first().edit({x: 99});

// Opt into mutation (rare)
pattern.find(data).editAll({x: 99}, {mutate: true});
```

**Scalar vs Group replacement:** The pattern determines semantics, not the value type.

```javascript
// Pattern with $x (scalar): array is a single value
Tendril("[$x ..]").find([[1,2], 3]).editAll({x: [9,9]})
// → [[9,9], 3]  (replaced [1,2] with [9,9] as one element)

// Pattern with @x (group): array elements are spliced
Tendril("[@x ..]").find([1, 2, 3]).editAll({x: [9,9]})
// → [9, 9, 3]  (spliced two elements where @x was)
```

**Replacement examples:**

```javascript
// Swap array elements
Tendril("[$x $y]").find([3, 4]).replaceAll($ => [$.y, $.x])
// → [4, 3]

// Redact passwords at any depth - two equivalent approaches:
const data1 = {user: {password: "secret", name: "Alice"}};

// Approach 1: Use .. with match() to search at any depth
const result1 = Tendril("{ ..password:$p }").match(data1).editAll({p: "REDACTED"});

// Approach 2: Use find() without .. to search at any depth
const result2 = Tendril("{ password:$p }").find(data1).editAll({p: "REDACTED"});

// ⚠️ Anti-pattern: Don't combine .. with find() - it's redundant!
// Tendril("{ ..password:$p }").find(data) // DON'T DO THIS
```

---

# When to Use Tendril

### ✅ Perfect fit

**1. Structural tree transformations (AST/VDOM manipulation)**

```javascript
// Macro expansion: <When>/<Else> → If node
const result = Tendril(`[
  ..
  @whenelse=(
    {tag:when/i children:$then}
    {tag:else/i children:$else}?
  )
  ..
]`).find(vdom).editAll($ => ({
  whenelse: [{
    tag: 'If',
    thenChildren: $.then,
    elseChildren: $.else || []
  }]
}))
```

**2. Relational queries joining data across paths**

```javascript
// Join users with their projects by ID
Tendril(`{
  users[$userId].name: $userName
  users[$userId].manager: $managerId
  projects[$projectId].owner: $managerId
  projects[$projectId].name: $projectName
}`).match(data).solutions()
```

**3. Deep search-and-replace with structural awareness**

```javascript
// Redact sensitive fields at any nesting level
const redacted = Tendril("{ password:$value }")
  .find(data)
  .editAll({value: "REDACTED"})
```

**4. Data extraction from semi-structured formats**

todo: example

### ⚠️ Works adequately

- Complex validation ("does this data match this schema?")
- Tree walking with pattern-based filtering
- Structural refactoring of configuration files

### ❌ Wrong tool

- **Simple path queries** - Use JSONPath/Lodash instead
- **Statistical analysis** - Use dedicated data libraries
- **Graph traversal** - Use graph databases
- **Performance-critical operations** - Backtracking can be expensive
- **Dynamic patterns** - Patterns must be known at "compile time"

---

# Reference

## Grammar

```

# --------------------------------------------------------------------
# Lexical structure
# --------------------------------------------------------------------

NUMBER        := /-?[0-9]+(\.[0-9]+)?/    # integers and decimals, positive or negative
INTEGER       := /[0-9]+/                 # non-negative integer (for quantifier counts)
BOOLEAN       := 'true' | 'false'
NULL          := 'null'
WILDCARD      := '_'                      # tokenized as kind 'any'
IDENT         := /[A-Za-z_][A-Za-z0-9_]*/

QUOTED_STRING := "..." | '...'            # supports \n \r \t \" \' \\ \uXXXX \u{...}
REGEX         := /pattern/flags           # JS RegExp; 'g' and 'y' flags not allowed
CI_STRING     := IDENT/i | QUOTED_STRING/i  # case-insensitive literal (no space before /i)

BAREWORD      := IDENT, except '_' 'true' 'false' 'null' 'else' are special-cased
LITERAL       := NUMBER | BOOLEAN | NULL | QUOTED_STRING | REGEX | CI_STRING | BAREWORD

# Whitespace and // line comments allowed between tokens everywhere.

# --------------------------------------------------------------------
# Core productions
# --------------------------------------------------------------------

ROOT_PATTERN := ITEM 

S_ITEM  := '$' IDENT
S_GROUP := '@' IDENT

ITEM :=
      ITEM_TERM ('|' ITEM_TERM)*              # alternation: enumerate all matches
    | ITEM_TERM ('else' ITEM_TERM)*           # prioritized: first match wins

ITEM_TERM :=
      '(' ITEM ')'
    | LOOK_AHEAD
    | S_ITEM '=' '(' ITEM ')'                      # binding with pattern
    | S_ITEM                                       # bare $x ≡ $x=(_)
    | S_GROUP '=' '(' A_GROUP ')'                  # binding with pattern
    | S_GROUP                                      # bare @x ≡ @x=(_*)
    | '_'
    | LITERAL
    | OBJ
    | ARR

LOOK_AHEAD :=
      '(?' A_GROUP ')'
    | '(!' A_GROUP ')'

# --------------------------------------------------------------------
# Arrays
# --------------------------------------------------------------------

ARR := '[' A_BODY ']'

A_BODY := (A_GROUP (','? A_GROUP)*)?           # commas optional

A_GROUP :=
      '..' A_QUANT?                            # spread token in arrays
    | A_GROUP_BASE A_QUANT?                    # quantifiers bind tight
      ( ('|' (A_GROUP_BASE A_QUANT?))*         # alternation: enumerate all
      | ('else' (A_GROUP_BASE A_QUANT?))*      # prioritized: first match wins
      )

A_GROUP_BASE :=
      LOOK_AHEAD
    | '(' A_BODY ')'                           # if >1 element => Seq node
    | S_GROUP '=' '(' A_BODY ')'               # group binding with pattern
    | S_GROUP                                  # bare @x ≡ @x=(_*)
    | S_ITEM '=' '(' A_BODY ')'                # scalar binding with pattern
    | S_ITEM                                   # bare $x ≡ $x=(_)
    | ITEM_TERM                                # including nested ARR/OBJ

A_QUANT :=
      '?' | '??'
    | '+' | '+?' | '++'
    | '*' | '*?' | '*+'
    | '{' INTEGER '}'                          # exact
    | '{' INTEGER ',' INTEGER? '}'             # {m,n} or {m,}
    | '{' ',' INTEGER '}'                      # {,n}

# --------------------------------------------------------------------
# Objects
# --------------------------------------------------------------------

OBJ := '{' O_GROUP* O_REMNANT? '}'
    # O_GROUPs parsed greedily until they stop parsing, then O_REMNANT attempted once at end

# Global remainder ("unmatched entries") is a special tail clause, only once, only at end.
# '%' is the new spelling (alias old 'remainder' if desired).

O_REMNANT :=
      S_GROUP '=' '(' '%' O_REM_QUANT? ')' ','?
    | '%' O_REM_QUANT? ','?
    | '$' ','?                                 # shortcut for '%#{0}'
    | '(!' '%' ')' ','?                       # closed-object assertion (equiv to '$')

O_REM_QUANT :=
      '#{' INTEGER (',' INTEGER?)? '}'         # #{m} or #{m,n} or #{m,}
    | '#{' ',' INTEGER '}'                     # #{,n}
    | '#' '?'                                  # shorthand for "0..∞" (same as #{0,})

# --------------------------------------------------------------------
# Object groups and terms
# --------------------------------------------------------------------

O_GROUP :=
      O_LOOKAHEAD
    | '(' O_GROUP* ')'                         # OGroup node
    | S_GROUP '=' '(' O_GROUP* ')'             # group binding in object context
    | O_TERM

O_LOOKAHEAD :=
      '(?' O_GROUP ')'
    | '(!' O_GROUP ')'

# Breadcrumb paths
O_TERM :=
      KEY BREADCRUMB* OBJ_ASSERT_OP VALUE O_KV_QUANT? O_KV_OPT?
    | '..' BREADCRUMB* OBJ_ASSERT_OP VALUE O_KV_QUANT? O_KV_OPT?   # leading .. allowed

KEY   := ITEM
VALUE := ITEM

# Object assert operators:
# ':'   = slice definition (allows bad entries unless constrained)
# ':>'  = implication / validate-only (forces bad#{0})
OBJ_ASSERT_OP :=
      ':'
    | ':>'

# KV quantifier counts the slice (not the bad set). Defaults are semantic, not syntactic.
O_KV_QUANT :=
      '#{' INTEGER (',' INTEGER?)? '}'         # #{m} or #{m,n} or #{m,}
    | '#{' ',' INTEGER '}'                     # #{,n}
    | '#' '?'                                  # shorthand for "0..∞" (same as #{0,})

# KV suffix: disables existence assertion for the slice.
# This is NOT a general object-group quantifier; it attaches only to a KV term.
O_KV_OPT :=
      '?'                                      # meaning: slice defaults to #{0,} instead of #{1,}

BREADCRUMB :=
      '..' KEY                                 # skip any depth, then match KEY
    | '..'                                     # if immediately followed by ':', ':>', or '?' then KEY := '_'
    | '.' KEY
    | '[' KEY ']'

```


## Semantics

### Matching Rules

- **Numbers:** strict equality for finite numbers; NaN and Infinity do not match numeric patterns
- **Booleans:** strict equality
- **Strings:** strict equality for literals; regex patterns match substrings unless anchored
- **null:** matches only `null` or `_`
- **Arrays:** matched positionally with backtracking
- **Objects:** matched via assertions (non-consuming, conjunctive, non-exclusive)

### Binding and Unification

Scalar bindings (`$x`) succeed when:
1. The pattern matches
2. The matched value is a single item (not a subsequence)
3. If `$x` was previously bound, the new value equals the old value (structural equality)

Group bindings (`@x`) succeed when:
1. The pattern matches (may match zero or more items)
2. If `@x` was previously bound, the new group equals the old group (structural equality)

Bare variables are shorthand: `$x` ≡ `$x=(_)`, `@x` ≡ `@x=(_*)`.

### Object Assertions (Slice-Based Semantics)

Each K:V term defines both a **slice** (the set of object fields that satisfy both k~K and v~V) and a set denoted by **bad** (k~K AND NOT(v~V)).

In the following short forms, `>` signifies "no bad values" (i.e. k~K => v~V), and `?` signifies that the key is optional:

| Short form | Equivalent long form | Meaning |
|------------|----------------------|---------|
| `K:V`      | `K:V  #{1,} bad#{0,}`  | At least one matching k,v |
| `K:>V`     | `K:V  #{1,} bad#{0}`   | At least one matching k,v, and no bad values |
| `K:V?`     | `K:V  #{0,} bad#{0,}`  | No assertion (use for binding) |
| `K:>V?`    | `K:V  #{0,} bad#{0}`   | No bad values |

Binding keys or values:
```
{ $myKey=(K):$myVal=(V) }
```

Binding slices:
```
{ @slice1=(K1:V1)       }   # bind one slice
{ @slice2=(K2:V2 K3:V3) }   # bind a union of slices
{ @x=(K1:V1) @x=(K2:V2) }   # asserting two slices are the same
```

`%`, pronounced "remainder", defines the slice of fields that didn't fall into any of the declared slices or bad sets; in other words, the **entries whose keys did not match any of the terms, regardless of whether the values matched.**  (The predominant use case is the fall-through of unrecognized fields, not the fall-through of invalid values.)

It may appear only once in the object pattern, only at the end. You can bind it or quantify it.

```
{ K1:V1 K2:V2 }             # No assertion about remainder
{ K1:V1 K2:V2 % }           # Remainder is nonempty
{ K1:V1 K2:V2 $ }           # Remainder is empty (short for %#{0})
{ K1:V1 K2:V2 %#{3,4} }     # Remainder is of size 3-4
{ K1:V1 K2:V2 @rest=(%) }   # Bind it
```

Assertions are evaluated non-exclusively: a single key-value pair may satisfy multiple assertions.

### Object Evaluation Order

Object terms produce results consistent with **left-to-right evaluation**. Bindings established by earlier terms are visible to later terms. This enables patterns where one term binds a variable and a subsequent term constrains it.

Each term selects a **witness** — one key-value pair where both K and V match. If multiple pairs qualify, the matcher branches, producing one solution per witness:

```javascript
{ /a.*/:$x }  matching {a1:1, a2:2}
// Two solutions: {x:1} and {x:2} — one witness each
```

**`:>` with unbound variables:**

When V contains an unbound variable like `$x`, matching V against a value *binds* `$x`. This means the value is in the slice, not the bad set. Therefore `:>` is not a "universal equality" operator — it means "no bad entries exist," where bad means "fails to match V":

```javascript
{ /a.*/:>$x }  matching {a1:1, a2:2}
// Succeeds with two solutions: {x:1} and {x:2}
// Each value matches $x (by binding), so no bad entries

{ /a.*/:>1 }   matching {a1:1, a2:2}
// Fails — a2:2 is a bad entry (2 doesn't match 1)
```

**Universal equality idiom:** To enforce that all matching keys have the same value, bind first, then use `:>` with the bound variable:

```javascript
{ /a.*/:$x  /a.*/:>$x }  matching {a1:1, a2:2}
// Fails — first term binds x, second requires ALL /a.*/
// values to match that x. With x=1, a2:2 is a bad entry.

{ /a.*/:$x  /a.*/:>$x }  matching {a1:1, a2:1}
// Succeeds with x=1 — all values match
```

### Quantifiers

**Array quantifiers** operate sequentially with backtracking. Greedy quantifiers consume as much as possible, lazy quantifiers as little as possible, possessive quantifiers do not backtrack.

**Object quantifiers** count matching pairs globally after all matches are found, then assert the count is within range. No backtracking.

### Lookaheads

Lookaheads (`(?P)`, `(!P)`) test whether pattern P matches at the current position without consuming input. Positive lookaheads commit bindings from successful matches and enumerate all binding possibilities. Negative lookaheads (`(!P)`) assert that P does NOT match and never commit bindings.

## Conventions

`~=` and `===` and `≡` appear in examples as shorthand for illustration only. They are not part of Tendril syntax.

- `foo ~= bar` means `Tendril("foo").matches(bar) === true`
- `p1 === p2` indicates semantic or syntactic equivalence

The data model is JSON-like: objects, arrays, strings, numbers, booleans, null. Regex literals use JavaScript regex syntax.

---

**End of Specification**

---

# Discussion

## Open Design Questions

- **Bare identifiers as strings** is convenient, but creates ambiguity with future keywords and makes error messages harder ("did you mean a string or a variable?"). Already special-cased `_ true false null bad` etc; this tends to grow.

- **`find()` + `..` redundancy**: The admonition ("don't combine") is good, but users will do it anyway. Could make it harmless by having the engine detect redundant `..` in root-object terms during scan.

- **Edits with overlapping solutions**: The v2 API uses deterministic "first solution per occurrence" semantics. `editAll` iterates over occurrences (locations) and applies edits from the first solution at each location. This avoids cross-solution conflicts while still editing all locations. For fine-grained control, use `occurrence.edit()` or `solution.edit()`.

---

# Roadmap

## Solution Explosion Limiter

Add per-match and total limits on solution count, with a clear error when exceeded. We can implement this by allowing multiple hooks to be installed at once and letting this be a default hook.

## Debug Trace

Add a "debug trace" story that explains *why* a pattern failed or multiplied. (Hook infrastructure exists.)

## Streaming/Generator-Based Matching

The current short-circuit optimization (`hasMatch`, `hasAnyMatch`, `firstMatch`) uses exception-based early termination. While effective, this approach cannot resume enumeration after stopping.

A future improvement would refactor the engine to use generators/iterators for solution emission, enabling:
- **Lazy evaluation**: Solutions generated on-demand, not all at once
- **Resumable iteration**: Stop and continue enumeration as needed
- **Memory efficiency**: No need to materialize all solutions before filtering
- **Cancellation tokens**: Clean cancellation without exception overhead

This would make iteration over occurrences and solutions truly streaming rather than eagerly collecting all results.


---

# Testing todos


Todo: highlight the following set of 'golden tests', set them up as smoke tests.

N.B. These tests are good in concept but have not been proofread yet for correctness.

Awesome — golden tests are the best ROI because they exercise “the whole stack” (parser → engine → API → edit/replace/site tracking) in a way that unit tests often don’t.

Below is a **small-but-potent golden suite** (8 tests) that together hits most of Tendril’s surface area. Each test has:

* a realistic data fixture
* one or more patterns
* an expected output (bindings / transformed structure)

You can drop these into `test/golden/*.test.js` (or split by topic). I’ll write them as “specs” you can translate into your harness.

---

## Golden 1: OpenAI Chat Completions response → stitch all text

**Purpose:** deep paths + array scanning + binding enumeration + solution aggregation + stable ordering sanity.

**Fixture (representative):**

```js
const resp = {
  id: "chatcmpl_x",
  object: "chat.completion",
  choices: [
    { index: 0, message: { role: "assistant", content: [
      { type: "output_text", text: "Hello" },
      { type: "output_text", text: ", world" },
      { type: "refusal", text: "nope" }
    ]}},
    { index: 1, message: { role: "assistant", content: [
      { type: "output_text", text: "!" }
    ]}}
  ]
};
```

**Pattern:**

* Find all text fragments of type `output_text` anywhere:

```js
const pat = `{ ..:{type:output_text text:$t} }`;
```

**Expected:**

* `solutions().toArray().map($.t).join("") === "Hello, world!"`
* Also assert count is 3, and no “refusal” text appears.

---

## Golden 2: OpenAI streaming-ish “delta” chunks → only final assembled text

**Purpose:** alternation + optional keys + find() vs match() + object assertions.

**Fixture:**

```js
const chunks = [
  { choices: [{ delta: { content: "Hel" } }] },
  { choices: [{ delta: { content: "lo" } }] },
  { choices: [{ delta: { refusal: "no" } }] },
  { choices: [{ delta: { content: "!" }, finish_reason: "stop" }] }
];
```

**Pattern:**

```js
const pat = `{ ..content:$t }`;
```

**Expected:**

* Extract `["Hel","lo","!"]` and join to `"Hello!"`
* Ensure refusal is ignored.

(You can also add a second pattern verifying the finish reason exists somewhere, e.g. `{ ..finish_reason:stop }` hasMatch.)

---

## Golden 3: HTML/VDOM macro expansion: `<FormattedAddress .../>` → `<div>...</div>`

**Purpose:** array group binding + object matching + editAll group replacement + path correctness.

**Fixture (simple VDOM):**

```js
const vdom = [
  { tag: "p", children: ["Ship to:"] },
  { tag: "FormattedAddress", props: { type: "oneLine", model: "uAddress" }, children: [] },
  { tag: "p", children: ["Thanks!"] }
];
```

**Pattern (match the node):**

```js
const pat = `[
  ..
  $node=({ tag:FormattedAddress props:{ type:oneLine model:$m } })
  ..
]`;
```

**Edit:**

* Replace the matched node (`$node`) with a div template. Since `$node` is scalar, easiest is replace whole match `$0` only if you match the node itself; but in this pattern you’re matching an *array*, so prefer **group-edit**:

Better pattern for in-place replacement:

```js
const pat2 = `[
  ..
  @x=({ tag:FormattedAddress props:{ type:oneLine model:$m } })
  ..
]`;
```

Then:

```js
.editAll($ => ({
  x: [{ tag: "div", children: [`{${$.m}.name}, {${$.m}.street}`] }]
}))
```

**Expected:**

* vdom now contains `{tag:"div", ...}` where `FormattedAddress` was.
* Surrounding nodes unchanged.

---

## Golden 4: Config validation with universal object semantics + closed object

**Purpose:** universal `K:V`, optional `?:`, `(!remainder)`.

**Fixture:**

```js
const cfgOK = { x_port: 8080, x_host: "localhost", id: "abc" };
const cfgBad = { x_port: "8080", x_host: "localhost", id: "abc" };
```

**Pattern:**

```js
// all x_* must be number OR string? pick one and test.
// Here: x_* must be number
const pat = `{ /^(x_)/: $v=(123|0|1|2|3|4|5|6|7|8|9|/^\d+$/) }`;
```

That’s messy if you don’t have “number predicate”. Better golden test using existing primitives:

```js
const pat = `{ /^x_/: $n=(/^\d+$/) }`;  // if x_* are strings of digits
```

And add a closed object case:

```js
const closed = `{ id:_ /^x_/:/^\d+$/ (!%) }`;
```

**Expected:**

* `closed` matches `{id:"abc", x_port:"8080", x_host:"123"}` only if *every* key is `id` or `x_*` and values satisfy.
* A stray key should fail due to `(!remainder)`.

(If you prefer to validate “numbers are numbers”, use literal numeric fixtures and match with `_` and key coverage; the point is universal + remainder.)

---

## Golden 5: JSON “join” across paths (your planets/aka example)

**Purpose:** root match + key binding + lookahead + array `..` + producing many solutions.

Use your README example almost verbatim (it’s excellent).

**Expected:**

* exactly the 7 “Hello, …” strings
* and verify it still works if you reorder `aka` rows or add unrelated keys (resilience)

---

## Golden 6: Redaction at any depth, two equivalent styles

**Purpose:** find() recursion vs `..` path recursion, and editAll correctness.

**Fixture:**

```js
const data = {
  user: { password: "secret", profile: { password: "also" } },
  password: "top"
};
```

**Patterns:**

1. `Tendril("{ password:$p }").find(data).editAll({p:"REDACTED"})`
2. `Tendril("{ ..password:$p }").match(data).editAll({p:"REDACTED"})`

**Expected:**

* both yield the same transformed structure
* all password fields redacted
* other fields unchanged

---

## Golden 7: Non-trivial array slicing + splice offset correctness

**Purpose:** group splices on same array; ensures your `offset` logic in `applyEdits` is correct.

**Fixture:**

```js
const arr = [1, 2, 3, 4, 5, 6];
```

**Pattern:**

```js
const pat = `[ .. @mid=(3 4) .. ]`;
```

**Edit:**
Replace `@mid` with 3 elements:

```js
.editAll({ mid: [30, 40, 50] })
```

**Expected:**
`[1,2,30,40,50,5,6]`

Then a second edit in same run that splices earlier and later groups (two group sites) is even better:

```js
const pat2 = `[ @a=(1 2) .. @b=(5 6) ]`;
editAll({ a:[10], b:[60,70,80] })
```

Expected:
`[10,3,4,60,70,80]`

---

## Golden 8: Object group capture + replace with new props

**Purpose:** object `@x=(...)` capture, replacement semantics (delete captured keys then insert).

**Fixture:**

```js
const obj = { Big:1, Cute:2, Alice:3, c:99 };
```

**Pattern:**

```js
const pat = `{ @x=(/a/:_, /b/:_) /c/:_ }`;
```

**Edit:**

```js
.editAll({ x: { foo: "bar" } })
```

**Expected:**

* keys matched by `/a/` or `/b/` removed (`Big`, `Alice`)
* replaced with `{foo:"bar"}`
* keys `Cute` and `c` remain
  Result:

```js
{ foo:"bar", Cute:2, c:99 }
```

---

# Minimal MVP golden suite layout

If you want a small file count:

* `test/golden/openai-text-assembly.test.js` (Golden 1 + 2)
* `test/golden/vdom-macro-expansion.test.js` (Golden 3)
* `test/golden/joins-and-lookahead.test.js` (Golden 5)
* `test/golden/redaction.test.js` (Golden 6)
* `test/golden/remainder-and-universal.test.js` (Golden 4 + 8)
* `test/golden/splice-offsets.test.js` (Golden 7)

# END "Golden Tests"


# Real-world examples 

This is more sophisticated than the If/Else example, but it's genuinely useful and demonstrates real power. A few syntax corrections:

```javascript
Tendril(`{
  ..:@label=({
    tag: label, 
    props: {for: $id}, 
    children: [$labelText=(/.*/)]
  })
  ..:{
    tag: input, 
    props: {id: $id, type: text},
    @placeholder=(placeholder:_?)
  }
}`).match(data).editAll({
  label: undefined,  // delete it
  placeholder: $ => ({placeholder: $.labelText})
})
```

This showcases:

- **Breadcrumbs** (`..:{...}`) finding elements at any depth
- **Backreference** (`$id`) joining label to input
- **Group variables** enabling surgical edits (delete label, update placeholder)
- **Optional patterns** (`placeholder:_?`) handling cases where placeholder exists or not
- **Practical transformation** that's immediately useful

The complexity tradeoff: it shows more features but requires more explanation. For the README's second example slot, this might be too much. It would work better in one of the specialized guides (like the "Regex for Structures" guide showing find-and-replace).

For the README, I'd still lean toward the If/Else merge—simpler pattern, clearer "before/after" mental model, shows the core ideas without requiring breadcrumb or group-variable knowledge.

Save the label/input example for a "Real-World Examples" section or one of the specialized guides?


= Current work

I am thinking of making some changes to the syntax to address some unpleasantness before publishing a beta. 


1.  Allow array slice expressions for as the top-level search pattern, `find("(a b)")` so that you don't have to say `find("[... @this=(a b) ...]")`, which makes replace operations harder.


3. '..' is nonintuitive.

arrays: use `[... foo ...]`; also accept `[… foo …]`

Paths: use `**` instead:  `{ foo.**.bar }`

4. Add a very minimal EL to support
    - is a number
    - is a string
    - coerce to numbr/string/boolean
    - Future direction:
        - Numerical comparison, support e.g. ` [ $x where ($x<3) ] `
        - simple invertible arithmetic, support e.g. `{ foo[1+$x]:bar }`

5. Objects semantics cleanup proposal

**This proposal would replace the existing spec about how object matching works, Which was confusing and somewhat incoherent. .** 

Object patterns are conjunctions of K:V assertions, where K and V are patterns. For example:

    `{ status:good userId:$id } 
     // match all good users, enumerating userIds`

### `K:V` - existential match

Meaning:  It asserts that there is at least one k:v in the object such that (k~K AND v~V).

Bound to an object slice, as in `@foo=( K:V)`, the slice comprises all k:v where k~K (including pairs where v does not match V). For example, @s=(/a/:1) matching {a1:1, a2:2} binds s to {a1:1, a2:2}.

It is a domain-wide generator: it iterates all properties k:v, attempting to match (k~K AND v~V), ignoring failures, and may bind fresh variables per property. Variables unbound at entry may be bound independently for each k:v. Variables already bound before the term are effectively constants, and must unify across all keys.

### `K:V !!` - no counterexamples

Meaning:

1. It asserts that there is at least one k:v in the object such that (k~K AND v~V).
2. It asserts that for all k:v in the object, (k~K implies v~V).

Each value is matched independently against V. This does not require that all values are identical, only that each individually satisfies V.

Bound to an object slice, as in `@foo=( K:V)`, the slice comprises all k:v in the object such that k~K (which then implies v~V)

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

5.5. Categorization in object syntax.

The pattern `K:(V1 else V2 else V3)` is just a special case of `K:V` where `V` is an else-chain. Therefore, the else chain is applied independently to each value, routing that property to the first Vi that matches its value, forming a partition of the domain (no overlap).

So the idiom for categorization into buckets, including a fallback bucket is

    `K:A else B` // rules of precedence make this `K:(A else B)`
    `K:A else _` // fallback bucket

This idiosyncratic syntax is for capturing these buckets as object slices is:

    `{
         K: V1      ->@S1 
            else V2 ->@S2
            else V3 ->@S3 // etc.
     }`

for example,

```
    { _:: (OK|perfect)->@goodStatus else _->@others } 
    // matches { proc1:"OK", proc2:"perfect", proc3:"bad"}
    // with solution = 
    // {
    //    goodStatus: { proc1:"OK", proc2:"perfect"}
    //    others:     { proc3:"bad"}
    // }
```

\[Note: This right arrow syntax is idiosyncratic and a bit inconsistent with the rest of the document. It is meant to emphasize that the k:v slices (not V slices) are being collected across multiple keys rather than simply enclosing part of the V pattern with parentheses. ]

6. Defaults for nomatching bindings?

7. Recursive descent

A breadcrumb path is really just an array of instructions for navigating somewhere else in the structure.

We already have p.**.q indicating remote ancestry. This works only for the simple case of chained parent-child relationships. It is equivalent to `p(._)*.q` -- We are already treating this path as a **pattern on the array of navigation instructions**.

 This could be generalized to navigations other than simple keyed/indexed child descent.

For example, what if you wanted to find a cycle in a directed graph like `[ [$from,$to]* ]`?

Introduce a descent rule syntax `..↳($from, $to where PATTERN )` Which for this directed graph example would be 
    `↳($a,$b where $b=($a[1]))`

Then a cyclic graph is `[... $start..(↳($a,$b where $b=($a[1])):$start) ...]`

(You don't need to point out that this particular example would be very inefficient, and that we'd need a 'visited' flag and a depth limit, and that this is a complication to the language that is prima facie unjustified. )
    ``



8. This is a lame suggestion, but I'm keeping it because it's not entirely uninteresting.
   hmm. A simpler version that accomplishes the same thing *and* also modifies the structure in place to materialize the required view - that's a good thing or a bad thing depending on what you're driving for, but it enables super simple inline edits; If you really don't like that, it could be, as you say, a virtual edit that is removed at the end.

Add a force operator❗. The forced expression cannot be ambiguous or have unbound variables.

      "[$i { p.q[$i]: $r }]" ~= [3 {p: {q: ['a','b','c','d']}}]
```
data = {
    users: [ {id:1,ability:11,team:X},
             {id:2,ability:12,team:X}, 
             {id:3,ability:12,team:Y}, 
             {id:4,ability:13,team:Y}, 
             {id:5,ability:14,team:Y},
             {id:6,ability:11,team:Z},
             {id:7,ability:12,team:Z},
             {id:8,ability:12,team:Z},
             ]
    abilities: [ {id:11,name:wizard}
                 {id:12,name:miner}
                 {id:13,name:priest}
                 {id:14,name:leader}]
    teams: [{id:X}, {id:Y}]
}
Desired output: pairs of teams with identical abilities
[ 
   ["X", "Z",  [wizard,miner]],
]
  



```
data.teams[_]:{name:$tname, act[$actid]:$uid‼️}

data.teams[_]:{name:$tname, members:[]} // teams with no users
data.teams[_]:{name:$tname, activeMembers:[$first, ...]} // teams with at least one active user


So: declarative views/extensions that become part of the matchable shape.
extend data.teams[_] as $t with {
members: data.users[_] where .teamId = $t.id,
activeMembers: .members where .id in data.activities[_]:{targetType:"user", targetId:*}
}
Now patterns can just say:
data.teams[_]:{name:$tname, members:[]} // teams with no users
data.teams[_]:{name:$tname, activeMembers:[$first, ...]} // teams with at least one active user
The data "looks like" it has inline arrays of members even though it doesn't. Patterns stay intuitive because you're still matching shapes — the shapes are just richer than the raw JSON.


