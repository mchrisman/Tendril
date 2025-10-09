
# Tendril

**Object graphs grow in all directions. Your pattern matching language should too.**

<div style="padding:3em; margin:3em; background-color:pink">Status: alpha</div>

Tendril = structural pattern matching **+** relational logic, in a small, generator-inspired language for **match** and **replace** across JSON-like graphs.

## Hello, world

```js
const data = {
  planets: { Jupiter: {size:"big"}, Earth: {size:"small"}, Ceres: {size:"tiny"} },
  aka: [["Jupiter","Jove","Zeus"],["Earth","Terra"],["Ceres","Demeter"]]
};

const pattern = `{
  planets.$name.size: $size
  aka: [... [$name ... $alias ... | $alias=$name ...] ... ] // $name itself as a possible alias
}`;

Tendril(pattern).match(data).map(m => `Hello, ${m.$size} world ${m.$alias}`);

=> [
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

# Quick Start (1 minute read)

Defaults differ across arrays, objects, and sets; don’t assume identical behavior.

```
// Basic equivalences
{ foo: bar }                       ~= { "foo": "bar", "baz": "buzz" }   // objects are unanchored by default
[ a b c ... ]                      ~= [ "a", "b", "c", "d", "e" ]       // slice wildcard (lazy), not a spread

// Object with constraints
{
  data.users[3].name: "John Smith"    // object?.data?.users?.[3]?.name == "John Smith"
  _: /permission/                     // AND all property values match /permission/
}

// Array quantifiers
[ a? b+ c* ]                       // optional a; one-or-more b; zero-or-more c

// Repeated slice reuse
[ $X=( _ _ ) ... $X ]              // first two items equal the last two

```

---

# Cheat Sheet (10 minute read)


In this document,
`foo ~= bar` means `Tendril("foo").matches(bar)`,
and `===` shows pattern equivalence.
These notations are **only for illustration** — *not part of the language*.

---

## Atoms

```
123                        // coerces to number
true, false                // coerces to boolean
"a", bareword, /regex/     // coerces to string (regex uses JS engine)
_                          // any single object or primitive
```

---

## Sequences and Containers

```
a b c                      // three patterns in sequence (array context)
[ a b c ]                  // one pattern matching an array
a ( b c )*2   === a b c b c
a [ b c ]*2   === a [b c] [b c]

a:b c:d e:f                // three key/value assertions (object context)
{ a:b c:d e:f }            // one pattern matching an object
{ a:b c:d e:f } as Map     // object treated as map

a b c                      // set members (set context)
{{ a b c }}                // pattern matching a Set

>> a b c <<                // slice marked for replacement
>> k << : v                // replace key
k : >> v <<                // replace value
```

**Precedence (high → low)**:
Parentheses > Quantifiers > `.` > Space > `&` > `|`

```
p1 | p2                    // alternation
p1 & p2                    // conjunction (same value matches both)
```

---

## Anchoring

```
[ a b ]        ~= ["a","b"]
[ a b ]       !~= ["a","b","c"]
[ a b ... ]    ~= ["a","b","c"]       // yes, "..." is the actual syntax

{ b:_  c:_ }   ~= { b:1, c:2 }        // every kv assertion satisfied
{ b:_      }  !~= { b:1, c:2 }        
{ b:_  c:_ }  !~= { b:1 }             // objects anchored by default
{ b:_  ... }   ~= { a:1, c:2, Z:1 }   

{ /[ab]/:_  /[ad]/:_ }   ~= { a:1 }   // kv assertions can overlap
{ /[ab]/:_  /[ad]/:_ }  !~= { d:1 }

{ b:_  $s=(...) }   ~= { a:1, c:2, Z:1 }  // Extracting the set of KV pairs that were not constrained by any of the assertions:  $s = { 'c':2, 'Z':1 }
```


---

## Binding

Bindings are **Prolog-style**: all occurrences of a symbol must unify.
```
$name = pattern            // bind variable if pattern matches
$name                      // shorthand for $name:_*? (array slice context) or $name:_ (singular context)

