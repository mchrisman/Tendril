# Tendril: Pattern Matching for Tree Structures

**Tendril** is a declarative language for matching, transforming, and querying JSON-like tree data. It combines the familiar syntax of regex with Prolog-style unification, offering a sweet spot between simple path queries (JSONPath, jq) and full logic programming.

Patterns resemble the data they match. Arrays use regex-like operators. Objects use declarative assertions. Variables capture and unify across the pattern.

## Quick Start

Tendril patterns look like the data they match:

```javascript
// Extract a value
Tendril("{ name: $x }")
  .solutions({name: "Alice", age: 30})
// → [{x: "Alice"}]

// Match array patterns
Tendril("[1 2 $x]")
  .solutions([1, 2, 3])
// → [{x: 3}]

// Use wildcards
Tendril("[1 .. 5]")
  .matches([1, 2, 3, 4, 5])
// → true
```

Variables starting with `$` capture single values. The pattern must match for the query to succeed. If the same variable appears twice, unification ensures both occurrences match the same value.

## Example: Relational Joins

Tendril excels at joining data across different paths in a structure, much like SQL joins but for nested JSON:

```javascript
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

This pattern extracts planet names from keys in the `planets` object, finds their sizes, then searches through the nested `aka` arrays to find all aliases for each planet. The `(?=$name)` lookahead asserts that the first element of each alias array must equal the already-bound planet name. The `..` wildcards match any subsequence, making the pattern resilient to array structure.

---

# Core Concepts

## Primitives

Tendril matches primitives using literal values or patterns:

```javascript
foo            // matches the exact string "foo" (bare identifier)
"foo bar"      // quoted strings match strings containing spaces or punctuation

/foo/          // regex matches any substring — "seafood" matches (contains "foo")
/foo/i         // case-insensitive — "FOOdish", "seaFOOd" both match
/^[A-Z]{2,}$/  // regex anchors match whole string — "NASA", "OK", not "Ok!"

123            // matches numeric value 123 (123 and 123.0 equivalent)
true           // matches Boolean true only
false          // matches Boolean false only
null           // matches null only
_              // wildcard matches any single value
```

Strings can be written as barewords (alphanumeric identifiers) or quoted. Regex patterns use JavaScript regex syntax and match against string values only.

## Arrays

Arrays are matched positionally, similar to regex. Patterns specify exact sequences unless wildcards are used:

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

The `|` operator creates alternatives. Quantifiers bind tighter than adjacency. Lookaheads test without consuming:

```javascript
[(?! .. 3 4) ..]   // matches arrays NOT containing subsequence [3,4]
                   // e.g., [4, 3, 2, 1] matches, [1, 2, 3, 4] doesn't
```

## Objects

Object patterns differ fundamentally from array patterns. Rather than matching positionally, object patterns are sets of assertions. Each assertion tests whether certain key-value pairs exist and satisfy conditions.

An assertion `K:V` means: "There exists at least one key matching K with value matching V, and for every key matching K, the value must match V."

An assertion `K?:V` means: "For every key matching K (if any exist), the value must match V."

```javascript
{ a:b, c:d }       // matches {"a":"b", "c":"d", "e":"f"}
                   // All assertions satisfied; "e":"f" is extra (allowed)

{ a:b, x:y }       // does NOT match {"a":"b", "c":"d", "e":"f"}
                   // x:y assertion not satisfied (no "x" key)

{ a:b, x?:y }      // matches {"a":"b", "c":"d", "e":"f"}
                   // x?:y is optional — satisfied trivially (no "x" key)

{ a:b, x?:y }      // does NOT match {"a":"b", "c":"d", "x":"w"}
                   // x?:y not satisfied ("x" exists but value != "y")
```

Commas are optional. Assertions are unordered. Multiple assertions can match the same key-value pair:

```javascript
{ /a|b/:/x/ /b|c/:/y/ }  // matches {"a":"x", "b":"xy"}
                         // "b":"xy" satisfies both assertions
```

### Remainder

The keyword `remainder` refers to all key-value pairs whose keys didn't match any assertion:

``` 
{ a:b }                    // matches {"a":"b", "c":"d"}
                           // remainder is {"c":"d"}

