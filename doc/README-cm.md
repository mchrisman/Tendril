
**Tendril: Pattern Matching and Transformation for Tree Structures**

## Overview

Tendril is a declarative pattern matching and transformation engine for JSON-like tree structures (objects, arrays, primitives). It combines regex-like pattern syntax with Prolog-style unification to **match** structural patterns and **replace** matched data or **extract solutions**.

**Core capabilities:**

- **Pattern matching** - Describe data shapes with variables, wildcards, and constraints
- **Unification** - Variables that appear multiple times must match equal values (relational logic)
- **Transformation** - Find patterns and replace them with computed results
- **Generator-style iteration** - Produces multiple solutions when patterns match ambiguously

**Key use cases:**

- Structural transformations of AST/VDOM trees (macro expansion)
- Relational queries across nested JSON (joining data from multiple paths)
- Search-and-replace operations on complex data structures
- Validation and extraction from semi-structured data

---


## Design Philosophy

**"Regex for structures."** Through careful crafting of syntax, build a pattern language that:

- Is easily readable for those familiar with regexes
- Uses JSON-like syntax
- Has patterns structurally similar to the data being matched
- Is not much more difficult to master than regexes
- Adds relational logic without additional syntactic complexity

**Not a logic engine.** Tendril is not Prolog or miniKanren. Its solver has basic optimizations but, like SQL and regex, depends on the developer to avoid inefficient expressions.

**Unique positioning:** More powerful than JSONPath or jq, more accessible than Prolog.


---

## Hello Worlds

Let's write a pattern to understand this data:

```
const data = {
  planets: {
    Jupiter: {size: "big"},
    Earth: {size: "small"},
    Ceres: {size: "tiny"}
  },
  aka: [
    ["Jupiter", "Jove", "Zeus"],  // canonical name is listed first
    ["Earth", "Terra"],
    ["Ceres", "Demeter"]]
}
```

Tendril supports both **compact** (path-like) and **verbose** (structure-mirroring) syntax.
**Both are equivalent.**

```javascript
// Compact style - concise, path-focused
const pattern = `{
  planets.$name.size=$size
  aka[$idx][_]=$alias
  aka[$idx][0]=$name
}`

// Verbose style - mirrors data structure
const pattern = `{
  planets = {
      $name = {size = $size}
  }
  aka = [ .. 
           [(?=$name) .. $alias ..]
        .. ] 
}`

Tendril(pattern) // Use either pattern
.solutions(data)
.map($ => `Hello, ${$.size} world ${$.alias}`)

// Output
[
    "Hello, big world Jupiter",
    "Hello, big world Jove",
    "Hello, big world Zeus",
    "Hello, small world Earth",
    "Hello, small world Terra",
    "Hello, tiny world Ceres",
    "Hello, tiny world Demeter",
]
```

---

## Core Concepts

### Primitives
```
foo            // matches the exact string "foo"
"foo bar"      // matches "foo bar" (quotes required for non-alphanumeric strings)
/foo/          // matches "foo bar" (Javascript-style regex)
/^foo$/        // matches "foo" (but not "foo bar")

123            // matches an equivalent number (e.g. 123.0)

true           // matches Boolean true (nothing else)
```
### Arrays
```
[1,2,3]        // matches [1,2,3]
[1 2 3]        // matches [1,2,3]. Commas are optional.
[123]          // ❌does not match [1,2,3]. Whitespace is insignificant, *except* as a token delimiter.
[1 2]          // ❌does not match [1,2,3].
[1 2 _]        // matches [1,2,3]. Wildcard _ matches a single item
[1 _]          // ❌does not match [1,2,3]. Wildcard _ does not match multiple items
[1 ..]         // matches [1,2,3]. Wildcard '..' matches any subsequence.
[.. 1 2 3 ..]  // matches [1,2,3]. '..' can even match zero-length subsequences.

```
### Objects
An object pattern is an unordered set of predicates.

