# Tendril

<div style="padding:3em; margin:3em; background-color:pink">Status: alpha</div>

Tendril = structural pattern matching **+** relational logic, in a small, generator-inspired language for **match** and **replace** across JSON-like graphs.

## Hello, world

```js
const data = {
  planets: {Jupiter: {size: "big"}, Earth: {size: "small"}, Ceres: {size: "tiny"}},
  aka: [["Jupiter", "Jove", "Zeus"], ["Earth", "Terra"], ["Ceres", "Demeter"]]
};

const pattern = `{
  planets.$name.size = $size
  aka = [.. [$name .. $alias .. | $alias:$name ..] .. ] // $name itself as a possible alias
}`;

Tendril(pattern)
  .solutions(data)
  .project($ => `Hello, ${$.size} world ${$.alias}`);

=>
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

# Cheat Sheet (10 minute read)

In this document, `foo ~= bar` means `Tendril("foo").matches(bar)`, and `===` shows pattern equivalence. These notations are **only for illustration** — *not part of the API*.

---

## Atoms

```
123                        // Pattern that matches a number literal
true, false                // Pattern that matches a boolean literal
"a", bareword, /regex/     // ... string literal or regex (regex uses JS engine)
_                          // Pattern matching any single object or primitive
```

---

## Sequences and Containers

```
a b c                      // *Three* patterns in sequence (only allowed in an array context)
[ a b c ]                  // *One* pattern: an Array with three items

[ a ( b c )*2 ]  === [a b c b c ]      // ( ) indicates mere grouping (not a substructure)
[ a [ b c ]*2 ]  === [a [b c] [b c] ]  // [ ] indicates an Array

a=b c=d e=f                // *Three* unordered key/value assertions
                           // (only allowed in an object/map context)
{ a=b c=d e=f }            // *One* pattern: an object with three assertions
{ a=b c=d e=f } as Map     // One pattern matching a Map (does not match regular Object)

{{ a b c }}                // pattern matching a Set
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
[ a b .. ]    ~= ["a","b","c"]       // yes, ".." is the actual syntax

{ b=_  c=_ }   ~= { b:1, c:2 }        // every kv assertion satisfied
{ b=_      }  !~= { b:1, c:2 }
{ b=_  c=_ }  !~= { b:1 }             // objects anchored by default
{ b=_  .. }   ~= { a:1, c:2, Z:1 }

{ /[ab]/=_  /[ad]/=_ }   ~= { a:1 }   // kv assertions can overlap
{ /[ab]/=_  /[ad]/=_ }  !~= { d:1 }

{ b=_  $s:(..) }   ~= { a:1, c:2, Z:1 }  // Extracting the set of KV pairs that were not constrained by any of the assertions:  $s = { 'c':2, 'Z':1 }
```

---

## Binding

Bindings are Prolog-style. Patterns may be labeled with symbols. The patterns must match the data. **In addition**, if two patterns have the same label, they must match the same (or structurally equivalent) data. This is called **Unification**. The data value is bound to that symbol.
```
$name : pattern            // bind variable if pattern matches
$name                      // shorthand for `$name:_` (Careful! Not `$name:_*`)

[ $x $x:/[ab]/ $y ]   ~= ['a','a','y']
[ $x $x:/[ab]/ $y ]  !~= ['a','b','y']
[ $x $x:$y $y ]      ~= ['q','q','q']
[ $x:($z $y) $y $z ] ~= ['r','q','q','r']

$key = $val              // binds any key/value pair
$key:k = $val:v          // binds only when key = k and value = v
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
..          === _*?            // lazy wildcard slice

// Multiple ellipses allowed. '..' is sugar for '_*?'.
[a .. b .. c]  ~=  [a x y b z c]
```

---

## Quantifiers — Objects and Sets

Each object assertion matches a **slice** of key/value pairs, possibly overlapping, no backtracking.
```
{{ pat1=_  $happy:(pat2=_) }}     // bind subset slice
{{ a=_  b=_  $rest:.. }}      // bind residual slice
```

---
Quantifiers on KV assertions don't work the same as they do in arrays.. They match against all the KVs, and then count the number of matches (no backtracking)

```
k=v #{2,4}   === object has 2–4 keys matching k
k=v #2       === k=v #{2,2}
k=v #?       === k=v #{0,}      // optional
k=v          === k=v #{1,}      // default: one or more

..          === _=_ #?         // allow unknown keys

// Multiple ellipsess allowed but redundant
{ .. a=1 .. b=2 }   // valid; warns about redundancy
```

---

## Assertions

```
(?=pattern)   // positive lookahead — must match, no consume
(?!pattern)   // negative lookahead — must not match
```

---

## Path Patterns a.k.a Breadcrumbs

```
{ a.b.c=d }   ~= { a:{ b:{ c:'d' } } }

