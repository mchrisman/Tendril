# Tendril

Tendril is a pattern matching language for JSON-like data structures that combines structural pattern matching with relational logic. It allows you to express complex queries and transformations over nested objects and arrays using a concise, declarative syntax inspired by regular expressions and logic programming.

---

## A First Example

Consider a dataset containing information about planets and their alternative names:

```js
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
};
```

We want to find all combinations of planets and their aliases. In Tendril, this relational query looks like:

```js
const pattern = `{
  planets.$name.size = $size
  aka = [.. [$name .. $alias .. | $alias:($name) ..] .. ]
}`;

Tendril(pattern)
  .solutions(data)
  .project($ => `Hello, ${$.size} world ${$.alias}`);
```

This produces:

```js
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

The pattern joins data from different parts of the structure using shared variables (`$name`), demonstrating Tendril's core strength: treating pattern matching as a logic problem that can yield multiple solutions through unification.

---

## Core Concepts

### Literals and Wildcards

Tendril patterns can match literal values or use wildcards. The underscore `_` matches any single value:

```
123 ~= 123                    // numbers match by strict equality
true ~= true                  // booleans match by strict equality
"hello" ~= "hello"            // strings match by strict equality
bareword ~= "bareword"        // barewords are string literals
/^[a-z]+$/ ~= "hello"         // regex matches strings
_ ~= 42                       // wildcard matches anything
```

Throughout this document, the notation `pattern ~= data` means "pattern matches data," and `!~=` means "does not match." These notations are for illustration only and are not part of the Tendril syntax.

### Arrays

Arrays are matched by sequences of patterns enclosed in square brackets. By default, array patterns must match exactly:

```
[ a b c ] ~= ["a", "b", "c"]
[ a b c ] !~= ["a", "b", "c", "d"]
```

The special token `..` represents a lazy wildcard slice that matches zero or more items:

```
[ a .. c ] ~= ["a", "b", "c"]
[ a .. c ] ~= ["a", "c"]
[ .. a .. b .. ] ~= ["x", "a", "y", "z", "b", "w"]
```

Multiple ellipses are allowed and are resolved through backtracking.

### Objects

Object patterns consist of key-value assertions. Each assertion specifies a constraint that must be satisfied by the data:

```
{ a=1 b=2 } ~= { a:1, b:2 }
```

There are two forms of assertions. The `K=V` form requires at least one key-value pair to satisfy the constraint:

```
{ color=red } ~= { color: "red" }
{ color=red } !~= { size: "big" }          // no key matching "color"
```

The `K?=V` form is a universal quantifier that applies to all matching keys, even if there are none:

```
{ color?=red } ~= { color: "red" }
{ color?=red } ~= { size: "big" }          // no color keys, so constraint trivially satisfied
```

Object keys can be literals, barewords, or regular expressions. When a regular expression is used, the assertion applies to all keys that match:

```
{ /col.*/=blue } ~= { color: "blue", collar: "blue" }
{ /col.*/=blue } !~= { color: "blue", collar: "red" }
```

Assertions are conjunctive and non-exclusive. A single key-value pair can satisfy multiple assertions:

```
{ /[ab].*/=22  /[bc].*/=22 } ~= { b:22, c:22 }
```

The special token `..` in object patterns represents the untested slice: all key-value pairs whose keys did not match any of the key patterns in any `K=V` or `K?=V` assertion. The untested slice is not necessarily empty:

```
{ a=_ .. } ~= { a:1, b:2, c:3 }            // .. contains {b:2, c:3}
```

Note: We avoid using the term "anchored" when referring to objects, as it can be confusing. All key-value pairs in the data are tested against all assertions, but this does not imply that the untested slice `..` is empty.

<!-- TODO: INCONSISTENCY - The following example contradicts modern semantics. Since the assertion b=_ is satisfied (b:1 exists), the pattern should match even though c:2 is in the untested slice. Either fix this example or document that objects require an explicit .. to permit untested pairs. -->

```
{ b=_ } !~= { b:1, c:2 }                   // fails because c:2 is in untested slice
{ b=_ .. } ~= { b:1, c:2 }                 // succeeds, .. explicitly permits untested pairs
```

### Binding and Unification

Variables in Tendril begin with `$` (for scalar bindings) or `@` (for slice bindings). When a pattern contains a variable, the matched data is bound to that variable. If the same variable appears multiple times, all occurrences must match structurally equivalent data. This is called unification.

The syntax for binding is `$name:(pattern)` where pattern describes what to match. A bare `$name` is shorthand for `$name:(_)`, matching any single value:

```
[ $x $x:(/[ab]/) $y ]   ~= ["a", "a", "y"]
[ $x $x:(/[ab]/) $y ]  !~= ["a", "b", "y"]         // unification fails
[ $x $x:($y) $y ]       ~= ["q", "q", "q"]
[ $x:($z $y) $y $z ]    ~= [["r", "q"], "q", "r"]
```

The terms "scalar" and "slice" refer to data, not patterns. A scalar is a single value. A slice is a sequence of zero or more values. In array patterns, all entries are slice patterns, and a scalar is simply an unwrapped slice of length exactly one.

Formally, `$x:(pattern)` is a triple assertion: the data matches pattern, AND the data is a single value, AND (for unification) if `$x` was previously bound, the data equals the previously bound value:

```
[ $x:(_?) ] ~= [1]                         // matches one item
[ $x:(_?) ] !~= []                         // $x must bind to exactly one value
[ $x:(_*) ] ~= [1]                         // matches one item
[ $x:(_*) ] !~= [1, 1]                     // $x must bind to exactly one value
```

### Scalar vs Slice Variables

Scalar variables (`$x`) bind exactly one item per solution, but can produce multiple solutions:

```
[ .. $x .. ] ~= ["a", "b"]                 // solutions: [{x:"a"}, {x:"b"}]
[ $x .. ]    ~= ["a", "b"]                 // solution: [{x:"a"}]
```

Slice variables (`@x`) bind zero or more items and use `@x:(slice_pattern)` syntax. A bare `@x` is shorthand for `@x:(_*)`:

```
[ @x .. ]    ~= ["a", "b"]                 // solutions: [{x:[]}, {x:["a"]}, {x:["a","b"]}]
[ $x @y ]    ~= [[1,2], [3,4]]             // solution: {x:[1,2], y:[[3,4]]}
[ @x @y ]    ~= [[1,2], [3,4]]             // multiple solutions via backtracking
```

Using both `$x` and `@x` in the same pattern is a name collision and is not permitted.

In object patterns, slice variables can bind sets of key-value pairs:

```
{ a=_ b=_ @rest:(..) }                     // @rest binds untested pairs
```

<!-- TODO: INCONSISTENCY - The explanation says object slices use `@x(O_TERM*)` notation but also mentions `@x:(...)` syntax. The grammar shows `S_SLICE ':' '(' O_SLICE* ')'` which would be `@x:(...)`. Clarify whether the colon is required for object slice bindings. -->

### Quantifiers in Arrays

Array slice patterns can be quantified to match repeated occurrences:

```
a*{2,3}      // 2 or 3 repetitions (greedy, possessive)
a*3          // exactly 3 repetitions
a*           // 0 or more repetitions (greedy)
a*?          // 0 or more repetitions (lazy)
a*+          // 0 or more repetitions (possessive)
a+           // 1 or more repetitions (greedy)
a+?          // 1 or more repetitions (lazy)
a++          // 1 or more repetitions (possessive)
a?           // 0 or 1 repetition
a??          // 0 or 1 repetition (lazy)
*{,m}        // up to m items
```

Quantifiers can be nested using grouping:

```
[ ((a b)+ c)*2 ] ~= ["a","b","a","b","c","a","b","a","b","c"]
```

The maximum values in range quantifiers are enforced strictly:

```
[ 0*{2,4} ] !~= [0,0,0,0,0,0,0]            // too many repetitions
```

### Quantifiers in Objects

Object assertions can be quantified using the `#` operator. Object quantifiers count how many key-value pairs satisfy the assertion (without backtracking) and then check if the count meets the requirement:

```
k=v #{2,4}   // 2 to 4 keys matching k
k=v #{0}     // no keys matching k
k=v #?       // 0 or more keys matching k
.. #{0}      // no untested pairs (all keys accounted for)
```

The notation `#?` expands to `#{0,}` (zero or more). The default behavior for a bare `K=V` is to require at least one match.

### Path Patterns (Breadcrumbs)

Object patterns can match nested structures using breadcrumb notation. The `.` and `[]` operators descend into nested objects and arrays:

```
{ a.b.c=d } ~= { a:{ b:{ c:"d" } } }
{ a[3].c=d } ~= { a:[_, _, _, { c:"d" }] }
```

Breadcrumb segments can be quantified using `B_QUANT` operators:

```
{ ((.a)*3).b=c }                           // descend through .a three times, then .b
```

This allows matching paths of varying depth:

```
{ _(._)*.password = $value }               // matches any path ending in .password
```

The above pattern would match `{ foo: { password: "x" } }` as well as `{ foo: { bar: { password: "y" } } }`.

### Lookahead

Lookahead assertions test a condition without consuming input:

```
(?=pattern)                                // positive lookahead
(?!pattern)                                // negative lookahead
```

In arrays:

```
[ (?= a b) a b .. ]                        // ensure array starts with a, b
[ (?! error) .. ]                          // ensure array doesn't start with "error"
```