{ a:b remainder }          // does NOT match {"a":"b"}
                           // remainder assertion requires nonempty remainder

{ a:b (?!remainder) }      // does NOT match {"a":"b", "c":"d"}
                           // (?!remainder) asserts empty remainder

{ a:_ (?!remainder) }      // matches iff 'a' is the only key
```

Bind the remainder to capture it:

``` 

// CAUTION: this form asserts that the remainder is nonempty
{ a:b @rest=(remainder) }  // matches {"a":"b", "c":"d"}, binds {"c":"d"} to @rest

// Common idiom: bind the remainder without asserting it's nonempty:
{ a:b @rest=(remainder?) }
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
{ (?! a:1) }           // key 'a' must not have value 1
{ (?! a?:1) }          // key 'a' exists and its value must not be 1.
{ (?! a:1 b:2) }       // can't have BOTH a:1 and b:2 (one is OK)
{ (?! a:1) (?! b:2) }  // can't have a:1 AND can't have b:2
```

## Capturing Variables

Tendril has two kinds of variables: **scalars** (prefix `$`) capture single values, and **groups** (prefix `@`) capture sequences or sets. Groups are like slices, neither a single element nor the entire array/object.
```
    Tendril("[1 $x 9]").solutions([1, 2, 9])        // → [{x: "2"}]
    Tendril("[1 $x 9]").solutions([1, 2, [3], 9])   // → []   // no solution in which $x is a single value
    Tendril("[1 $x 9]").solutions([1, [2, [3]], 9]) // → [{x: [2 [3]]}]                // *
    
    Tendril("[1 @x 9]").solutions([1, 2, 9])        // → [{x: Group.array(2)}]
    Tendril("[1 @x 9]").solutions([1, 2, [3], 9])   // → [{x: Group.array(2 [3])}]     // *
    Tendril("[1 @x 9]").solutions([1, [2, [3]], 9]) // → [{x: Group.array([2 [3]])}]   // *
    
    Tendril("[_ @x _]").replace([1 2 9], vars=>{x:10})   //  → [1, 10, 9]
    Tendril("[_ @x _]").replace([1 2 9], vars=>{x:[10,11]})   //  → [1, [10,11], 9]
    Tendril("[_ @x _]").replace([1 2 9], vars=>{x:Group.array(10,11)})   //  → [1, 10, 11, 9]
``` 

### Scalars

Scalars capture exactly one item. In arrays, this means one element. In objects, one key or one value:

```javascript
// Multiple solutions
Tendril("[ .. $x .. ]")
  .solutions(["a", "b"])
// → [{x: "a"}, {x: "b"}]

// First solution only
Tendril("[ $x .. ]")
  .solutions(["a", "b"])
// → [{x: "a"}]
```

Each possible binding creates a separate solution. The scalar `$x` must bind to a single value, so the first pattern generates two solutions (one for each element), while the second generates only one (binding to the first element).

### Groups

Groups capture zero or more items. In arrays, they capture subsequences. In objects, they capture sets of key-value pairs:

```javascript
Tendril("[ @x .. ]")
  .solutions(["a", "b"])
// → [
//   {x: Group()},
//   {x: Group("a")},
//   {x: Group("a", "b")}
// ]

Tendril("[ $x @y ]")
  .solutions([[1,2], [3,4]])
// → [{x: [1,2], y: Group(3,4)}]
```

Groups are represented as `Group` objects to distinguish them from array references. Groups are like slices: neither a single object, nor the entire array.

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

[$x=(1? 2?)]       // matches only [1] or [2]
                   // $x must bind to a scalar, so can't match [] nor [1,2]

[@x=(1? 2?)]       // matches [], [1], [2], [1,2]
                   // @x can bind to zero, one, or two elements
```

## Paths

Object assertions can navigate through nested structures using path notation:

```javascript
{ a.b.c:d }        // equivalent to { a:{ b:{ c:d } } }
                   // descends through nested objects

{ a[3].c:d }       // equivalent to { a:[_ _ _ { c:d } ..] }
                   // array index then object key

Tendril("{ a.b.c[3].e:f }").matches(object)   // like object?.a?.b?.c?.[3]?.e === "f"
```

