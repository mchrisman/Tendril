# Tendril: Pattern Matching for Tree Structures

**Tendril** is a declarative language for matching, transforming, and querying JSON-like tree data. It combines the familiar syntax of regex with Prolog-style unification, offering a sweet spot between simple path queries (JSONPath, jq) and full logic programming.

Patterns resemble the data they match. Arrays use regex-like operators. Objects use declarative assertions. Variables capture and unify across the pattern.

## Quick Start

Tendril patterns look like the data they match:

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

Variables starting with `$` capture single values. The pattern must match for the query to succeed. If the same variable appears twice, unification ensures both occurrences match the same value (using structural equality).

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
  .match(data)
  .solutions()
  .toArray()
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
{ /a|b/:/x/ /b|c/:/y/ }  // matches {"b":"xy"} - "b":"xy" satisfies both assertions
```

### Remainder

The keyword `remainder` refers to all key-value pairs whose keys didn't match any assertion:

``` 
{ a:b }                    // matches {"a":"b", "c":"d"}
                           // remainder is {"c":"d"}

{ a:b remainder }          // does NOT match {"a":"b"}
                           // 'remainder' asserts a nonempty remainder

{ a:b (?!remainder) }      // does NOT match {"a":"b", "c":"d"}
                           // (?!remainder) asserts an empty remainder

{ a:_ (?!remainder) }      // matches iff 'a' is the only key
```

Bind the remainder to capture it:

``` 

// CAUTION: this form asserts that the remainder is nonempty
{ a:b @rest=(remainder) }  // matches {"a":"b", "c":"d"}, binds {"c":"d"} to @rest

// Special idiom: bind the remainder without asserting it's nonempty:
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

## Binding Variables

Tendril has two kinds of variables. **Scalar variables** (prefix `$`) capture single values.  **Group variables** (prefix `@`) capture contiguous subsequences in arrays, or subsets of properties of objects. Groups are like slices, neither a single element nor the entire array/object.

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

Tendril("{ @x=(/a/:_, /b/:_) /c/:_ }").match({Big:1, Cute:2, Alice:3}) // matches with binding {x:{Big:1, Alice:3}}
Tendril("{ @x=(/a/:_, /b/:_) /c/:_ }").match({Big:1, Cute:2, Alice:3}).edit({x:_=>{foo:"bar"}}) // -> {foo:"bar",Cute:2}


### Scalars

Scalars capture exactly one item. In arrays, this means one element. In objects, one key or one value:

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
  .first()
// → {x: "a"}
```

Each possible binding creates a separate solution. The scalar `$x` must bind to a single value, so the first pattern generates two solutions (one for each element), while the second generates only one (binding to the first element).

### Groups

Groups capture zero or more items. In arrays, they capture subsequences. In objects, they capture sets of key-value pairs:

```javascript
Tendril("[ @x .. ]")
  .match(["a", "b"])
  .solutions()
  .toArray()
// → [
//   {x: Group()},
//   {x: Group("a")},
//   {x: Group("a", "b")}
// ]

Tendril("[ $x @y ]")
  .match([[1,2], [3,4]])
  .solutions()
  .first()
// → {x: [1,2], y: Group([3,4])}
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

Tendril("{ a.b.c[3].e:f }").match(object).hasMatch()   // like object?.a?.b?.c?.[3]?.e === "f"
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

## Quantifiers on Objects

Object quantifiers count matching key-value pairs after all matches are found (no backtracking):

```javascript
{ /a.*/:_ #{2,4} }     // object has 2-4 keys matching /a.*/
{ /a.*/:_ #{0} }       // object has no keys matching /a.*/
{ a:b remainder #{0} } // require no residual pairs (closed object)
```

The `#` quantifier follows an assertion and requires a specific count range. Unlike array quantifiers, object quantifiers operate globally over all key-value pairs, not sequentially.

## Lookaheads

Lookaheads test conditions without consuming data:

```javascript
(?=PATTERN)        // positive lookahead (must match)
(?!PATTERN)        // negative lookahead (must not match)
```

**Binding behavior:**
- Positive lookaheads (`(?=P)`) commit bindings on success. If the pattern can match multiple ways (e.g., with wildcard keys), all binding possibilities are enumerated.
- Negative lookaheads (`(?!P)`) never commit bindings, since the pattern must fail to match.

In arrays:

```javascript
[ (?= $x=(/[ab]/)) $x .. ]  // first element must match /[ab]/, bind to $x

[ (?! .. 3 4) .. ]           // array must not contain [3,4] subsequence
```

In objects:

```javascript
{ (?= a:$x) b:$x }           // assert a exists, bind its value, require b equals it
{ (?! secret:_) .. }         // assert no key named 'secret' exists
```

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

