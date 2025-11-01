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

**Objects** are written with `{...}` and contain key–value **assertions** of the form `K = V` or `K ?= V`. 
```
    { b=_  c=_ }   ~= { b:1, c:2 }  // every key-value assertion satisfied
    { b=_      }   ~= { b:1, c:2 }  // every key-value assertion satisfied
    { b=_  c=_ }  !~= { b:1 }       // unsatisfied assertion
    { b=_  c?=_ }  ~= { b:1 }       // optional assertion
```
In objects, the **residual** is the set of key-value pairs whose keys didn't match any of the key patterns in the assertions. It can be bound to a slice variable using the `remainder` keyword.
```
    { /[a-z]/=3 @x:(remainder) } ~= { a:3, b:3, foo:3 } => @x is bound to {foo:3}
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

Use `|` for alternation. Use `(?= P)` for positive lookahead and `(?! P)` for negative lookahead. Lookaheads are zero-width assertions. Positive lookaheads may introduce bindings that escape to the outer scope; negative lookaheads discard any bindings made during the check.

Array items may be quantified with `{m,n}`, with `?`, `+`, and `*` as shorthands. `..` is equivalent to a lazy `_` slice. Open-ended bounds on arrays are allowed where the grammar states so; object-level counts, where used, are counted by key–value matches per assertion.

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

{ b=_  @s:(remainder) }   ~= { a:1, c:2, Z:1 }  // @s is the residual slice
```

### Scalar vs. slice in arrays and objects

A scalar captures exactly one value even in an array context. A slice captures zero or more items. This distinction is visible in results:

```
[ .. $x .. ] ~= ['a','b']   // multiple solutions, each with one scalar x: [{x:'a'},{x:'b'}]
[ $x .. ]    ~= ['a','b']   // single solution per slice of array elements: [{x:'a'}]
[ @x .. ]    ~= ['a','b']   // solutions: [{x:[]},{x:['a']},{x:['a','b']}]
[ $x @y ]    ~= [[1,2],[3,4]] // solutions: {x:[1], y:Slice(3,4)},
 {x:[2], y:Slice(3,4)}
[ @x @y ]    ~= [[1,2],[3,4]] // multiple solutions by different splits
```

In objects, keys and values are scalars; slices contain key–value pairs. For example, `{ @rest:(remainder) }` binds the residual set. The names `$x` and `@x` must not collide.

### Test cases that document intent

* `[ $x y $x? ]` matches `[ 1, "y", 1 ]`.
* `[ $x y ($x:(_))? ]` matches `[ 1, "y", 1 ]` (the binder exists only on the taken branch).
* `[ $x y $x:(_?) ]` matches `[ 1, "y", 1 ]` (the node is concrete; `?` cannot accept “nothing” here).
* `[ [($x:(_))? ..] $x ]` matches `[ [1], 1 ]`.
* `[ [$x:(_?) ..] $x ]` matches `[ [1], 1 ]`.
* `[ [($x:(_))? ..] $x ]` matches `[ [1], 2 ]`.
* `[ [$x:(_?) ..] $x ]` does **not** match `[ [1], 2 ]` (the inner binder would force `$x=1`).
* `[ [($x:(_))? ..] ($x:(_))? ..]` matches `[ [1], 2 ]`.
* `[ [$x:(_?) ..] $x:(_?) .]` does **not** match `[ [1], 2 ]` (and note the trailing `.` inside an array is invalid; `.` is the breadcrumb operator for objects, not an array element).
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
- `.replaceAll(data, fn)` finds **all non-overlapping occurrences** in the input and applies replacements to each. Like `.replace()`, `fn` receives bindings and returns an object mapping variable names to replacement values.

The illustrative `~=` and `===` notation is documentation sugar, not part of the API.

---

## Part II — Language Reference

### Literals and matching

Numbers and booleans match by strict equality. Strings (quoted or barewords that are not keywords) match by strict equality. Regex literals use the JavaScript engine and match strings. `_` matches any single value.

### Operators and constructs

Use `|` for alternation. Use `.` and `[]` to descend through objects and arrays. Array quantifiers include `?`, `+`, `*`, and `{m,n}` forms; `..` is a lazy slice equivalent to a non-greedy `_` repetition. Object assertions use `=` and `?=` and may be given optional count suffixes to require that a predicate match a certain number of keys. Lookaheads `( ?= P )` and `( ?! P )` assert without consuming; positive lookaheads may bind variables.

### Arrays

