# Tendril Cheat Sheet

## Simple API (90% of use cases)

```javascript
// .on(data) — anchored matching (pattern must match entire root)
Tendril("{name: $x}").on({name: "Alice", age: 30}).test()      // => true
Tendril("{name: $x}").on({name: "Alice", age: 30}).solve()     // => {x: "Alice"}
Tendril("{name: $x}").on({age: 30}).solve()                    // => null (no match)
Tendril("{a: (1|2)}").on({a: 1}).solutions()                // => [{}]

// .in(data) — search within (find pattern anywhere in tree)
Tendril("{name: $n}").in([{name:"A"},{name:"B"},{x:1}]).count()     // => 2
Tendril("{name: $n}").in({users:[{name:"A"}]}).locations()
// => [{path:["users",0], fragment:{name:"A"}, bindings:{n:"A"}}]

// Replacement and mutation
Tendril("{a: $x}").on({a: 1, b: 2}).replace({replaced: true})  // => {replaced: true}
Tendril("{a: $x}").on({a: 5}).replace(b => ({doubled: b.x*2})) // => {doubled: 10}
Tendril("{a: $x, b: $y}").on({a: 1, b: 2}).mutate({x: 99})     // => {a: 99, b: 2}
Tendril("{password: $p}").in(data).replace("REDACTED")         // replaces all matches
```

## Advanced API (full control)

```javascript
// .advancedMatch(data), .advancedFind(data) return OccurrenceSet
// (Legacy: .match() and .find() still work as aliases)
const result = Tendril("{name: $x}").advancedMatch(data);
result.hasMatch()              // boolean
result.count()                 // number of occurrences
result.solutions()             // SolutionSet
result.solutions().first()     // first Solution or null
result.solutions().toArray()   // array of Solutions
result.replaceAll(value)       // replace all matches
result.editAll({x: 99})        // edit bindings across all matches
```

---

## Variables and Unification

```javascript
// Extract a value
Tendril("{name: $x}").on({name: "Alice", age: 30}).solve()
// => {x: "Alice"}

// Unification: same variable must match same value
Tendril("[$x $x]").on([3, 3]).solve()
// => {x: 3}

Tendril("[$x $x]").on([3, 4]).test()
// => false (can't unify 3 and 4)

// Join keys of one structure to values of another
let items={table:brown,chair:red}
let colors={brown:'#555500', red:'#FF0000'}
Tendril("{items:{$item,$color}, colors:{$color,$rgb}")
  .on({items,colors})
  .solve()
// => {item:'table' color:'brown' rgb:'#555500'}

// Join using path notation
Tendril("{users[$i].id: $uid, orders[$j].user_id: $uid, orders[$j].item: $item}")
  .on({users: [{id: 1}], orders: [{user_id: 1, item: "laptop"}]})
  .solve()
// => {i: 0, j: 0, uid: 1, item: "laptop"}
```

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

## Anchoring

```
[ a b ]        ~= ["a","b"]
[ a b ]       !~= ["a","b","c"]
[ a b ... ]    ~= ["a","b","c"]       // yes, "..." is the actual syntax

{ b:_  c:_ }   ~= { b:1, c:2 }        // every kv assertion satisfied
{ b:_      }   ~= { b:1, c:2 }        // every kv assertion satisfied
{ b:_  c:_ }  !~= { b:1 }             // unsatisfied assertion
{ b:_  c?:_ }   ~= { b:1 }             // optional assertion

{ b:_  % }   ~= { a:1, c:2, Z:1 }    // remainder % represents all key-value pairs where the keys did not match any of the assertions

{ /[ab]/:_  /[ad]/:_ }   ~= { a:1 }   // kv assertions can overlap
{ /[ab]/:_  /[ad]/:_ }  !~= { d:1 }

{ b:_  (% as %s) }   ~= { a:1, c:2, Z:1 }  // Extracting the set of KV pairs that were not matched by the assertions:  $s = { 'c':2, 'Z':1 }
```

