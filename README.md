
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
Tendril("[1 ... 5]")
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
  ** $L=( { tag:'label', props:{for:$id}, children:[$text]   } )
  **      { tag:'input', props:{id:$id @p=(placeholder:_?) } }
}`)
.match(vdom)
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
_string        // typed wildcard: matches any string
_number        // typed wildcard: matches any number (including NaN, Infinity)
_boolean       // typed wildcard: matches true or false
```

Strings can be written as barewords (alphanumeric identifiers) or quoted. The `/i` suffix on literals matches case-insensitively but requires exact match (unlike regex which matches substrings).

**Typed wildcards** (`_string`, `_number`, `_boolean`) match values of the corresponding JavaScript type. These are reserved—variable names cannot start with underscore.

Regex patterns use JavaScript regex syntax and match against string values only. Don't forget that JavaScript regexes match on substrings.

## Arrays

Square brackets indicate arrays. Items in arrays match in sequence left to right (just as characters in regexes do).

```javascript
[1 2 3]        // matches [1,2,3] exactly
[1 2]          // does NOT match [1,2,3] — too short
[1 2 _]        // matches [1,2,3] — wildcard _ matches the third item
[1 ... 3]      // matches [1,2,3] — ... matches any subsequence
[1 ...]        // matches [1,2,3] and [1] and [1,99,100]
[... 1 2 3 ...]  // matches [1,2,3] — ... can match zero elements
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
{m,n}, {m,}, {m}   // specific repetitions (greedy, nonpossessive)

...                // lazy wildcard group (equivalent to _*?)
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
[(! ... 3 4) ...]   // matches arrays NOT containing subsequence [3,4]
                     // e.g., [4, 3, 2, 1] matches, [1, 2, 3, 4] doesn't
```

## Objects

Object patterns differ fundamentally from array patterns. Rather than matching positionally, object patterns are composed of **field clauses**—each making an assertion about key-value pairs, in the form `K:V`:
```
    { a:1 b:$x }  // The object contains a property named 'a' with value 1,
                  // and a property named 'b' with value bound to $x.  
```

### Slice-Based Semantics

Each field clause `K:V` defines a **slice**: the set of the object's properties where the key matches K AND the value matches V. It also implicitly defines a **bad** set: pairs where the key matches K but the value does NOT match V.