The v5 API uses a fluent, chainable interface:

```javascript
// Start by compiling your pattern. 
const tendril = Tendril(pattern);

// match pattern to data
let matcher = pattern.match(data) // match it to the entirety of your data
let matcher = pattern.find(data)  // find the pattern within your data (maybe multiple occurrences)
let matcher = pattern.first(data) // find the first occurrence

// At this point, you will be interested in focusing on either the **occurrences** of the pattern 
// in your data, or the **solutions**, i.e. variable bindings (Prolog style).
let matches = matcher.matches()   // -> MatchSet (iterator of unique Match (location0)
let solutions = matcher.solutions() // -> iterator of unique Solution

type MatchSet // itself is iterable of Match

    // 'replaceAll' operates on a **copy** and replaces the **entire match**
    matches.replaceAll(expr /* not depending on bindings*/)  // uses first solution of match
    matches.replaceAll(bindings=>expr)                       // uses first solution of match

    // 'editAll' mutates the original data and replaces **named groups**
    matches.editAll("x", $=>($.x * 2))  // string,func: replace $x only
    matches.editAll($=>{x:$.y, y:$.x})  // (=>plan)
    matches.editAll({x:$=>$.y, y:$=>$.x})  // plan = obj<key,replacement>; replacement = (vars=>any) | any

type Match:
    path()          // breadcrumb locating the match point from root
    value()         // $0
    solutions()     // iterator of Solution for this match

type Solution // itself, is an object representing bindings
    matches()       // iterator of Match with this solution


// Example: iterate over solutions
for (const $ of Tendril("{ users.$id.name:$name }").match(data).solutions()) {
  console.log($.id, $.name);
}

// Find occurrences at any depth (recursive scan)
const matches = tendril.find(data);          // Returns MatchSet with all deep matches

// Replace using first match - returns new structure
const result = tendril.find(data).replaceAll($ => newValue);

// Edit in place - modifies data
tendril.find(data).editAll($ => ({varName: newValue}));
```

**Replacement examples:**

```javascript
// Swap array elements
Tendril("[$x $y]").find([3, 4]).replaceAll($ => [$.y, $.x])
// Result: [4, 3]

// Redact passwords at any depth - two equivalent approaches:
const data1 = {user: {password: "secret", name: "Alice"}};

// Approach 1: Use .. with match() to search at any depth
Tendril("{ ..password:$p }").match(data1).editAll($ => ({p: "REDACTED"}));

// Approach 2: Use find() without .. to search at any depth
Tendril("{ password:$p }").find(data1).editAll($ => ({p: "REDACTED"}));

// ⚠️ Anti-pattern: Don't combine .. with find() - it's redundant!
// Tendril("{ ..password:$p }").find(data) // DON'T DO THIS
```

---

# When to Use Tendril

### ✅ Perfect fit

**1. Structural tree transformations (AST/VDOM manipulation)**