### Array Matching

```javascript
// Positional matching
Tendril("[1 2 3]").on([1, 2, 3]).test()
// => true

Tendril("[1 2 3]").on([1, 2, 3, 4]).test()
// => false (too long)

// Wildcard at specific position
Tendril("[1 _ 3]").on([1, 99, 3]).test()
// => true

// Spread operator (...) matches any subsequence
Tendril("[1 ... 5]").on([1, 2, 3, 4, 5]).test()
// => true

Tendril("[... $x ...]").on([1, 2, 3]).solutions()
// => [{x:1}, {x:2}, {x:3}] (three solutions)
```

### Array Groups

```javascript
// Group variable captures subsequence
Tendril("[@x ...]").on([1, 2, 3]).solutions()
// => [{x: []}, {x: [1]}, {x: [1,2]}, {x: [1,2,3]}]

Tendril("[$x @y]").on([1, 2, 3]).solve()
// => {x: 1, y: [2, 3]}

// Scalar must match exactly one element
Tendril("[... $x]").on([1, 2, 3]).solve()
// => {x: 3}

Tendril("[$x]").on([1, 2]).test()
// => false ($x can't match two elements)
```

### Object Field Clauses

```javascript
// Field clause: key-value assertion
Tendril("{a: 1}").on({a: 1, b: 2}).test()
// => true (b is ignored)

// Multiple clauses (conjunctive)
Tendril("{a: 1, b: 2}").on({a: 1, b: 2, c: 3}).test()
// => true

// Regex keys
Tendril("{/a.*/: $x}").on({ab: 1, ac: 2}).solutions()
// => [{x: 1}, {x: 2}] (two solutions)

Tendril("{/a.*/: $x}").on({ab: 1, xyz: 2}).solve()
// => {x: 1}
```

### Each Clause (validate all)

```javascript
// each K:V - for all keys matching K, value must match V
Tendril("{ each /a.*/: 1 }").on({ab: 1, ac: 1}).test()
// => true (all /a.*/ keys have value 1)

Tendril("{ each /a.*/: 1 }").on({ab: 1, ac: 2}).test()
// => false (ac:2 is a "bad entry" - key matches but value doesn't)

Tendril("{ each /a.*/: 1 }").on({}).test()
// => false (There must be at least one.)

Tendril("{ each /a.*/?: 1 }").on({}).test()
// => true ('?' makes the field optional, i.e. #{0,} instead of the default #{1,})

Tendril("{ each /a.*/: 1 else 2 }").on({ab: 1, ac: 3}).test()
// => false (`3` does not match `1 else 2`).

Tendril("{ each /a.*/: $x }").on({a1: 1, a2: 2}).test()
// => true (Variables are *not* required to unify across keys. Hint: the keyword is "each", not "all".)
// If you want to assert that all the values are the same, you can use this idiomatic pattern: `{ /a.*/: $x, each /a.*/: $x }`. (Todo, provide linear-time alternative.)


### Object Remainder

```javascript
// % matches unmatched keys
Tendril("{a: 1, %}").on({a: 1, b: 2}).test()
// => true (remainder is {b:2})

Tendril("{a: 1, %}").on({a: 1}).test()
// => false (empty remainder)

// %#{0} requires closed object (no remainder)
Tendril("{a: 1, %#{0}}").on({a: 1}).test()
// => true

Tendril("{a: 1, %#{0}}").on({a: 1, b: 2}).test()
// => false (b is unexpected)

// Bind remainder
Tendril("{a: 1, (%? as %rest)}").on({a: 1, b: 2}).solve()
// => {rest: {b: 2}}
```

### Paths and Breadcrumbs

```javascript
// Dot notation descends through objects
Tendril("{a.b.c: $x}").on({a: {b: {c: 3}}}).solve()
// => {x: 3}

// Array indexing
Tendril("{a[1].b: $x}").on({a: [null, {b: 5}]}).solve()
// => {x: 5}

