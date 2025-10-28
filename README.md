# Tendril — v5 

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

**Objects** are written with `{...}` and contain key–value **assertions** of the form `K = V` or `K =? V`. 
```
    { b=_  c=_ }   ~= { b:1, c:2 }  // every key-value assertion satisfied
    { b=_      }   ~= { b:1, c:2 }  // every key-value assertion satisfied
    { b=_  c=_ }  !~= { b:1 }       // unsatisfied assertion
    { b=_  c=?_ }  ~= { b:1 }       // optional assertion
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

### A few concrete truths

```
[ a b ]         ~= ["a","b"]
[ a b ]        !~= ["a","b","c"]
[ a b .. ]      ~= ["a","b","c"]

{ b=_  c=_ }    ~= { b:1, c:2 }
{ b=_ }         ~= { b:1, c:2 }
{ b=_  c=_ }   !~= { b:1 }
{ b=_  c=?_ }   ~= { b:1 }

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

### Arrays

Sequencing is written by adjacency inside `[...]`. Nested quantifiers apply via grouping. Arrays behave like anchored sequences: `[a b]` does not match `[a b c]` unless `..` is present. Multiple `..` are allowed: `[ a .. b .. c ]` matches `[ a, x, y, b, z, c ]`.

Quantifier shorthands follow the grammar. For example, `a?` is zero-or-one, `a+` is one-or-more, and `a*` is zero-or-more. Possessive and lazy variants appear in the grammar. `..` is equivalent to a lazy `_` slice.

### Objects and object slices

Each key–value assertion evaluates over all entries whose keys match the key pattern, and each such value must satisfy the value pattern. For `K = V` at least one such entry must exist; for `K =? V` existence is not required. Assertions may overlap. The token `..` denotes the set of entries whose keys match none of the key patterns in the object. You can bind that set to a slice variable: `{ … @rest:(..) }`. Unconstrained keys may exist unless you explicitly demand otherwise by inspecting or counting `..`.

Object-level count quantifiers (e.g., `k=v #{2,4}`) count how many keys matched that assertion and impose bounds without backtracking; `.. #{0}` expresses the absence of unconstrained entries. These counts are assertion-local.

### Binding and unification

`$name:(pattern)` matches the node against `pattern` and binds `$name` to that single value. A bare `$name` is sugar for `$name:(_)`. If `$name` appears again, its matched value must unify (deep structural equality where relevant). `@name:(slice-pattern)` binds a slice: for arrays, a sequence of items; for objects, a set of key–value pairs. Bare `@name` is sugar for `@name:(_*)` in arrays and `@name:(..)` in objects. `$name` and `@name` must not collide.

Unification occurs after each binder has independently matched its own pattern. The sequence `[ $x $x:(/[ab]/) $y ]` matches `['a','a','y']` but not `['a','b','y']`. Deep equality is required where values are composite.

// todo, express the following n the form of examples
When applied directly to an S_ITEM ($x) or S_SLICE (@x),
quantifiers denote repetition of identical bound structures:
$x+ ≡ ($x:(_))+,
@x+ ≡ (@x:(_*))+.
The same applies to * and ? variants.
Zero-length matches of @x* unify @x with an empty slice.


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

// General note: whitespace is interpreted by the lexer as a token boundary, and 
// otherwise is only significant within quoted strings. The lexer also recognizes
// C-style comments.  

