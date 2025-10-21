# Tendril — v5 (Final Draft)

Tendril is a small declarative language for structural pattern matching and relational logic over JSON-like graphs. It combines expressive pattern syntax, Prolog-style unification, and generator-style iteration to **match** and **replace** data.

This document is the cleaned, integrated v5 README. It is divided into a **pedagogical guide** and a **reference**. Examples are executable. Notation like `foo ~= bar` is for exposition only and is not part of the API. When something in the design appears inconsistent or incomplete, it is called out explicitly rather than modified.

---

## Part I — A Short Guide

### A first taste
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
    ["Ceres", "Demeter"]]
};

// Here's one way to describe the data, very visual, looks like the data
const pattern = `{
  planets = {
      $name = {size = $size}
  }
  aka = [ .. 
           [(?=$name) .. $alias ..]
        .. ] 
}`;

// Here's an equivalent way, very concise. Both work equally well.
const pattern = `{
  planets.$name.size=$size
  aka[$idx][_]=$alias
  aka[$idx][0]=$name
}`;

Tendril(pattern)
.solutions(data)
.map($ => `Hello, ${$.size} world ${$.alias}`);

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

The pattern is a conjunction of constraints over the same input graph. Each variable is a logic symbol that either introduces a new binding or must unify with a prior binding.

### What patterns look like

An **atom** is a number, boolean, string (quoted or bareword), regex `/.../flags`, or wildcard `_` which matches any single value.

**Arrays** are written with `[...]` and describe sequences. Inside arrays, space denotes sequencing, parentheses group, and `..` denotes a lazy slice (a possibly empty run of items).

**Objects** are written with `{...}` and contain key–value **assertions** of the form `K = V` or `K ?= V`. 
```
    { b=_  c=_ }   ~= { b:1, c:2 }  // every key-value assertion satisfied
    { b=_      }   ~= { b:1, c:2 }  // every key-value assertion satisfied
    { b=_  c=_ }  !~= { b:1 }       // unsatisfied assertion
    { b=_  c?=_ }  ~= { b:1 }       // optional assertion
```
In objects, '..' denotes the **residual** set of key-value pairs, those whose keys didn't match any of the key patterns in the assertions. It can be bound to a slice variable.
```
    { /[a-z]/=3 @x:(..) } ~= { a:3, b:3, foo:3 } => @x is bound to {foo:3}
```

**Paths** (“breadcrumbs”) chain through objects and arrays: `.k` descends into an object key, `[i]` descends into an array index, and these can be composed: `{ a.b.c = d }`, `{ a[3].c = d }`.
```
    { a(.b.a)*.c=d } ~= {a:{b:{a:{b:{a:{b:{a:{c:"d"}}}}}}}}
```

### Binding and unification

Variables beginning with `$` bind **scalars** (exactly one value per solution). Variables beginning with `@` bind **slices** (zero or more items for arrays; sets of key–value pairs for objects). A bare `$x` is sugar for `$x:(_)`. A bare `@x` is sugar for `@x:(_*)` in arrays (not defined for objects).

Bindings are Prolog-style. If the same variable appears multiple times, the matched values must be equal (deep structural equality where relevant); this is called **unification**. 

A scalar binder `$x:(P)` succeeds exactly when the data matches P at that point AND the matched value is a single value AND unification succeeds. 
```
    [ 1? 2? ]         matches any of  [], [1], [2], [1,2]
    [ $x:(1? 2?) ]    matches only [1], [2], because $x must bind to a scalar.
```

### Alternation, lookahead, and quantifiers

Use `|` for alternation. Use `(?= P)` for positive lookahead and `(?! P)` for negative lookahead. Lookaheads are zero-width assertions and must not introduce new bindings.

Array items may be quantified with `{m,n}`, with `?`, `+`, and `*` as shorthands. `..` is equivalent to a lazy `_` slice. Open-ended bounds on arrays are allowed where the grammar states so; object-level counts, where used, are counted by key–value matches per assertion.

### Reading precedence

From higher to lower: optional `?`; breadcrumb operators `.` and `[]`; adjacency/commas inside arrays and objects; `|`; binding `:`; quantifiers; `=`. Parentheses override precedence. Lookaheads always require parentheses.

### A few concrete truths