- `K?:V` means for all key/value properties in the object, if the key matches K then the value must match V
- `K:V` means the same thing **and** that there exists at least one key matching K.
- 
```
{ a:b, c:d }    // matches {"a":"b", "c":"d", "e":"f"}.  All predicates are satisfied.
{ a:b, x:y }    // ❌does not match {"a":"b", "c":"d", "e":"f"}.  `x:y` not satisfied.
{ a:b, x?:y }   // matches {"a":"b", "c":"d", "e":"f"}.  `x?:y` is trivially satisfied.
{ a:b, x?:y }   // ❌does not match {"a":"b", "c":"d", "x":"w"}. `x?:y` not satisfied.

{ /a|b/:/x/ /b|c/:/y/ }  // matches {"b":"xy"}. Commas are optional.
{ /a|b/:/x/ /b|c/:/y/ }  //cdoes not match {"b","x"}. If two predicates overlap, they both apply.
```
`%` signifies the remainder, the set of key/value properties whose keys didn't match any of the predicates' conditions.
```
{ a:b }           // matches {"a":"c", "b":"c", "e":"f"}. Remainder is {"b":"c", "e":"f"}.
{ a:b % }         // ❌does not match {"a":"b"}. The `%` asserts a nonempty remainder.
{ a:b (?!%) }     // ❌does not match {"a":"b", "c":"d"}. The '(?!%)' asserts an empty remainder.
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

You can negate a pattern: `(?! pattern )` means the pattern must NOT match.
```
{ (?! a:1) }          // a:1 must not exist

{ (?! a:1 b:2) }      // Can't have both a:1 and b:2
                      // (having just one is OK)

{ (?! a:1) (?! b:2) } // Can't have a:1, can't have b:2
                      // (can't have either one)

{ a:1 (?! %) }    // Matches exactly {'a':1} and nothing else. ('%' also represents a group, the properties that didn't match any predicate.)

```

### Precedence
**High to low**:
    binding `=`
    optional `?`,  quantifiers `+`, etc.
    breadcrumb operators  `.` and `[]`
    adjacency/commas inside arrays and objects
    `|`
    `=`, `?=`
    Parentheses override precedence. Lookaheads always require parentheses.

### Variables: Scalars and groups

Tendril has two kinds of variables, similar to named groups or backreferences in regex.

**Scalars** capture exactly one value:

- In arrays: one item
- In objects: one key, or one value
- Syntax: `$name`

**groups** capture zero or more items (scoped using parentheses):

- In arrays: a subsequence
- In objects: a subset of key-value pairs
- Syntax: `@name`

"**Unification**": If the same variable appears twice, it asserts that the value in each position is the same.
```
[ $x .. $x ]  // matches ["a", "some", "other", "stuff", "a"]
              // $x unifies to "a" (appears twice, must be equal)

[ @x @y ]     // matches [1, 2, 3, 4]
              // Multiple solutions by different splits:
              // {x:[1,2,3,4], y:[]}
              // {x:[1,2,3], y:[4]}
              // {x:[1,2], y:[3,4]}
              // etc.
```

A scalar binder `$x:(P)` succeeds exactly when the data matches P at that point AND the matched value is a single value AND unification succeeds.

```
    [ 1? 2? ]         matches any of  [], [1], [2], [1,2]
    [ $x:(1? 2?) ]    matches only [1], [2], because $x must bind to a scalar.
```

### Paths

In objects, the K:V assertions generalize to paths, chains of more than one key or index:
```

    { a.b.c = d }              // Descend through nested objects
    { a[3].c = d }             // Array index then object key

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
Tendril("{ users.$id.name=$name }")
  .solutions(data)
  .forEach($ => console.log($.id, $.name));
```

**Transformation API:**

```javascript
// Replace entire input using first (longest) match
matcher.replace(data, vars => newValue)

// Replace all non-overlapping occurrences
matcher.replaceAll(data, vars => ({varName: newValue}))
```

**Replacement examples:**

```javascript
// Swap array elements
Tendril("[$x $y]").replace([3,4], $ => [$.y, $.x])
// Result: [4, 3]

// Replace group variables
Tendril("[@x 99 @y]").replace([1,2,99,4], $ => [...$.y, 99, ...$.x])
// Result: [4, 99, 2]

// Transform object structures
Tendril("{ _(._)*.password = $p }")
  .replaceAll(data, $ => ({ p: "REDACTED" }))
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
    {tag = /^when$/i, children = $then}
    {tag = /^else$/i, children = $else}?
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
  users.$userId.name = $userName
  users.$userId.managerId = $managerId  
  projects.$projectId.assigneeId = $userId
  projects.$projectId.name = $projectName
}`).solutions(data)
```

**3. Deep search-and-replace with structural awareness**

```javascript
// Redact sensitive fields at any nesting level
Tendril("{ _..password = $value }")
  .replaceAll(data, $ => ({ value: "REDACTED" }))
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