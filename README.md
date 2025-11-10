# **Tendril: Pattern Matching and Transformation for Tree Structures**

## 1. Overview

**Tendril** is a small declarative language for **structural matching, transforming, extracting, or joining** JSON-like tree data (objects, arrays, primitives).

Tendril is:

* **Regex**, but on **trees** instead of strings
* **Prolog-style unification**, without requiring logic programming knowledge
* **Right between** JSONPath/jq and Prolog in both power and ease.

Patterns resemble the data they match, with minimal extra syntax, and with syntax familiar to Regex and JSON users.

```
// "Hello, worlds"
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

const pattern = `{
  planets: { $name: { size: $size } }
  aka: [
    ..
    [ (?=$name) .. $alias .. ]
    ..
  ]
}`

Tendril(pattern)
  .solutions(data)
  .map(solution => `Hello, ${solution.size} world ${solution.alias}`)

// output  
[
  "Hello, big world Jupiter",
  "Hello, big world Jove",
  "Hello, big world Zeus",
  "Hello, small world Earth",
  "Hello, small world Terra",
  "Hello, tiny world Ceres",
  "Hello, tiny world Demeter"
]
```

---

## Core Concepts

### Primitives

```
foo                    // matches the exact string "foo" (bare identifier)
"foo bar"              // quoted strings match strings containing spaces or punctuation

/foo/                  // regex matches *any substring* — "seafood" matches (contains "foo")
/foo/i                 // case-insensitive substring match — "FOOdish", "seaFOOd" both match
/^[A-Z]{2,}$/          // regex anchors to whole string — matches "NASA", "OK", but not "Ok!"

123                    // matches numeric value 123 (123 and 123.0 equivalent)

true                   // matches Boolean true only
false                  // matches Boolean false only
null                   // matches null only
```

### Arrays

```
[1,2,3]        // matches [1,2,3]
[1 2 3]        // matches [1,2,3]. Commas are optional.
[1 2]          // ❌does not match [1,2,3].
[1 2 _]        // matches [1,2,3]. Wildcard _ matches a single item
[1 _]          // ❌does not match [1,2,3]. Wildcard _ does not match multiple items
[1 ..]         // matches [1,2,3]. Wildcard '..' matches any subsequence (a more readable equivalent to `_*?`).
[.. 1 2 3 ..]  // matches [1,2,3]. '..' can even match zero-length subsequences.

// Whitespace is insignificant, *except* as a token delimiter.
[ foobar ]     // matches ["foobar"], ❌does not match ["foo","bar"]
[ foo bar ]    // matches ["foo","bar"], ❌does not match ["foo bar"]

```

### Objects

An object pattern is an unordered set of predicates, each of the form

- `K?:V`, which means for all key/value properties in the object, if the key matches K then the value must match V;
- `K:V`, which means the same thing **and** that there exists at least one key matching K.

```
{ /[ab]/:/[cd]/ }   // matches object {"a":"c"}. Does not match any array or string.
{ a:b, c:d }    // matches {"a":"b", "c":"d", "e":"f"}.  All predicates are satisfied.
{ a:b, x:y }    // ❌does not match {"a":"b", "c":"d", "e":"f"}.  `x:y` not satisfied.
{ a:b, x?:y }   // matches {"a":"b", "c":"d", "e":"f"}.  `x?:y` is trivially satisfied.
{ a:b, x?:y }   // ❌does not match {"a":"b", "c":"d", "x":"w"}. `x?:y` not satisfied.

{ /a|b/:/x/  /b|c/:/y/ }  // matches {"a":"x", "b":"y"}. Commas are optional.

Every predicate must be satisfied by at least one key-value pair, but the same key-value pair may satisfy multiple predicates:

{ /a|b/:/x/  /b|c/:/y/ }  //matches { b: "xy" }
{ /a|b/:/x/ /b|c/:/y/ }  // does not match {"b":"x"}. 


```

The keyword `remainder` signifies the set of key/value properties whose keys didn't match any of the predicates' conditions.

