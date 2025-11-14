# Tendril

<div style="padding:3em; margin:3em; background-color:pink">Status: alpha</div>

Tendril = structural pattern matching **+** relational logic, in a small, template-inspired language for **match** and **replace** across JSON-like graphs.

## Hello, world

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
      ["Ceres", "Demeter"]]
};

// Expected output
[
   "Hello, big world Jupiter",
   "Hello, big world Jove",
   "Hello, big world Zeus",
   "Hello, small world Earth",
   "Hello, small world Terra",
   "Hello, tiny world Ceres",
   "Hello, tiny world Demeter",
]

// First method
const pattern = `{
  planets = {
      $name = {size = $size}
  }
  aka = [ .. 
           ([.. $alias ..] & [$name .. ])
        .. ] 
}`;

// Second method
const pattern = `{
  planets.$name.size=$size
  aka[$idx][_]=$alias
  aka[$idx][0]=$name
}`;

Tendril(pattern)
.solutions(data)
.map($ => `Hello, ${$.size} world ${$.alias}`);

```

---

# Quick Start (1 minute read)
```
// Basic patterns ... 
{ foo = bar }         does match     { "foo": "bar" } 
{ foo = bar }         does not match { "foo": "bar", "baz": "buzz" } 
[ a b c .. ]          does match     [ "a", "b", "c", "d", "e" ] 

// Object with constraints
{
  data.users[3].name = "John Smith"    // object?.data?.users?.[3]?.name ?? null == "John Smith"
  _ = /permission/                     // AND all property values of object match /permission/
}

// Array quantifiers
[ a? b+ c* ]                       // optional a; one-or-more b; zero-or-more c

// Repeated symbols form assertions
[ $X:( _ _ ) .. $X ]              // first two items equal the last two

```

---

# Cheat Sheet (10 minute read)

In this document, `foo ~= bar` means `Tendril("foo").matches(bar)`, and `===` shows pattern equivalence. These notations are **only for illustration** — *not part of the API*.

Caution: the same concept has different nuances within array contexts [ ] vs. object contexts { }.


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
[ a b .. ]     ~= ["a","b","c"]       // yes, ".." is the actual syntax

{ b=_  c=_ }   ~= { b:1, c:2 }        // every kv assertion satisfied
{ b=_      }  !~= { b:1, c:2 }
{ b=_  c=_ }  !~= { b:1 }             // objects anchored by default
{ b=_  .. }    ~= { a:1, c:2, Z:1 }

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
  
$x:(keyPattern = valPattern)   // binds to the set (group) of all matching key/value pairs; non-backtracking
$k:keyPattern = $v:valPattern   // binds to an individual key or value. 
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
..          === _*?            // lazy wildcard group

// Multiple ellipses allowed. '..' is sugar for '_*?'.
[a .. b .. c]  ~=  [a x y b z c]
```

---

## Quantifiers — Objects and Sets

Each object assertion matches a **group** of key/value pairs, possibly overlapping, no backtracking.

```
{{ pat1=_  $happy:(pat2=_) }}     // bind subset group
{{ a=_  b=_  $rest:.. }}      // bind residual group
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

```
Here's the proposal first version 0.4: a major change to the language.  (This project is in alpha state, and nobody is using it, so no concern with migration or backward compatibility.) 

== for objects:

Semantics of k/v matching are unsatisfactory.

Terminology for possible interpretations of {kp=vp}:
   Validation:  *If* a key matches kp, *then* its value must match vp
   Existential:  *Some* k,v pair must match kp,vp (existing behavior)
   Strong:  Both assertions (Validation & Existential)
   
Proposal:
1. Get rid of the current match semantics (Existential) and replace with ?= (Validation) and = (Strong).
2. Permit ( ) to designate object groups.  
3. When, syntactically, the symbol is being bound to key value *pairs*, not to keys or to values, then we are binding a group. This is greedy, non-backtracking, non-iterating. The symbol cannot be used as an index in paths, and cannot unify with a single value symbol. 
4. When, syntactically, the symbol is being bound to a key (or to a value), it is binding an individual object. This is also greedy and non-backtracking, but it can cause iteration. 
5. Optimize against combinatorial explosion later,  one strategy being to not actually realize the Cartesian product unless it becomes necessary. 
6. '..' means the residue of k/v pairs that didn't match any assertion.