// precedence from higher to lower: 
   binding `:
   optional `?`,  quantifiers
   breadcrumb operators  `.` and `[]`
   adjacency/commas inside arrays and objects
   `|`
   `=`, '=?'
   Parentheses override precedence. Lookaheads always require parentheses.

ROOT_PATTERN   := ITEM

INTEGER        := decimal integer
BOOLEAN        := true | false
QUOTED_STRING  := quoted string literal
REGEX          := /pattern/flags              // JS regex literal
BAREWORD       := [A-Za-z_][A-Za-z0-9_]*      // unless a keyword
_              := singleton wildcard

LITERAL        := INTEGER | BOOLEAN | QUOTED_STRING | REGEX | BAREWORD
IDENT          := /[a-zA-Z]\w*/               // logic variable name

S_ITEM         := '$' IDENT                   // [^6]
S_SLICE        := '@' IDENT                   // [^6]

ITEM           := '(' ITEM ')'
               | S_ITEM                       // [^8]
               | S_ITEM ':' '(' ITEM ')'      // [^7]
               | '_'
               | LITERAL
               | OBJ
               | ARR
               | ITEM '|' ITEM                            // [^3]

A_BODY         := (A_SLICE (','? A_SLICE)*)?              // [^5]

A_SLICE        := '(' A_BODY ')'                          // [^6]
               | S_SLICE
               | S_SLICE ':' '(' A_BODY ')'
               | S_ITEM
               | S_ITEM ':' '(' A_BODY ')'
               | ITEM
               | OBJ
               | ARR
               | A_SLICE A_QUANT                         // [^3]
               | A_SLICE '|' A_SLICE                     // [^3]
               | '(?=' A_SLICE ')'
               | '(?!' A_SLICE ')'

ARR            := '[' A_BODY ']'
KEY            := ITEM                                   // [^13]
VALUE          := ITEM
B_QUANT        := '?' | '+' | '*'                        // [^11]
BREADCRUMB     := '.' KEY                                // [^12]
               | '(' '.' KEY ')' B_QUANT                 // [^11]
               | '[' KEY ']' B_QUANT?                    // [^11]

O_TERM         := KEY BREADCRUMB* ('=' | '=?') VALUE      // [^10]
O_BODY         := (O_SLICE (','? O_SLICE)*)?              // [^5]
O_SLICE        := '(' O_BODY ')'                          // [^1], [^6] 
               | '(?!' O_BODY ')'                         // [^9]
               | S_SLICE ':' '(' O_BODY ')'
               | S_SLICE
               | O_TERM

O_REMNANT      := '..'                      // note that `..` (without quotes) is a keyword/token
               | S_SLICE ':' '(' '..' ')'
               | '(?!' '..' ')'

OBJ            := '{' O_BODY O_REMNANT? '}'

A_QUANT        := '?'
               | '+' | '+?' | '++'
               | '*' | '*?' | '*+'
               | '*{' INTEGER '}'
               | '*{' INTEGER ',' INTEGER '}'
               | '*{' INTEGER ',' '}'
               | '*{' ',' INTEGER '}'

```

**Conventions.** Whitespace and `//` / `/* … */` comments are allowed between tokens. Whitespace is ignored except where adjacency inside arrays denotes sequencing.  
The notations `~=` and `===` appear only in this document.

Notes:
[^1] Parentheses allow grouping, but they do not change the semantics. { k1=v1 k2=v2 k3=v3 } and { k1=v1 (k2=v2 k3=v3) } are equivalent conjunctions.

[^2] `..` is sugar for ((?!OT1)(?!OT2)...(?!OTn)_=_) where the denied patterns are all the O_TERMs in the object (excluding those within negative assertions). But the implementation will be more efficient than that brute-force method.  Ditto for `(?!..)` (which is a special idiom), the negation, which means "no extra keys not specified".

[^3] You know what I mean. Apply the usual recursive constructs.

[^4] `(?!..)` is semantically defined as a conjunction of negative assertions, but the actual implementation would need to optimize this by remembering which assertions succeeded. Perhaps simply memoizing those tests would suffice.

[^5] Commas are optional. 

[^6] A "slice" is a contiguous subsequence of an array, or a subset of the unordered key/value pairs of an object. Parentheses are used to delineate slices.

[^7], [^8] `$foo` is short for `$foo:(_)` in arrays, `@foo` for `@foo:(..)` in objects. When ":" is used, the rhs must be in parentheses.