```
{ a:b }           // matches {"a":"c", "b":"c", "e":"f"}. Remainder is {"b":"c", "e":"f"}.

{ a:b remainder }         // ❌does not match {"a":"b"}. The `remainder` asserts a nonempty remainder.
{ a:b (?!remainder) }     // ❌does not match {"a":"b", "c":"d"}. The '(?!remainder)' asserts an empty remainder.
{ a:b @rest=(remainder) } // @rest binds to a nonempty remainder
{ a:b @rest=(remainder?) } // @rest binds to a nonempty or empty remainder
{ a:_ (?!remainder) } // matches iff 'a' is the only key
{ a:_ remainder } // matches iff 'a' is not the only key
```

### Operators in arrays

In arrays, all operators borrow their familiar meanings from regexes:

```
[a c* d]           // matches ['a', 'c', 'c', 'c', 'd']
                   // The * repeats the item 'c', not characters within a string
[a c* d]           // ❌does not match ['a', 'ccc', 'd']
                   // 'ccc' is a different item (a single string), not three 'c' items
[a /c*/ d]         // ✓ matches ['a', 'ccc', 'd']
                   // Regex /c*/ matches the string 'ccc'
 
?, ??, ?+          // Optional greedy, optional nongreedy, optional greedy posessive
*, *?, *+          // zero or more greedy, zero or more nongreedy, zero or more greedy posessive
+, +?, ++          // one or more greedy, one or more nongreedy, one or more greedy posessive

{m,n}, {m,}, {,n}, {m}   // Specific numbers of repetitions, greedy

(?=PATTERN)        // lookahead
(?!PATTERN)        // negative lookahead
```

Use parentheses to apply operators to groups.

```
[1 (2 3)*]         // matches [1, 2, 3, 2, 3, 2, 3]
[(3 (4|5)?)*]      // matches [3 4 3 5 3 3 3 5 3 4]
[1 2 (3 4|5 6)]    // matches [1, 2, 5, 6]  
[(?! .. 3 4) ..]   // matches [4, 3, 2, 1] but not [1, 2, 3, 4]
                   // (matches arrays *not* containing the subsequence [3,4])
```

### Operators on key/value predicates

You can use the alternation operator on individual key patterns or value patterns.

```
{ (a|b):c }        // matches if the key is 'a' or 'b', and the value is 'c'
{ a:(b|c) }        // matches if the key is 'a', and the value is 'b' or 'c'
```

You can use the alternation or optional operators on K:V predicates:

```
{ a:b | c:d }     // matches either one

{ (a:b)? }        // matches any object including {"a":"c"}
                  // (useful only if you add a binding);
{ a?:b }          // In contrast, does not match {"a":"c"}
```

You can negate one or more K:V predicates: `(?! pattern )` means the pattern must NOT match.

```
{ (?! a:1) }          // a:1 must not exist

{ (?! a:1 b:2) }      // Can't have both a:1 and b:2
                      // (having just one is OK)

{ (?! a:1) (?! b:2) } // Can't have a:1, can't have b:2
                      // (can't have either one)

{ a:1 (?! remainder) }    // Matches exactly {'a':1} and nothing else. ('remainder' also represents a group, the properties that didn't match any predicate.)

```

### Precedence

**High to low**:
binding `=`
optional `?`, quantifiers `+`, etc.
breadcrumb operators  `.` and `[]`
adjacency/commas inside arrays and objects
`|`
`:`, `?:`
Parentheses override precedence. Lookaheads always require parentheses.

### Variables: Scalars and groups

Tendril has two kinds of variables, similar to named groups or backreferences in regex.

**Scalars** capture exactly one item (a single primitive, or a single array or object reference):

- In arrays: one array entry
- In objects: one key, or one value
- Syntax: `$name`

**groups** capture zero or more items (scoped using parentheses):

- In arrays: a subsequence
- In objects: a subset of key-value pairs
- Syntax: `@name`

**Multiple solutions example**
[ .. $x .. ] applied to ["a","b"]

produces two solutions:
{ x: "a" }
{ x: "b" }

Because `$x` must bind to a *single* item, and each possible binding
yields a distinct solution.

"**Unification**": If the same variable appears twice, it asserts that the value in each position is the same.