```
[ a b ]         ~= ["a","b"]
[ a b ]        !~= ["a","b","c"]
[ a b .. ]      ~= ["a","b","c"]

{ b=_  c=_ }    ~= { b:1, c:2 }
{ b=_ }         ~= { b:1, c:2 }
{ b=_  c=_ }   !~= { b:1 }
{ b=_  c?=_ }   ~= { b:1 }

{ /[ab]/=_  /[ad]/=_ }   ~= { a:1 }    // overlapping predicates are fine
{ /[ab]/=_  /[ad]/=_ }  !~= { d:1 }

{ b=_  $s:(..) }   ~= { a:1, c:2, Z:1 }  // $s is the unconstrained slice
```

### Scalar vs. slice in arrays and objects

A scalar captures exactly one value even in an array context. A slice captures zero or more items. This distinction is visible in results:

```
[ .. $x .. ] ~= ['a','b']   // solutions: [{x:'a'},{x:'b'}]
[ $x .. ]    ~= ['a','b']   // solutions: [{x:'a'}]
[ @x .. ]    ~= ['a','b']   // solutions: [{x:[]},{x:['a']},{x:['a','b']}]
[ $x @y ]    ~= [[1,2],[3,4]] // one solution: {x:[1,2], y:[[3,4]]}
[ @x @y ]    ~= [[1,2],[3,4]] // multiple solutions by different splits
```

In objects, keys and values are scalars; slices contain key–value pairs. For example, `{ @rest:(..) }` binds the residual set. The names `$x` and `@x` must not collide.

### Test cases that document intent

* `[ $x y $x? ]` matches `[ 1, "y", 1 ]`.
* `[ $x y ($x:(_))? ]` matches `[ 1, "y", 1 ]` (the binder exists only on the taken branch).
* `[ $x y $x:(_?) ]` matches `[ 1, "y", 1 ]` (the node is concrete; `?` cannot accept “nothing” here).
* `[ [($x:(_))? ..] $x ]` matches `[ [1], 1 ]`.
* `[ [$x:(_?) ..] $x ]` matches `[ [1], 1 ]`.
* `[ [($x:(_))? ..] $x ]` matches `[ [1], 2 ]`.
* `[ [$x:(_?) ..] $x ]` does **not** match `[ [1], 2 ]` (the inner binder would force `$x=1`).
* `[ [($x:(_))? ..] ($x:(_))? ..]` matches `[ [1], 2 ]`.
* `[ [$x:(_?) ..] $x:(_?) .]` does **not** match `[ [1], 2 ]` (and note the trailing `.` inside an array item is syntactically suspect; see callout in the reference).
* `[ [($x:(_))? ..] $x ]` matches `[ [1], null ]`.
* `[ [$x:(_?) ..] $x ]` does **not** match `[ [], null ]`.
* `[ [($x:(_))? ..] $x ]` does not match `[ [1] ]`.
* `[ [$x:(_?) ..] $x ]` does not match `[ [1] ]`.
* `[ ($x:(_))? $x .. ]` matches `[ 1, "y" ]`.
* `[ $x:(_?) $x .. ]` does not match `[ 1, "y" ]`.
* `[ [$x:(1? 2?)] $x ]` matches `[ [1], 1 ]`. This illustrates why we do not attempt to prove “scalar-ness” of patterns at compile time; runtime acceptance on the concrete node suffices.

### API at a glance

`Tendril(pattern)` returns a compiled matcher. Call `.solutions(data)` to produce an iterator (or array) of solution environments. Call `.project(fn)` to map solutions to values.

**Replacement API**:
- `.replace(data, fn)` applies transformations using **only the first solution** (which is the longest match due to greedy quantifiers). The function `fn` receives bindings and returns an object mapping variable names to replacement values.
- `.replaceAll(data, fn)` is a convenience wrapper that replaces the entire match (`$0`).

The illustrative `~=` and `===` notation is documentation sugar, not part of the API.

---

## Part II — Language Reference

### Literals and matching

Numbers and booleans match by strict equality. Strings (quoted or barewords that are not keywords) match by strict equality. Regex literals use the JavaScript engine and match strings. `_` matches any single value.

### Operators and constructs

Use `|` for alternation. Use `.` and `[]` to descend through objects and arrays. Array quantifiers include `?`, `+`, `*`, and `{m,n}` forms; `..` is a lazy slice equivalent to a non-greedy `_` repetition. Object assertions use `=` and `?=` and may be given optional count suffixes (see `O_QUANT` in the grammar) to require that a predicate match a certain number of keys. Lookaheads `( ?= P )` and `( ?! P )` assert without consuming or binding.

### Precedence

