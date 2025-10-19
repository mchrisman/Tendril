

# Changes for V5 ( Not yet integrated into this document. )

- Drop support for Sets/Maps
- 
- Drop the >>..<< syntax for replacement target (Instead, the bound variables themselves are replacement targets.)
- 
- Rationalize semantics for Object patterns:
  K?=V means for all (key,value) where key matches K, value matches V;
  K=V means for all (key,value) where key matches K, value matches V, *and* there is at least one such


- `..` in objects refers to the **untested slice**: the set of all key value pairs whose key did not match any of the key patterns in any of the K=V assertions.
  Let us avoid the use of the word *anchored* in referring to objects. (It's confusing. The object is 'anchored' in the sense that *all* of the k/v pairs of the object are tested against *all* the assertions. But this doesn't imply that `..` is empty.)

- Rationalize semantics and syntax for singleton vs slice matching:
    $x:(ARRAY_SLICE_PATTERN) can bind a 0-item or 1-item match; bare $x means $x:(_)
    @x:(ARRAY_SLICE_PATTERN) can bind a slice (n-item match); bare @X means @x:(_*)
    In objects, @x(OBJECT_ASSERTION*) binds a slice (set of k/v pairs)

a point of clarification about "@rest": 'rest' is not a special keyword.  '..' in Object patterns is a
special token that means "the slice of all k/v pairs that matched *none* of the other assertions". You can bind it
to any @ variable:  @xyz:(..). 

- bare $x or @x is allowed, but if you want to enforce a pattern on the bound object, parentheses are now required:
  $x:(pat) or @x(slice).

- A `$` variable binds to a scalar; a `@` to a slice.  The terms *scalar* and *slice* refer to *data*, not to *patterns*. (Some patterns cannot be classified as scalar or slice at compile time.)
- 
  - In array patterns [ ], all the entries are slice patterns, and a *scalar* is merely an unwrapped slice of length zero or one. Formally, `$x:(pattern)` is a *triple assertion*: the data matches pattern AND the data is a single value AND (unification) if $x was previously bound, the data is equal to the previously bound value. Therefore $x:(_?) and $x:(_*) are both equivalent to $x:(_).
 
Examples:
```
    [ .. $x .. ] ~= ['a','b'] => solutions [{x:'a'},{x:'b'}]
       -- Scalar variables can have multiple solutions, but only one value per solution. 
       
    [ $x .. ] ~= ['a','b'] => solutions [{x:'a'}]
       -- Not {x:undefined}, because the implicit _ wildcard matches one object, not zero objects

    [ $x:(.*) .. ] ~= ['a','b'] => solutions [{x:'a'}]
       -- Not {x:['a','b']}, because $x is a scalar var.
       
    [ @x .. ] ~= ['a','b'] => solutions [{x:[]}, {x:['a']}, {x:['a','b']}]
    
     [ $x @y ] =~ [[1,2],[3,4]] => one solution, {x:[1,2], y:[[3,4]]}.  
         -- That $x is a scalar means that it binds to one item, not multiple items.  But that one item might be an array.
         
       Contrast with:
        [ @x @y ] ~= [[1,2],[3,4]]
        // Multiple solutions (greedy backtracking):
        // {x:[], y:[[1,2],[3,4]]}
        // {x:[[1,2]], y:[[3,4]]}
        // {x:[[1,2],[3,4]], y:[]}    
```

  - In object patterns { }, the distinction between a scalar and a slice is observable at compile time. Keys and values are scalars. Slices contain key value *pairs*.  `{ @mySlice:(color=blue) $myKey:(color)=$myValue:(blue) }`

- @x together with $x is a name collision, not permitted.

Discuss: can $x match zero objects?

Test cases:
Should `[ $x y $x? ]` match `[ 1, 'y', 1 ]` ?  // Reminder: bare `$x` means `$x:(_)`, and _ always binds exactly one object.

Should `[ $x y ($x:(_))? ]` match `[ 1,'y', 1 ]` ?  // Same thing. I think: yes. On the optional branch, the binding expression doesn't even exist, so it can't fail.
Should `[ $x y $x:(_?) ]` match `[ 1,'y',  1 ]` ?   // I think: yes.

Should `[ [($x:(_))? ..] $x ]` match `[ [1],  1 ]` ? // I think: yes.
Should `[ [$x:(_?) ..] $x ]` match `[ [1],  1 ]` ? // I think: yes.

Should `[ [($x:(_))? ..] $x ]` match `[ [1],  2 ]` ? // I think: yes.
Should `[ [$x:(_?) ..] $x ]` match `[ [1],  2 ]` ? // I think: no.

Should `[ [($x:(_))? ..] ($x:(_))? ..]` match `[ [1],  2 ]` ? // I think: yes.
Should `[ [$x:(_?) ..] $x:(_?) .]` match `[ [1],  2 ]` ? // I think: no