```javascript
// Macro expansion: <When>/<Else> → If node
Tendril(`[
  ..
  @whenelse=(
    {tag:/^when$/i children:$then}
    {tag:/^else$/i children:$else}?
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
Tendril("{ password:$value }")
  .find(data)
  .editAll($ => ({value: "REDACTED"}))
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

INTEGER       := /[0-9]+/                 # non-negative only
BOOLEAN       := 'true' | 'false'
NULL          := 'null'
WILDCARD      := '_'                      # tokenized as kind 'any'
IDENT         := /[A-Za-z_][A-Za-z0-9_]*/

QUOTED_STRING := "..." | '...'            # supports \n \r \t \" \' \\ \uXXXX \u{...}
REGEX         := /pattern/flags           # JS RegExp, validated by constructor

BAREWORD      := IDENT, except '_' 'true' 'false' 'null' are special-cased
LITERAL       := INTEGER | BOOLEAN | NULL | QUOTED_STRING | REGEX | BAREWORD

# Whitespace and // line comments allowed between tokens everywhere.

# --------------------------------------------------------------------
# Core productions
# --------------------------------------------------------------------

ROOT_PATTERN := ITEM

S_ITEM  := '$' IDENT
S_GROUP := '@' IDENT

ITEM :=
    ITEM_TERM ('|' ITEM_TERM)*

ITEM_TERM :=
      '(' ITEM ')'
    | LOOK_AHEAD
    | S_ITEM  ( '=' '(' ITEM ')' )?            # bare $x ≡ $x=(_)
    | S_GROUP ( '=' '(' A_GROUP ')' )?         # bare @x ≡ @x=(_*)
    | '_'
    | LITERAL
    | OBJ
    | ARR

LOOK_AHEAD :=
      '(?=' A_GROUP ')'
    | '(?!' A_GROUP ')'

# --------------------------------------------------------------------
# Arrays
# --------------------------------------------------------------------

ARR := '[' A_BODY ']'

A_BODY := (A_GROUP (','? A_GROUP)*)?           # commas optional

A_GROUP :=
      '..' A_QUANT?                            # spread token in arrays
    | A_GROUP_BASE A_QUANT?                    # quantifiers bind tight
      ('|' (A_GROUP_BASE A_QUANT?))*           # alternation at A_GROUP level

A_GROUP_BASE :=
      LOOK_AHEAD
    | '(' A_BODY ')'                           # if >1 element => Seq node
    | S_GROUP ( '=' '(' A_BODY ')' )?          # bare @x allowed here (≡ @x=(_*))
    | S_ITEM  ( '=' '(' A_BODY ')' )?          # bare $x allowed here (≡ $x=(_))
    | ITEM_TERM                                 # including nested ARR/OBJ

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
      '@' IDENT '=' '(' '%' ')' O_REM_QUANT? ','?
    | '%' O_REM_QUANT? ','?
    | '$' ','?                                 # shortcut for '%#{0}'
    | '(?!' '%' ')' ','?                       # closed-object assertion (equiv to '$')

O_REM_QUANT :=
      '#{' INTEGER (',' INTEGER?)? '}'         # #{m} or #{m,n} or #{m,}
    | '#{' ',' INTEGER '}'                     # #{,n}
    | '#' '?'                                  # shorthand for “0..∞”_tabs (same as #{0,})

# --------------------------------------------------------------------
# Object groups and terms
# --------------------------------------------------------------------

O_GROUP :=
      O_LOOKAHEAD
    | '(' O_GROUP* ')'                         # OGroup node
    | '@' IDENT '=' '(' O_GROUP* ')'           # group binding in object context (no bare @x)
    | O_TERM

O_LOOKAHEAD :=
      '(?=' O_GROUP ')'
    | '(?!' O_GROUP ')'

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
    | '#' '?'                                  # shorthand for “0..∞” (same as #{0,})

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

### Object Assertions

Each K:V term both defines both a **slice** (the set of object fields that satisfy both k~K and v~V) and a set denoted by **`bad`** (k~K AND NOT(v~V)).

In the following short forms, '>' signifies "no bad values" (i.e. k~K => v~V), and '?' signifies that the key is optional:

| Short form | Equivalent long form | meaning |
| K:V        | K:V  #{1,} bad#{0,}  | At least one matching k,v |
| K:>V       | K:V  #{1,} bad#{0}   | At least one matching k,v, and no bad values |
| K:V?       | K:V  #{0,} bad#{0,}  | No assertion (use for binding) |
| K:>V?      | K:V  #{0,} bad#{0}   | No bad values |

Binding keys or values
{ $myKey=(K):$myVal=(V) }

Binding slices
{ @slice1=(K1:V1)       } # bind one slice
{ @slice2=(K2:V2 K3:V3) } # bind a union of slices
{ @x=(K1:V1) @x=(K2:V2) } # asserting two slices are the same

'%', pronounced 'remainder', defines the slice of fields that didn't fall into any of the declared slices. It may appear only once in the object pattern, only at the end. You can bind it or quantify it, nothing else.

{ K1:V1 K2:V1 } # No assertion about remainder  
{ K1:V1 K2:V1 % } # Remainder is nonempty  
{ K1:V1 K2:V1 $ } # Remainder is empty (short for %#{0})
{ K1:V1 K2:V1 %#{3,4} } # Remainder is of size 3-4
{ K1:V1 K2:V1 @rSlice=(%) } # Bind it.

### Quantifiers

**Array quantifiers** operate sequentially with backtracking. Greedy quantifiers consume as much as possible, lazy quantifiers as little as possible, possessive quantifiers do not backtrack.

**Object quantifiers** count matching pairs globally after all matches are found, then assert the count is within range. No backtracking.

### Lookaheads

Lookaheads (`(?=P)`, `(?!P)`) test whether pattern P matches at the current position without consuming input. Positive lookaheads commit bindings from successful matches and enumerate all binding possibilities. Negative lookaheads (`(?!P)`) assert that P does NOT match and never commit bindings.

## Conventions

`~=` and `===` appear in examples as shorthand for illustration only. They are not part of Tendril syntax.

- `foo ~= bar` means `Tendril("foo").matches(bar) === true`
- `p1 === p2` indicates semantic or syntactic equivalence

The data model is JSON-like: objects, arrays, strings, numbers, booleans, null. Regex literals use JavaScript regex syntax.

---

**End of Specification**