From higher to lower: optional `?`; breadcrumb operators `.` and `[]`; adjacency/commas inside arrays and objects; `|`; binding `:`; quantifiers; `=`. Parentheses override precedence; lookaheads require parentheses.

### Arrays

Sequencing is written by adjacency inside `[...]`. Nested quantifiers apply via grouping. Arrays behave like anchored sequences: `[a b]` does not match `[a b c]` unless `..` is present. Multiple `..` are allowed: `[ a .. b .. c ]` matches `[ a, x, y, b, z, c ]`.

Quantifier shorthands follow the grammar. For example, `a?` is zero-or-one, `a+` is one-or-more, and `a*` is zero-or-more. Possessive and lazy variants appear in the grammar. `..` is equivalent to a lazy `_` slice.

### Objects and object slices

Each key–value assertion evaluates over all entries whose keys match the key pattern, and each such value must satisfy the value pattern. For `K = V` at least one such entry must exist; for `K ?= V` existence is not required. Assertions may overlap. The token `..` denotes the set of entries whose keys match none of the key patterns in the object. You can bind that set to a slice variable: `{ … @rest:(..) }`. Unconstrained keys may exist unless you explicitly demand otherwise by inspecting or counting `..`.

Object-level count quantifiers (e.g., `k=v #{2,4}`) count how many keys matched that assertion and impose bounds without backtracking; `.. #{0}` expresses the absence of unconstrained entries. These counts are assertion-local.

### Binding and unification

`$name:(pattern)` matches the node against `pattern` and binds `$name` to that single value. A bare `$name` is sugar for `$name:(_)`. If `$name` appears again, its matched value must unify (deep structural equality where relevant). `@name:(slice-pattern)` binds a slice: for arrays, a sequence of items; for objects, a set of key–value pairs. Bare `@name` is sugar for `@name:(_*)` in arrays and `@name:(..)` in objects. `$name` and `@name` must not collide.

Unification occurs after each binder has independently matched its own pattern. The sequence `[ $x $x:(/[ab]/) $y ]` matches `['a','a','y']` but not `['a','b','y']`. Deep equality is required where values are composite.

### Lookahead and negation

`(?= P)` asserts that `P` would match at this position; `(?! P)` asserts that it would not. Lookaheads are read-only and must not introduce bindings. They compose with array items and value patterns through grouping.

### Path assertions

Paths chain key and index steps: `{ a.b.c = d }` matches `{ a: { b: { c: 'd' } } }`. `{ a[3].c = d }` expects an array at `a` and a `c` within the fourth element. 

### Quantifiers — arrays

The array quantifier repertoire includes shorthands and counted forms. **All quantifiers are greedy by default**: when generating solutions, longer matches are emitted before shorter ones. This ensures that `.replace()` operates on the longest/best match.

The cheat-sheet equivalences:

```
a*{2,3}   ≡ exactly 2 or 3 repetitions
a*3       ≡ a*{3,3}
a*?       ≡ a*{0,}        // lazy (not yet implemented)
a*        ≡ a*{0,}        // greedy (default)
a*+       ≡ a*{0,}        // greedy, possessive (not yet implemented)
a+?, a+, a++ ≡ a*{1,}     // lazy, greedy, possessive
a?        ≡ a*{0,1}       // greedy (matches before skipping)
..        ≡ _*?           // lazy wildcard slice
```

**Greedy behavior**: When a quantifier allows multiple match lengths (e.g., `a?`, `a*`, `a{2,5}`), solutions with longer matches are generated first. For example, `[a?]` matching `['a']` produces two solutions: first `{a: 'a'}` (matched), then `{}` (skipped). This makes `.replace()` intuitive: it always uses the first (longest) match.

### Quantifiers — objects

Object assertions may include count qualifiers: `k=v #{2,4}`, `k=v #{0}`, `.. #{0}`. Each applies to the number of matched keys for that predicate within the same object. Matching is by counting, not by backtracking across subsets.

### Grammar (informal EBNF)

> **Callout:** The following is intentionally faithful to the draft. If something appears inconsistent or ambiguous, it is flagged in comments, not corrected.