Sequencing is written by adjacency inside `[...]`. Nested quantifiers apply via grouping. Arrays behave like anchored sequences: `[a b]` does not match `[a b c]` unless `..` is present. Multiple `..` are allowed: `[ a .. b .. c ]` matches `[ a, x, y, b, z, c ]`.

Quantifier shorthands follow the grammar. For example, `a?` is zero-or-one, `a+` is one-or-more, and `a*` is zero-or-more. Possessive and lazy variants appear in the grammar. `..` is equivalent to a lazy `_` slice.

### Objects and object slices

Each key–value assertion evaluates over all entries whose keys match the key pattern, and each such value must satisfy the value pattern. For `K = V` at least one such entry must exist; for `K ?= V` existence is not required. Assertions may overlap. The `remainder` keyword denotes the set of entries whose keys match none of the key patterns in the object. You can bind that set to a slice variable: `{ … @rest:(remainder) }`. Unconstrained keys may exist unless you explicitly demand otherwise by using `(?!remainder)`.

Object-level count quantifiers (e.g., `k=v #{2,4}`) count how many keys matched that assertion and impose bounds without backtracking. These counts are assertion-local.

### Binding and unification

`$name:(pattern)` matches the node against `pattern` and binds `$name` to that single value. A bare `$name` is sugar for `$name:(_)`. If `$name` appears again, its matched value must unify (deep structural equality where relevant). `@name:(slice-pattern)` binds a slice: for arrays, a sequence of items; for objects, a set of key–value pairs. Bare `@name` is sugar for `@name:(_*)` in arrays (not defined for objects). `$name` and `@name` must not collide.

Unification occurs after each binder has independently matched its own pattern. The sequence `[ $x $x:(/[ab]/) $y ]` matches `['a','a','y']` but not `['a','b','y']`. Deep equality is required where values are composite.


### Lookahead and negation

`(?= P)` asserts that `P` would match at this position; `(?! P)` asserts that it would not. Lookaheads are zero-width (do not consume input). Positive lookaheads may introduce bindings that escape to the outer scope; negative lookaheads discard any bindings made during the check. They compose with array items and value patterns through grouping.

### Path assertions

Paths chain key and index steps: `{ a.b.c = d }` matches `{ a: { b: { c: 'd' } } }`. `{ a[3].c = d }` expects an array at `a` and a `c` within the fourth element. 

### Quantifiers — arrays

The array quantifier repertoire includes shorthands and counted forms. **All quantifiers are greedy by default**: when generating solutions, longer matches are emitted before shorter ones. This ensures that `.replace()` operates on the longest/best match.

The cheat-sheet equivalences:

```
a*{2,3}   ≡ exactly 2 or 3 repetitions
a*3       ≡ a*{3,3}
a*?       ≡ a*{0,}        // lazy
a*        ≡ a*{0,}        // greedy (default)
a*+       ≡ a*{0,}        // greedy, possessive
a+?, a+, a++ ≡ a*{1,}     // lazy, greedy, possessive
a??       ≡ a*{0,1}       // lazy optional
a?        ≡ a*{0,1}       // greedy optional (matches before skipping)
```

**Greedy behavior**: When a quantifier allows multiple match lengths (e.g., `a?`, `a*`, `a{2,5}`), solutions with longer matches are generated first. For example, `[a?]` matching `['a']` produces two solutions: first `{a: 'a'}` (matched), then `{}` (skipped). This makes `.replace()` intuitive: it always uses the first (longest) match.

**A bound name must be the same across repetitions.**
```
[ $x:(_)+ ] matches        [ "a", "a", "a" ]
[ $x:(_)+ ] does not match [ "a", "b", "c" ]

[ @x:(_+) [@x]] matches        [ "a", "b", "c" ["a", "b", "c"]]
[ @x:(_+) [@x]] does not match [ "a", "b", "c", ["d", "e", "f"]]

[ @x:(_ _)+ ] matches        [ "a", "b", "a", "b", "a", "b" ]
[ @x:(_ _)+ ] does not match [ "a", "b", "c", "d", "e", "f" ]

The same applies to * and ? variants.
Zero-length matches of @x* unify @x with an empty slice.

As bare `$x` is short for `$x:(_)`, so `$x+` is short for $x:(_)+.
As bare `@x` is short for `@x:(_*)`, so `@x+` is short for @x:(_)+.
```

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
   `=`, `?=`
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
               | S_SLICE                              // [^8]
               | S_SLICE ':' '(' A_BODY ')'           // [^7]
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