[ $x $x=/[ab] $y ]   ~= ['a','a','y']
[ $x $x=/[ab] $y ]  !~= ['a','b','y']
[ $x $x=$y $y ]      ~= ['q','q','q']
[ $x=($z $y) $y $z ] ~= ['r','q','q','r']

$key: $val              // binds any key/value pair
$key=k: $val=v          // binds only when key = k and value = v
```


---

## Quantifiers — Arrays

```
a*{2,3}      === a a | a a a
a*3          === a*{3,3}
a*           === a*{0,}         // unbounded
a+           === a*{1,}
a?           === a*{0,1}
a            === a*1
a*{2,3}?     // lazy
...          === _*?            // lazy wildcard slice

// Multiple ellipses allowed
[a ... b ... c]  ~=  [a x y b z c]
```

Arrays are always anchored; `...` (or `_ *?`) relaxes that boundary.

---

## Quantifiers — Objects and Sets

```
{ pat1:_  $happy=(pat2:_) }     // bind subset slice
{ a:_  b:_  $rest=.. }      // bind residual slice
```

* Each object assertion matches a **slice** of key/value pairs.
* `others` is a **keyword** valid only inside object matchers;
  it denotes the remaining (unmatched) properties.

---
Quantifiers on KV assertions don't work the same as they do in arrays. There is no backtracking. They match against all the KVs, and then count the number of matches.
```
k:v #{2,4}   === object has 2–4 keys matching k
k:v #2       === k:v #{2,2}
k:v #?       === k:v #{0,}      // optional
k:v          === k:v #{1,}      // default: one or more

...          === _:_ #?         // allow unknown keys

// Multiple ellipsess allowed but redundant
{ ... a:1 ... b:2 }   // valid; warns about redundancy
```

---

## Assertions

```
(?=pattern)   // positive lookahead — must match, no consume
(?!pattern)   // negative lookahead — must not match
```

---

## Vertical / Path Patterns

```
{ a.b.c:d }   ~= { a:{ b:{ c:'d' } } }

{ a[3].c:d }  ~= { a:[_,_,_,{ c:'d' }] }

{ ((a.b.)*3)c:d }  
   ~= { a:{ b:{ a:{ b:{ a:{ b:{ c:'d' }}}}}}}
```

Right-to-left associative; no whitespace around `.`.
Array quantifiers apply to the *path prefix* (`a.b.` portion).

---

## Sets and Maps

```
{ a:_ b:_ } as Set          // treat keys as set elements
{ k:v  k2:v2 } as Map       // treat as map
```

---

## Replacement

```
>> pattern <<          // singleton replacement target
[ x >> y* << z ]       // replace array slice
>> k << : v            // replace key
k : >> v <<            // replace value
```

Not valid around an entire `k:v` pair or a multi-step path.

---

## Lookahead Recap

```
(?=p) q      // succeed if p matches
(?!p) q      // succeed if p does not match
[ (?=a b) a b ... ]
[ (?!a b) ... ]
```

---

## Cheat-Sheet Summary

```
...                === _*?            // lazy array wildcard
a*{m,n}            === repeat m–n times (greedy)
a*{m,n}?           === same, lazy
[ a b ]            !~= [ a b c ]      // arrays anchored
{ a:_ }             ~= { a:1, c:2 }   // objects unanchored
{ a:_ (?!=others) }=== anchored object
$k:$v              === $k=_ : $v=_    // kv binding sugar
$x                 === $x=_ (singleton) or $x=_*? (slice)
```

# Language Reference (Technical)

## Conventions

* **Whitespace & comments**
  C-style comments (`/* ... */`, `// ...`) are allowed anywhere between tokens.
  Whitespace is ignored except where **space denotes adjacency** (array sequences).
  No explicit `ws` annotations appear in productions; treat inter-token whitespace/comments as implicit.