### Alternation

The `|` operator provides alternation between patterns:

```
(a | b) ~= "a"
(a | b) ~= "b"
[ $x $x:(a | b) ] ~= ["a", "a"]
```

---

## Language Reference

This section provides a complete technical specification of the Tendril language.

### Grammar

The grammar is presented in informal EBNF notation. Recursion expresses logical intent but may need refactoring for implementation. The lexer splits tokens on whitespace and treats whitespace as insignificant otherwise.

#### Literals

Numbers match number primitives using strict equality. Booleans match boolean primitives using strict equality. Strings (quoted or bare, unless keyword) match string primitives using strict equality. Regex patterns match strings via the JavaScript regex engine.

<!-- TODO: INCONSISTENCY - LITERAL is referenced in the ITEM production but never defined as a non-terminal. Add: LITERAL := INTEGER | BOOLEAN | QUOTED_STRING | REGEX | BAREWORD -->

```
INTEGER                 :=  decimal integer (matches Number type)
BOOLEAN                 :=  true | false
QUOTED_STRING           :=  quoted string literal
REGEX                   :=  /pattern/flags (JS regex literal)
BAREWORD                :=  [A-Za-z_][A-Za-z0-9_]* unless a keyword
_                       :=  singleton wildcard (matches any single value)
```

<!-- TODO: INCONSISTENCY - IDENT := /[a-zA-Z]\w/ requires exactly 2 characters but examples throughout use single-character identifiers like $x, $y, $z. Should be /[a-zA-Z]\w*/ to allow one or more characters. -->