[^9] In object context, (?! Q) succeeds iff Q has no solutions under the current bindings. Variables occurring in Q are treated as follows: already-bound variables constrain Q; unbound variables are existentially scoped within the check. Bindings produced inside the negation do not escape.
[^10] In prior versions, the optional operator was '?='. It has been changed to '=?' to avoid ambiguity. This is a single token.
[^11] 
`foo(.bar)+=baz` (at least one repetition of .bar) would match {foo:{bar:{bar:baz}}}.
`foo(.bar)*=baz` would aditionally, match zero repetitions, i.e. foo=baz.
`foo(.bar)?=baz` means `foo=baz | foo.bar=baz`.
But: `foo.bar=?baz` means `foo.bar=baz | (?!foo.bar=_)`.
Both + and * are greedy.
[] is quantified similarly.
The quantifier applies only to the immediately preceding breadcrumb.
[^12] The difference between foo.bar and foo[bar] is that the latter also asserts `foo` to be an array and `bar` to be numeric (or else the match will fail).
[^13] I'm using ITEM because the possibilities are complex, including negative assertions, alternations, bindings, etc. But note that Object keys are strings, so unless the item describes a string, it can't match.

### Known Limitations (V5)

**Bidirectional Constraint Patterns**

The V5 implementation uses recursive-descent evaluation which processes patterns left-to-right. This creates a limitation when negative assertions need to constrain variables that are bound later:

```javascript
// ⚠️ LIMITATION: Cannot constrain $x before it's bound
{(?!_=$x) $x=_}
// Intent: "$x must not equal any existing value"
// Current: May succeed incorrectly due to evaluation order
```

**Workaround:** Reorder your pattern to bind variables before negations reference them:

```javascript
// ✓ WORKS: Bind $x first
{$x=_ (?!_=$x)}
// Now the negation can check the bound value of $x
```

**Note:** This only works if the semantic intent allows reordering. Some constraints are inherently bidirectional.

**Future:** A constraint propagation layer (planned for V6+) will enable true bidirectional constraints. Variables will have watchlists, and negations will be re-evaluated when watched variables become bound.

For more details, see `doc/v5-constraints-limitations.md`.

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

# Examples

## API decoding comparison

<table><tr><td colspan="2"><pre>
<b>Data</b>
    {
        "requests": {
            "87499"  : { "user": { "name": ["John", "T.", "Doe"],           }, "query": "gardening" },
            "1818872": { "user": { "name": ["Jane", "Doe"],                 }, "query": "houses" },
            "384122" : { "user": { "name": ["Mary", "Sue", "Ellen", "Doe"], }, "query": "medicine" },
        },
        "responses": [
            { "requestId": "1818872", "status": "ok", "output": "2 houses available" },
            { "requestId": "20097",   "status": "fail"},
            { "requestId": "384122",  "status": "ok", "output": {"type":"text", "content":"Here is your medicine info" }},
        ]
    }

<b>Desired output</b>

    Jane: 2 houses available
    Mary: Here is your medicine info

</pre></td></tr><tr><td><pre>
<b>// using Tendril</b>
pattern = {
        requests= {
            $reqId.user.name= [$first .. $last]
        }
        responses= [
            ..
            {
                requestId= $reqId
                status= ok
                output= ( $text:(/.*/) | { type=text content=$text } )
            }
            ..
        ]
    }
Tendril(pattern).match(data).map((m)=>`${m.$first}: ${m.$text}`)
</pre></td><td><pre>
<b>// using plain JS</b>
    const results = data.responses
    .filter(r => r.status === "ok" && data.requests[r.requestId])
    .map(r => {
        const request = data.requests[r.requestId];
        const name = request.user.name;
        const first = name[0];
        const last = name[name.length - 1];
        let text;
        if (typeof r.output === 'string') {
            text = r.output;
        } else if (r.output?.type === 'text') {
            text = r.output.content;
        }
        return text ? `${first}: ${text}` : null;
    })
    .filter(Boolean);
    console.log(results.join('\n'));

</pre></td><td><pre>
<b>// using Lodash</b>
    const results = _(data.responses)
        .filter({ status: 'ok' })
        .map(r => {
            const request = data.requests[r.requestId];
            if (!request) return null;
            const name = request.user.name;
            const text = _.isString(r.output) ? r.output : r.output?.content;
            return text ? `${_.first(name)}: ${text}` : null;
        })
        .compact()
        .value();
    console.log(results.join('\n'));
</pre></td></tr></table>

## Password Redaction Comparison