* **Equivalence notation**
  `~=` and `===` appear in this documentation as shorthand for illustration only.
  They are **not part of the Tendril language syntax**.

    * `foo ~= bar` means `Tendril("foo").matches(bar)`
    * `===` indicates syntactic or semantic equivalence between patterns.

* **Precedence (high → low)**
  Parentheses, quantifiers, `.`, space (array adjacency), `&`, `|`.

* **Data model**
  JSON-like: objects, arrays, strings, numbers, booleans, null.
  Regex literals use JavaScript’s regex syntax.

---

## Lexical Atoms

```
INTEGER                 // decimal integer; coerces to Number
BOOLEAN                 // true | false
QUOTED_STRING           // quoted string literal
REGEX                   // /pattern/flags (JS regex literal)
BAREWORD                // [A-Za-z_][A-Za-z0-9_]* unless a keyword
_                       // singleton wildcard (matches any single value)
SYMBOL                  // $[A-Za-z_][A-Za-z0-9_]* (logic variable)
```

**Literals and coercion**

* Numbers and booleans match by coercion to JS primitives.
* Strings: quoted or bare (unless keyword).
* Regex: matches strings via JS engine; no implicit coercion from non-strings.
* **Type guards** via `as`:

  ```
  pattern as string|number|regex|classname
  ```

  Runtime type constraint; coercion allowed only for `string` and `number`.

---

## Core Grammar (informal EBNF)

```
ROOT_PATTERN            := SINGLETON_PATTERN

SINGLETON_PATTERN       := LITERAL
                         | ARRAY_PATTERN
                         | OBJECT_PATTERN
                         | SET_OR_MAP_PATTERN
                         | '(' SINGLETON_PATTERN ')'
                         | LOOKAHEAD_SINGLETON
                         | '_'
                         | SYMBOL ('=' SINGLETON_PATTERN)?
                         | '>>' SINGLETON_PATTERN '<<'
                         | SINGLETON_PATTERN 'as' TYPE_NAME

LOOKAHEAD_SINGLETON     := '(?=' SINGLETON_PATTERN ')' SINGLETON_PATTERN
                         | '(?!' SINGLETON_PATTERN ')' SINGLETON_PATTERN

ARRAY_PATTERN           := '[' (ARRAY_SLICE_PATTERN (ARRAY_WS ARRAY_SLICE_PATTERN)*)? ']'
ARRAY_WS                := single space (array adjacency)

ARRAY_SLICE_PATTERN     := '...'                               // == _*? (lazy)
                         | SYMBOL ('=' ARRAY_SLICE_PATTERN)?
                         | '(' ARRAY_SLICE_PATTERN ')' ARRAY_QUANT?
                         | SINGLETON_PATTERN ARRAY_QUANT?
                         | ARRAY_SLICE_PATTERN ARRAY_WS ARRAY_SLICE_PATTERN
                         | LOOKAHEAD_ARRAY_SLICE
                         | '>>' ARRAY_SLICE_PATTERN '<<'

LOOKAHEAD_ARRAY_SLICE   := '(?=' ARRAY_SLICE_PATTERN ')' ARRAY_SLICE_PATTERN
                         | '(?!' ARRAY_SLICE_PATTERN ')' ARRAY_SLICE_PATTERN

ARRAY_QUANT             := '?' | '??' | '+' | '+?' | '*' ('{' (INTEGER (',' INTEGER)?)? '}')?

OBJECT_PATTERN          := '{' OBJECT_ASSERTION* '}'

OBJECT_ASSERTION        := KV_ASSERTION
                         | PATH_ASSERTION
                         | INDEXED_PATH_ASSERTION
                         | SLICE_BINDING
                         | NEGATIVE_SLICE_ASSERTION

KV_ASSERTION            := SINGLETON_PATTERN ':' SINGLETON_PATTERN
PATH_ASSERTION          := SINGLETON_PATTERN '.' OBJECT_ASSERTION
INDEXED_PATH_ASSERTION  := '[' SINGLETON_PATTERN ']' OBJECT_ASSERTION
SLICE_BINDING           := SYMBOL '=' '(' OBJECT_ASSERTION+ ')'
NEGATIVE_SLICE_ASSERTION:= '(?!=others)'

SET_OR_MAP_PATTERN      := OBJECT_PATTERN 'as' 'Set'
                         | OBJECT_PATTERN 'as' 'Map'
```