```
IDENT                   := /[a-zA-Z]\w*/

ROOT_PATTERN            := ITEM

S_ITEM                  := '$' IDENT
S_SLICE                 := '@' IDENT

ITEM                    := '(' ITEM ')'
                         | S_ITEM
                         | S_ITEM ':' '(' ITEM ')'
                         | '_'
                         | LITERAL
                         | OBJ
                         | ARR
                         | ITEM '|' ITEM

A_SLICE                 := '(' (A_SLICE (','? A_SLICE)*)? ')'
                         | S_SLICE
                         | S_SLICE ':' '(' A_SLICE ')'
                         | S_ITEM
                         | S_ITEM ':' '(' A_SLICE ')'
                         | ITEM
                         | OBJ
                         | ARR
                         | A_SLICE A_QUANT
                         | A_SLICE '|' A_SLICE
                         | '(?=' A_SLICE ')'
                         | '(?!' A_SLICE ')'

ARR                     := '[' (A_SLICE (','? A_SLICE)*)? ']'

KEY                     := ITEM
VALUE                   := ITEM

O_TERM                  := KEY BREADCRUMB* ('=' | '?=') VALUE O_QUANT?
                         | '..' O_QUANT?
                         | S_ITEM ':' '(' O_TERM ')'

B_QUANT                 := '?' | '+' | '*'

BREADCRUMB              := '.' KEY
                         | '[' KEY ']'
                         | '(' '.' KEY ')' B_QUANT
                         | '[' KEY ']' B_QUANT

<!-- TODO: AMBIGUOUS - '@_' appears in the O_SLICE production but is never explained. What does @_ mean? Is it a wildcard slice? How does it differ from bare @x? Document its semantics. -->

O_SLICE                 := '(' (O_SLICE (','? O_SLICE)*)? ')'
                         | S_SLICE
                         | S_SLICE ':' '(' O_SLICE* ')'
                         | O_TERM
                         | '@_'

OBJ                     := '{'  (O_SLICE (','? O_SLICE)*)? '}'

A_QUANT                 := '?' | '??'
                         | '+' | '+?' | '++'
                         | '*' | '*?' | '*+'
                         | '*{' INTEGER '}'
                         | '*{' INTEGER ',' INTEGER? '}'
                         | '*{' ',' INTEGER '}'

O_QUANT                 := '#' ( '?' | '{' INTEGER (',' INTEGER?)? '}' )
```

The array quantifiers support greedy, lazy, and possessive modes. The `*` prefix is deliberate, mirroring the `#` quantifiers and representing multiplication. Maximums are enforced strictly: `[0*{2,4}]` does not match `[0,0,0,0,0,0,0]`.

Object quantifiers use the `#` prefix:
- `#?` expands to `#{0,}` (zero or more)
- `#{m}` expands to `#{m,m}` (exactly m)
- `#{m,n}` matches m to n occurrences
- `#{m,}` matches m or more occurrences (unbounded)

### Conventions

Comments may appear anywhere between tokens using C-style syntax: `/* ... */` or `// ...`. Whitespace is ignored except where space denotes adjacency in array sequences.

The data model is JSON-like, supporting objects, arrays, strings, numbers, booleans, and null.

### Operator Precedence

From highest to lowest precedence:

1. Optional (`?`)
2. Breadcrumb operators (`.`, `[]`)
3. Adjacency/commas (in arrays and objects)
4. Alternation (`|`)
5. Binding (`:`)
6. Quantifiers
7. Key-value separator (`=`)

Parentheses override normal precedence. Lookahead operators come with mandatory parentheses.

### Array Semantics

Arrays are matched by sequential patterns. By default, the entire array must be matched exactly. The special token `..` (equivalent to `_*?`) represents a lazy wildcard slice.

Nested quantifiers are permitted through grouping with parentheses.

### Object Semantics

Each object assertion tests constraints over the key-value pairs in the data. The `K=V` form means "for all (key, value) pairs where key matches K, value matches V, and there is at least one such pair." The `K?=V` form means "for all (key, value) pairs where key matches K, value matches V" without requiring at least one match.

Assertions are evaluated conjunctively. The same key-value pair can satisfy multiple assertions.

The `..` token refers to the untested slice: all key-value pairs whose keys did not match any key pattern in any `K=V` or `K?=V` assertion. The untested slice is not necessarily empty and can be bound to a slice variable using `@rest:(..)`.

### Binding Semantics

The form `$name:(pattern)` binds the variable `$name` to the matched data if and only if: (1) the data matches the pattern, (2) the data is a single value (not a slice), and (3) if `$name` was previously bound, the newly matched data is structurally equal to the previously bound value.

