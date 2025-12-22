Todo:


This is the design document for the next version of Tendril. It's not well integrated because it is essentially the old design document with change notes scattered into it.

As for the code, this is a complete rewrite. However, due to ambiguities in the design document (which have hopefully now been resolved) there are major differences between the code and the design outlined here.

NEXT TASK: based on README-v5-draft.md (this document), create a cleaned-up README-v5.md (final draft).

You may use or adapt content from the older README.md if it is still accurate (or you update it to be accurate) and if its explanation is more clear than that of this document.  

Remove redundancies. Be elegant and concise. Write in complete sentences, avoiding bullet points for exposition. ( You can use bullet points for lists of things. ) Write for both LLM and human audiences, not assuming any prior knowledge. Divide the document into an engaging pedagogical section and a thorough, complete reference section. Do not touch the grammar. Some improvements have been made since we last spoke. Do not correct anything that you believe to be incorrect. Just call it out. 

Before we begin, any questions?

------------------------------------------------------------------------
Give me your first impression of this.
------------------------------------------------------------------------

# Tendril

Express joins and transformations over nested data without flattening it.

Tendril combines structural patterns (like regex), path navigation (like jq or JSONPath), and relational joins (like SQL) into a single model—so you can relate values across a nested structure without writing traversal code or flattening data first.

## Status

**Beta.** Tendril’s core engine and semantics are stable. API and tooling are still evolving.

Performance: The engine uses symbol unification to prune branches early, avoiding unnecessary traversals. Performance is reasonable for development and testing, untried at large scale.

---

## Example: Data extraction and joins (Kubernetes)

This example joins container *specs* with container *runtime status* by container name $c.

```js
const pod = {
  metadata: { name: "api-7d9c9b8c6f-abcde", namespace: "prod" },
  spec: {
    containers: [
      { name: "api",  image: "ghcr.io/acme/api:1.42.0" },
      { name: "side", image: "ghcr.io/acme/sidecar:3.1.0" }
    ]
  },
  status: {
    containerStatuses: [
      { name: "api",  ready: true,  restartCount: 0 },
      { name: "side", ready: false, restartCount: 7 }
    ]
  }
};

Tendril(`{
  metadata:{ name:$pod namespace:$ns }
  spec.containers[_]: { name:$c image:$img } 
  status.containerStatuses[_]: { name:$c ready:$ready restartCount:$restarts }
}`)
.match(pod)
.solutions()  // e.g. 
.toArray().map(({pod, ns, c, img, ready, restarts}) =>
  `${ns}/${pod}  ${c}  ${img}  ready=${ready}  restarts=${restarts}`
);
```

```txt
// Raw solution objects look like this:
//    {
//      pod: "api-7d9c9b8c6f-abcde",
//      ns: "prod", 
//      c: "api",
//      img: "ghcr.io/acme/api:1.42.0",
//      ready: true,
//      restarts: 0
//    }
// Final output:
[
  "prod/api-7d9c9b8c6f-abcde  api   ghcr.io/acme/api:1.42.0      ready=true  restarts=0",
  "prod/api-7d9c9b8c6f-abcde  side  ghcr.io/acme/sidecar:3.1.0  ready=false restarts=7"
]
```

---

## Example: Transformation (VDOM manipulation)

Replace a `<label>` tag with a `placeholder` on the associated `<input>` tag,
regardless of how distant the two nodes are in the tree.

```js
Tendril(`{
  .. ($L= { tag:'label', props:{for:$id}, children:[$text]   } )
  ..      { tag:'input', props:{id:$id (@p=placeholder:_?) } }
}`)
.find(vdom)
.editAll({
  L: undefined,                    // delete the <label>
  p: $ => ({placeholder: $.text}) // move its text into the <input>
});
```

---

## Example: joins across separate datasets.