O_TERM         := KEY BREADCRUMB* '?'? ('=' | '?=') VALUE      // [^10]
O_BODY         := (O_SLICE (','? O_SLICE)*)?              // [^5]
O_SLICE        := '(' O_BODY ')'                          // [^1], [^6]
               | '(?!' O_BODY ')'                         // [^9]
               | S_SLICE ':' '(' O_BODY ')'               // [^7]
               | O_TERM

O_REMNANT      := S_SLICE ':' '(' 'remainder' ')'  // [^2] bind residual keys to a slice variable
               | '(?!' 'remainder' ')'              // [^4] assert no residual keys
               | 'remainder'                               assert residual keys exist
               
OBJ            := '{' O_BODY O_REMNANT? '}'

A_QUANT        := '?' | '??'
               | '+' | '+?' | '++'
               | '*' | '*?' | '*+'
               | '{' INTEGER '}'
               | '{' INTEGER ',' INTEGER '}'
               | '{' INTEGER ',' '}'
               | '{' ',' INTEGER '}'

```

**Conventions.** Whitespace and `//` / `/* … */` comments are allowed between tokens. Whitespace is ignored except where adjacency inside arrays denotes sequencing.  
The notations `~=` and `===` appear only in this document.

Notes:
[^1] Parentheses allow grouping, but they do not change the semantics. { k1=v1 k2=v2 k3=v3 } and { k1=v1 (k2=v2 k3=v3) } are equivalent conjunctions.

[^2] In objects, residual keys (those not matching any assertion) are allowed by default. To bind them, use `@x:(remainder)`. To assert their existence without binding, use bare `remainder`. To forbid them, use `(?!remainder)`. Note: Unlike arrays where `..` means "unanchored matching", objects use the explicit `remainder` keyword to avoid confusion between different semantics.

[^3] You know what I mean. Apply the usual recursive constructs.

[^4] `(?!remainder)` is semantically defined as a conjunction of negative assertions, but the actual implementation would need to optimize this by remembering which assertions succeeded. Perhaps simply memoizing those tests would suffice.

[^5] Commas are optional. 

[^6] A "slice" is a contiguous subsequence of an array, or a subset of the unordered key/value pairs of an object. Parentheses are used to delineate slices.

[^7], [^8] `$foo` is short for `$foo:(_)`. `@foo` is short for `@foo:(_*)` in arrays (bare `@foo` is not defined in objects; use explicit `@foo:(..)` instead). When ":" is used, the rhs must be in parentheses.

[^9] In object context, (?! Q) succeeds iff Q has no solutions under the current bindings. Variables occurring in Q are treated as follows: already-bound variables constrain Q; unbound variables are existentially scoped within the check. Bindings produced inside the negation do not escape.
[^10] The optional operator is `?=` which can appear as a single token (`K?=V`) or with whitespace (`K ?= V` or even `K ? = V`). There is no ambiguity with lookaheads `(?=P)` since lookaheads have `(` before the `?`.
[^11] 
`foo(.bar)+=baz` (at least one repetition of .bar) would match {foo:{bar:{bar:baz}}}.
`foo(.bar)*=baz` would aditionally, match zero repetitions, i.e. foo=baz.
`foo(.bar)?=baz` means zero or one repetitions of .bar, thus `foo=baz | foo.bar=baz`.
But: `foo.bar?=baz` means `foo.bar=baz | (?!foo.bar=_)`.
Both + and * are greedy.
[] is quantified similarly.
The quantifier applies only to the immediately preceding breadcrumb.
[^12] The difference between foo.bar and foo[bar] is that the latter also asserts `foo` to be an array and `bar` to be numeric (or else the match will fail).
[^13] I'm using ITEM because the possibilities are complex, including negative assertions, alternations, bindings, etc. But note that Object keys are strings, so unless the item describes a string, it can't match.


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
  .replaceAll(input, vars => ({ value: "REDACTED" }));
```

Bind object slices:

```
{ /user.*/=_  $contacts:(/contact.*/=_)  @rest:(remainder) }
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
    firstResult = Tendril("[ $x:(1) @y:(2 3) { k=$k @z:(remainder) }]")
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

Tendril("[{ @s:(switch=_) }*]")
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
Tendril(pattern).solutions(data).map((m)=>`${m.$first}: ${m.$text}`)
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
Tendril("{ _(._)*.password = $p }").replaceAll(input, vars => ({ p: 'REDACTED' }))
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

)