<table>
<tr><th>Tendril</th><th>Plain JavaScript</th><th>Lodash</th></tr>
<tr><td><pre>
Tendril("{ _(._)*.password = $p }").replaceAll(input, "$p", 'REDACTED')
</pre></td><td><pre>
function redactPasswords(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

if (Array.isArray(obj)) {
return obj.map(redactPasswords);
}

const result = {};
for (const [key, value] of Object.entries(obj)) {
if (key === 'password') {
result[key] = 'REDACTED';
} else {
result[key] = redactPasswords(value);
}
}
return result;
}

const redacted = redactPasswords(data);
</pre></td><td><pre>
function redactPasswords(obj) {
  return _.cloneDeepWith(obj, (value, key) => {
    if (key === 'password') {
      return 'REDACTED';
    }
  });
}

const redacted = redactPasswords(data);
</pre></td></tr>
</table>




**End of README v5**

  ---
Appendix: Object Pattern Semantics and Optional Assertions

Problem Statement

During development of Tendril v5, we discovered ambiguities in how object patterns
should behave, particularly around:

1. Existential vs Universal semantics: Should {_=5} mean "all values equal 5" or
   "exists a value equal 5"?
2. Variable key bindings: How should {$k=$v} create solutions?
3. Optional assertions: What does {a=?5} mean and how does it interact with
   bindings?

This appendix documents the design decisions and their rationale.

Array-Object Equivalence Principle

The key insight is that object patterns should behave analogously to array
patterns. Consider:

Arrays:

- [.. 5 ..] means "exists a 5 somewhere" (existential)
- [5] means "the array is exactly [5]" (structural)
- [.. 5 6 ..] is like having implicit anonymous bindings that must be adjacent

Objects (proposed):

- {_=5} should mean "exists a key with value 5" (existential)
- {a=5 b=6} means "keys 'a' and 'b' exist with those values"
- This treats object terms as existential assertions that iterate over keys

Formal Semantics

Pattern Matching as Constraint Satisfaction

Pattern matching works via backtracking search:

1. Start with infinite solution space (all possible variable bindings)
2. At each step, create branches for alternatives (key iteration, alternation,
   etc.)
3. Each branch adds constraints that narrow the solution space
4. Branches that fail constraints are pruned
5. Surviving branches that complete the pattern are solutions

A solution is:

- A complete path through the search tree (a branch that succeeded)
- Associated with a binding-set: the variable bindings accumulated along that path
- Each binding-set represents necessary and sufficient conditions for that match

Object Term Semantics

For an object pattern {K1=V1 K2=V2 ... Kn=Vn}:

1. Each term Ki=Vi is existential: means ∃k,v where Kik and Viv
2. Terms are conjunctive: all assertions must hold (with unification)
3. Pattern matches iff: the solution set (join of all term solution-sets) is
   non-empty

Key iteration (existential semantics):

- {$k=5} iterates over object keys, creating one solution branch per key
- Each branch tests if value equals 5
- $k binds to the key name in successful branches
- Result: multiple solutions, one per matching key

Example 1: {$k=$v} against {a:1, b:2}
Start: {}
├─ try k="a" → {k:"a"}
│ └─ bind v=1 → {k:"a", v:1} ✓ Solution 1
└─ try k="b" → {k:"b"}
└─ bind v=2 → {k:"b", v:2} ✓ Solution 2

Example 2: {$x=$x} against {a:"a", b:"c"}
Start: {}
├─ try key="a", bind x="a" → {x:"a"}
│ └─ value must equal $x → "a"=="a" ✓ Solution 1: {x:"a"}
└─ try key="b", bind x="b" → {x:"b"}
└─ value must equal $x → "c"=="b" ✗ pruned

Example 3: {a=$x b=$x} against {a:5, b:6}
Start: {}
└─ assert a=$x → {x:5}
└─ assert b=$x → try to unify x=6 with x=5 ✗ fails
No solutions (unification failed)

Equivalence with Array Lookaheads

Object pattern {K1=V1 K2=V2} is equivalent to array pattern:
[(?=.. [K1 V1]) (?=.. [K2 V2]) ..]

Both are conjunctive assertions where:

