
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
  ** ({ tag:'label', props:{for:$id}, children:[(_string as $text)]   } as $L)
  **  { tag:'input', props:{id:$id (placeholder:_? as %p) } }
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

---

## Conventions

`~=` and `===` and `≡` appear in examples as shorthand for illustration only. They are not part of Tendril syntax.

- `foo ~= bar` means `Tendril("foo").matches(bar) === true`
- `p1 === p2` indicates semantic or syntactic equivalence

The data model is JSON-like: objects, arrays, strings, numbers, booleans, null. Regex literals use JavaScript regex syntax.

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
| `K:V else !` | At least one matching k:v pair exists, AND no bad entries (all keys matching K must have values matching V) |
| `K:V?`     | No existence requirement (use for optional binding) |
| `K:V else !?` | No bad entries allowed (but key doesn't need to exist) |

The `else !` suffix triggers **strong semantics**: if a key matches K, its value MUST match V, or the pattern fails.

```javascript
{ a: 1 }            // matches {"a":1} and {"a":1, "b":2}
                   // At least one 'a' with value 1

{ /a.*/: 1 }        // matches {"ab":1, "ac":2}
                   // At least one /a.*/ key with value 1 (bad entries allowed)

{ /a.*/: 1 else ! } // does NOT match {"ab":1, "ac":2}
                   // "ac":2 is a bad entry (key matches /a.*/, value doesn't match 1)

{ /a.*/: 1 else ! } // matches {"ab":1, "xyz":99}
                   // "xyz" doesn't match /a.*/, so it's not a bad entry

{ a: 1 ? }           // matches {} and {"a":1} and {"a":2}
                   // No existence requirement - just for binding

{ a: 1 else ! }     // matches {"a":1} and {"a":1,"b":2}, but NOT {"a":2}
                   // 'a' must exist with value 1; 'b' is uncovered, irrelevant.
```

Commas between clauses are optional. Multiple clauses can match the same key-value pair.

```javascript
{ /a|b/:/x/ /b|c/:/y/ }  // matches {"b":"xy"} - "b":"xy" satisfies both field clauses
```
Field clauses are evaluated left-to-right, so bindings from earlier clauses are
visible to later ones.

### Categorization and the -> operator

The `->` operator collects matching key-value pairs into named buckets. Combined with `else`, this lets you partition data in a single pass:

```javascript
const inventory = {
  apple: {type: "fruit", qty: 10},
  carrot: {type: "vegetable", qty: 5},
  banana: {type: "fruit", qty: 8},
  broccoli: {type: "vegetable", qty: 3}
};

Tendril(`{
  $item: {type: fruit}    -> %fruits
    else {type: vegetable} -> %veggies
}`)
.match(inventory)
.solutions()
.first()
// → {
//     fruits:  {apple: {type:"fruit", qty:10}, banana: {type:"fruit", qty:8}},
//     veggies: {carrot: {type:"vegetable", qty:5}, broccoli: {type:"vegetable", qty:3}}
//   }
```

Each entry is tested against the patterns in order. The first match wins, and the key-value pair flows into that bucket. The `else` ensures no entry is counted twice.

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
{ a:b (% as %rest) }    // matches {"a":"b", "c":"d"}, binds {"c":"d"} to %rest
                        // Note: requires nonempty remainder

{ a:b (%? as %rest) }   // also matches {"a":"b"}, binds {} to %rest
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
{ (! a: 1 else !?) }  // if 'a' exists, its value must not be 1.
{ (! a:1 b:2) }       // can't have BOTH a:1 and b:2 (one is OK)
{ (! a:1) (! b:2) }  // can't have a:1 AND can't have b:2
```

## Binding Variables

Tendril has two kinds of variables. **Scalar variables** (prefix `$`) capture single values. **Group variables** capture contiguous subsequences or subsets: `@` prefix for **array slices** (subsequences), `%` prefix for **object slices** (key-value subsets). 

The syntax for variable binding is `(pattern as $x)` or `(pattern as @x)`. **Parentheses are mandatory**.
```
Tendril("[... (2|4 as $x) (_ as $y) ...]").match([1, 2, 3, 4, 5])  // two solutions: {x:2,y:3} and {x:4,y:5}
```
You cannot use both '@x' and '$x' in the same pattern.  (The JS API treats them as the same variable 'x'. The sigil is a type marker.)

`$x` (without the pattern) is short for `(_ as $x)`, and `@x` is short for `(_* as @x)`.  

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
Tendril("{ (/a/:_, /b/:_ as %x) /c/:_ }").match({Big:1, Cute:2, Alice:3}) // matches with binding {x:{Big:1, Alice:3}}
Tendril("{ (/a/:_, /b/:_ as %x) /c/:_ }").match({Big:1, Cute:2, Alice:3}).edit({x:_=>{foo:"bar"}}) // -> {foo:"bar",Cute:2}
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

[ $x (/[ab]/ as $x) $y ]  // matches ['a', 'a', 'y']
                          // $x binds to 'a', matches /[ab]/, unifies

[ $x (/[ab]/ as $x) $y ]  // does NOT match ['a', 'b', 'y']
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

The syntax `(PATTERN as $x)` binds variable `$x` if `PATTERN` matches and the matched value is a single item. Bare `$x` is shorthand for `(_ as $x)`.

### Using scalars to force single-item matches

Scalar variables are constrained to match only single items, not groups. This effectively adds another constraint:
```
[1? 2?]            // matches [], [1], [2], [1,2]

[(1? 2? as @x)]       // matches [], [1], [2], [1,2]
                      // solutionSet = [ {x:[]}, {x:[1]}, {x:[2]}, {x:[1,2]} ]

// $x must bind to a scalar, so this can't match [] nor [1,2]
[(1? 2? as $x)]       // matches only [1] or [2]
                      // solutionSet = [ {x:1}, {x:2} ]
```

### Guard Expressions

Guard expressions constrain variable bindings with boolean conditions. The syntax extends the binding form with the `where` keyword:

```javascript
(PATTERN as $var where EXPRESSION)
```

The pattern must match, AND the expression must evaluate to true:

```javascript
(_number as $x where $x > 100)           // matches numbers greater than 100
(_string as $x where size($x) >= 3)      // matches strings of length 3+
(_number as $n where $n % 2 == 0)        // matches even numbers
```

**Operators:** `< > <= >= == != && || ! + - * / %`

Standard precedence applies. `&&` and `||` short-circuit. String concatenation uses `+`:

```javascript
(_string as $x where $x + "!" == "hello!")  // matches "hello"
```

**Functions:**
- `size($x)` — string length, array length, or object key count
- `number($x)`, `string($x)`, `boolean($x)` — type coercion (JS semantics; `number()` fails on non-numeric strings)

**Multi-variable guards:**

Guards can reference other variables. Evaluation is **deferred** until all referenced variables are bound:

```javascript
// Match objects where min < max
{ min: (_number as $a where $a < $b), max: (_number as $b) }

// The guard "$a < $b" waits until both $a and $b are bound
{min: 1, max: 10}   // matches: 1 < 10
{min: 10, max: 1}   // fails: 10 < 1 is false
```

**Error handling:**

If an expression errors, the match branch fails silently—no exception is thrown.

```javascript
(_string as $x where $x * 2 > 10)  // never matches (can't multiply string)
(_number as $x where $x / 0 > 0)   // never matches (division by zero)
```

**Arithmetic strictness:** Unlike JavaScript, the expression language treats division by zero (`x/0`) and modulo by zero (`x%0`) as errors that cause match failure, rather than silently producing `Infinity` or `NaN`.

**Anonymous guards:**

Guards can also be used without binding, using `_` to refer to the matched value:

```javascript
(_ where _ > 3)                   // matches values > 3
(_ where size(_) >= 3)            // matches arrays/strings with 3+ elements
([$x $y] where $y == $x + 1)      // pattern with bindings + guard
({x:$x, y:$y} where $x < $y)      // object with constraint
```

The `_` variable is only available within the guard expression—it doesn't bind to the solution.

**Restrictions:**
- Guards only work with scalar bindings (`$x`), not group bindings (`@x`)
- All variables referenced in a guard must eventually be bound, or the match fails

### Flow Operator (`->`)

The `->` operator collects matching key-value pairs into **buckets** during object iteration. This enables categorization and partitioning of object properties.

```javascript
{ $k: 1 -> %ones }              // collect all k:v where value is 1 into %ones
{ $k: 1 -> %ones else 2 -> %twos }  // partition by value: 1s and 2s into separate buckets
{ $k: 1 -> %ones else _ -> %rest }  // collect 1s; everything else goes to %rest
```

**Key semantics:**
- Object buckets (`%bucket`) receive `{key: value}` pairs; array buckets (`@bucket`) receive values only
- The value captured is from the **match point** of the `->`, not necessarily the full K:V value
- Buckets accumulate entries (unlike regular binding which unifies)
- Unpopulated buckets are `undefined`, not empty `{}`

**Flow captures match-point value:**

```javascript
// The -> captures the FIRST element (match point), not the whole array
{ $k: [/a/ -> %captured, b] }
// On {x: ['apple', 'b'], y: ['avocado', 'b']}
// %captured = {x: 'apple', y: 'avocado'}

// To capture the full value, place -> at outer level
{ $k: ([/a/, b] -> %captured) }
// %captured = {x: ['apple', 'b'], y: ['avocado', 'b']}
```

**Strong semantics with `else !`:**

```javascript
{ $k: 1 -> %ones else 2 -> %twos else ! }  // FAIL if any value is neither 1 nor 2
```

The `else !` triggers **strong semantics**: every key must match one of the preceding branches, or the pattern fails.

**Backtracking safety:** If a branch fails after the `->` has been reached, the bucket entry is rolled back. Only successful complete matches contribute to buckets.

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
// Hello, worlds
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
const pattern2 = `{
    planets.$name.size: $size
    aka[$i][0]: $name
    aka[$i][_]: $alias
}`

Tendril(pattern).match(data).solutions().toArray()
.map(({size,alias})=>`Hello, ${size} world ${alias}!`)

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

❌ `K:V else !` does not mean all values are the same; it merely means all values (individually) match V.

```
    // Does not demand that all the colors are the same.
    "{ (/color/ as $k): $c else ! }" matches {backgroundColor:"green", color:"white"}
    // => Solutions = [{k:"backgroundColor", c:"green"}, {k:"color",c:"white"}]
```

✅ Use this idiom to enforce universal equality over values:

```
    "{ (/color/ as $k):$c  (/color/ as $k): $c else ! }"
```

It works because variables unify across terms.

### Lookaheads `(? )`, negative lookaheads `(! )`

In array context, a positive lookahead matches the next subsequence but does not consume it.
```
[ (? (/[ab]/ as $x)) $x ... ]  // first element must match /[ab]/, bind to $x
```
A negative look ahead cannot have bindings.
```
[ (! ... 3 4) ... ]         // array must not contain [3,4] subsequence
```

In objects, a positive lookahead does not contribute to the computation of the remainder. You can also have negative lookaheads:

```
{ (! secret:_) }              // assert no key named 'secret' exists
{ (! secret: yes else !) }    // assert no key named 'secret' exists, or some secret key does not have value "yes"

```

## Precedence

**High to low:**

1. Binding `as`
2. Optional `?`, quantifiers `+`, `*`, etc.
3. Breadcrumb operators `.`, `**`, `[]`
4. Adjacency/commas (in arrays and objects)
5. Alternation `|`, prioritized choice `else`
6. Flow operator `->`
7. Key-value separator `:`

Parentheses override precedence. Lookaheads always require parentheses.

Note: `|` and `else` have the same precedence but cannot be mixed without parentheses. Use `((A|B) else C)` or `(A else (B|C))` to combine them.

## DSL philosophy.

 Tendril is a concise punctuation-heavy language for power users, but wants to stay readable. We distinguish between "Core", "Advanced", and "Arcane" idioms.  ("idiom" = semantic intent + syntax + behavior features.) The 'core' language includes idioms that can be learned in an hour and provides 80% of the utility, including simple regex-inspired operators, basic joins, scalar variables, simple extraction and replacement. 'Advanced' would be documented separately and would include things like slices, 'else', object quantifiers, etc.; things that are not uncommon, but which you don't need to learn right away. 'Arcane' would be the difficult stuff.

Core idioms should be succinct and punctuation-heavy. More advanced idioms can employ more or longer keywords as needed to remain readable. The idioms with keywords would be carefully constructed so that use of the language keywords does not interfere with the ability to use bare words as string literals.

`<directives>`

    * It should be **zero-width** (doesn’t consume / doesn’t affect matching).
    * It should run **only on successful branches** (your rollback property).

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
Tendril("{ (/^pw_/:_ as %slice) }")     // K:V implies "at least one" matching kv-pair.
.find(data)
.editAll({slice: {sanitized: true}});

// Variant: allow zero matches. (`?` removes the nonempty requirement for the slice.)
Tendril("{ (/^pw_/:_? as %slice) }")    // Always matches; slice may be empty.
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
  (
    {tag:when/i children:$then}
    {tag:else/i children:$else}?
  as @whenelse)
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

# Labels for scope control (CW16)
LABEL_DECL    := '§' IDENT                   # label declaration (attaches to OBJ or ARR)
LABEL_REF     := '^' IDENT                   # label reference

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

# The '->' suffix flows matching k:v pairs into a bucket during object iteration,
# but may also appear elsewhere.
# Precedence: 'as' (tightest) > '->' > 'else' (loosest)
# So: K:V -> %x else W -> %y  parses as  K:((V -> %x) else (W -> %y))
ITEM_TERM :=
      ITEM_TERM_CORE ('->' BUCKET_REF FLOW_MOD?)?   # optional flow-into-bucket suffix

BUCKET_REF :=
      '%' IDENT                                  # object bucket (collects k:v pairs)
    | '@' IDENT                                  # array bucket (collects values only)

FLOW_MOD :=
      '<' LABEL_REF '>'                       # label reference modifier: <^label>

ITEM_TERM_CORE :=
      '(' ITEM ')'
    | '(' ITEM 'as' S_ITEM ('where' GUARD_EXPR)? ')'   # binding with pattern and optional guard
    | '(' ITEM 'as' S_GROUP ')'               # group binding with pattern
    | '(' ITEM 'where' GUARD_EXPR ')'         # anonymous guard (no binding)
    | LOOK_AHEAD
    | S_ITEM                                  # bare $x ≡ (_ as $x)
    | S_GROUP                                 # bare @x ≡ (_* as @x)
    | TYPED_WILD                              # _string, _number, _boolean
    | '_'
    | LITERAL
    | OBJ
    | ARR

GUARD_EXPR := <expression with operators: < > <= >= == != && || ! + - * / %>
            # References $variables, literals, _ (matched value), and functions: size(), number(), string(), boolean()

LOOK_AHEAD :=
      '(?' A_GROUP ')'
    | '(!' A_GROUP ')'

# --------------------------------------------------------------------
# Arrays
# --------------------------------------------------------------------

ARR := LABEL_DECL? '[' A_BODY ']'             # optional label for scope control

A_BODY := (A_GROUP (','? A_GROUP)*)?           # commas optional

A_GROUP :=
      '...'                                    # ellipsis (three dots, or Unicode … U+2026)
    | A_GROUP_BASE A_QUANT?                    # quantifiers bind tight
      ( ('|' (A_GROUP_BASE A_QUANT?))*         # alternation: enumerate all
      | ('else' (A_GROUP_BASE A_QUANT?))*      # prioritized: first match wins
      )

A_GROUP_BASE :=
      LOOK_AHEAD
    | '(' A_BODY ')'                           # if >1 element => Seq node
    | '(' A_BODY 'as' S_GROUP ')'              # group binding with pattern
    | '(' A_BODY 'as' S_ITEM ('where' GUARD_EXPR)? ')'  # scalar binding with pattern and optional guard
    | '(' A_BODY 'where' GUARD_EXPR ')'        # anonymous guard (no binding)
    | S_GROUP                                  # bare @x ≡ (_* as @x)
    | S_ITEM                                   # bare $x ≡ (_ as $x)
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

OBJ := LABEL_DECL? '{' O_GROUP* O_REMNANT? '}'   # optional label for scope control
    # O_GROUPs parsed greedily until they stop parsing, then O_REMNANT attempted once at end

# Global remainder ("unmatched entries") is a special tail clause, only once, only at end.
# Spelled '%', pronounced "remainder".

S_OBJGROUP := '%' IDENT                          # object group variable

O_REMNANT :=
      '(' '%' O_REM_QUANT? 'as' S_OBJGROUP ')' ','?
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
    | '(' O_GROUP* 'as' S_OBJGROUP ')'         # group binding in object context (uses %)
    | STRONG_O_TERM O_KV_OPT?                  # try strong first (with 'else !')
    | O_TERM O_KV_OPT?                         # then weak

O_LOOKAHEAD :=
      '(?' O_GROUP ')'
    | '(!' O_GROUP ')'

# Strong O_TERM: triggers strong semantics (no bad entries allowed)
# The 'else !' suffix replaces the deprecated ':>' operator.
STRONG_O_TERM := O_TERM 'else' '!'

# Breadcrumb paths
O_TERM :=
      KEY BREADCRUMB* ':' VALUE O_KV_QUANT?
    | '**' BREADCRUMB* ':' VALUE O_KV_QUANT?   # leading ** allowed (glob-style)

KEY   := ITEM
VALUE := ITEM

# Object field semantics:
# K:V          = weak: at least one k~K with v~V; bad entries (k~K, NOT v~V) allowed
# K:V else !   = strong: at least one k~K with v~V; bad entries forbidden
# K:V?         = weak + optional: no existence requirement
# K:V else !?  = strong + optional: no existence requirement, but bad entries forbidden
# V -> %bucket = flow k:v pairs into bucket; V -> @bucket = flow values only (accumulates, does not unify)

# KV quantifier counts the slice (not the bad set). Defaults are semantic, not syntactic.
O_KV_QUANT :=
      '#{' INTEGER (',' INTEGER?)? '}'         # #{m} or #{m,n} or #{m,}
    | '#{' ',' INTEGER '}'                     # #{,n}
    | '#' '?'                                  # shorthand for "0..∞" (same as #{0,})

# KV suffix: disables existence assertion for the slice.
O_KV_OPT :=
      '?'                                      # meaning: slice defaults to #{0,} instead of #{1,}

BREADCRUMB :=
      '**' KEY                                 # skip any depth (glob-style), then match KEY
    | '**'                                     # if immediately followed by ':' then KEY := '_'
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

Bare variables are shorthand: `$x` ≡ `(_ as $x)`, `@x` ≡ `(_* as @x)`.

### Field Clauses (Slice-Based Semantics)

Each field clause defines both a **slice** (the set of object fields that satisfy both k~K and v~V) and a set denoted by **bad** (k~K AND NOT(v~V)).

In the following short forms, `else !` signifies "no bad values" (strong semantics: k~K => v~V), and `?` signifies that the key is optional:

| Short form | Equivalent long form | Meaning |
|------------|----------------------|---------|
| `K:V`      | `K:V  #{1,} bad#{0,}`  | At least one matching k,v |
| `K:V else !` | `K:V  #{1,} bad#{0}` | At least one matching k,v, and no bad values |
| `K:V?`     | `K:V  #{0,} bad#{0,}`  | No existence requirement (use for binding) |
| `K:V else !?` | `K:V  #{0,} bad#{0}` | No bad values |

> Note: The "Equivalent long form" column uses `bad#{...}` as notation to describe semantics, not actual syntax.

Binding keys or values:
```
{ (K as $myKey):(V as $myVal) }
```

Binding slices:
```
{ (K1:V1 as %slice1)       }   # bind one slice
{ (K2:V2 K3:V3 as %slice2) }   # bind a union of slices
{ (K1:V1 as %x) (K2:V2 as %x) }   # asserting two slices are the same
```

`%` (pronounced "remainder") defines the slice of fields that didn't fall into any of the declared slices or bad sets; in other words, the **entries whose keys did not match any of the field clauses, regardless of whether the values matched.**  (The predominant use case is the fall-through of unrecognized fields, not the fall-through of invalid values.)

It may appear only once in the object pattern, only at the end. You can bind it or quantify it.

```
{ K1:V1 K2:V2 }             # No constraint on remainder
{ K1:V1 K2:V2 % }           # Remainder is nonempty
{ K1:V1 K2:V2 %#{0} }       # Remainder is empty (closed object)
{ K1:V1 K2:V2 %#{3,4} }     # Remainder is of size 3-4
{ K1:V1 K2:V2 (% as %rest) }   # Bind it
```

Field clauses are evaluated non-exclusively: a single key-value pair may satisfy multiple clauses.

### Object Evaluation Order

Field clauses produce results consistent with **left-to-right evaluation**. Bindings established by earlier clauses are visible to later ones. This enables patterns where one clause binds a variable and a subsequent clause constrains it.

Each field clause selects a **witness** — one key-value pair where both K and V match. If multiple pairs qualify, the matcher branches, producing one solution per witness:

```javascript
{ /a.*/:$x }  matching {a1:1, a2:2}
// Two solutions: {x:1} and {x:2} — one witness each
```

**`else !` with unbound variables:**

When V contains an unbound variable like `$x`, matching V against a value *binds* `$x`. This means the value is in the slice, not the bad set. Therefore `else !` is not a "universal equality" operator — it means "no bad entries exist," where bad means "fails to match the field clause's value pattern":

```javascript
{ /a.*/: $x else ! }  matching {a1:1, a2:2}
// Succeeds with two solutions: {x:1} and {x:2}
// Each value matches $x (by binding), so no bad entries

{ /a.*/: 1 else ! }   matching {a1:1, a2:2}
// Fails — a2:2 is a bad entry (2 doesn't match 1)
```

**Universal equality idiom:** To enforce that all matching keys have the same value, bind first, then use `else !` with the bound variable:

```javascript
{ /a.*/:$x  /a.*/: $x else ! }  matching {a1:1, a2:2}
// Fails — first clause binds x, second requires ALL /a.*/
// values to match that x. With x=1, a2:2 is a bad entry.

{ /a.*/:$x  /a.*/: $x else ! }  matching {a1:1, a2:1}
// Succeeds with x=1 — all values match
```

### Quantifiers

**Array quantifiers** operate sequentially with backtracking. Greedy quantifiers consume as much as possible, lazy quantifiers as little as possible, possessive quantifiers do not backtrack.

**Object quantifiers** count matching pairs globally after all matches are found, then assert the count is within range. No backtracking.

### Lookaheads

Lookaheads (`(?P)`, `(!P)`) test whether pattern P matches at the current position without consuming input. Positive lookaheads commit bindings from successful matches and enumerate all binding possibilities. Negative lookaheads (`(!P)`) assert that P does NOT match and never commit bindings.

### Labels

**Labels** attach names to AST nodes using `§name` (section sign + identifier). Labels can appear on objects and arrays:

```javascript
§outer { a: §inner { b: 1 } }   // nested labeled objects
§items [1, 2, 3]                // labeled array
```

Labels serve multiple purposes:
- **Structural comments**: Name parts of a complex pattern for readability
- **Scope references**: Other constructs can refer to labeled scopes (see `->@bucket<^label>` in CW 14)
- **Disambiguation**: When patterns have nested iterations, labels identify which scope to target

Labels do not affect matching semantics—they are metadata attached to the AST node


##  '->' operator and aggregation

### Summary

The `->` operator collects matching k:v pairs into buckets during object iteration. It is deliberately distinct from `=` binding:

| Syntax | Meaning | On repetition |
|--------|---------|---------------|
| `(P as %x)` | bind (object slice) | unify |
| `(P as @x)` | bind (array slice) | unify |
| `P -> %x` | flow k:v pairs into | accumulate |
| `P -> @x` | flow values into | accumulate |

The arrow visually suggests "pour into a bucket." Users won't confuse it with binding because it doesn't look like binding.

### Semantics

`(S -> %foo)` succeeds iff `S` succeeds at that value. On success, it records the current key:value pair into bucket `%foo`. Use `-> @foo` to collect values only (no keys).

**Aggregation target:**

- Default: nearest enclosing OBJ or ARR in the AST (lexically obvious)
- With label: `->%foo<^L>` targets the scope labeled `§L`
- See CW 16 for the full label design

**Bucket types:**

- Object buckets (`%name`): collect `{key: value, ...}` pairs
- Array buckets (`@name`): collect `[value, ...]` (values only, no keys)

**Collision handling:**

- Same key + same value: deduplicated (only one entry kept)
- Same key + different value: the pattern **fails** (collision)
- Failure scope: the containing object/array pattern (backtracking can try alternatives)
- This prevents silent data loss from overwrites

**Branch isolation:**

- Buckets are cloned on branch (like bindings)
- Failed branches do not contribute to buckets
- Only successful branches accumulate into the final bucket

If the same bucket appears in multiple arms/places within the same enclosing scope, they accumulate into the same bucket (subject to collision rules). You cannot use both `%foo` and `@foo` in the same pattern—they are distinct bucket types.

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
| `K: V1->%a else V2->%b` | Collect matching k:v's into buckets; non-matching k's ignored; require at least one match |
| `K: V1->%a else V2->%b else !` | Collect matching k:v's; **fail** if any k doesn't match V1 or V2 |
| `K: V1->%a else V2->%b else _->%rest` | Collect **all** k:v's (complete coverage) |
| `K: V else _` | At least one match; silently ignore non-matching k's (no collection) |

**Note:** `{ K:V else _->%bad }` collects non-matching values but never fails. Use `else !` if you want validation.

### Unpopulated buckets

If a bucket is never populated (its branch is never taken), it is **undefined**, not empty `{}`. This is consistent with how Tendril treats other variables—they are bound by matching, not declared.

If you need "empty if none," handle it in user code:

```javascript
const good = solution.good ?? {};
```

### Operator precedence

From strongest to weakest:

```
%foo=, @foo=   // binding, unary
->             // binary
else           // binary
```

So `K:V -> %x else W -> %y` parses as `K:((V -> %x) else (W -> %y))`. Parentheses are redundant but recommended for legibility; use multiple lines for complex categorizations.

### Implementation notes

- `S` is not a backtracking point, but may fail early (empty quantifier on slice) or late (non-empty quantifier checked after iteration).
- Although `K:V` normally asserts only one-or-more witnesses, presence of `->` requires the engine to iterate all matching witnesses (to collect them all). This is inherent to categorization/validation, not a hidden cost.

**Bucket type semantics:**
- `-> %bucket` in object context: collects `{key: value}` pairs
- `-> %bucket` in array context: collects `{index: value}` pairs
- `-> @bucket` in any context: collects values only (into an array)

### Test case 1

```
data = {a:[
    { b1:'d11',b2:'d12',b3:'x' },
    { z:'d13' },
    { b3:'d24', x:'d25' },
    { b4:'d34', x:'d25' },
]}
pattern = {
    a[$i]:({/b.*/:((/d1.*/ as $x) -> %foo)
                  else (/d3.*/->%bar)}
          | _)   // fallback to show non-matching $i's
}
// solutions:
//   {i:0, x:'d11', foo:{ b1:'d11',b2:'d12' } }
//   {i:0, x:'d12', foo:{ b1:'d11',b2:'d12' } }
//   {i:1}
//   {i:2}
//   {i:3, bar:{ b4:'d34'} }
```

### Test Case 2

```
pattern = { $k: {/a/:_->%a }->%y else {/b/:_->%b}->%z }
data = { foo: {a1:1, a2:2, b1:3}, bar: {a3:4, a4:5} }
// The 'y' branch is always taken because both of the outer values contain an object with at least
// one /a/ key. The 'z' branch is never taken. Therefore %b is never populated
// Solutions:
{k:'foo', a:{a1:1, a2:2}, y:{ foo: {a1:1, a2:2, b1:3}, bar: {a3:4, a4:5} }}
{k:'bar', a:{a3:4, a4:5}, y:{ foo: {a1:1, a2:2, b1:3}, bar: {a3:4, a4:5} }}
```

Labels allow explicit control over aggregation scope.

**Syntax:**

- `§label` — declare a label (attaches to OBJ or ARR node)
- `^label` — reference a label (in flow operator)
- `->%bucket<^L>` — flow to %bucket, keyed by iteration at scope §L

**Example:**

```
§L { $key: { name: ($n -> %names<^L>) } }
// data: {a: {name: "alice"}, b: {name: "bob"}}
// result: %names = {a: "alice", b: "bob"}
```

Without the label, %names would be keyed by `name` (inner scope), giving `{name: "alice"}` then `{name: "bob"}` — overwriting.

### Semantics

**Target resolution:**

- `->%bucket<^L>` — aggregation target is the OBJ or ARR node labeled §L
- `->%bucket` (no label) — aggregation target is nearest ancestor OBJ or ARR
- The target must be an ancestor of the flow operator (compile-time check)

**Bucket types:**

- Object buckets (`%name`): collect `{key: value, ...}` pairs
- Array buckets (`@name`): collect `[value, ...]` (values only)

In object context, the key comes from K:V iteration. In array context with `%bucket`, indices become keys (`{0: v0, 1: v1, ...}`).

**Collision handling:**

- If the same key is flowed twice, the pattern fails
- Failure scope: the containing object/array pattern (not the whole match)
- Backtracking can try alternatives
- Future work: configurable collision policies (overwrite, merge, etc.)

### Label rules

- Labels attach to AST nodes (annotations), not separate node types
- Labels are global and must be unique within a pattern
- For now, labels may only appear on OBJ or ARR nodes
- Future work: labels anywhere in AST, local/scoped labels

### Flow in arrays

Flow is now allowed inside arrays:

```
§L { $k: [ (X->%items<^L>)* ] }
// data: {a: [1,2,3], b: [4,5]}
// result: %items = {a: {0:1, 1:2, 2:3}, b: {0:4, 1:5}}
```

Without a label, Flow uses the nearest scope. If that's an array, indices become keys.

### Categorization in arrays

```
[ ({type:cat}->%cats else {type:dog}->%dogs else _->%other)* ]
// data: [{type:cat, name:"fluffy"}, {type:dog, name:"spot"}, {type:fish}]
// result: %cats = {0: {...fluffy}}, %dogs = {1: {...spot}}, %other = {2: {...fish}}
```

### Grammar additions

```
LABEL_DECL := '§' IDENT
LABEL_REF  := '^' IDENT

// Labels attach to OBJ or ARR:
OBJ := LABEL_DECL? '{' O_BODY '}'
ARR := LABEL_DECL? '[' A_BODY ']'

// Flow operator with optional label reference:
FLOW := ITEM_TERM '->' BUCKET_REF ('<' LABEL_REF '>')?

BUCKET_REF := '%' IDENT | '@' IDENT
```

### Implementation notes

- Parser: `§ident` attaches `label` property to AST node
- Parser: `^ident` in flow stores `labelRef` in Flow node
- Engine: track `currentKey` for each labeled scope during descent
- Engine: Flow looks up label → gets currentKey → uses as bucket key
- Engine: collision detection in `addToBucket` — fail if key exists

**End of Specification**

---

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
  **:({
    tag: label,
    props: {for: $id},
    children: [(/.*/ as $labelText)]
  } as %label)
  **:{
    tag: input,
    props: {id: $id, type: text},
    (placeholder:_? as %placeholder)
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