Should `[ [($x:(_))? ..] $x ]` match `[ [1],  null ]` ? // I think: yes
Should `[ [$x:(_?) ..] $x ]` match `[ [],  null ]` ? // I think: no

Should `[ [($x:(_))? ..] $x ]` match `[ [1] ]` ? // I think: no;
Should `[ [$x:(_?) ..] $x ]` match `[ [1]  ]` ? // I think: no

Should `[ ($x:(_))? $x ..]` match `[ 1, 'y' ]` ? // I think: Yes
Should `[ $x:(_?) $x .. ]` match `[ 1, 'y' ]` ? // I think: no.

Should `[ [$x:(1? 2?)] $x ]` match `[ [1] 1 ]` ? // Yes. This is a good example demonstrating why we don't try to prove that a pattern represents a scalar at compile-time.

## Core Grammar (informal EBNF)

```
// Regarding recursion: This expresses the desired logical intent, but may need to be refactored to make the recursion work. 

// Regarding optional commas: Note that the lexer splits tokens on whitespace and otherwise treats whitespace as insignificant. 

ROOT_PATTERN            := SINGLETON_PATTERN

IDENT                   := /[a-zA-Z]\w+/
                         
S_ITEM                   := '$' IDENT
S_SLICE                  := '@' IDENT

ITEM                     := '(' ITEM ')'
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
                          | A_SLICE A_QUANT        // todo, indicate precedence
                          | A_SLICE '|' A_SLICE
                          | '(?=' A_SLICE ')'
                          | '(?!' A_SLICE ')'    
                          
ARR                      := [ (A_SLICE (','? A_SLICE)*)? ]                          

KEY                     := ITEM
VALUE                   := ITEM
                          
O_TERM                  := KEY BREADCRUMB* ('=' | '?=') VALUE O_QUANT?
                          | '..' O_QUANT?
                          | S_ITEM ':' O_TERM
                          
BREADCRUMB              := '.' KEY 
                          | '[' KEY ']'
                          
O_SLICE                 := '(' (O_SLICE (','? O_SLICE)*)? ')'
                          | S_SLICE
                          | S_SLICE ':' '(' O_SLICE* ')'
                          | O_TERM
                          | '@_'
                          
OBJ                     := '{'  (O_SLICE (','? O_SLICE)*)? '}'

A_QUANT                  := '?' | '??' 
                          | '+' | '+?' | '++'
                          | '*' | '*?' | '*+' 
                          // The following are greedy and possessive.
                          // Maximums are taken seriously: 
                          //   [ 0*{2,4} ] does not match [0,0,0,0,0,0,0] 
                          | '*{' INTEGER '}' //  '*' is deliberate, mirroring '#' quantifiers, and representing multiplication. 
                          | '*{' INTEGER ',' INTEGER? '}'
                          | '*{' ',' INTEGER '}'


O_QUANT                   := '#' ( '?' | '{' INTEGER (',' INTEGER?)? '}' )
                         // #?           → #{0,}   (optional, zero or more)
                         // #{m}         → #{m,m}  (exactly m)
                         // #{m,n}                 (m to n occurrences)
                         // #{m,}        → #{m,∞}  (m or more, unbounded)


```




-------------------------------------------------------------------------

Everything below this line is a copy of the older version and has not yet incorporated the above changes. Where it does not contradict the above, it is still valid.

------------------------------------------------------------------------


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

```

**Precedence (high → low)**:

    Optional (`?`) 
    Breadcrumb operators (`.`, `[]`)
    Adjacenty/commas (in arrays, objects)
    `&`
    `|`
    Binding (`:`)
    Quantifiers
    Key-value separator (`=`)

As usual, parentheses override normal precedence. The lookahead operators come with mandatory parentheses.

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
{ b=_      }  !~= { b:1, c:2 }         // objects anchored by default
{ b=_  c=_ }  !~= { b:1 }             // unsatisfied assertion
{ b=_  c?=_ }   ~= { b:1 }             // optional assertion

{ b=_  .. }   ~= { a:1, c:2, Z:1 }    // .. Represents all key-value pairs where the keys did not fall into the scope any of the other assertions. 

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
{{ a=_  b=_  @rest:(..) }}      // bind residual slice
```

---
Quantifiers on KV assertions don't work the same as they do in arrays.. They match against all the KVs, and then count the number of matches (no backtracking)

```
k=v #{2,4}   === object has 2–4 keys matching k
k=v #2       === k=v #{2,2}
k=v #?       === k=v #{0,}      // optional
k=v          === k=v #{1,}      // default: one or more

..          === _=_ #?         // allow unknown keys
.. #{0}     === Object has no extra keys that were not accounted for in the assertions. 

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
{ a=_  b=_  @rest:(..) }        // bind residual slice
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
{ /user.*/=_  $contacts:(/contact.*/=_)  @rest:(..) }
```

**End of Specification**

// Todo: a better API exposition section, and mention the variable names