- Each term/lookahead checks for existence of a matching pair
- Variables bind and must unify across all assertions
- Pattern succeeds iff all assertions hold with compatible bindings

This requires lookaheads with escaping bindings (Prolog-style, not regex-style):

- Bindings made inside lookaheads participate in unification
- (?=$x) both checks and binds $x

Optional Assertions: K=?V

The Problem

How do we express "if key K exists, it must match V, otherwise OK"?

This is a conditional constraint: (K exists → V matches) ∧ (K doesn't exist →
true), which simplifies to: ¬K ∨ (K ∧ V).

Our search paradigm iterates over what exists in the data. We can't iterate over
"keys that don't exist" (infinite set).

Solution: Desugaring to Negative Lookaheads

K=?V desugars to: (K=V | (?!K))

Where:

- K=V: first alternative checks if K exists and matches V
- (?!K): second alternative uses negative lookahead to check K doesn't exist
- Negative lookahead (?!K) is sugar for (?!(K=_))

Examples:

{a=?5} desugars to {a=5 | (?!a)}

Against {a:5}: first alternative succeeds → 1 solutionAgainst {a:3}: first
alternative fails, second fails (a exists) → 0 solutionsAgainst {b:5}: first
alternative fails (a doesn't exist), second succeeds → 1 solution

{a=?$x} desugars to {a=$x | (?!a)}

Against {a:5}: binds x=5 → solution {x:5}Against {b:5}: negative lookahead succeeds
→ solution {} (x unbound)

Complex Patterns

{($x:(/x/)|foo)=?$x} desugars to {($x:(/x/)|foo)=$x | (?!(($x:(/x/)|foo)=_))}

Against {foo:5}:

- First alternative, branch 2: matches "foo", binds x=5 → solution {x:5}

Against {bar:5}:

- First alternative: "bar" doesn't match pattern → fails
- Second alternative: negative lookahead succeeds (no key matches) → solution {} (x
  unbound)

Note: In negative lookaheads, bindings never escape because the lookahead only
succeeds when the interior pattern doesn't match.

Interaction with Unification

{a=?$x b=$x} desugars to {(a=$x | (?!a)) b=$x}

Against {a:5, b:5}: a=$x binds x=5, b=$x unifies → solution {x:5}Against {b:5}:
(?!a) succeeds with no binding, b=$x binds x=5 → solution {x:5}Against {a:3, b:5}:
a=$x binds x=3, b=$x needs x=5 → unification fails, 0 solutions

Grammar Changes

Current Array Grammar (has lookaheads):

A_SLICE := ... | '(?=' A_SLICE ')' | '(?!' A_SLICE ')'

Proposed Object Grammar (add lookaheads):

O_SLICE := '(' O_BODY ')'
| S_SLICE
| S_SLICE ':' '(' O_SLICE* ')'
| O_TERM
| '(?=' O_SLICE ')'      // NEW: positive lookahead
| '(?!' O_SLICE ')'      // NEW: negative lookahead

O_TERM  := KEY BREADCRUMB* '=' VALUE O_QUANT?
// REMOVED: '?=' operator (becomes syntactic sugar)

Syntactic Sugar:

- K=?V → (K=V | (?!K)) where (?!K) is sugar for (?!(K=_))
- Desugaring happens during parsing/compilation

Implementation Requirements

1. Make object patterns consistently existential
    - Remove distinction between variable and non-variable keys
    - All key patterns iterate and create solution branches
2. Implement lookaheads for objects
    - (?=O_SLICE) positive lookahead
    - (?!O_SLICE) negative lookahead
    - Bindings escape and participate in unification (Prolog-style)
3. Implement K=?V desugaring
    - Parser or compiler transforms K=?V to (K=V | (?!K))
    - No special runtime handling needed
4. Ensure lookahead bindings work correctly
    - Positive lookahead: bindings escape and unify with outer context
    - Negative lookahead: only succeeds when pattern fails, so no bindings escape
    - Both array and object lookaheads use same mechanism

Test Cases

See test/optional-patterns.test.js for comprehensive test coverage of:

- Simple optional keys
- Optional with value bindings
- Complex key patterns with alternation
- Optional with unification across multiple assertions

  ---

End of Appendix