The `..` operator skips arbitrary levels of nesting:

```javascript
{ a.b..c:d }       // matches 'c' at any depth under a.b
                   // e.g., {a: {b: {p: {q: {c: "d"}}}}}

{ ..password:$p }  // matches 'password' at any depth (including top-level)
                   // e.g., {password: "x"} or {user: {password: "x"}}

{ ..:_ }           // matches every value at any depth
```

Leading `..` means "start from root, navigate to any depth." Paths can combine dots, brackets, and skip operators freely.

## Quantifiers on Objects

Object quantifiers count matching key-value pairs after all matches are found (no backtracking):

```javascript
{ /a.*/:_ #{2,4} }     // object has 2-4 keys matching /a.*/
{ /a.*/:_ #{0} }       // object has no keys matching /a.*/
{ a:b remainder #{0} } // require no residual pairs (closed object)
```

The `#` quantifier follows an assertion and requires a specific count range. Unlike array quantifiers, object quantifiers operate globally over all key-value pairs, not sequentially.

## Lookaheads

Lookaheads test conditions without consuming data or committing bindings:

```javascript
(?=PATTERN)        // positive lookahead (must match)
(?!PATTERN)        // negative lookahead (must not match)
```

In arrays:

```javascript
[ (?= $x=(/[ab]/)) $x .. ]  // first element must match /[ab]/

[ (?! .. 3 4) .. ]           // array must not contain [3,4] subsequence
```

In objects, lookaheads typically test for key existence or conditions.

## Precedence

**High to low:**

1. Binding `=`
2. Optional `?`, quantifiers `+`, `*`, etc.
3. Breadcrumb operators `.`, `..`, `[]`
4. Adjacency/commas (in arrays and objects)
5. Alternation `|`
6. Key-value separator `:`, `?:`

Parentheses override precedence. Lookaheads always require parentheses.

---

# API Overview

## Query API

```javascript
const tendril = Tendril(pattern);

// Get all solutions
tendril.solutions(data)  // Returns array of binding objects

// Example
Tendril("{ users.$id.name:$name }")
  .solutions(data)
  .forEach($ => console.log($.id, $.name));
```

## Transformation API

Replacements modify the input structure in place. Clone the data first if immutability is desired.

```javascript
// Replace entire input using first (longest) match
tendril.replace(data, vars => newValue)

// Replace all non-overlapping occurrences
tendril.replaceAll(data, vars => ({varName: newValue}))
```

**Replacement examples:**

```javascript
// Swap array elements
Tendril("[$x $y]").replace([3, 4], $ => [$.y, $.x])
// Result: [4, 3]

// Replace group variables
Tendril("[@x 99 @y]").replace([1, 2, 99, 4], $ => [...$.y, 99, ...$.x])
// Result: [4, 99, 1, 2]

// Transform object structures
Tendril("{ ..password:$p }")
  .replaceAll(data, $ => ({p: "REDACTED"}))
// Redacts all password fields at any depth
```

---

# When to Use Tendril

### ✅ Perfect fit

**1. Structural tree transformations (AST/VDOM manipulation)**

```javascript
// Macro expansion: <When>/<Else> → If node
Tendril(`[
  ..
  @whenelse:(
    {tag:/^when$/i children:$then}
    {tag:/^else$/i children:$else}?
  )
  ..
]`).replaceAll(vdom, $ => ({
  whenelse: Group.array({
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
  users:$userId.name:$userName
  users:$userId.managerId:$managerId
  projects:$projectId.assigneeId:$userId
  projects:$projectId.name:$projectName
}`).solutions(data)
```

**3. Deep search-and-replace with structural awareness**

```javascript
// Redact sensitive fields at any nesting level
Tendril("{ ..password:$value }")
  .replaceAll(data, $ => ({value: "REDACTED"}))
```

**4. Data extraction from semi-structured formats**

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

The complete Tendril grammar in informal EBNF follows. Whitespace and C-style comments (`/* */`, `//`) are allowed between tokens. Whitespace is significant only as a token delimiter in array sequences.