// ** skips arbitrary depth (glob-style)
Tendril("{a.**.c: $x}").on({a: {p: {q: {c: 7}}}}).solve()
// => {x: 7}

// Leading ** finds at any depth (including root)
Tendril("{**.password: $p}").on({user: {password: "secret"}}).solve()
// => {p: "secret"}
```

### Array Quantifiers

```javascript
// * matches zero or more
Tendril("[1 2* 3]").on([1, 2, 2, 3]).test()
// => true

Tendril("[1 2* 3]").on([1, 3]).test()
// => true

// + matches one or more
Tendril("[1 2+ 3]").on([1, 3]).test()
// => false

// {m,n} matches specific count
Tendril("[1 2{2,3} 3]").on([1, 2, 2, 3]).test()
// => true

// Greedy vs lazy
Tendril("[((1*) as @x) ((1*) as @y)]").on([1, 1]).solutions().length
// => 3 (greedy matches all possibilities)
```

### Object Quantifiers

```javascript
// Count matching pairs
Tendril("{/a.*/: _#{2,4}}").on({a1: 1, a2: 2, a3: 3}).test()
// => true (3 keys match /a.*/)

Tendril("{/a.*/: _#{5,}}").on({a1: 1, a2: 2}).test()
// => false (only 2 keys)

// Optional field (K?:V is preferred syntax)
Tendril("{a: 1, b?: $x}").on({a: 1}).solve()
// => {x: undefined} or similar (b doesn't exist)

Tendril("{a: 1, b?: $x}").on({a: 1, b: 2}).solve()
// => {x: 2}
```

### Alternation

```javascript
// | enumerates all matches
Tendril("[1 (2|3) 4]").on([1, 2, 4]).test()
// => true

Tendril("[1 (2|3) 4]").on([1, 3, 4]).test()
// => true

// else is prioritized (first match wins)
Tendril("[1 (2 else 3) 4]").on([1, 2, 4]).test()
// => true (2 matches, 3 not tried)

Tendril("[1 (2 else 3) 4]").on([1, 3, 4]).test()
// => true (2 fails, 3 tried)

// Works in objects too
Tendril("{a: (1|2)}").on({a: 1}).solutions().length
// => 1
```

### Lookaheads

```javascript
// Positive lookahead (? ) - test without consuming
Tendril("[(? (/[ab]/ as $x)) $x ...]").on([2, 3]).test()
// => false (first element doesn't match /[ab]/)

Tendril("[(? (/[ab]/ as $x)) $x ...]").on(["a", "b"]).solve()
// => {x: "a"}

// Negative lookahead (! ) - must not match
Tendril("[(! ... 3 4) ...]").on([1, 2, 5]).test()
// => true (no [3,4] subsequence)

Tendril("[(! ... 3 4) ...]").on([1, 2, 3, 4]).test()
// => false (contains [3,4])

// In objects
Tendril("{(! secret: _)}").on({public: 1}).test()
// => true (no 'secret' key)
```

### Editing and Replacement

```javascript
// replace() replaces entire match
Tendril("[$x $x]").in([[3, 3], 4]).replace([99])
// => [[99], 4]

// mutate() replaces named variables
Tendril("[$x $y]").on([1, 2]).mutate({x: 99, y: 88})
// => [99, 88]

// Function replacements
Tendril("{name: $n}").on({name: "alice"}).mutate({n: b => b.n.toUpperCase()})
// => {name: "ALICE"}

// Scalar vs group semantics
Tendril("[$x ...]").on([1, 2]).mutate({x: [9, 9]})
// => [[9, 9], 2] (scalar: replaces as one element)

Tendril("[@x ...]").on([1, 2]).mutate({x: [9, 9]})
// => [9, 9, 2] (group: splices elements)
```

### Slice Patterns

```javascript
// %{ } finds and replaces object slices (not the whole object)
Tendril("%{ foo: 1 }").in({foo: 1, bar: 2}).replace({baz: 3})
// => {baz: 3, bar: 2} (only foo:1 replaced, bar kept)