A bare `$name` is shorthand for `$name:(_)`.

Slice variables use `@name:(slice_pattern)` syntax. A bare `@name` is shorthand for `@name:(_*)`.

Using both `$x` and `@x` in the same pattern is a name collision error.

### Structural Equality

Unification requires structural equality, which is deep comparison:

```
[ $x $x ] ~= [[1,2], [1,2]]                // structural equality succeeds
[ $x $x ] !~= [[1,2], [1,4]]               // different values
[ $x $x ] !~= [[1,2], [1,2,3]]             // different shapes
```

### Examples

**Finding and joining relational facts:**

```js
Tendril(`{
  users.$userId.contact = [$userName _ _ $userPhone]
  users.$userId.managerId = $managerId
  users.$managerId.phone = $managerPhone
  projects.$projectId.assigneeId = $userId
  projects.$projectId.name = $projectName
}`)
.solutions(input)
.forEach($ => console.log($.projectName, $.userName, $.userPhone, $.managerPhone));
```

**Redacting sensitive fields:**

```js
Tendril("{ _(._)*.password = $value }")
  .replaceAll(input, $ => ({ $value: "REDACTED" }));
```

**Binding object slices:**

```js
{ /user.*/=_  $contacts:(/contact.*/=_)  @rest:(..) }
```

This pattern binds all keys matching `/user.*/` (requiring at least one), binds matching `/contact.*/` pairs to `$contacts`, and binds remaining pairs to `@rest`.

---

## Test Cases and Edge Cases

The following test cases explore edge cases around scalar variables, optional quantifiers, and unification. These illustrate subtle interactions between optional patterns and unification constraints.

The question "can `$x` match zero objects?" has been resolved: no, scalar variables match exactly one object. Optional patterns like `($x:(_))?` allow the entire binding expression to be absent, but if the binding expression is present, `$x` must bind to exactly one value.

```
[ $x y $x? ] ~= [1, "y", 1]                              // Yes
[ $x y ($x:(_))? ] ~= [1, "y", 1]                        // Yes
[ $x y $x:(_?) ] ~= [1, "y", 1]                          // Yes

[ [($x:(_))? ..] $x ] ~= [[1], 1]                        // Yes
[ [$x:(_?) ..] $x ] ~= [[1], 1]                          // Yes

[ [($x:(_))? ..] $x ] ~= [[1], 2]                        // Yes (first $x absent)
[ [$x:(_?) ..] $x ] ~= [[1], 2]                          // No (unification fails)

[ [($x:(_))? ..] ($x:(_))? .. ] ~= [[1], 2]              // Yes
[ [$x:(_?) ..] $x:(_?) . ] ~= [[1], 2]                   // No

[ [($x:(_))? ..] $x ] ~= [[1], null]                     // Yes
[ [$x:(_?) ..] $x ] ~= [[], null]                        // No

[ [($x:(_))? ..] $x ] ~= [[1]]                           // No (second $x missing)
[ [$x:(_?) ..] $x ] ~= [[1]]                             // No

[ ($x:(_))? $x .. ] ~= [1, "y"]                          // Yes
[ $x:(_?) $x .. ] ~= [1, "y"]                            // No

[ [$x:(1? 2?)] $x ] ~= [[1], 1]                          // Yes
```

This final example demonstrates why we cannot statically classify all patterns as scalar or slice at compile time. The pattern `(1? 2?)` could match zero items, one item, or two items at runtime, yet when wrapped in a scalar binding `$x:(...)`, it asserts single-value semantics dynamically.

---

## Notes

Parentheses are required when binding variables to patterns: `$x:(pattern)` and `@x:(slice_pattern)`. Bare `$x` and `@x` are permitted as shorthand for `$x:(_)` and `@x:(_*)` respectively.

The notations `~=` and `===` used throughout this document are for illustration only. They represent "matches" and "equivalence" but are not part of the Tendril language syntax.