== Maps, Sets
Drop support. Introduce them later as convenience operators for converting them to objects before matching. 

== For arrays

1. Delete existing *, +, *{m,n} operators, together with their greedy and possessive forms. 
   Keep '?' (non-posessive)

2. Introduce (in array context):
    pat*        - greedy possessive 0-or-more
    pat+        - greedy possessive 1-or-more
    pat*{m,n}   - greedy possessive

    **Internal anchor points**
    leftPat>rightPat    - Split the input at the leftmost point for which the right side matches rightPat, 
                            no backtracking, then attempt to match the left side to leftPat.   
    leftPat>>rightPat   - Split the input at the rightmost point for which the right side matches rightPat, 
                            no backtracking, then attempt to match the left side to leftPat.  
    
    ..              - `X ..` is equivalent to `X < _*`  But is hopefully optimized for that pattern.
                      `.. X` is equivalent to `_* > X`  (ditto).
                      Therefore:
                      `A .. B` is equivalent to `(A < _*) > B`
                      `.. A ..` is equivalent to `(_* > A) < _*`
                      And those two special cases might warrant their own optimization. 

                      n.b. The above should be equivalent to defining `..` as `_*?` where `*?` is the 
                      nonpossessive nongreedy backtracking quantifier.

    Precedence:   possessive(*,+) > path(`.`, `[n]`) > adjacency > & > | > split('>' '>>' '<' '<<') 
    Reminder:  All array patterns are anchored. The idiom for a non-anchored match is [.. pat ..].
    Reminder:  '>>' '<<' are no longer reserved as markers for replacement targets in the latest version.
    
The key theory motivating this is that **iteration over repetition count** is not only very inefficient, it's also not very useful, because the decision to stop a sequence is not arbitrary. You don't just stop it randomly someplace in the middle. You stop it on a condition. 

== string regexes

Instead of using JS regexes, use our own regex language. The main differences to standard regexes are:
1. mirror the changes we made to array patterns (avoid iterating over repetition count, introduce internal anchor points)
2. named groups in the regex participate in Tendril symbol binding.

Did I forget anything?
```
```

A. { kp=>vp } // *If* a key matches kp, *then* its value must match vp
B. { kp?=vp } // *Some* k,v pair must match kp,vp (existing behavior)
C. { kp=vp } // *All* k,v pairs must match kp,vp

A. { kp => vp } // *If* a key matches kp, *then* its value must match vp
B. { kp ?= vp } // *Some* k,v pair must match kp,vp (existing behavior)
D. { kp = vp } // Both assertions (A & B)


{ $kv:($k:kp=>vp) } // *If* a key matches kp, *then* its value must match vp
   Probable binding strategy:
      $k = group of keys that matched
      $kv = group of kv pairs that matched
    Alternate binding strategy:
        $k = iterate over single values that matched
        $kv = iterate over single values that matched

{ $kv:($k:kp?=vp) } // *Some* k,v pair must match kp,vp (existing behavior)
    Probable binding strategy:
        $k = group of keys that matched
        $kv = group of kv pairs that matched
    Alternate binding strategy:
        $k = iterate over single values that matched
        $kv = iterate over single values that matched
        
{ $kv:($k:kp=vp) } // *All* k,v pairs must match kp,vp
   Probable binding strategy:
      $k = group of keys that matched
      $kv = group of kv pairs that matched
    Alternate binding strategy:
        $k = iterate over single values that matched
        $kv = iterate over single values that matched


(placeholder syntax)

bind groups:
   { @kv:(@k:kp=vp) }
   [ @x:(a b|_) c]   
bind individual values (with backtracking)
   { $kv:($k:kp=vp) }
   [ a $x:(b|c) ]

Drawback: yet another syntax to learn. But I think we need both modes.

Alternate: indicate group assertions explicitly
    {
      $k1:k1=v1             # may be wildcard; individual with backtracking 
         ($ks=$vs of $k2:k2=v2, $k3:k3=v3)  # $ks is an object group; $k2 and $k3 are arrays
    }