```ebnf
INTEGER        := decimal integer
BOOLEAN        := true | false
QUOTED_STRING  := quoted string literal
REGEX          := /pattern/flags              // JS regex literal
BAREWORD       := [A-Za-z_][A-Za-z0-9_]*      // unless a keyword
_              := singleton wildcard

LITERAL        := INTEGER | BOOLEAN | QUOTED_STRING | REGEX | BAREWORD
IDENT          := /[a-zA-Z]\w*/

ROOT_PATTERN   := ITEM

S_ITEM         := '$' IDENT
S_SLICE        := '@' IDENT

ITEM           := '(' ITEM ')'
               | S_ITEM
               | S_ITEM ':' '(' ITEM ')'
               | '_'
               | LITERAL
               | OBJ
               | ARR
               | ITEM '|' ITEM

A_BODY         := (A_SLICE (','? A_SLICE)*)?

A_SLICE        := '(' A_BODY ')'
               | S_SLICE
               | S_SLICE ':' '(' A_BODY ')'
               | S_ITEM
               | S_ITEM ':' '(' A_BODY ')'
               | ITEM
               | OBJ
               | ARR
               | A_SLICE A_QUANT
               | A_SLICE '|' A_SLICE
               | '(?=' A_SLICE ')'
               | '(?!' A_SLICE ')'

ARR            := '[' A_BODY ']'

KEY            := ITEM
VALUE          := ITEM

O_TERM         := KEY BREADCRUMB* ('=' | '?=') VALUE O_QUANT?
               | '..' O_QUANT?

B_QUANT        := '?' | '+' | '*'
BREADCRUMB     := '.' KEY
               | '[' KEY ']'
               | '(' '.' KEY ')' B_QUANT
               | '[' KEY ']' B_QUANT

O_BODY         := (O_SLICE (','? O_SLICE)*)?

O_SLICE        := '(' O_BODY ')'
               | S_SLICE
               | S_SLICE ':' '(' O_SLICE* ')'
               | O_TERM

OBJ            := '{' O_BODY '}'

A_QUANT        := '?'
               | '+' | '+?' | '++'
               | '*' | '*?' | '*+'
               | '*{' INTEGER '}'
               | '*{' INTEGER ',' INTEGER '}'
               | '*{' INTEGER ',' '}'
               | '*{' ',' INTEGER '}'

O_QUANT        := '#' ( '?' | '{' INTEGER (',' INTEGER?)? '}' )
               // #?          → #{0,}
               // #{m}        → #{m,m}
               // #{m,n}
               // #{m,}       → #{m,∞}
```

**Conventions.** Whitespace and `//` / `/* … */` comments are allowed between tokens. Whitespace is ignored except where adjacency inside arrays denotes sequencing. The notations `~=` and `===` appear only in this document.

### Examples

Find and join relational facts:

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

Redact sensitive fields:

```js
Tendril("{ _(._)*.password = $value }")
// Todo, is this the right api shape?
  .replaceAll(input, { value: "REDACTED" });
```

Bind object slices:

```
{ /user.*/=_  $contacts:(/contact.*/=_)  @rest:(..) }
```

### API sketch

**Query API**:

Several convenience methods are provided (todo, list them), covering the primary API which is more complex and powerful.
```
    Tendril(pattern).solutions(data)
    Tendril(pattern).occurrences(data)
```    
**Bound variables**
Each solution or occurrence returns a map of bound variables, including:
$ — scalar variables
@ — slice variables (wrapped in Slice objects)
```
    firstResult = Tendril("[ $x:(1) @y:(2 3) { k=$k @z:(..) }]")
           .solutions([1, 2, 3, {k:"value", p:true, q:false}]).first()
    
    firstResult.bindings == 
    {
        x:1, 
        y:Slice.array(2,3) // Representing a contiguous subsequence of an array, 
                           // not a complete array. 
        k:"value"
        z:Slice.object({p:true, q:false}) // Representing a subset of an object's properties, 
                                   // not a complete object. 
    }                  
```
**Replacement**
The Replacement API lets you specify a function that generates replacements.

Replace the entire input:
```
// swap x and y
Tendril("[$x $y]").replace([3,4], var => [ var.y, var.x ])  // [4,3]

// swap slices; use the familiar spreading operator
Tendril("[@x 99 @y]").replace([1,2,99,4], var => [...var.y, 99, ...var.x])  // [4,3,99,2]
```

Or replace just the matched parts (bound variables):  
```
// replace all occurrences of slice variables
const input = [
  { light: "entry", switch: "on" },
  { light: "kitchen", switch: "off" }
];

Tendril("[{ @s:(switch=_) ..}*]")
  .replaceAll(input, vars => ({ s: Slice.object({ switch: "auto" }) }));

// => [
//      { light: "entry", switch: "auto" },
//      { light: "kitchen", switch: "auto" }
//    ]
```

Note: Replacements modify the original data in place.
If you want to preserve it, deep-clone your input first.


---

**End of README v5**