{ a[3].c=d }  ~= { a:[_,_,_,{ c:'d' }] }

// Quantifiers work on breadcrumb pieces
{ ((a.b.)*3)c=d }
   ~= { a={ b={ a={ b={ a={ b={ c='d' }}}}}}}
```

# Language Reference (Technical)

## Conventions

* **Whitespace & comments**
  C-style comments (`/* .. */`, `// ..`) are allowed anywhere between tokens.
  Whitespace is ignored except where **space denotes adjacency** (array sequences).
  No explicit `ws` annotations appear in productions; treat inter-token whitespace/comments as implicit.

* **Equivalence notation**
  `~=` and `===` appear in this documentation as shorthand for illustration only.
  They are **not part of the Tendril language syntax**.

    * `foo ~= bar` means `Tendril("foo").match(bar) !== null`
    * `===` indicates syntactic or semantic equivalence between patterns.

* **Precedence (high → low)**
  Parentheses, quantifiers, `.`, space (array adjacency), `&`, `|`.

* **Data model**
  JSON-like: objects, arrays, strings, numbers, booleans, null.
  Regex literals use JavaScript’s regex syntax.

---

## Lexical Atoms

```
INTEGER                 // decimal integer (matches Number type)
BOOLEAN                 // true | false
QUOTED_STRING           // quoted string literal
REGEX                   // /pattern/flags (JS regex literal)
BAREWORD                // [A-Za-z_][A-Za-z0-9_]* unless a keyword
_                       // singleton wildcard (matches any single value)
SYMBOL                  // $[A-Za-z_][A-Za-z0-9_]* (logic variable)
```

**Literals and matching**

* Numbers match number primitives using strict equality.
* Booleans match boolean primitives using strict equality.
* Strings: quoted or bare (unless keyword), match string primitives using strict equality.
* Regex: matches strings via JS engine.
* **Disambiguation** via `as`:

  ```
  { k=v } as Map              // creates Map pattern (matches Maps only)
  ```

  Grammar-level feature to distinguish Map patterns from Object patterns. Use `{{ }}` for Sets.

---

## Core Grammar (informal EBNF)

```
ROOT_PATTERN            := SINGLETON_PATTERN

SINGLETON_PATTERN       := LITERAL
                         | ARRAY_PATTERN
                         | OBJECT_PATTERN
                         | MAP_PATTERN
                         | SET_PATTERN
                         | '(' SINGLETON_PATTERN ')'
                         | LOOKAHEAD_SINGLETON
                         | '_'
                         | SYMBOL (':' SINGLETON_PATTERN)?

LOOKAHEAD_SINGLETON     := '(?=' SINGLETON_PATTERN ')' SINGLETON_PATTERN
                         | '(?!' SINGLETON_PATTERN ')' SINGLETON_PATTERN

ARRAY_PATTERN           := '[' (ARRAY_SLICE_PATTERN (ARRAY_WS ARRAY_SLICE_PATTERN)*)? ']'
ARRAY_WS                := single space (array adjacency)

ARRAY_SLICE_PATTERN     := '..'                               // == _*? (lazy)
                         | SYMBOL (':' SINGLETON_PATTERN)?
                         | '(' ARRAY_SLICE_PATTERN ')' ARRAY_QUANT?
                         | SINGLETON_PATTERN ARRAY_QUANT?
                         | ARRAY_SLICE_PATTERN ARRAY_WS ARRAY_SLICE_PATTERN
                         | LOOKAHEAD_ARRAY_SLICE

LOOKAHEAD_ARRAY_SLICE   := '(?=' ARRAY_SLICE_PATTERN ')' ARRAY_SLICE_PATTERN
                         | '(?!' ARRAY_SLICE_PATTERN ')' ARRAY_SLICE_PATTERN

ARRAY_QUANT             := '?' | '??' | '+' | '+?' | '*' ('{' (INTEGER (',' INTEGER)?)? '}')?

OBJECT_PATTERN          := '{' OBJECT_ASSERTION* '}'
MAP_PATTERN             := '{' OBJECT_ASSERTION* '}' 'as' 'Map'
SET_PATTERN             := '{{' (SINGLETON_PATTERN (WS SINGLETON_PATTERN)*)? '}}'

OBJECT_ASSERTION        := KV_ASSERTION
                         | PATH_ASSERTION
                         | INDEXED_PATH_ASSERTION
                         | '..'                               // spread (allow extra keys)

KV_ASSERTION            := SINGLETON_PATTERN '=' SINGLETON_PATTERN OBJECT_COUNT?
PATH_ASSERTION          := SINGLETON_PATTERN '.' OBJECT_ASSERTION
INDEXED_PATH_ASSERTION  := '[' SINGLETON_PATTERN ']' OBJECT_ASSERTION

OBJECT_COUNT            := '#' ( '?' | '{' INTEGER (',' INTEGER?)? '}' )
                         // #?           → #{0,}   (optional, zero or more)
                         // #{m}         → #{m,m}  (exactly m)
                         // #{m,n}                 (m to n occurrences)
                         // #{m,}        → #{m,∞}  (m or more, unbounded)
                         // (default: no count means #{1,}, one or more)

// Note: 'as Set' on { } is a parse error
// Note: 'as' on {{ }} is a parse error
```