---

## Keywords

| Keyword    | Meaning                                    | Scope                                 |
| ---------- | ------------------------------------------ | ------------------------------------- |
| **others** | Residual slice (unmatched key/value pairs) | Valid **only within object matchers** |

---

## Operators

```
p1 | p2                   // alternation
p1 & p2                   // conjunction on a single value
a.b:c                     // vertical/path assertion (right-associative)
[a].b:c                   // index/key indirection
>> ... <<                 // replacement target
```

Precedence: `( )` > quantifiers > `.` > space > `&` > `|`.

---

## Binding and Unification

* `$name = pattern` binds `$name` to the matched value or slice.
* Bare `$name` is shorthand for `$name=_` (singleton) or `$name=_*?` (in array slice).
* **Unification is global and Prolog-style**: repeated symbols must agree across branches.

Examples:

```
[ $x $x=/[ab]/ $y ]      ~= ['a','a','y']
[ $x $x=/[ab]/ $y ]     !~= ['a','b','y']
[ $x $x=$y $y ]          ~= ['q','q','q']
[ $x=($z $y) $y $z ]     ~= ['r','q','q','r']
```

---

## Arrays

* **Sequencing** is by space inside `[...]`.
* **Quantifiers**:

  ```
  a*{2,3}   === a a | a a a
  a*3       === a*{3,3}
  a*        === a*{0,}
  a+        === a*{1,}
  a?        === a*{0,1}
  a*?       // lazy
  ...       === _*?       // lazy wildcard slice
  ```
* **Nested quantifiers** are allowed via grouping:

  ```
  [ ((a b)+ c)*2 ]  ~=  [a,b,a,b,c,a,b,a,b,c]
  ```
* Arrays are **anchored by default**; `[a b] !~= [a b c]`.

---

## Objects and Object Slices

* Each object assertion matches a **slice**: a subset of key/value pairs satisfying that assertion.
* Assertions are **conjunctive** and **non-exclusive**; a single property may satisfy several.

Example:

```
{ /[ab].*/:22  /[bc].*/:22  xq*3 }  ~=  { b:22, c:22 }
```

### Binding slices

```
{ pat1:_  $happy=(pat2:_) }       // bind subset slice to $happy
{ a:_  b:_  $rest=others }        // bind residual slice
```

### Anchoring objects

```
{ a:1 b:2 (?!=others) }           // anchored object, no extras
```

### Vertical/path assertions

```
{ a.b.c:d }            ~= { a:{ b:{ c:"d" } } }
{ a[3].c:d }           ~= { a:[_,_,_,{ c:"d" }] }
{ ((a.b.)*3)c:d }      ~= { a:{ b:{ a:{ b:{ a:{ b:{ c:"d" }}}}}}}
```

Objects are **unanchored by default**; `{a:b} ~= {a:b, c:d}`.

---

## Sets and Maps

```
{ a:_ b:_ } as Set         // treat keys as set elements
{ k:v  k2:v2 } as Map      // treat as map
```

These use the object form but enforce set/map semantics internally.

---

## Lookahead and Negation

```
(?=pattern) q     // positive lookahead
(?!pattern) q     // negative lookahead
```

Array-slice lookaheads:

```
[ (?= a b ) a b ... ]
[ (?! a b ) ... ]
```

Objects use the dedicated negation `(?!=others)` for anchoring.

---

## Replacement

Mark what to replace with `>> ... <<`.

```
>> pattern <<           // singleton
[ x >> y* << z ]        // array slice
>> k << : v             // key replacement
k : >> v <<             // value replacement
```