// @[ ] finds and replaces array slices (subsequences)
Tendril("@[ 2 3 ]").in([1, 2, 3, 4]).replace([20, 30])
// => [1, 20, 30, 4] (only [2,3] replaced)

// Works with bindings
Tendril("%{ name: $n }").in([{name: "Alice"}, {name: "Bob"}]).locations()
// => [{path:[0], fragment:{name:"Alice"}, bindings:{n:"Alice"}}, ...]

// Slice patterns require .in() (search), not .on() (anchored)
Tendril("%{ a: 1 }").on({a: 1})   // Error!
Tendril("%{ a: 1 }").in({a: 1})   // OK
```

### Collecting Directive

```javascript
// <collecting> explicitly collects values from iterations into buckets
// Syntax: <collecting $val in @bucket across ^label> (values into array)
//         <collecting $key:$val in %bucket across ^label> (k:v pairs into object)

// Collect k:v pairs across labeled iteration
const data = {a: {name: "alice"}, b: {name: "bob"}};
Tendril('§L { $key: { name: $n <collecting $key:$n in %names across ^L> }}')
  .on(data).solve()
// => {key: "b", n: "bob", names: {a: "alice", b: "bob"}}
//    (names contains ALL k:v pairs collected across the §L iteration)

// Collect values only (into array)
Tendril('§L { $key: { name: $n <collecting $n in @names across ^L> }}')
  .on(data).solve()
// => {key: "b", n: "bob", names: ["alice", "bob"]}

// The `across ^label` clause is required — there is no default scope
// The label marks where separate buckets are created
// Values are collected across all sub-branches beneath that label

// Type enforcement:
// - k:v form ($key:$val) requires %bucket (object slice)
// - value-only form ($val) requires @bucket (array slice)
```

### Primitives and Literals

```
123                        // number literal
true, false                // boolean literal
"a", bareword, /regex/     // string or regex literal
foo/i, "Foo Bar"/i         // case-insensitive string (exact match, not substring)
_                          // wildcard (matches any single object or primitive)
```
```javascript
// Bare identifiers match strings
Tendril("foo").on("foo").test()
// => true

// Numbers, booleans, null
Tendril("123").on(123).test()
// => true

Tendril("true").on(true).test()
// => true

// Typed wildcards match by JavaScript type
Tendril("[_string _number _boolean]").on(["hi", 42, true]).test()
// => true (_number also matches NaN, Infinity)

// Regex matches substrings
Tendril("/^[A-Z]+$/").on("NASA").test()
// => true

Tendril("/foo/").on("seafood").test()
// => true (contains "foo")

// Case-insensitive literal (exact match)
Tendril("foo/i").on("Foo").test()
// => true

Tendril("foo/i").on("foobar").test()
// => false (not exact)
```

### Guard Expressions

```javascript
// Constrain bindings with boolean conditions
Tendril("(_number as $x where $x > 100)").on(150).solve()
// => {x: 150}

Tendril("(_number as $x where $x > 100)").on(50).test()
// => false (50 > 100 is false)

// Guards can reference multiple variables (deferred evaluation)
Tendril("{ min: (_number as $a where $a < $b), max: (_number as $b) }")
  .on({min: 1, max: 10}).test()
// => true (guard waits for $b, then checks 1 < 10)

// Available operators: < > <= >= == != && || ! + - * / %
Tendril("(_number as $x where $x % 2 == 0)").on(4).test()
// => true (even number)

// Functions: size(), number(), string(), boolean()
Tendril("(_string as $x where size($x) >= 3)").on("hello").test()
// => true (length 5 >= 3)

// Errors cause match failure (no exceptions)
Tendril("(_string as $x where $x * 2 > 10)").on("hello").test()
// => false (can't multiply string)
```