---

## Operators

```
p1 | p2                   // alternation
p1 & p2                   // conjunction on a single value
a.b=c                     // vertical/path assertion (right-associative)
[a].b=c                   // index/key indirection
```

Precedence: `( )` > quantifiers > binding > path descent (i.e. . []) > space > `&` > `|`.

---

---

## Arrays

* **Sequencing** is by space inside `[..]`.
* **Quantifiers**:

  ```
  a*{2,3}   === a a | a a a
  a*3       === a*{3,3}
  a*        === a*{0,}
  a+        === a*{1,}
  a?        === a*{0,1}
  a*?       // lazy
  ..       === _*?       // lazy wildcard slice
  ```
* **Nested quantifiers** are allowed via grouping:

  ```
  [ ((a b)+ c)*2 ]  ~=  [a,b,a,b,c,a,b,a,b,c]
  ```
* Arrays are **anchored by default**; `[a b] !~= [a b c]`.

---

## Binding and Unification

* `$name : pattern` attempts to match the data to the pattern, and if successful, binds `$name` to the matched data. The pattern must be a singleton pattern, not a slice pattern.
* Bare `$name` is shorthand for `$name:_`.
* **Unification** If the same symbol occurs more than once, e.g. [ $x:pattern1 $x:pattern2 ]:
    - First pattern1 is matched. (Abort on failure.) The first $x is set to that matched value.
    - Then pattern2 is _independently_ matched. (Abort on failure.) The second $x is set to that matched value.
    - Then the two $x values are asserted to be structurally equal using strict equality. (Abort on failure.)

Examples:

```
[ $x $x:/[ab]/ $y ]      ~= ['a','a','y']
[ $x $x:/[ab]/ $y ]     !~= ['a','b','y']
[ $x $x:$y $y ]          ~= ['q','q','q']
[ $x:($z $y) $y $z ]     ~= ['r','q','q','r']

// Structural equality (deep comparison)
[ $x $x ] ~= [ [1,2], [1,2] ]         // YES

// Values must still match structurally
[ $x $x ] !~= [ [1,2], [1,4] ]      // NO (different values)
[ $x $x ] !~= [ [1,2], [1,2,3] ]    // NO (different shapes)
```

## Objects and Object Slices

* Each object assertion matches a **slice**: a subset of key/value pairs satisfying that assertion.
* Assertions are **conjunctive** and **non-exclusive**; a single property may satisfy several.

Example:

```
{ /[ab].*/=22  /[bc].*/=22  xq*3 }  ~=  { b:22, c:22 }
```

### Binding slices

```
{ pat1=_  $happy:(pat2=_) }       // bind subset slice to $happy
{ a=_  b=_  $rest:.. }        // bind residual slice
```

### Vertical/path assertions

```
{ a.b.c=d }            ~= { a:{ b:{ c:"d" } } }
{ a[3].c=d }           ~= { a:[_,_,_,{ c:"d" }] }
{ ((a.b.)*3)c=d }      ~= { a:{ b:{ a:{ b:{ a:{ b:{ c:"d" }}}}}}}
```

Objects are **anchored by default**; `{a=b} !~= {a:b, c=d}`.

---

## Sets and Maps

```
{{ a b c }}                // Set pattern (double braces) - matches Sets ONLY
{ k=v  k2=v2 } as Map      // Map pattern - matches Maps ONLY (not plain objects)
{ k=v  k2=v2 }             // Object pattern - matches plain objects ONLY (not Maps)
// Note: '{ } as Set' is a syntax error - use {{ }} for sets
```

These use similar syntax but create distinct AST nodes with different matching semantics.

---

## Lookahead and Negation

```
(?=pattern) q     // positive lookahead
(?!pattern) q     // negative lookahead
```

Array-slice lookaheads:

```
[ (?= a b ) a b .. ]
[ (?! a b ) .. ]
```

---

## Examples

**Find and join relational facts**

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

**Redact sensitive fields**

```js
Tendril("{ (_.)*password = $value }")
  .replaceAll(input, $ => ({ $value: "REDACTED" }));
```

**Bind object slices**

```
{ /user.*/=_  $contacts:(/contact.*/=_)  $rest:.. }
```

**End of Specification**

// Todo: a better API exposition section, and mention the variable names