bind groups (sets of keys) :
   { $kv:{$k:kp=vp} }
   [ $x:(a b|_) c]   
bind individual values (with backtracking)
   { $kv:($k:kp=vp) }
   [ a $x:(b|c) ]


```

Or how about this?
1. We don't distinguish between a variable that captures an object and a variable that captures an object group (no "@" signifier).
2. When, syntactically, the symbol is being bound to key value *pairs*, not to keys or to values, then we are binding a group. This is greedy, non-backtracking, non-iterating. The symbol cannot be used as an index in paths, and cannot unify with a single value symbol. 

```
    { a=_ $x:( c=_ /e|f/=_ ) }  ~=  {a:1 c:2 e:3 f:4}  => one solution: [ $x:{c:2 e:3 f:4} ] 
```   

3. When, syntactically, the symbol is being bound to a key (or to a value), it is binding an individual object. This is also greedy and non-backtracking, but it can cause iteration. 
 ```
 { $m:/a|b|c|d/=$n } ~= { a=1 b=2 c=3 d=4 } 
   => 4 solutions: [ {$m:a,$n:1}, {$m:b,$n:2}, {$m:c,$n:3}, {$m:d,$n:4} ]`
 ```

To mitigate the possible combinatorial explosion, 
```
    { $m:/a|b|c|d/=$n $o:/e|f|g|h/=$p $q:/i|j|k|l/=$r } ~= { a=1 b=1 c=1 ...etc. }  
       => a Cartesian product, [ {$m:a $n:1 $o:e $p:1 $q:i $r:1}, ... ] // 4^3 solutions
```
we in future optimize it, internally keeping it as an array of k/v pairs, and not actually performing the iteration under favorable conditions (e.g. no other symbols in the values, and the same symbols not used elsewhere.)
```
    { $m:/a|b|c|d/=$n $o:/e|f|g|h/=$p $q:/i|j|k|l/=$r } ~= { a=1 b=1 c=1 ...etc. }  
       => a Cartesian product, but this case can be optimized. Instead of representing it internally as 4^3 branches,
               [ {$m:a $n:1 $o:e $p:1 $q:i $r:1}, ... ] // 4^3 solutions
          we might internally represent it as
               CartesianProduct([ 
                   [{$m:a,$n:1}, {$m:b,$n:1}, {$m:c,$n:1}, {$m:d,$n:1}],
                   [{$o:e,$p:1}, {$o:f,$p:1}, {$o:g,$p:1}, {$o:h,$p:1}],
                   [{$q:e,$r:1}, {$o:f,$r:1}, {$o:g,$r:1}, {$o:h,$r:1}]
                   ])
          and either present the solution in that form or expand it only after the matching is done and we're giving the solution.          
```

5. 
6. 
       2. 

3. `{ k1=v1 k2=v2 (k3=v3 k4=v4) .. }`
           

 
-----


Tendril Let you describe intertwined arrays, maps, and paths in a unified way, but be alert to the ways in which they behave differently.

This is an **Array Pattern**.  It matches this **Array**.  
```
    [a b 123]                    matches ["a", "b", 123]
```
Each piece of the pattern matches a **group** (contiguous subsequence) of the array. This is an **Array Group**.  Parentheses are for grouping. They don't create substructures.
```
    [ a (b c)*{2} d? ..]           matches ["a", "b", "c", "b", "c", "f"]
       group 1: a           matches group   "a"
       group 2: (b c)*{2}   matches group        "b", "c", "b", "c"
       group 3: d?          matches group                          
       group 4: ..          matches group                            "f"     
    
```