```
[ $x .. $x ]  // matches ["a", "some", "other", "stuff", "a"]
              // $x unifies to "a" (appears twice, must be equal)

[ @x @x @y ]     // matches [5, 5, 5, 5, 5]
              // Multiple solutions by different splits:
              // {x:Slice(5, 5), y:Slice(5)}
              // {x:Slice(5), y:Slice(5, 5, 5)}
              // {x:Slice(), y:Slice(5, 5, 5, 5, 5)}
```

A scalar binder `$x:(P)` succeeds exactly when the data matches P at that point AND the matched value is a single value AND unification succeeds.

```
    [ 1? 2? ]         matches any of  [], [1], [2], [1,2]
    [ $x:(1? 2?) ]    matches only [1], [2], because $x must bind to a scalar.
```

### Paths

In objects, the K:V assertions generalize to paths, chains of more than one key or index:

```

    { a.b.c : d }              // Descend through nested objects
    { a[3].c : d }             // Array index then object key

    { a.b.c[3].e:f }  // satisfied iff `object?.a?.b?.c?[3]?.e=="f"`
                      // equivalent to the pattern `{a:{b:{c:[_ _ _ {e:f} ..]}}}`
```

Use '..' to express arbitrary depth.

```
    {a.b..c:d}  // matches {'a': {'b': {'p':[{} {} {'q':{'r':{'c':'d'}}}]}}}
```

## API Overview

**Query API:**

```javascript
const matcher = Tendril(pattern);

// Get all solutions
matcher.solutions(data)  // Returns array of binding objects

// Example
Tendril("{ users.$id.name:$name }")
.solutions(data)
.forEach($ => console.log($.id, $.name));
```

**Transformation API:**

Replacements modify the input structure in place; clone the data first if immutability is desired.

```javascript
// Replace entire input using first (longest) match
matcher.replace(data, vars => newValue)

// Replace all non-overlapping occurrences
matcher.replaceAll(data, vars => ({varName: newValue}))
```

**Replacement examples:**

```javascript
// Swap array elements
Tendril("[$x $y]").replace([3, 4], $ => [$.y, $.x])
// Result: [4, 3]

// Replace group variables
Tendril("[@x 99 @y]").replace([1, 2, 99, 4], $ => [...$.y, 99, ...$.x])
// Result: [4, 99, 2]

// Transform object structures
Tendril("{ _(._)*.password : $p }")
.replaceAll(data, $ => ({p: "REDACTED"}))
// Redacts all password fields at any depth
```

---

## When to Use Tendril

### ✅ **Perfect fit (10%):**

**1. Structural tree transformations (AST/VDOM manipulation)**

```javascript
// Macro expansion: <When>/<Else> → If node
Tendril(`[
  ..
  @whenelse:(
    {tag : /^when$/i, children : $then}
    {tag : /^else$/i, children : $else}?
  )
  ..
]`).replaceAll(vdom, $ => ({
  whenelse: group.array({
    tag: 'If',
    thenChildren: $.then,
    elseChildren: $.else || []
  })
}))
```

**2. Relational queries joining data across paths**

```javascript
// Join users with their projects by ID
Tendril(`{
  users.$userId.name : $userName
  users.$userId.managerId : $managerId  
  projects.$projectId.assigneeId : $userId
  projects.$projectId.name : $projectName
}`).solutions(data)
```

**3. Deep search-and-replace with structural awareness**

```javascript
// Redact sensitive fields at any nesting level
Tendril("{ _..password : $value }")
.replaceAll(data, $ => ({value: "REDACTED"}))
```

#### ⚠️ **Works adequately (40%):**

- Complex validation ("does this data match this schema?")
- Data extraction from semi-structured formats
- Tree walking with pattern-based filtering
- Structural refactoring of configuration files

#### ❌ **Wrong tool (50%):**

- **Simple path queries** - Use JSONPath/Lodash instead
- **Statistical analysis** - Use dedicated data libraries
- **Graph traversal** - Use graph databases
- **Performance-critical operations** - Backtracking can be expensive
- **Dynamic patterns** - Patterns must be known at "compile time"

---

## Advanced examples

Alternating predicate vs. alternating value:

```
{ @x:(a:b|c:d|) } // Matches anything; @x will be one of {"a":"b"}, {"c":"d"}, or {}.
{ @x:(a:(b|c|)) } // Matches iff key 'a' is present; @x will be one of {"a","b"}, {"a","c"}, {"a",null}.
```