| Short form | Meaning |
|------------|---------|
| `K:V`      | At least one matching k:v pair exists |
| `K:>V`     | At least one matching k:v pair exists, AND no bad entries (implication: all keys matching K must have values matching V) |
| `K:V?`     | No existence requirement (use for optional binding) |
| `K:>V?`    | No bad entries allowed (but key doesn't need to exist) |

The `:>` operator, visually reminiscent of an arrow, adds an implication constraint: if a key matches K, its value MUST match V.

```javascript
{ a: 1 }            // matches {"a":1} and {"a":1, "b":2}
                   // At least one 'a' with value 1

{ /a.*/: 1 }        // matches {"ab":1, "ac":2}
                   // At least one /a.*/ key with value 1 (bad entries allowed)

{ /a.*/:> 1 }       // does NOT match {"ab":1, "ac":2}
                   // "ac":2 is a bad entry (key matches /a.*/, value doesn't match 1)

{ /a.*/:> 1 }       // matches {"ab":1, "xyz":99}
                   // "xyz" doesn't match /a.*/, so it's not a bad entry

{ a: 1 ? }           // matches {} and {"a":1} and {"a":2}
                   // No existence requirement - just for binding

{ a:> 1}            // matches {"a":1} and {"a":1,"b":2}, but NOT {"a":2}
                   // 'a' must exist with value 1; 'b' is uncovered, irrelevant.
```

Commas between clauses are optional. Multiple clauses can match the same key-value pair.

```javascript
{ /a|b/:/x/ /b|c/:/y/ }  // matches {"b":"xy"} - "b":"xy" satisfies both field clauses
```
Field clauses are evaluated left-to-right, so bindings from earlier clauses are
visible to later ones.

### Remainder

The **remainder** (spelled `%`, pronounced "remainder") is a special clause representing the slice of properties whose *keys* (ignoring *values*) are not touched (do not match any K of the K:V clauses).  

```
{ a:b }            // matches {"a":"b", "c":"d"}
                   // remainder is {"c":"d"} 

{ a:b % }          // matches {"a":"b", "c":"d"}
                   // '%' asserts a nonempty remainder

{ a:b %#{0} }      // does NOT match {"a":"b", "c":"d"}
                   // '%#{0}' requires empty remainder (closed object)

{ a:_ %#{0} }      // matches iff 'a' is the only key

{ /a.*/:1 %#{0} }  // matches {"ab":1, "ac":2}
                   // Both 'ab' and 'ac' are touched by /a.*/
                   // Bad entries (ac:2) are touched, just not in slice
```

Bind the remainder to capture it:

```
{ a:b @rest=(%) }    // matches {"a":"b", "c":"d"}, binds {"c":"d"} to @rest
                     // Note: requires nonempty remainder

{ a:b @rest=(%?) }   // also matches {"a":"b"}, binds {} to @rest
                     // %? allows empty remainder
```

### Operators on Field Clauses

Alternation applies to keys, values, or entire field clauses:

```
{ (a|b):c }        // key is 'a' or 'b', value is 'c'
{ a:(b|c) }        // key is 'a', value is 'b' or 'c'
{ a:b | c:d }      // either field clause (or both)
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
Tendril("[... $x=(2|4) $y=(_) ...]").match([1, 2, 3, 4, 5])  // two solutions: {x:2,y:3} and {x:4,y:5}
```
You cannot use both '@x' and '$x' in the same pattern.  (The JS API treats them as the same variable 'x'. The sigil is a type marker.) 

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
Tendril("[$x $x]").find([1, [2, 2]]).editAll({x: _ => ['the','replacement']}) // ['the','replacement'] treated as a scalar
   // -> [1, ['the','replacement'], ['the','replacement']]

Tendril("[@x @x]").find([1, [2, 2]]).editAll({x: _ => ['the','replacement']})  // ['the','replacement'] treated as a group/slice
   // -> [1, ['the','replacement', 'the','replacement']]
```

**Capturing field clauses as slices**

To capture a set of matching key-value pairs, use a group variable with one or more field clauses. (Scalar variables work normally within K or V positions, but capturing entire field clauses requires a group.)
```
Tendril("{ @x=(/a/:_, /b/:_) /c/:_ }").match({Big:1, Cute:2, Alice:3}) // matches with binding {x:{Big:1, Alice:3}}
Tendril("{ @x=(/a/:_, /b/:_) /c/:_ }").match({Big:1, Cute:2, Alice:3}).edit({x:_=>{foo:"bar"}}) // -> {foo:"bar",Cute:2}
```

### Scalars

Scalars capture exactly one item. In arrays, this means one element. In objects, one key or one value.

```javascript
// Multiple solutions
Tendril("[ ... $x ... ]")
  .match(["a", "b"])
  .solutions()
// → SolutionSet with {x: "a"}, {x: "b"}

// First solution only
Tendril("[ $x ... ]")
  .match(["a", "b"])
  .solutions()
// → SolutionSet with {x: "a"}
```

Each possible binding creates a separate **solution**. The scalar `$x` must bind to a single value, so the first pattern generates two solutions (one for each element), while the second generates only one (binding to the first element).

### Groups

Groups capture zero or more items. In arrays, they capture subsequences. In objects, they capture sets of key-value pairs:

```javascript
Tendril("[ @x ... ]")
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
[ $x ... $x ]      // matches ["a", "stuff", "stuff", "a"]
                   // $x unifies to "a"

[ $x ... $x ]      // does NOT match ["a", "other", "b"]
                   // $x can't be both "a" and "b"

[ $x $x=(/[ab]/) $y ]  // matches ['a', 'a', 'y']
                       // $x binds to 'a', matches /[ab]/, unifies

[ $x $x=(/[ab]/) $y ]  // does NOT match ['a', 'b', 'y']
                       // $x='a' doesn't unify with $x='b'
```

Unification works the same way in objects—variables unify across field clauses, and even between keys and values:

```javascript
// Cross-clause unification: name must match on both paths
{ name:$name  creditCard:{name:$name} }
// Matches if person's name equals the name on their credit card

// Key-value unification: the key must equal the nested id
{ $id:{id:$id} }
// Matches {"3": {id: "3", name: "Alice"}} but not {"3": {id: "4", name: "Bob"}}

// Self-referential: all keys must equal their values
{ $x:$x }
// Matches {a: "a", b: "b"} but not {a: "b"}

// Caution: wildcards with unbound variables can explode solutions
{ _:$x }
// With $x unbound: cannot fail, every value becomes a separate solution
// With $x already bound: asserts all values equal $x
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

### Guard Expressions

Guard expressions constrain variable bindings with boolean conditions. The syntax extends the binding form with the `where` keyword:

```javascript
$var=(PATTERN where EXPRESSION)
```

The pattern must match, AND the expression must evaluate to true:

```javascript
$x=(_number where $x > 100)           // matches numbers greater than 100
$x=(_string where size($x) >= 3)      // matches strings of length 3+
$n=(_number where $n % 2 == 0)        // matches even numbers
```

**Operators:** `< > <= >= == != && || ! + - * / %`

Standard precedence applies. `&&` and `||` short-circuit. String concatenation uses `+`:

```javascript
$x=(_string where $x + "!" == "hello!")  // matches "hello"
```

**Functions:**
- `size($x)` — string length, array length, or object key count
- `number($x)`, `string($x)`, `boolean($x)` — type coercion (JS semantics; `number()` fails on non-numeric strings)

**Multi-variable guards:**

Guards can reference other variables. Evaluation is **deferred** until all referenced variables are bound:

```javascript
// Match objects where min < max
{ min: $a=(_number where $a < $b), max: $b=(_number) }

// The guard "$a < $b" waits until both $a and $b are bound
{min: 1, max: 10}   // matches: 1 < 10
{min: 10, max: 1}   // fails: 10 < 1 is false
```

**Error handling:**

If an expression errors, the match branch fails silently—no exception is thrown.

```javascript
$x=(_string where $x * 2 > 10)  // never matches (can't multiply string)
$x=(_number where $x / 0 > 0)   // never matches (division by zero)
```

**Arithmetic strictness:** Unlike JavaScript, the expression language treats division by zero (`x/0`) and modulo by zero (`x%0`) as errors that cause match failure, rather than silently producing `Infinity` or `NaN`.

**Restrictions:**
- Guards only work with scalar bindings (`$x`), not group bindings (`@x`)
- All variables referenced in a guard must eventually be bound, or the match fails

## Paths (breadcrumb notation)

Field clauses can navigate through nested structures using breadcrumb notation:

```javascript
{ a.b.c:d }        // equivalent to { a:{ b:{ c:d } } }
                   // descends through nested objects

{ a[3].c:d }       // equivalent to { a:[_ _ _ { c:d } ...] }
                   // array index then object key

Tendril("{ a.b.c[3].e:f }").match(object).hasMatch()   
                   // similar to Javascript (object?.a?.b?.c?.[3]?.e === "f")
```
The `**` operator (glob-style) skips arbitrary levels of nesting:

```javascript
{ a.b.**.c:d }     // matches 'c' at any depth under a.b
                   // e.g., {a: {b: {p: {q: {c: "d"}}}}}

{ **.password:$p } // matches 'password' at any depth (including top-level)
                   // e.g., {password: "x"} or {user: {password: "x"}}

{ **:$node }       // matches every node (Both leaves and internal nodes.)
```

Leading `**` means "start from root, navigate to any depth." Paths can combine dots, brackets, and skip operators freely.

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
    ...
    [ (?$name) ... $alias ... ]
    ...
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
{ a:b %#{0} }          // require no residual pairs (closed object)
```

The `#` quantifier follows a field clause and requires a specific count range. Unlike array quantifiers, object quantifiers operate globally over all key-value pairs, not sequentially.

## Lookaheads

Lookaheads test conditions without consuming data:

```javascript
(?PATTERN)        // positive lookahead (must match)
(!PATTERN)        // negative lookahead (must not match)
```

**Binding behavior:**
- Positive lookaheads (`(?P)`) commit bindings on success. If the pattern can match multiple ways (e.g., with wildcard keys), all binding possibilities are enumerated.
- Negative lookaheads (`(!P)`) never commit bindings, since the pattern must fail to match.

### "Same-values" idiom

❌ "K:>V" does not mean all values are the same; it merely means all values (individually) match V.

```
    // Does not demand that all the colors are the same.
    "{ $k=(/color/):>$c }" matches {backgroundColor:"green", color:"white"}
    // => Solutions = [{k:"backgroundColor", c:"green"}, {k:"color",c:"white"}] 
```

✅ Use this idiom to enforce universal equality over values:

```
    "{ $k=(/color/):$c  $k=(/color/):>$c }"
```

It works because variables unify across terms.

### Lookaheads `(? )`, negative lookaheads `(! )`

In array context, a positive lookahead matches the next subsequence but does not consume it.
```
[ (? $x=(/[ab]/)) $x ... ]  // first element must match /[ab]/, bind to $x
```
A negative look ahead cannot have bindings.
```
[ (! ... 3 4) ... ]         // array must not contain [3,4] subsequence
```

In objects, a positive lookahead is redundant. But you can have negative lookaheads:

```
{ (! secret:_) }      // assert no key named 'secret' exists
{ (! secret:>yes) }   // assert no key named 'secret' exists, or some secret key does not have value "yes"

```

## Precedence

**High to low:**

1. Binding `=`
2. Optional `?`, quantifiers `+`, `*`, etc.
3. Breadcrumb operators `.`, `**`, `[]`
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

All edit/replace operations are **pure by default** — they return a new copy of the data (unless you specify mutate:true).

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

// Opt into mutation - If you want to perform surgery on the original data rather than a copy.
pattern.find(data).editAll({x: 99}, {mutate: true});
```

> **Note:** The identifier `0` is reserved internally to represent the entire match. You cannot use numeric identifiers like `$0` in patterns (the grammar requires identifiers to start with a letter or underscore), but the API exposes the whole match as `"0"` in solution objects and `replaceAll` operates on it implicitly.

**Scalar vs Group replacement:** The pattern determines semantics, not the value type.

```javascript
// Pattern with $x (scalar): array is a single value
Tendril("[$x ...]").find([[1,2], 3]).editAll({x: [9,9]})
// → [[9,9], 3]  (replaced [1,2] with [9,9] as one element)

// Pattern with @x (group): array elements are spliced
Tendril("[@x ...]").find([1, 2, 3]).editAll({x: [9,9]})
// → [9, 9, 3]  (spliced two elements where @x was)

// Replace an object slice: collapse any pw_* properties into one marker.
Tendril("{ @slice=(/^pw_/:_) }")        // K:V implies “at least one” matching kv-pair.
.find(data)
.editAll({slice: {sanitized: true}});

// Variant: allow zero matches. (`?` removes the nonempty requirement for the slice.)
Tendril("{ @slice=(/^pw_/:_?) }")       // Always matches; slice may be empty.
.find(data)
.editAll({slice: {sanitized: true}});  // Adds sanitized:true everywhere.

```

**Replacement examples:**

```javascript
// Swap array elements
Tendril("[$x $y]").find([3, 4]).replaceAll($ => [$.y, $.x])
// → [4, 3]

// Redact passwords at any depth - two equivalent approaches:
const data1 = {user: {password: "secret", name: "Alice"}};

// Approach 1: Use ** with match() to search at any depth
const result1 = Tendril("{ **.password:$p }").match(data1).editAll({p: "REDACTED"});

// Approach 2: Use find() without ** to search at any depth
const result2 = Tendril("{ password:$p }").find(data1).editAll({p: "REDACTED"});

// ⚠️ Anti-pattern: Don't combine ** with find() - it's redundant!
// Tendril("{ **.password:$p }").find(data) // DON'T DO THIS
```

## Slice Patterns

Slice patterns (`@{ }` and `@[ ]`) let you search for and replace *parts* of objects or arrays without affecting the rest:

```javascript
// Object slice: replace just the matched key-value pairs
const data = {foo: 1, bar: 2, baz: 3};
Tendril("@{ foo:1 bar:2 }").find(data).replaceAll({replaced: true})
// → {replaced: true, baz: 3}

// Array slice: replace just the matched subsequence
const arr = [1, 2, 3, 4, 5];
Tendril("@[ 2 3 ]").find(arr).replaceAll([20, 30, 31])
// → [1, 20, 30, 31, 4, 5]

// Works with bindings
Tendril("@{ name:$n }").find([{name: "Alice"}, {name: "Bob"}])
  .solutions().toArray()
// → [{n: "Alice"}, {n: "Bob"}]
```

**Important:** Slice patterns only work with `find()` and `first()`. Using them with `match()` is an error—there's no surrounding container at the root level.

---

# When to Use Tendril

### ✅ Perfect fit

**1. Structural tree transformations (AST/VDOM manipulation)**

```javascript
// Macro expansion: <When>/<Else> → If node
const result = Tendril(`[
  ...
  @whenelse=(
    {tag:when/i children:$then}
    {tag:else/i children:$else}?
  )
  ...
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
TYPED_WILD    := '_string' | '_number' | '_boolean'  # typed wildcards
IDENT         := /[A-Za-z][A-Za-z0-9_]*/  # user identifiers cannot start with _

QUOTED_STRING := "..." | '...'            # supports \n \r \t \" \' \\ \uXXXX \u{...}
REGEX         := /pattern/flags           # JS RegExp; 'g' and 'y' flags not allowed
CI_STRING     := IDENT/i | QUOTED_STRING/i  # case-insensitive literal (no space before /i)

BAREWORD      := IDENT, except 'true' 'false' 'null' 'else' are special-cased
LITERAL       := NUMBER | BOOLEAN | NULL | QUOTED_STRING | REGEX | CI_STRING | BAREWORD

# Whitespace and // line comments allowed between tokens everywhere.

# --------------------------------------------------------------------
# Core productions
# --------------------------------------------------------------------

ROOT_PATTERN := ITEM
             |  '@{' O_GROUP+ '}'              # object slice pattern (find/first only)
             |  '@[' A_BODY ']'                # array slice pattern (find/first only)

S_ITEM  := '$' IDENT
S_GROUP := '@' IDENT

ITEM :=
      ITEM_TERM ('|' ITEM_TERM)*              # alternation: enumerate all matches
    | ITEM_TERM ('else' ITEM_TERM)*           # prioritized: first match wins

ITEM_TERM :=
      '(' ITEM ')'
    | LOOK_AHEAD
    | S_ITEM '=' '(' ITEM ('where' GUARD_EXPR)? ')'    # binding with pattern and optional guard
    | S_ITEM                                       # bare $x ≡ $x=(_)
    | S_GROUP '=' '(' A_GROUP ')'                  # binding with pattern
    | S_GROUP                                      # bare @x ≡ @x=(_*)
    | TYPED_WILD                                   # _string, _number, _boolean
    | '_'
    | LITERAL
    | OBJ
    | ARR

GUARD_EXPR := <expression with operators: < > <= >= == != && || ! + - * / %>
            # References $variables, literals, and functions: size(), number(), string(), boolean()

LOOK_AHEAD :=
      '(?' A_GROUP ')'
    | '(!' A_GROUP ')'

# --------------------------------------------------------------------
# Arrays
# --------------------------------------------------------------------

ARR := '[' A_BODY ']'

A_BODY := (A_GROUP (','? A_GROUP)*)?           # commas optional

A_GROUP :=
      '...' A_QUANT?                           # spread token in arrays (three dots)
    | A_GROUP_BASE A_QUANT?                    # quantifiers bind tight
      ( ('|' (A_GROUP_BASE A_QUANT?))*         # alternation: enumerate all
      | ('else' (A_GROUP_BASE A_QUANT?))*      # prioritized: first match wins
      )

A_GROUP_BASE :=
      LOOK_AHEAD
    | '(' A_BODY ')'                           # if >1 element => Seq node
    | S_GROUP '=' '(' A_BODY ')'               # group binding with pattern
    | S_GROUP                                  # bare @x ≡ @x=(_*)
    | S_ITEM '=' '(' A_BODY ('where' GUARD_EXPR)? ')'  # scalar binding with pattern and optional guard
    | S_ITEM                                   # bare $x ≡ $x=(_)
    | ITEM_TERM                                # including nested ARR/OBJ

A_QUANT :=
      '?' | '??' | '?+'
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
# Spelled '%', pronounced "remainder".

O_REMNANT :=
      S_GROUP '=' '(' '%' O_REM_QUANT? ')' ','?
    | '%' O_REM_QUANT? ','?
    | '(!' '%' ')' ','?                        # closed-object assertion (equiv to %#{0})

O_REM_QUANT :=
      '#{' INTEGER (',' INTEGER?)? '}'         # #{m} or #{m,n} or #{m,}
    | '#{' ',' INTEGER '}'                     # #{,n}
    | '#' '?'                                  # shorthand for "0..∞" (same as #{0,})
    | '?'                                      # shorthand for "0..∞" (bare ? also allowed)

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
    | '**' BREADCRUMB* OBJ_ASSERT_OP VALUE O_KV_QUANT? O_KV_OPT?   # leading ** allowed (glob-style)

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
      '**' KEY                                 # skip any depth (glob-style), then match KEY
    | '**'                                     # if immediately followed by ':', ':>', or '?' then KEY := '_'
    | '.' KEY
    | '[' KEY ']'

```


## Semantics

### Equality

Tendril uses **SameValueZero** semantics for all equality comparisons (the same algorithm JavaScript uses for Map/Set keys):
- `NaN` equals `NaN` (unlike JavaScript's `===` operator)
- `0` equals `-0`
- All other values compare as with strict equality

This applies to literal matching, variable unification, and the `==`/`!=` operators in guard expressions.

### Matching Rules

- **Numbers:** SameValueZero equality; NaN matches NaN, 0 matches -0
- **Booleans:** strict equality
- **Strings:** strict equality for literals; regex patterns match substrings unless anchored
- **null:** matches only `null` or `_`
- **Arrays:** matched positionally with backtracking
- **Objects:** matched via field clauses (non-consuming, conjunctive, non-exclusive)

### Binding and Unification

Scalar bindings (`$x`) succeed when:
1. The pattern matches
2. The matched value is a single item (not a subsequence)
3. If `$x` was previously bound, the new value equals the old value (structural equality)

Group bindings (`@x`) succeed when:
1. The pattern matches (may match zero or more items)
2. If `@x` was previously bound, the new group equals the old group (structural equality)

Bare variables are shorthand: `$x` ≡ `$x=(_)`, `@x` ≡ `@x=(_*)`.

### Field Clauses (Slice-Based Semantics)

Each field clause defines both a **slice** (the set of object fields that satisfy both k~K and v~V) and a set denoted by **bad** (k~K AND NOT(v~V)).

In the following short forms, `>` signifies "no bad values" (i.e. k~K => v~V), and `?` signifies that the key is optional:

| Short form | Equivalent long form | Meaning |
|------------|----------------------|---------|
| `K:V`      | `K:V  #{1,} bad#{0,}`  | At least one matching k,v |
| `K:>V`     | `K:V  #{1,} bad#{0}`   | At least one matching k,v, and no bad values |
| `K:V?`     | `K:V  #{0,} bad#{0,}`  | No existence requirement (use for binding) |
| `K:>V?`    | `K:V  #{0,} bad#{0}`   | No bad values |

> Note: The "Equivalent long form" column uses `bad#{...}` as notation to describe semantics, not actual syntax. (TODO: notation for nonmatching slice)

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

`%` (pronounced "remainder") defines the slice of fields that didn't fall into any of the declared slices or bad sets; in other words, the **entries whose keys did not match any of the field clauses, regardless of whether the values matched.**  (The predominant use case is the fall-through of unrecognized fields, not the fall-through of invalid values.)

It may appear only once in the object pattern, only at the end. You can bind it or quantify it.

```
{ K1:V1 K2:V2 }             # No constraint on remainder
{ K1:V1 K2:V2 % }           # Remainder is nonempty
{ K1:V1 K2:V2 %#{0} }       # Remainder is empty (closed object)
{ K1:V1 K2:V2 %#{3,4} }     # Remainder is of size 3-4
{ K1:V1 K2:V2 @rest=(%) }   # Bind it
```

Field clauses are evaluated non-exclusively: a single key-value pair may satisfy multiple clauses.

### Object Evaluation Order

Field clauses produce results consistent with **left-to-right evaluation**. Bindings established by earlier clauses are visible to later ones. This enables patterns where one clause binds a variable and a subsequent clause constrains it.

Each field clause selects a **witness** — one key-value pair where both K and V match. If multiple pairs qualify, the matcher branches, producing one solution per witness:

```javascript
{ /a.*/:$x }  matching {a1:1, a2:2}
// Two solutions: {x:1} and {x:2} — one witness each
```

**`:>` with unbound variables:**

When V contains an unbound variable like `$x`, matching V against a value *binds* `$x`. This means the value is in the slice, not the bad set. Therefore `:>` is not a "universal equality" operator — it means "no bad entries exist," where bad means "fails to match the field clause's value pattern":

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
// Fails — first clause binds x, second requires ALL /a.*/
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

- **Bare identifiers as strings** is convenient, but creates ambiguity with future keywords and makes error messages harder ("did you mean a string or a variable?"). Already special-cased `_ true false null else` etc; this tends to grow.

- **`find()` + `**` redundancy**: The admonition ("don't combine") is good, but users will do it anyway. Could make it harmless by having the engine detect redundant `**` in root-object terms during scan.

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

# Real-world examples 

This is more sophisticated than the If/Else example, but it's genuinely useful and demonstrates real power. A few syntax corrections:

```javascript
Tendril(`{
  **:@label=({
    tag: label,
    props: {for: $id},
    children: [$labelText=(/.*/)]
  })
  **:{
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

- **Breadcrumbs** (`**:{...}`) finding elements at any depth
- **Backreference** (`$id`) joining label to input
- **Group variables** enabling surgical edits (delete label, update placeholder)
- **Optional patterns** (`placeholder:_?`) handling cases where placeholder exists or not
- **Practical transformation** that's immediately useful

The complexity tradeoff: it shows more features but requires more explanation. For the README's second example slot, this might be too much. It would work better in one of the specialized guides (like the "Regex for Structures" guide showing find-and-replace).

For the README, I'd still lean toward the If/Else merge—simpler pattern, clearer "before/after" mental model, shows the core ideas without requiring breadcrumb or group-variable knowledge.

Save the label/input example for a "Real-World Examples" section or one of the specialized guides?

# Current work (CW)

## CW 2. Language pruning

The language has got too complex and messy, and we need to prune or streamline some features. A large part of this will be solved in documentation by relegating more complex features to the reference section or a separate "advanced" section. But there are some specific language changes:
1. 
2. Retire ':>', made redundant by CW 4.
2. Retire positive and negative look-aheads for object field clauses.Replace with simple boolean expressions with better defined semantics for the remainder.
3. Retire quantifiers for object field clauses. Replace them with CW 4, which includes a simplified quantifier scheme for buckets.
4. Retire item repetition numeric quantifiers a{m,n}. Keep the notation for greedy, lazy, possessive quantifiers, but relegate it to a footnote. Possessive is an 'advanced' escape hatch.
5. Allow anonymous guards on wildcards: `(_ where _ % 2 == 0)` short for `$tmp=(_ where $tmp % 2 == 0)`
6. Allow the top level pattern to be a slice, for find/edit/replace:
```
Tendril("{ a:b }").find(data).replaceAll("X") // Cross out any object that contains key 'a'. 
Tendril("a:b").find(data).replaceAll("X:X") // Replace only that key, not the whole object. 
```
7. Retire quantifiers for object remainders. Retain only '%','!%','%?'.


## CW 2B. Better binding syntax.

Current style

```
    $foo=(0|1|2|3|4)
    $foo=(0|1|2|3|4 where $foo>1)
    $foo=([$x $y] where $x>$y)
    
    (_ where _>1)
    ([$x $y] where $x>$y)
    
    [ a b @foo=(c d) e f]
    { @foo=( K:V K2:V2) }
```

Proposed style
```
    // style 2
    (0|1|2|3|4 as $foo)
    (0|1|2|3|4 as $foo where $foo>1)
    ([$x $y] as $foo where $x>$y)
    
    (_ where _>1)
    ([$x $y] where $x>$y)
    
    [ a b (c d as @foo) e f]
    { (K:V K2:V2 as @foo) }
```

## CW 2A. Object slice quantifiers

Retire O_KV_QUANT and O_REM_QUANT. 
Replace with the following:

Bare K:V clauses:
```
     K:V      // (no change to existing) asserts #{1,Infinity}
     K:V ?    // (no change to existing, asserts #{0,Infinity}; 
              // Note this acts like a quantifier, not a branching alternation. 
              
```
Slice variables bound to K:V clauses (Previously not supported at all.)
```
    // assuming CW 2b
    (K:V as @foo)    // @foo is nonempty (contract of K:V) 
    (K:V? as @foo)   // @foo may be empty (contract of K:V?)
    
    // assuming CW 14
    (K:     V ->@foo 
       else V2 ->@bar! // @bar is nonempty
       else V3 ->!@baz // @baz is empty )
    
```

To replace the lost quantifiers (which are infrequently needed), support '#' (or 'size()' if you prefer) in EL:
```
    [ ... (@slice where #@slice>5) ...]
    { (K:V as @S where #@S>5) }
    { K: (V -> @bucket1 where #@bucket1>5)   // Evaluation deferred until the iteration is finished and the count is available. 
         else (V2 -> @bucket2 where #@bucket2>5)}
```


## CW 14. '->' operator

### Summary

The `->` operator collects matching k:v pairs into buckets during object iteration. It is deliberately distinct from `=` binding:

| Syntax | Meaning | On repetition |
|--------|---------|---------------|
| `@x=(P)` | bind | unify |
| `P -> @x` | flow into | accumulate |

The arrow visually suggests "pour into a bucket." Users won't confuse it with binding because it doesn't look like binding.

### Semantics

`(S -> @foo)` succeeds iff `S` succeeds at that value. On success, it records the current k:v pair into bucket `@foo` for the nearest enclosing `K:V` in the AST (lexically obvious—travel up the AST, not the data).

The value of @foo is associated with the clause, as if it were @foo=(K:V), i.e. the same @foo binding is used for all the k-branches. If S itself branches, the same k:v is not added to @foo twice.

If the same @foo collector appears in multiple arms/places within the same enclosing K:V, they **union** into the same bucket (not unification—this is accumulation). But not within the same enclosing K:V, they unify as object slices.

### Composition with `else`

The `->` operator composes naturally with `else`. There is no special "categorization mode"—the partitioning behavior emerges from composition:

- `else` provides prioritized alternation (first match wins, no backtracking)
- `->` does the collecting

```
{ K: V1->@bucket1 else V2->@bucket2 else _->@rest }
```

For each value, try V1 first; if it matches, flow into @bucket1. Otherwise try V2, etc. The `else` ensures mutual exclusivity.

### Strong semantics with `else !`

The pattern `K:V else !` replaces `K:>V`. It triggers **strong semantics**: every k matching K must have a value matching V, or the pattern fails.

```
{ K: V }           // weak: at least one k~K with v~V; other k's may have non-matching v's
{ K: V else ! }    // strong: all k~K must have v~V (replaces K:>V)
```

This allows retiring the `:>` operator while preserving its semantics in a more compositional form.

### Categorization patterns

| Pattern | Meaning |
|---------|---------|
| `K: V1->@a else V2->@b` | Collect matching k:v's into buckets; non-matching k's ignored; require at least one match |
| `K: V1->@a else V2->@b else !` | Collect matching k:v's; **fail** if any k doesn't match V1 or V2 |
| `K: V1->@a else V2->@b else _->@rest` | Collect **all** k:v's (complete coverage) |
| `K: V else _` | At least one match; silently ignore non-matching k's (no collection) |

**Note:** `{ K:V else _->@bad }` collects non-matching values but never fails. Use `else !` if you want validation.

### Unpopulated buckets

If a bucket is never populated (its branch is never taken), it is **undefined**, not empty `{}`. This is consistent with how Tendril treats other variables—they are bound by matching, not declared.

If you need "empty if none," handle it in user code:
```javascript
const good = solution.good ?? {};
```

### Operator precedence

From strongest to weakest:
```
@foo=    // binding, unary
->       // binary
else     // binary
```

So `K:V -> @x else W -> @y` parses as `K:((V -> @x) else (W -> @y))`. Parentheses are redundant but recommended for legibility; use multiple lines for complex categorizations.

### Implementation notes

- `S` is not a backtracking point, but may fail early (empty quantifier on slice) or late (non-empty quantifier checked after iteration).
- Although `K:V` normally asserts only one-or-more witnesses, presence of `->` requires the engine to iterate all matching witnesses (to collect them all). This is inherent to categorization/validation, not a hidden cost.

### Test case

```
data = {a:[
    { b1:'d11',b2:'d12',b3:'x' },
    { z:'d13' },
    { b3:'d24', x:'d25' },
    { b4:'d34', x:'d25' },
]}
pattern = {
    a[$i]:({/b.*/:($x=(/d1.*/) -> @foo)
                  else (/d3.*/->@bar)}
          | _)   // fallback to show non-matching $i's
}
// solutions:
//   {i:0, x:'d11', foo:{ b1:'d11',b2:'d12' } }
//   {i:0, x:'d12', foo:{ b1:'d11',b2:'d12' } }
//   {i:1}
//   {i:2}
//   {i:3, bar:{ b4:'d34'} }
```



## CW 4. Categorization in object syntax.

The pattern `K:(V1 else V2 else V3)` is just a special case of `K:V` where `V` is an else-chain. The else chain is applied independently to each value, routing that property to the first Vi that matches, forming a partition (no overlap).

### Basic idiom

```
K:A else B      // precedence makes this K:(A else B)
K:A else _      // fallback for non-matching values
```

### Capturing into buckets

Use `->` to collect matching k:v pairs into named buckets:

```
{ _: (OK|perfect) -> @goodStatus
     else _       -> @others }

// matches { proc1:"OK", proc2:"perfect", proc3:"bad"}
// solution = {
//    goodStatus: { proc1:"OK", proc2:"perfect"}
//    others:     { proc3:"bad"}
// }
```

### Validation (closed categorization)

Use `else !` to fail if any value doesn't match the expected patterns:

```
{ _: (OK|perfect) -> @goodStatus else ! }

// matches { proc1:"OK", proc2:"perfect" }
// fails on { proc1:"OK", proc2:"bad" }
```

The `else !` triggers strong semantics—every key must have a matching value, or the pattern fails. This replaces the `:>` operator:

```
K:>V  ===  K: V else !
```

# Future ideas

These ideas have not been thoroughly thought out and are not on the roadmap. Treat this as just brainstorming.

## CW 5. Defaults for nomatching bindings?

## CW 6. Recursive descent

A breadcrumb path is really just an array of instructions for navigating somewhere else in the structure.

We already have p.**.q indicating remote ancestry. This works only for the simple case of chained parent-child relationships. It is equivalent to `p(._)*.q` -- We are already treating this path as a **pattern on the array of navigation instructions**.

 This could be generalized to navigations other than simple keyed/indexed child descent.

For example, what if you wanted to find a cycle in a directed graph like `[ [$from,$to]* ]`?

Introduce a descent rule syntax `**↳($from, $to where PATTERN )` Which for this directed graph example would be 
    `↳($a,$b where $b=($a[1]))`

Then a cyclic graph is `[... $start.**↳($a,$b where $b=($a[1])):$start) ...]`

(You don't need to point out that this particular example would be very inefficient, and that we'd need a 'visited' flag and a depth limit, and that this is a complication to the language that is prima facie unjustified. )
    ``

## CW 7. **Training wheels**:
Add a **boundedness mode** that distinguishes **O(1), syntactically finite branching** from **data-dependent enumeration**: small alternations like `red|rouge` are always safe, while constructs whose match count depends on input size (regex or wildcard keys in object position, array spreads/splits, variable-length quantifiers, wildcard indices, unbound `_:$x`) are rejected unless explicitly marked. Provide two opt-ins: `enum(P)` to acknowledge intentional enumeration, and `one(P)` / `atMostOne(P)` to assert uniqueness and fail otherwise. Implement this via a simple syntactic classification of branching sites (finite vs size-dependent) with clear compile-time errors explaining which construct causes unbounded branching and how to fix it; this teaches users to avoid accidental Cartesian products without limiting legitimate finite alternation.

## CW 8. EL assertions applied to structural pieces other than bindings.

ChatGPT recommends against this, or if we do it, make it explicit, such as a zero width `guard(expr)`

Support something like
```
"{
    securityLevel:$securityLevel;
    "some_huge_record": {
         // deeply inside here...
             { 
                 hasClearance:(true ; $securityLevel>10) | false
             }
    }
}"

or perhaps leverage lookaheads
"{
    securityLevel:$securityLevel;
    "some_huge_record": {
         // deeply inside here...
             { 
                 hasClearance:(?;$securityLevel>10)true | false
             }
    }
}"
```

#### CW 9. Currently If a variable in an EL expression is unbound, the evaluation is deferred. If the variable never gets bound by the time the entire pattern is matched, then it fails.

Proposal. Permit defaults. An expression with a default may be evaluated immediately if the expression is closed. Otherwise, it is deferred, but evaluated as soon as it becomes closed (to allow pruning ASAP).
If after the entire pattern is matched, it is still open and cannot be evaluated, then we evaluate the expression using the defaults. (If there are still free variables without defaults, then it fails. )
 This honors our current support for forward reference expressions having deferred evaluation.

`{
    sum: $sum=(_ where $sum==default($n,0)+default($s,0))
    ( 
      number: $n ?
      string: $s ?
    )
}`
For now, we only propose to support primitive defaults.
It is a syntax error to declare a default for a variable that does not appear anywhere else in the pattern. (guard against typos).

To rephrase:

Treat default($x, v) as a three-valued reference at evaluation time:

If $x is bound, it evaluates to that value.

If $x is unbound but might still be bound later, the whole guard is not yet evaluable (defer).

Only if the guard reaches the end of pattern evaluation and $x is still unbound, then default($x, v) evaluates to v.

Operationally: defaults don’t make expressions “closed”; they only change what happens at the final “still-open” check.

Tiny doc-friendly phrasing

Something like:

default($x, v) does not count as binding $x. Guards are still deferred until all referenced variables are bound. Defaults apply only at the end of matching, if some referenced variables remain unbound.

## CW 10. Calc

Proposal: support calculated expressions in the pattern (not just in guards).

This allows some usages to preserve the O(1) behavior and pruning optimizations for key-matching.

Syntax: ==expr
Semantics: It is equivalent to writing the resulting primitive literal in the pattern, and it never binds variables.

list indices:
```
{
    list[==2*$idx]: $name
    list[==2*$idx+1]: $number
}
```
Path notation
```
{
    user: {id:$id}
    data: personal.prefs.=="P"+$id: { some:pref }
}
```
Keys in normal notation
```
{
    user: {id:$id}
    data: {personal: prefs: { =="P"+$id: { some:pref } } }
}
```

It may only be used for list indices and object keys.
It would **not** support deferred calculation for free variables. It fails with an error, not a silent mismatch, if it contains free variables.
It must evaluate to a primitive.
Once evaluated, it must be memoized (AST identity + bindings).

TBD: Clarify precedence and how it might combine with other syntactic structures.

## CW 11. Optimized primitives for common cases

In practice people need: “key absent,” “no keys matching regex,” “no values matching predicate,” “closed object,” and “only keys from this set.” If you don’t make those primitives obvious and idiomatic, users will recreate them with enumeration-heavy patterns (wildcard keys + negative constraints) and you’re back in explosion land. So I’d put on the cut line a small set of object-level constraints that are syntactically distinct from matching clauses. Concretely, something like absent(K) / forbid(K:V) / closed (your !%) / allowExtras (default) / captureExtras (%? plus binding). Whether it’s spelled as guards, a where block, or a dedicated !{...} constraint form doesn’t matter as much as: it must not enumerate, and it must read like a constraint, not like a pattern that backtracks.

## CW 12. Simplify and integrate regex.

1. Make /foo/ anchored.
2. In RE group syntax: /.*[.](?<$ext>\w+)/ -- Named groups that start with the $ sigil are lifted into Tendril land and participate in binding logic.. By default, this will not cause branching in Tendril (at most one regex solution per Tendril branch, as is usual for regexes). nitpicky details are mostly answered by the following equivalence:
   `[ /(?<$x>[ab])|[bc]/ ]`
   acts *exactly* like
   [ $x=(/[ab]/) else /[bc]/ ]
   (where 'else' is the non-backtracking form of '|' as desscribed earlier), with regard to backtracking, binding, and so on.
3. Provide consistent ergonomic quoting options:

 '...' "..." «...» --- literals
 /.../, r'...' r"..." r«...» --- Tendril regex (like JS regex, but with (1)+(2))
 jr/.../ - JavaScript compatible regex (disables (1) and (2))

 ~ LITERAL_OR_REGEX --- Substring match (unanchored)

This is brainstorming, not a polished proposal. Any suggestions? (Ignore missing details with obvious resolutions.)

Below is how I would rewrite **CW 12** as a *user-guide* section.
It assumes no prior knowledge of the old rules, avoids grammar talk, and focuses on “what you type” and “what it means,” with motivation first and corner cases last.

---
        Below is how I would rewrite **CW12** in *user-guide style*, with:

1. a **short, high-level summary** about the size/density of your original CW12, and
2. the **longer explanatory section** (the one you liked earlier), revised so that **Plan B is the default** and explained using your “bind-if-unknown, assert-if-known” framing rather than “constrain the search.”

---
            
            ## Regex in Tendril — Summary
            
            Tendril integrates regex as a **single, predictable matching step**, not as a second pattern language.
            
            Key rules:
            
            1. **Regexes are anchored by default.**
               `/foo/` matches `"foo"`, not `"seafood"`.
            
            2. **Named capture groups bind Tendril variables.**
               A group named `(?<$x>…)` binds `$x` if it is unbound, or asserts its value if it is already bound.
            
            3. **Regexes do not enumerate solutions.**
               Each regex produces at most one result per Tendril branch.
            
            4. **Substring matching is explicit.**
               Use `~ /foo/` or `~ "foo"` when you want “contains” behavior.
            
            5. **Regex binding follows Tendril’s normal unification rules.**
               A bound variable is tested, not re-chosen.
            
            6. **JavaScript-compatible regex is available as an escape hatch.**
               `jr/.../` disables Tendril-specific behavior.
            
            This makes regex behave like other Tendril matchers:
            *bind if unknown, assert if known, never silently multiply solutions.*
            
            ---
            
            ## Regex in Tendril (Predictable and Integrated)
            
            Regexes are useful in Tendril, but they should not introduce hidden search behavior or surprise interactions with unification. Tendril therefore treats regex as a **single matching operation with optional extraction**, fully integrated into the existing binding model.
            
            This section explains how regex behaves in Tendril and how it differs from JavaScript regex.
            
            ---
            
            ### 1. Regexes match the entire value
            
            In Tendril, a regex literal like:
            
            ```
            /foo/
            ```
            
            matches the **entire string**, not a substring.
            
            ```
            /foo/     // matches "foo"
                      // does NOT match "seafood"
            ```
            
            This aligns regex with all other Tendril patterns: a value either matches or it doesn’t.
            
            If you want substring matching, see **Substring matching** below.
            
            ---
            
            ### 2. Regex alternation does not create Tendril branches
            
            Regex alternation (`|`) is handled entirely inside the regex engine.
            
            Even if a regex has multiple internal matches, Tendril treats it as **one atomic test** and never enumerates alternatives as separate solutions.
            
            ```
            /foo|bar/
            ```
            
            either matches or fails; it does not produce two Tendril branches.
            
            This prevents accidental solution explosion.
            
            ---
            
            ### 3. Named capture groups bind Tendril variables
            
            Regex groups whose names start with `$` participate directly in Tendril binding.
            
            ```
            /(?<$ext>\w+)/
            ```
            
            Example:
            
            ```js
            Tendril("{ file: /.*\\.(?<$ext>\\w+)/ }")
              .match({ file: "report.pdf" })
              .solutions().first()
            // → { ext: "pdf" }
            ```
            
            ---
            
            ### 4. Bound variables turn captures into assertions
            
            A `$`-named capture group behaves differently depending on whether the variable is already bound.
            
            #### If the variable is unbound
            
            The group captures a value and binds it, like a normal regex capture.
            
            #### If the variable is already bound
            
            The group **does not choose a new value**.
            Instead, it **asserts** that the bound value appears at that position and satisfies the group’s pattern.
            
            In effect:
            
            > A `$`-named regex group means “bind if unknown; assert if known.”
            
            This mirrors Tendril’s behavior everywhere else.
            
            ---
            
            ### 5. Example: why this matters
            
            Consider this regex:
            
            ```
            /(?<$x>a)b | a(?<$x>b)/
            ```
            
            On the string `"ab"`, both alternatives are valid.
            
            Now suppose `$x` is already bound to `"b"` elsewhere in the pattern.
            
            Under Tendril semantics:
            
            * The first alternative is rejected (it would require `$x = "a"`).
            * The second alternative succeeds.
            
            So `"ab"` **does match**, and `$x` remains `"b"`.
            
            This is equivalent to the Tendril pattern:
            
            ```
            [ $x=(a) b | a $x=(b) ]
            ```
            
            Once `$x` is known, each occurrence simply tests it.
            
            ---
            
            ### 6. How to think about it
            
            You do **not** need to think about regex backtracking.
            
            The mental model is:
            
            > Regex runs once.
            > `$`-named groups bind variables if they are unknown,
            > and assert those variables if they are already known.
            
            This avoids the “regex picked the wrong witness” surprise and keeps regex commutative with other Tendril matchers in the same way that repeated variables are.
            
            ---
            
            ### 7. Substring matching is explicit
            
            Because regexes are anchored, substring matching must be explicit.
            
            Use the substring operator:
            
            ```
            ~ /foo/
            ~ "foo"
            ```
            
            Examples:
            
            ```
            ~ /foo/    // matches "seafood"
            ~ "foo"    // matches "seafood"
            ```
            
            Substring matching applies only to strings; other types do not coerce silently.
            
            ---
            
            ### 8. Regex vs literals
            
            Often you don’t need regex at all.
            
            ```
            foo/i
            ```
            
            is usually clearer and safer than:
            
            ```
            /foo/i
            ```
            
            Use regex when you need structure or extraction:
            
            ```
            /\d{4}-\d{2}-\d{2}/
            /(?<$user>[a-z]+)@/
            ```
            
            ---
            
            ### 9. Regex flavors
            
            #### Tendril regex (default)
            
            ```
            /.../flags
            ```
            
            * Anchored
            * Supports `$`-named capture groups
            * Participates in unification
            * Disallows stateful flags (`g`, `y`)
            * Allowed flags: `i m s u`
            
            This is the regex you usually want.
            
            #### JavaScript regex (escape hatch)
            
            ```
            jr/.../flags
            ```
            
            * JavaScript behavior
            * Substring matching
            * No Tendril bindings
            * No anchoring changes
            
            Use this only when you need exact JS compatibility.
            
            ---
            
            ### 10. What regex does *not* do in Tendril
            
            Regex does not:
            
            * enumerate alternatives
            * create multiple Tendril solutions
            * override unification rules
            * silently coerce non-strings
            * introduce hidden backtracking across the pattern
            
            If you want enumeration, use Tendril alternation.
            If you want validation, use guards.
            If you want search, use `~`.
            
            ---
            
            ### One-sentence takeaway
            
            > In Tendril, regex is a **single match with optional binding**:
            > it binds unknown variables and asserts known ones, just like the rest of the language.
            
            If you want, next we can:
            
            * tighten this further for README length, or
            * add a migration note showing how existing `/foo/` patterns change under anchoring.
