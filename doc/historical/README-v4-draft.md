# Tendril

<div style="padding:3em; margin:3em; background-color:pink">Status: alpha</div>

Tendril = structural pattern matching **+** relational logic, in a small, parser-like language for **match** and **replace** across JSON-like graphs.

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

// Here's one way to describe the data. 
const pattern = `{
  planets = {
      $name = {size = $size}
  }
  aka = [ .. 
           ([.. $alias ..] & [$name .. ])
        .. ] 
}`;

// Here's an equivalent way. 
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

---

# Quick Start Essentials (1 minute read)
```
// Literals
[ foo "foo" 123 false]       matches [ "foo", "bar", 123.0, false]

// Wildcards
[ /oo/ _ _ ]                 matches [ "foo", "bar", ["x","y"] ]

// Arrays
[ a ]                        does not match [ "a", "b", "c" ] 
[ .. b .. ]                  matches ["a", "b", "c"]            (backtracking)
[ a b | c d]                 matches ["a", "b"] or [ "c", "d" ] (backtracking)
[ a? b ]                     "a" is optional                    (backtracking)
[ a*+ b ]                    matches ["a", "a", "b"].           (greedy and non-backtracking)
[ a*{min,max} ]              matches between min<=n<=max copies (greedy and non-backtracking)

// Star-Arrow operators
[ a*--> B ]         repetition that stops at the first B (and consumes B, unless B is a lookahead)
[ a*---> B ]        repetition that stops at the last B (and consumes B, unless B is a lookahead)
[ a*--?> B ]        repetition that stops at any B (and consumes B, unless B is a lookahead) 
                             (possibly multiple solutions)
Examples:
    [ $x:/ab/*--> $y:b ]   matches ['a','a','a','b','b','b'] with $x=('a'), $y=('b')
         (Why does $x match only one 'a'?  Because it's not `$x:(/ab/*)`.
    [ $x:/ab/*---> (?=b) ]  does not match ['a','a','a','b','b','b'].
         (Why not? Because on the first repetition, $x binds to 'a', which means on the fourth repetition it fails to unify with 'b'. 
    [ $x:(/ab/*---> (?=b)) ]   matches ['a','a','a','b','b','b'] with $x=('a','a','a','b','b').
    [ $x:/ab/*--?> $y:b ]   matches ['a','a','a','b','b','b'] with 3 solutions:
                                     $x=('a','a','a','b','b'), $y=('b')
                                     $x=('a','a','a','b'), $y=('b','b')
                                     $x=('a','a','a'), $y=('b','b','b')
    [ _* --> PAT ]   is equivalent to  [.. PAT]

// Objects 
{ K ?= V }                   Every key matching K must have a value matching V.
{ K = V }                    Every key matching K must have a value matching V, AND there's at least one.
{ /key.*/=/foo/, p?=q }     matches {key1:"food", other:"stuff" }. (Commas are optional.)

// Paths, a.k.a breadcrumbs 
{
  data.users[3].name = "John Smith"    // this.data.users[3].name == "John Smith"
}

// Logic variables
[ $x:( _ _ ) .. $x ]       matches [a [p q] x a [p q]]: the first two items equal the last two. 
                           (Parentheses denote grouping, not substructures)
{ $k:/a/ = yes }           matches {a1:"yes", a2:"yes", a3:"no"} with two solutions: $k="a1", $k="a2".

```

---

# Cheat Sheet (10 minute read)

In this document, `foo ~= bar` means `Tendril("foo").matches(bar)`, and `===` shows pattern equivalence. These notations are **only for illustration** — *not part of the API*.

Caution: the same concept has different nuances within array contexts [ ] vs. object contexts { }.


---

## Atoms ("single items", though they may have internal structure)

```
// Literals
123                        // Pattern that matches a number literal
true, false                // Pattern that matches a boolean literal
"a", bareword              // String literal or bareword

// Wildcards
_                          // Pattern matching any single object or primitive
/foo/                      // Javascript regex