### Literals

```
INTEGER         := decimal integer (matches Number type)
BOOLEAN         := true | false
QUOTED_STRING   := quoted string literal
REGEX           := /pattern/flags (JS regex literal)
BAREWORD        := [A-Za-z_][A-Za-z0-9_]* unless keyword
_               := singleton wildcard (matches any single value)

LITERAL := INTEGER | BOOLEAN | QUOTED_STRING | REGEX | BAREWORD

IDENT := /[a-zA-Z]\w*/
```

### Core Productions

```
ROOT_PATTERN := ITEM

S_ITEM   := '$' IDENT
S_GROUP  := '@' IDENT

ITEM := '(' ITEM ')'
      | S_ITEM
      | S_ITEM '=' '(' ITEM ')'
      | '_'
      | LITERAL
      | OBJ
      | ARR
      | ITEM '|' ITEM
```

### Arrays

```
ARR := '[' A_BODY ']'

A_BODY := (A_GROUP (','? A_GROUP)*)?

A_GROUP := '(' A_BODY ')'
         | S_GROUP
         | S_GROUP '=' '(' A_GROUP ')'
         | S_ITEM
         | S_ITEM '=' '(' A_GROUP ')'
         | ITEM
         | OBJ
         | ARR
         | A_GROUP A_QUANT
         | A_GROUP '|' A_GROUP
         | '(?=' A_GROUP ')'
         | '(?!' A_GROUP ')'

A_QUANT := '?'
         | '+' | '+?' | '++'
         | '*' | '*?' | '*+'
         | '*{' INTEGER '}'
         | '*{' INTEGER ',' INTEGER '}'
         | '*{' INTEGER ',' '}'
         | '*{' ',' INTEGER '}'
```

The `*{m,n}` syntax is used (rather than `{m,n}`) to mirror the `#` quantifier for objects and to suggest multiplication/repetition.

### Objects

```
OBJ := '{' O_BODY '}'

O_BODY := (O_GROUP (','? O_GROUP)*)?

O_GROUP := '(' O_BODY ')'
         | S_GROUP
         | S_GROUP '=' '(' O_GROUP* ')'
         | O_TERM

KEY   := ITEM
VALUE := ITEM

O_TERM := KEY BREADCRUMB* (':' | '?:') VALUE O_QUANT?
        | 'remainder' O_QUANT?
        | '..' BREADCRUMB* (':' | '?:') VALUE O_QUANT?
        | S_ITEM '=' '(' O_TERM ')'

BREADCRUMB := '.' KEY
            | '..' KEY
            | '[' KEY ']'

O_QUANT := '#' ('?' | '{' INTEGER (',' INTEGER?)? '}')
```

Leading `..` in `O_TERM` enables paths like `{..password:$x}` (match at any depth including zero).

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

### Object Assertions

Each `K:V` assertion means:
1. For all key-value pairs in the object, if the key matches K, then the value must match V
2. At least one key must match K

Each `K?:V` assertion means:
1. For all key-value pairs in the object, if the key matches K, then the value must match V
2. (No existence requirement)

Assertions are evaluated non-exclusively: a single key-value pair may satisfy multiple assertions.

### Quantifiers

**Array quantifiers** operate sequentially with backtracking. Greedy quantifiers consume as much as possible, lazy quantifiers as little as possible, possessive quantifiers do not backtrack.

**Object quantifiers** count matching pairs globally after all matches are found, then assert the count is within range. No backtracking.

### Lookaheads

Lookaheads (`(?=P)`, `(?!P)`) test whether pattern P matches at the current position without consuming input or committing bindings. Negative lookaheads (`(?!P)`) assert that P does NOT match.

## Conventions

`~=` and `===` appear in examples as shorthand for illustration only. They are not part of Tendril syntax.

- `foo ~= bar` means `Tendril("foo").matches(bar) === true`
- `p1 === p2` indicates semantic or syntactic equivalence

The data model is JSON-like: objects, arrays, strings, numbers, booleans, null. Regex literals use JavaScript regex syntax.

---

**End of Specification**