```peg
# -----------------------------
# LEXICAL & WHITESPACE
# -----------------------------
# C/JS-style comments allowed anywhere between tokens:
# // line comment
# /* block comment */
# Whitespace is not significant (except within quoted strings and regexes, and except that they always split tokens.)
# Whitespace and comments are assumed to have been stripped by the lexor. 

INTEGER           <- '-'? [0-9]+ # decimal integer
BOOLEAN           <- 'true' / 'false'
QUOTED_STRING     <- '"' ( '\\"' / !'"' . )* '"'      # no template strings

# Barewords are strings unless they are reserved tokens or keywords.
# NOTE: Ambiguity with keywords is resolved by longest-match and keyword table.

BAREWORD          <- !KEYWORD [A-Za-z_][A-Za-z0-9_]*
KEYWORD           <- 'true' / 'false' / 'as' / 'Map' / 'Set'
UNDERSCORE        <- '_'                               # wildcard
SYMBOL            <- '$' [A-Za-z_][A-Za-z0-9_]*        # logic variable

# https://chatgpt.com/c/68ecde47-bdc0-8326-9be6-c8def6019669?model=gpt-5-instant
REGEX             <- JSREGEX                           # native JS regex





# -----------------------------

# TOP-LEVEL

# -----------------------------

ROOT              <- WS PATTERN WS !. # single pattern input

# PATTERN expression language with | and & on SINGLETONs

PATTERN           <- OR

OR                <- AND (WS? '|' WS? AND)*
AND               <- SINGLETON (WS? '&' WS? SINGLETON)*

# -----------------------------

# SINGLETON PATTERNS (one JSON value)

# -----------------------------

SINGLETON         <- GROUPED
/ LOOKAHEAD_SINGLETON
/ ARRAY
/ OBJECT_OR_MAP
/ SET
/ BIND_SINGLETON
/ LITERAL
/ UNDERSCORE

LITERAL           <- INTEGER / BOOLEAN / QUOTED_STRING / REGEX / BAREWORD

GROUPED           <- '(' WS PATTERN WS ')' QUANT? # grouping + optional quant for arrays via higher ctx (see note below)

# Positive/negative lookahead that does not consume

LOOKAHEAD_SINGLETON
<- '(?=' WS PATTERN WS ')' WS SINGLETON
/ '(?!' WS PATTERN WS ')' WS SINGLETON

# -----------------------------

# ARRAYS

# -----------------------------

# Inside arrays, SPACE is the adjacency operator between GROUP elements.

ARRAY             <- '[' WS ARRAY_BODY? WS ']'

ARRAY_BODY        <- ARRAY_ELEM (ADJ ARRAY_ELEM)*
ADJ               <- SPACE # EXACTLY space (not '&') as sequence

ARRAY_ELEM        <- LOOKAHEAD_GROUP
/ BIND_GROUP
/ GROUP

# Group building blocks (can be repeated with quantifiers)

GROUP             <- DOTS
/ GROUPED_GROUP QUANT?
/ SINGLE_GROUP QUANT?

# '..' sugar == lazy wildcard group == _*?

DOTS              <- '..'

GROUPED_GROUP     <- '(' WS ARRAY_ELEM (ADJ ARRAY_ELEM)* WS ')'  # mere grouping, not nested array

SINGLE_GROUP      <- ARRAY_ATOM

# Things that may appear as an array group atom

ARRAY_ATOM        <- LOOKAHEAD_GROUP_ATOM
/ BINDABLE_ATOM
/ SINGLETON_ATOM

# Lookaheads at group granularity

LOOKAHEAD_GROUP   <- '(?=' WS ARRAY_ELEM WS ')' WS ARRAY_ELEM
/ '(?!' WS ARRAY_ELEM WS ')' WS ARRAY_ELEM

LOOKAHEAD_GROUP_ATOM
<- '(?=' WS ARRAY_ELEM WS ')' WS ARRAY_ELEM
/ '(?!' WS ARRAY_ELEM WS ')' WS ARRAY_ELEM

# Bind a group (e.g., $rest:.. or $x:(a b))

BIND_GROUP        <- SYMBOL WS? ':' WS GROUP

# Bindable atoms may be bare symbols bound to implied wildcard, or SYMBOL:pattern

BINDABLE_ATOM     <- BIND_SINGLETON
SINGLETON_ATOM    <- LITERAL / UNDERSCORE / GROUPED / ARRAY / OBJECT_OR_MAP / SET

# Quantifiers for array elements

QUANT             <- LAZYQUANT / GREEDYQUANT
LAZYQUANT         <- '?' '?'? # ? (0..1 greedy) or ?? (0..1 lazy)
GREEDYQUANT       <- '+' '?'? # + or +? (lazy)
/ '*' ('{' WS BOUNDS WS '}' )? '?'? # *, *{m}, *{m,n}, optional ? for lazy

BOUNDS            <- INTEGER (WS? ',' WS? INTEGER?)?

# Semantics:

# *{m} == exactly m repeats

# *{m,n} == m..n repeats

# + == 1..∞

#    *        == 0..∞

# ? == 0..1

# trailing ? makes the repetition LAZY (prefer fewer)

# -----------------------------

# OBJECTS, MAPS, PATHS, COUNTS

# -----------------------------

OBJECT_OR_MAP     <- OBJECT (WS 'as' WS 'Map' {reject_if_plain_object})?
OBJECT            <- '{' WS OBJECT_BODY? WS '}'

# NOTE: '{ } as Map' produces a Map pattern; plain '{ }' is Object pattern.

# '{ } as Set' is a syntax error (use '{{ }}').

OBJECT_BODY       <- OBJECT_ASSERTION (WS OBJECT_ASSERTION)*

OBJECT_ASSERTION  <- DOTS_OBJ
/ KV_ASSERTION
/ PATH_ASSERTION
/ BIND_OBJ_GROUP

DOTS_OBJ          <- '..' # allow unknown keys (residual group)

# Bind an object group (subset of kvs matched by inner assertion)

BIND_OBJ_GROUP    <- SYMBOL WS? ':' WS OBJ_GROUP_CORE

OBJ_GROUP_CORE    <- DOTS_OBJ
/ KV_ASSERTION
/ PATH_ASSERTION

# kv: keyPattern = valuePattern with optional count suffix

KV_ASSERTION      <- KEY_PAT WS? '=' WS? VAL_PAT WS? COUNT?

KEY_PAT           <- SINGLE_KEY
VAL_PAT           <- SINGLE_VAL

# Singletons only (not groups) for key/value patterns:

SINGLE_KEY        <- BIND_SINGLETON / LITERAL / UNDERSCORE / GROUPED / REGEX / BAREWORD
SINGLE_VAL        <- BIND_SINGLETON / SINGLETON

# Vertical/path assertions: a.b.c = v  or  a[3].b = v

PATH_ASSERTION    <- PATH_HEAD PATH_TAILS WS? '=' WS? VAL_PAT WS? COUNT?

PATH_HEAD         <- KEY_PAT # starting object (current value)
PATH_TAILS        <- ( DOT_SEG / IDX_SEG )+
DOT_SEG           <- WS? '.' WS? KEY_PAT
IDX_SEG           <- WS? '[' WS? SINGLETON WS? ']'        # SINGLETON acts as dynamic key/index

# Optional object-level occurrence counters (apply to kv/path assertions):

COUNT             <- '#' ( WS? '?' # #? == #{0,}
/ WS? '{' WS INTEGER (WS? ',' WS? INTEGER?)? WS '}' )?

# Default when COUNT omitted: #{1,} (one or more keys satisfy this assertion).

# Counting is over the set of properties; matching is non-backtracking & may overlap.

# -----------------------------

# SETS

# -----------------------------

# Double braces denote a Set pattern (matches only JS/ECMAScript Set-like).

SET               <- '{{' WS SET_BODY? WS '}}'
SET_BODY          <- SET_ELEM (WS SET_ELEM)*
SET_ELEM          <- BIND_SINGLETON / SINGLETON

# -----------------------------

# BINDING (general)

# -----------------------------

# Bind a SINGLETON value: $x:pattern   or   bare $x == $x:_

BIND_SINGLETON    <- SYMBOL (WS? ':' WS SINGLETON)?
/ SYMBOL # shorthand for $x:_

# -----------------------------

# TYPE GUARDS

# -----------------------------

# Parse-time constraints (not grammar tokens):

# - OBJECT with 'as Map' must compile to a MapPattern node and must not match plain Objects.

# - SET uses '{{ }}' only; '{ } as Set' is an error.

```