Not allowed around entire key/value pairs or multi-step paths.

---

## Examples

**Find and join relational facts**

```js
Tendril(`{
  users.$userId.contact: [$userName _ _ $userPhone]
  users.$userId.managerId: $managerId
  users.$managerId.phone: $managerPhone
  projects.$projectId.assigneeId: $userId
  projects.$projectId.name: $projectName
}`)
.find(input)
.each(s => console.log(s.$projectName, s.$userName, s.$userPhone, s.$managerPhone));
```

**Redact sensitive fields**

```js
Tendril("{ (_.)*password: >>value<< }").replaceAll(input, "REDACTED");
```

**Anchored object**

```
{ a:1 b:2 (?!=others) } ~= { a:1, b:2 }
{ a:1 b:2 (?!=others) } !~= { a:1, b:2, c:3 }
```

**Bind object slices**

```
{ /user.*/:_  $contacts=(/contact.*/:_)  $rest=others }
```

---

## Formal Semantics (summary)

* Matching uses backtracking matcher generators with:

    * **Scope** for variable bindings.
    * **Unification** enforcing global consistency.
    * **Type guards** enforced at runtime.
    * **Lookaheads** asserting without consuming.
* **Objects**:

    * Each assertion → subset of k/v pairs.
    * `others` = residual (unmatched) properties.
    * `(?!=others)` ensures residual is empty.
* **Arrays** anchored; `...` relaxes boundaries.
* **Replacement** uses tracked source spans; replacements are exact.

---

## Design Notes

1. **Whitespace and comments** – ignored globally; only array adjacency uses space semantically.
2. **Arrays anchored, objects not** – reflects natural data variability.
3. **Anchoring via residual negation** – `(?!=others)` is explicit, compositional, and readable.
4. **Object slices** – unify non-exclusive matching with bindable subsets.
5. **Nested quantifiers** – enable expressive regular patterns.
6. **Prolog-style unification** – supports relational joins across structures.
7. **Type guards with limited coercion** – ergonomic yet predictable.
8. **Replacement scope** – precise, avoids ambiguity.
9. **Set/Map annotations** – clean reuse of object syntax.
10. **Lookaheads** – regex-familiar; `others` negation fills object gap.

---

## Quick Equivalence Cheatsheet

```
...                  === _*?                 // array lazy slice
a*{m}                === repeat m times
a*{m,n}              === m..n repetitions (greedy)
a*{m,n}?             === m..n repetitions (lazy)
[ a b ]              !~= [ a b c ]          // arrays anchored
{ a:_ }               ~= { a:1, c:2 }       // objects unanchored
{ a:_ (?!=others) }  === anchored object
$k:$v                === $k=_ : $v=_        // kv binding sugar
$x                   === $x=_ or $x=_*?     // depends on position
```

---

**End of Specification**


## Summary of Critical Discrepancies

| # | Issue | Impact |
|---|-------|--------|
| **2** | **Object anchoring default** | 🔴 MAJOR - v1 anchored, v2 unanchored |
| **6** | **Replacement restrictions** | 🟡 MEDIUM - v2 adds new constraints |
| **7** | **Binding context-dependence** | 🟡 MEDIUM - v2 makes `$x` ambiguous |
| **8** | **Object anchoring mechanism** | 🔴 MAJOR - v1 has none, v2 uses `(?!=others)` |
| **11** | **Map syntax** | 🟡 MEDIUM - `as Map` → `as @AsMap` |
| **12-13** | **Object slice binding & `others`** | 🔴 MAJOR - v2 introduces new features |
| **14** | **Type guards** | 🟡 MEDIUM - v2 introduces new feature |
| **16** | **Comments** | 🟢 MINOR - backward compatible addition |
| **17** | **Regex coercion** | 🟡 MEDIUM - contradictory statements |

The biggest issue is **#2**: Are objects anchored or unanchored by default? The two versions directly contradict each other.