// Operators
**Precedence (high → low)**:
    
    Optional (`?`) 
    Breadcrumb operators (`.`, `[]`)
    Adjacenty (in arrays)
    `&`
    `|`
    Binding (`:`)
    Quantifiers (`*+`, `*{}`, *+-->`, `*+--?>`, `*+--->`)
    Key-value separator (`=`)
As usual, parentheses override normal precedence. The lookahead operators come with mandatory parentheses.

```

---

## Arrays and Array slices


A "slice" of an array is a contiguous subsequence. Each term of the array pattern matches a slice.

```


// Arrays
[ a b ]                      matches ["a","b"]
[ a b ]                      does not match ["a","b","c"]
[ a b .. ]                   matches ["a","b","c"]       // yes, ".." is the actual syntax
[ .. b .. ]                  matches ["a", "b", "c"]            (backtracking)
[ a b | c d]                 matches ["a", "b"] or [ "c", "d" ] (backtracking)
[ a? b ]                     "a" is optional                    (backtracking)
[ a*+ b ]                    matches ["a", "a", "b"].           (greedy and non-backtracking)
[ a*{min,max} ]              matches between min<=n<=max copies (greedy and non-backtracking)
    [ a*{2,3} ]              matches ['a','a','a','a']

// Star-Arrow operators (binary)
[ a*--> B ]         repetition that stops at the first B (and consumes B, unless B is a lookahead)
[ a*---> B ]        repetition that stops at the last B (and consumes B, unless B is a lookahead)
[ a*--?> B ]        repetition that stops at any B (and consumes B, unless B is a lookahead) 
    Examples:
        [ /ab/*--> $y:b ]   matches ['a','a','a','b','b','b'] with  $y=('b')
        [ /ab/*---> $y:b ]   matches ['a','a','a','b','b','b'] with  $y=('b')
        [ /ab/*--?> $y:b ]   does not match ['a','a','a','b','c','b']
            // Why? because $y:b is anchored to the end of the array, implying
            // a 'c' must precede it.
        [ /ab/*--?> $y:b ]   matches ['a','a','a','b','b','b'] with 3 solutions:
                                         $y=('b') , $y=('b','b') , $y=('b','b','b')
        [..] is defined as [_*+]
        [.. P] is defined as [_*-->P]
        [P ..] is defined as [P .*+]
        [P1 .. P2]   is equivalent to [ P1 _*--?> P2]
        [.. P ..]   is equivalent to [ _*--?>P--->_*+]
        
p1 | p2                    // alternation
p1 & p2                    // conjunction (same value matches both)
        [ /b/ /b/ & /a/ /a/ ] does match ['ab','ab']
        [ /b/ & /a/ /a/ ] does not match ['ab','ab'] ( Terms must be the same length.)



(?=pattern)   // positive lookahead — must match, no consume
(?!pattern)   // negative lookahead — must not match

```
## Objects

A "slice" of an object is a subset of its unordered K/V pairs. Each term of an object pattern defines a slice and expresses an assertion about it. The terms can be overlapping and may be empty.

```
{ K ?= V }        In the slice of all keys matching K, every value must match V. (An empty object always matches.)
{ K = V }         In the slice of all keys matching K, every value must match V; *and* the slice is nonempty.
{ K1=V1 K2=V2 }   A conjunction.
{ (?!TERM) }      A negation
{ 
                        
{ /key.*/=/foo/, p?=q }     matches {key1:"food", other:"stuff" }. (Commas are optional.)

```

## Anchoring

```

{ (a|b)=_  $s:(..) }   ~= { a:1, c:2, Z:1 } // Extracting the set of KV pairs that were not constrained by any of the assertions:  $s = { 'c':2, 'Z':1 }

// Anchoring
    { b=_  c=_ }   ~= { b:1, c:2 }        // every kv assertion satisfied
    { b=_      }  !~= { b:1, c:2 }
    { b=_ c?=_ }   ~= { b:1 }         
    { b=_  .. }    ~= { a:1, c:2, Z:1 }
    
    { (a|b)=_  (a|d)=_ }   ~= { a:1 }   // kv assertions can overlap
    { (a|b)=_  (a|d)=_ }  !~= { d:1 }

```

---

## Binding 

Patterns or sub-patterns may be labeled with symbols, a.k.a logic variables, which work similarly to Prolog.  The patterns must match the data. **In addition**, if two patterns have the same label, they must match the same (or structurally equivalent) data. This is called **Unification**. The data value is **bound** to that symbol.

The syntax for symbol binding is
```
$name:pattern 
$name           // if pattern is omitted, it's a _ wildcard.
```
Binding happens **left to right**.
```
Attempt to match [ $x $y $x ] ~= [ 1 2 3 ]  ==> **fail**

   1. Left $x binds to 1
   2. $y binds to 2
   3. Right $x binds to 3 --- and then tries to unify with left $x and fails
```
Binding can backtrack. There can be multiple solutions.

When the variable is unbound, `$name` is short for `$name:_`.
When already bound, `$name` is short for `($name:_*{n})` where n is the length of the bound slice.

```
[ $x $x:/(a|b)/ $y ]   ~= ['a','a','y']
[ $x $x:/(a|b)/ $y ]  !~= ['a','b','y']
[ $x $x:$y $y ]      ~= ['q','q','q']
[ $x:($z $y) $y $z ] ~= ['r','q','q','r']
  
$x:(keyPattern = valPattern)   // binds to the set (slice) of all matching key/value pairs; non-backtracking
$k:keyPattern = $v:valPattern   // binds to an individual key or value. 

```

## Binding Objects

## Quantifiers — Objects and Sets

Each object assertion matches a **slice** of key/value pairs, possibly overlapping, no backtracking.

```
{{ pat1=_  $happy:(pat2=_) }}     // bind subset slice
{{ a=_  b=_  $rest:.. }}      // bind residual slice
```

Object-counting remains:

```
k=v #{2,4}   === object has 2–4 keys matching k
k=v #2       === k=v #{2,2}
k?=v         === k=v #{0,}      // optional
k=v          === k=v #{1,}      // default: one or more
..          === _?=_          // allow unknown keys

{ .. a=1 .. b=2 }               // valid; redundant ellipses allowed
```
```
{$x:($k:KEYPAT=$v:VPAT)}  // $k,$v Get bound to individual KB pairs (iterating, backtracking)
                          // $x is bound to the whole slice
```

---

## Assertions


---

## Path Patterns a.k.a Breadcrumbs

```
{ a.b.c=d }   ~= { a:{ b:{ c:'d' } } }

{ a[3].c=d }  ~= { a:[_,_,_,{ c:'d' }] }

// Quantifiers including '*' (nongreedy, nonpossessive) work on breadcrumb pieces
{ ((a.b.)*{3})c=d }
   ~= { a={ b={ a={ b={ a={ b={ c='d' }}}}}}}
```

# Technical specification
```

# Language Reference (Technical)

## Conventions
* **Whitespace & comments**
  C-style comments (`/* .. */`, `// ..`) are allowed anywhere between tokens.
  Whitespace serves as a token delimiter and is stripped by the lexer.
  
* **Adjacency notation**
  In the grammar below, when two nonterminals appear adjacent (e.g., `ARRAY_SLICE_PATTERN ARRAY_SLICE_PATTERN`),
  this represents adjacency in the token stream after whitespace removal.
  In array patterns, adjacent tokens denote sequence/concatenation of array slices.
  
  No explicit `ws` annotations appear in productions; treat inter-token whitespace/comments 
  as lexical separators only.

INTEGER                 // decimal integer (matches Number type)
BOOLEAN                 // true | false
QUOTED_STRING           // quoted string literal
REGEX                   // /pattern/flags (JS regex literal)
BAREWORD                // [A-Za-z_][A-Za-z0-9_]* unless a keyword
_                       // singleton wildcard (matches any single value)
SYMBOL                  // $[A-Za-z_][A-Za-z0-9_]* (logic variable)

ROOT_PATTERN            := SINGLETON_PATTERN

SINGLETON_PATTERN       := LITERAL
                         | ARRAY_PATTERN
                         | OBJECT_PATTERN
                         | '(' SINGLETON_PATTERN ')'
                         | LOOKAHEAD_SINGLETON* SINGLETON_PATTERN?
                         | '_'
                         | SYMBOL (':' SINGLETON_PATTERN)?

LOOKAHEAD_SINGLETON     := '(?=' SINGLETON_PATTERN ')' 
                         | '(?!' SINGLETON_PATTERN ')' 

ARRAY_PATTERN           := '[' ARRAY_SLICE_PATTERN*']'

ARRAY_SLICE_PATTERN     := '..'                           
                         | SYMBOL (':' SINGLETON_PATTERN)?
                         | '(' ARRAY_SLICE_PATTERN ')' ARRAY_QUANT?
                         | SINGLETON_PATTERN ARRAY_QUANT?
                         | ARRAY_SLICE_PATTERN ARRAY_SLICE_PATTERN  // adjacency
                         | LOOKAHEAD_ARRAY_SLICE

LOOKAHEAD_ARRAY_SLICE   := '(?=' ARRAY_SLICE_PATTERN ')'
                         | '(?!' ARRAY_SLICE_PATTERN ')'

ARRAY_QUANT             := '*-->' | '*--->' | '*--?>' | ('{' (INTEGER (',' INTEGER)?)? '}')? | '?' | '*+'

OBJECT_PATTERN          := '{' OBJECT_ASSERTION* '}'

OBJECT_ASSERTION        := KV_ASSERTION
                         | PATH_ASSERTION
                         | INDEXED_PATH_ASSERTION
                         | '..'

KV_ASSERTION            := SINGLETON_PATTERN '=' SINGLETON_PATTERN OBJECT_COUNT?
PATH_ASSERTION          := SINGLETON_PATTERN '.' OBJECT_ASSERTION
INDEXED_PATH_ASSERTION  := '[' SINGLETON_PATTERN ']' OBJECT_ASSERTION

OBJECT_COUNT            := '#' ( '{' INTEGER (',' INTEGER?)? '}' )
                         // We are counting unique *keys*, not unique *values*
                         // #{0,}                  (optional, zero or more)
                         // #{m}         → #{m,m}  (exactly m)
                         // #{,m}        → #{0,m}  (up to m)
                         // #{m,n}                 (m to n occurrences)
                         // #{m,}        → #{m,∞}  (m or more, unbounded)
                         // k=v means #{v,}
                         // k?=v means #{0,}

```

---

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

---

## Sets and Maps

```
{{ a b c }}                // Set pattern (double braces) - matches Sets ONLY
{ k=v  k2=v2 } as Map      // Map pattern - matches Maps ONLY (not plain objects)
{ k=v  k2=v2 }             // Object pattern - matches plain objects ONLY (not Maps)
```
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

```