Nothing could be easier (as long as they're both in-memory).

```javascript
const users = [{id: 1, name: "Alice"}, {id: 2, name: "Bob"}];
const orders = [
  {user_id: 1, item: "laptop"},
  {user_id: 2, items: ["mouse", "mousepad"]}
];

Tendril(`{
  users[$i].id: $userId
  users[$i].name: $name
  orders[$j].user_id: $userId
  orders[$j].item: $item?
  orders[$j].items[_]: $item?
}`).match({users, orders})
  .solutions(["name", "item"])
// → [{name: "Alice", item: "laptop"},
//    {name: "Bob", item: "mouse"},
//    {name: "Bob", item: "mousepad"}]
```

---

## Getting Started

Pick one of these gentle introductions, whichever will be more immediately useful to you, and then move on to the advanced guide.

**Gentle Intro: Regex for structures** — Basic search and replace

**Gentle Intro: Data extraction** — Binding variables in search patterns

**Gentle Intro: Joins in JSON** — SQL-like joins within or between datasets.

**[Advanced Guide](docs/advanced.md)** — Complete reference: object semantics, precedence, performance notes, and API details.

**[Cheat Sheet]**

**[Cookbook]**

---

BEGIN ADVANCED GUIDE

---



---

# Cheat Sheet (10-minute read)

In this document, `foo ~= bar` means `Tendril("foo").matches(bar)`, and `===` shows pattern equivalence. These notations are **only for illustration** — *not part of the API*.

---

## Atoms

```
123                        // number literal
true, false                // boolean literal
"a", bareword, /regex/     // string or regex literal
foo/i, "Foo Bar"/i         // case-insensitive string (exact match, not substring)
_                          // wildcard (matches any single object or primitive)
```

---

## Sequences and Containers

```
a b c                      // *Three* patterns in sequence (only allowed in an array context)
[ a b c ]                  // *One* pattern: an Array with three items

[ a ( b c )*2 ]  === [a b c b c ]      // ( ) indicates mere grouping (not a substructure)
[ a [ b c ]*2 ]  === [a [b c] [b c] ]  // [ ] indicates an Array

a:b c:d e:f                // *Three* unordered key/value assertions
                           // (only allowed in an object/map context)
{ a:b c:d e:f }            // *One* pattern: an object with three assertions

```


**Precedence (high → low)**:

    Binding (`=`)
    Optional (`?`), Quantifiers (`+`, `*`, etc.)
    Breadcrumb operators (`.`, `..`, `[]`)
    Adjacenty/commas (in arrays, objects)
    `|`
    Key-value separator (`:`, `?:`)

As usual, parentheses override normal precedence. The lookahead operators come with mandatory parentheses.

```
  K?:V means for all (key,value) where key matches K, value matches V;
  K:V means for all (key,value) where key matches K, value matches V, *and* there is at least one such.
```

`remainder` refers to the **residual group**: all key/value pairs whose key did not match any key pattern in any `K:V` or `K?:V` assertion.
`remainder` is not necessarily empty; it can be bound to any `@` variable (`(@x=remainder)`).

---

## Anchoring

```
[ a b ]        ~= ["a","b"]
[ a b ]       !~= ["a","b","c"]
[ a b .. ]    ~= ["a","b","c"]       // yes, ".." is the actual syntax

{ b:_  c:_ }   ~= { b:1, c:2 }        // every kv assertion satisfied
{ b:_      }   ~= { b:1, c:2 }        // every kv assertion satisfied
{ b:_  c:_ }  !~= { b:1 }             // unsatisfied assertion
{ b:_  c?:_ }   ~= { b:1 }             // optional assertion

{ b:_  remainder }   ~= { a:1, c:2, Z:1 }    // remainder represents all key-value pairs where the keys did not match any of the assertions

{ /[ab]/:_  /[ad]/:_ }   ~= { a:1 }   // kv assertions can overlap
{ /[ab]/:_  /[ad]/:_ }  !~= { d:1 }

{ b:_  (@s=remainder) }   ~= { a:1, c:2, Z:1 }  // Extracting the set of KV pairs that were not matched by the assertions:  $s = { 'c':2, 'Z':1 }
```

---

## Binding

Bindings are Prolog-style. Patterns may be labeled with symbols. The patterns must match the data. **In addition**, if two patterns have the same label, they must match the same (or structurally equivalent) data. This is called **Unification**. The data value is bound to that symbol.

```
($name=pattern)       // bind if pattern matches
$name                 // shorthand for ($name=_)

[ $x ($x=/[ab]/) $y ]   ~= ['a','a','y']
[ $x ($x=/[ab]/) $y ]  !~= ['a','b','y']
[ $x ($x=$y) $y ]      ~= ['q','q','q']
[ ($x=$z $y) $y $z ] ~= ['r','q','q','r']
```

### Scalar vs. Group bindings

* `$x` binds a **scalar** (one item per solution).
* `@x` binds a **group** (0 … n items).
* Bare `$x` ≡ `($x=_)`
* Bare `@x` ≡ `(@x=_*)`
* `($x=pattern)` ensures the data matches `pattern` and is a single value.

  Example: `[ ($x=_?)]` matches `[ 1 ]` but not `[ ]` because $x must bind to a single value.
  Example: `[ ($x=_*)]` matches `[ 1 ]` but not `[ 1 1 ]` because $x must bind to a single value.  

Examples:

```
[ .. $x .. ] ~= ['a','b']       // [{x:'a'},{x:'b'}]
[ $x .. ]    ~= ['a','b']       // [{x:'a'}]
[ @x .. ]    ~= ['a','b']       // [{x:[]},{x:['a']},{x:['a','b']}]
[ $x @y ]    ~= [[1,2],[3,4]]   // {x:[1,2], y:[[3,4]]}
[ @x @y ]    ~= [[1,2],[3,4]]   // 3 solutions (different splits)
```
- `remainder` in objects refers to the **residual group**: the set of all key value pairs whose key did not match any of the key patterns in any of the assertions.
  Let us avoid the use of the word *anchored* in referring to objects. (It's confusing. The object is 'anchored' in the sense that *all* of the k/v pairs of the object are tested against *all* the assertions. But this doesn't imply that `remainder` is empty.)

- Rationalize semantics and syntax for singleton vs group matching. We have two kinds of logic variables: scalars prefixed with '$', and groups prefixed with '@':
  `($x=A_GROUP)` can bind $x to exactly one item; bare $x means `($x=_)`.
  `(@x=A_GROUP)` can bind @x to zero, one, or more items; bare @X means `(@x=_*)`.
  In objects, `(@x=O_BODY)` binds a group (set of k/v pairs). The terms *scalar* and *group* refer to *data*, not to *patterns*. (Some patterns cannot be classified as scalar or group at compile time.)

- 'remainder' in Object patterns is a special keyword that means "the group of all k/v pairs whose keys did not match any of the key patterns of any of the k/v assertions.

- bare $x or @x is allowed, but if you want to enforce a pattern on the bound object, parentheses are now required:
  `($x=pat)` or `(@x=group)`.

-
  - In array patterns [ ], all the entries are group patterns, and a *scalar* is merely an unwrapped group of length exactly one. Formally, `($x=pattern)` is a *triple assertion*: the data matches pattern AND the data is a single value AND (unification) if $x was previously bound, the data is equal to the previously bound value. Therefore ($x=_?) and ($x=_*) are both equivalent to ($x=_). You can bind `remainder` to any @ variable:  `(@xyz=remainder)`.

Examples:

```
    [ .. $x .. ] ~= ['a','b'] => solutions [{x:'a'},{x:'b'}]
       -- Scalar variables can have multiple solutions, but only one value per solution.

    [ $x .. ] ~= ['a','b'] => solutions [{x:'a'}]
       -- Not {x:undefined}, because the implicit _ wildcard matches one object, not zero objects

    [ ($x=.*) .. ] ~= ['a','b'] => solutions [{x:'a'}]
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

- In object patterns { }, the distinction between a scalar and a group is observable at compile time. Keys and values are scalars. Groups contain key value *pairs*.  `{ (@myGroup=color:blue) ($myKey=color):($myValue=blue) }`

- @x together with $x is a name collision, not permitted.

Test cases:
Should `[ $x y $x? ]` match `[ 1, 'y', 1 ]` ? Yes.

Should `[ $x y (($x=_))? ]` match `[ 1,'y', 1 ]` ? // Same thing. I think: yes. On the optional branch, the binding expression doesn't even exist, so it can't fail.
Should `[ $x y ($x=_?) ]` match `[ 1,'y',  1 ]` ? // I think: yes.

Should `[ [(($x=_))? ..] $x ]` match `[ [1],  1 ]` ? // I think: yes.
Should `[ [($x=_?) ..] $x ]` match `[ [1],  1 ]` ? // I think: yes.

Should `[ [(($x=_))? ..] $x ]` match `[ [1],  2 ]` ? // I think: yes.
Should `[ [($x=_?) ..] $x ]` match `[ [1],  2 ]` ? // I think: no.

Should `[ [(($x=_))? ..] (($x=_))? ..]` match `[ [1],  2 ]` ? // I think: yes.
Should `[ [($x=_?) ..] ($x=_?) .]` match `[ [1],  2 ]` ? // I think: no

Should `[ [(($x=_))? ..] $x ]` match `[ [1],  null ]` ? // I think: yes
Should `[ [($x=_?) ..] $x ]` match `[ [],  null ]` ? // I think: no

Should `[ [(($x=_))? ..] $x ]` match `[ [1] ]` ? // I think: no;
Should `[ [($x=_?) ..] $x ]` match `[ [1]  ]` ? // I think: no

Should `[ (($x=_))? $x ..]` match `[ 1, 'y' ]` ? // I think: Yes
Should `[ ($x=_?) $x .. ]` match `[ 1, 'y' ]` ? // I think: no.

Should `[ [($x=1? 2?)] $x ]` match `[ [1] 1 ]` ? // Yes. This is a good example demonstrating why we don't try to prove that a pattern represents a scalar at compile-time.
---

## Quantifiers — Arrays

```
a*{2,3}      === 2 or 3 repetitions    // greedy,possessive
a*3          === a*{3,3}
a*?          === a*{0,}         // not greedy
a*           === a*{0,}         // greedy
a*+          === a*{0,}         // greedy, possessive
a+?, a+, a++ === a*{1,}         // Not greedy, greedy, greedy possessive
a?           === a*{0,1}
..          === _*?            // lazy wildcard group
```

Multiple ellipses are allowed:
`[a .. b .. c]  ~=  [a x y b z c]`

---

## Quantifiers — Objects

Each key/value assertion operates over *all* pairs, then counts matches (no backtracking):

```
k:v #{2,4}   // object has 2–4 keys matching k
k:v #{0}     // object has no keys matching k
remainder #{0}      // require no residual pairs

```

---

## Lookahead / Assertions

```
(?=pattern)   // positive lookahead
(?!pattern)   // negative lookahead
```

---

## Path (Breadcrumb) patterns

```
{ a.b.c:d }   ~= { a:{ b:{ c:'d' } } }

{ a[3].c:d }  ~= { a:[_,_,_,{ c:'d' }] }

// Deep path wildcards with '..'
{ ..password:$p }     // matches 'password' at any depth (including zero)
{ user..name:$n }     // matches 'name' at any depth under 'user'
```

# Language Reference (Technical)

## Core Grammar (informal EBNF)

// Regarding recursion: This expresses the desired logical intent, but may need to be refactored to make the recursion work.

// Regarding optional commas: Note that the lexer splits tokens on whitespace and otherwise treats whitespace as insignificant.

## Literals

**Literals and matching**

* Numbers match number primitives using strict equality.
* Booleans match boolean primitives using strict equality.
* Strings: quoted or bare (unless keyword), match string primitives using strict equality.
* Case-insensitive strings (`foo/i`, `"Foo"/i`): match strings case-insensitively, requiring exact match (not substring).
* Regex: matches strings via JS engine (substring match unless anchored).

```
INTEGER                 :=  decimal integer (matches Number type)
BOOLEAN                 :=  true | false
QUOTED_STRING           :=  quoted string literal
REGEX                   :=  /pattern/flags (JS regex literal)
CI_STRING               :=  BAREWORD/i | QUOTED_STRING/i (no space before /i)
BAREWORD                :=  [A-Za-z_][A-Za-z0-9_]* unless a keyword
_                       :=  singleton wildcard (matches any single value)

 LITERAL := INTEGER | BOOLEAN | QUOTED_STRING | REGEX | CI_STRING | BAREWORD 
 
IDENT                   := /[a-zA-Z]\w*/
                         

ROOT_PATTERN            := ITEM

S_ITEM                   := '$' IDENT
S_GROUP                  := '@' IDENT

ITEM                     := '(' ITEM ')'
                          | S_ITEM
                          | S_ITEM '=' '(' ITEM ')'
                          | '_'
                          | LITERAL
                          | OBJ
                          | ARR
                          | ITEM '|' ITEM

A_BODY                   :=  (A_GROUP (','? A_GROUP)*)?

A_GROUP                  := '(' A_BODY ')'
                          | S_GROUP
                          | S_GROUP '=' '(' A_GROUP ')'
                          | S_ITEM
                          | S_ITEM '=' '(' A_GROUP ')'
                          | ITEM
                          | OBJ
                          | ARR
                          | A_GROUP A_QUANT        // todo, indicate precedence
                          | A_GROUP '|' A_GROUP
                          | '(?=' A_GROUP ')'
                          | '(?!' A_GROUP ')'    
                          
ARR                      := '[' A_BODY ']'                          

KEY                     := ITEM
VALUE                   := ITEM

O_TERM                  := KEY BREADCRUMB* (':' | '?:') VALUE O_QUANT?
                          | 'remainder' O_QUANT?
                          | '..' BREADCRUMB* (':' | '?:') VALUE O_QUANT?    // leading .. for deep path
                          | S_ITEM '=' '(' O_TERM ')'

BREADCRUMB              := '.' KEY
                          | '..' KEY                                         // skip arbitrary levels
                          | '[' KEY ']'


O_BODY                  := (O_GROUP (','? O_GROUP)*)?

O_GROUP                 := '(' O_BODY ')'
                          | S_GROUP
                          | S_GROUP '=' '(' O_GROUP* ')'
                          | O_TERM

OBJ                     := '{' O_BODY '}'

A_QUANT                  := '?'  
                          | '+' | '+?' | '++'   // greedy, not greedy, greedy possessive 
                          | '*' | '*?' | '*+'   // greedy, not greedy, greedy possessive
                          // The following are greedy and possessive.
                          | '*{' INTEGER '}' //  '*' is deliberate, mirroring '#' quantifiers, and representing multiplication. 
                          | '*{' INTEGER ',' INTEGER '}'
                          | '*{' INTEGER ',' '}'
                          | '*{' ',' INTEGER '}'


O_QUANT                   := '#' ( '?' | '{' INTEGER (',' INTEGER?)? '}' )
                         // #?           → #{0,}   (optional, zero or more)
                         // #{m}         → #{m,m}  (exactly m)
                         // #{m,n}                 (m to n occurrences)
                         // #{m,}        → #{m,∞}  (m or more, unbounded)


```

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

* **Data model**
  JSON-like: objects, arrays, strings, numbers, booleans, null.
  Regex literals use JavaScript’s regex syntax.

---
---

---

## Operators

```
p1 | p2                   // alternation
a.b:c                     // vertical/path assertion (right-associative)
[a].b:c                   // index/key indirection
```
---


## Arrays

* **Sequencing** is by space inside `[..]`.
* **Quantifiers**:

```
  // See grammar for complete list
  a*{2,3}
  a*+
  a+
  a?
  ..       === _*?       // lazy wildcard group
```
  
* **Nested quantifiers** are allowed via grouping:

  ```
  [ ((a b)+ c)*2 ]  ~=  [a,b,a,b,c,a,b,a,b,c]
  ```
* Arrays are **anchored by default**; i.e. `[a b] !~= [a b c]`.

---

## Binding and Unification

* `($name=pattern)` attempts to match the data to the pattern, and if successful, binds `$name` to the matched data. The pattern must be a singleton pattern, not a group pattern.
* Bare `$name` is shorthand for `($name=_)`.
* **Unification** If the same symbol occurs more than once, e.g. `[ ($x=pattern1) ($x=pattern2) ]`:
    - First pattern1 is matched. (Abort on failure.) The first $x is set to that matched value.
    - Then pattern2 is _independently_ matched. (Abort on failure.) The second $x is set to that matched value.
    - Then the two $x values are asserted to be structurally equal using strict equality. (Abort on failure.)

Examples:

```
[ $x ($x=/[ab]/) $y ]      ~= ['a','a','y']
[ $x ($x=/[ab]/) $y ]     !~= ['a','b','y']
[ $x ($x=$y) $y ]          ~= ['q','q','q']
[ ($x=$z $y) $y $z ]     ~= ['r','q','q','r']

// Structural equality (deep comparison)
[ $x $x ] ~= [ [1,2], [1,2] ]         // YES

// Values must still match structurally
[ $x $x ] !~= [ [1,2], [1,4] ]      // NO (different values)
[ $x $x ] !~= [ [1,2], [1,2,3] ]    // NO (different shapes)
```

## Objects and Object Groups

* Each object assertion matches a **group**: a subset of key/value pairs satisfying that assertion.
* Assertions are **conjunctive** and **non-exclusive**; a single property may satisfy several.

Example:
```
{ /[ab]/:22  /[bc]/:22 }  ~=  { b:22, c:22 }
```

### Binding groups


```
{ pat1:_  ($happy=pat2:_) }       // bind subset group to $happy
{ a:_  b:_  (@rest=remainder) }        // bind residual group
```

### Vertical/path assertions

```
{ a.b.c:d }            ~= { a:{ b:{ c:"d" } } }
{ a[3].c:d }           ~= { a:[_,_,_,{ c:"d" }] }
{ ..password:$p }      ~= { user:{ credentials:{ password:"secret" }}}   // deep path wildcard
```


---


## Lookahead and Negation

```
(?=pattern) q     // positive lookahead
(?!pattern) q     // negative lookahead
```

Array-group lookaheads:

```
[ (?= a b ) a b .. ]
[ (?! a b ) .. ]
```

---

## Examples

**Find and join relational facts**

```js
Tendril(`{
  users:$userId.contact:[$userName _ _ $userPhone]
  users:$userId.managerId:$managerId
  users:$managerId.phone:$managerPhone
  projects:$projectId.assigneeId:$userId
  projects:$projectId.name:$projectName
}`)
.solutions(input)
.forEach($ => console.log($.projectName, $.userName, $.userPhone, $.managerPhone));
```

**Redact sensitive fields**

```js
Tendril("{ ..password:$value }")
  .replaceAll(input, $ => ({ value: "REDACTED" }));
```

**Bind object groups**
```
{ /user.*/:_  ($contacts=/contact.*/:_)  (@rest=remainder) }
```

**End of Specification**

// Todo: a better API exposition section, and mention the variable names

------------------

```