# Tendril Cheat Sheet

**Pattern matching for tree structures.** Match patterns against JSON-like data, extract values with variables, and transform structures. Variables unify across the pattern—if `$x` appears twice, both occurrences must match the same value. This enables relational joins across nested data.

**Two contexts:** Arrays match positionally (like regex). Objects use field clauses that assert key-value pairs exist. Variables prefixed with `$` capture single values; `@` captures array groups (subsequences); `%` captures object groups (key-value subsets).

**Core API:** `Tendril(pattern).match(data)` matches at root. `.find(data)` searches recursively. Both return an OccurrenceSet with `.solutions()` for variable bindings and `.editAll({...})` for transformations.

---

### Variables and Unification

```javascript
// Extract a value
Tendril("{name: $x}").match({name: "Alice", age: 30}).solutions().first()
// => {x: "Alice"}

// Unification: same variable must match same value
Tendril("[$x $x]").match([3, 3]).solutions().first()
// => {x: 3}

Tendril("[$x $x]").match([3, 4]).hasMatch()
// => false (can't unify 3 and 4)

// Join keys of one structure to values of another
let items={table:brown,chair:red}
let colors={brown:'#555500', red:'#FF0000'}
Tendril("{items:{$item,$color}, colors:{$color,$rgb}")
  .match({items,colors})
  .solutions.first()
// => {item:'table' color:'brown' rgb:'#555500'}

// Join using path notation
Tendril("{users[$i].id: $uid, orders[$j].user_id: $uid, orders[$j].item: $item}")
  .match({users: [{id: 1}], orders: [{user_id: 1, item: "laptop"}]})
  .solutions().first()
// => {i: 0, j: 0, uid: 1, item: "laptop"}
```

### Array Matching

```javascript
// Positional matching
Tendril("[1 2 3]").match([1, 2, 3]).hasMatch()
// => true

Tendril("[1 2 3]").match([1, 2, 3, 4]).hasMatch()
// => false (too long)

// Wildcard at specific position
Tendril("[1 _ 3]").match([1, 99, 3]).hasMatch()
// => true

// Spread operator (...) matches any subsequence
Tendril("[1 ... 5]").match([1, 2, 3, 4, 5]).hasMatch()
// => true

Tendril("[... $x ...]").match([1, 2, 3]).solutions().count()
// => 3 (three solutions: x=1, x=2, x=3)
```

### Array Groups

```javascript
// Group variable captures subsequence
Tendril("[@x ...]").match([1, 2, 3]).solutions().toArray()
// => [{x: []}, {x: [1]}, {x: [1,2]}, {x: [1,2,3]}]

Tendril("[$x @y]").match([1, 2, 3]).solutions().first()
// => {x: 1, y: [2, 3]}

// Scalar must match exactly one element
Tendril("[... $x]").match([1, 2, 3]).solutions().first()
// => {x: 3}

Tendril("[$x]").match([1, 2]).hasMatch()
// => false ($x can't match two elements)
```

### Object Field Clauses

```javascript
// Field clause: key-value assertion
Tendril("{a: 1}").match({a: 1, b: 2}).hasMatch()
// => true (b is ignored)

// Multiple clauses (conjunctive)
Tendril("{a: 1, b: 2}").match({a: 1, b: 2, c: 3}).hasMatch()
// => true

// Regex keys
Tendril("{/a.*/: $x}").match({ab: 1, ac: 2}).solutions().count()
// => 2 (x=1 and x=2)

Tendril("{/a.*/: $x}").match({ab: 1, xyz: 2}).solutions().first()
// => {x: 1}
```

### Object Implication (`: else !`)

```javascript
Tendril("{/a.*/: 1 else !}").match({ab: 1, ac: 1}).hasMatch()
// => true (all /a.*/ keys have value 1)

Tendril("{/a.*/: 1 else !}").match({ab: 1, ac: 2}).hasMatch()
// => false (ac:2 is a "bad entry" - key matches but value doesn't)

// Universal equality idiom
Tendril("{/a.*/: $x, /a.*/: $x else !}").match({ab: 1, ac: 1}).hasMatch()
// => true (all /a.*/ values equal)

Tendril("{/a.*/: $x, /a.*/: $x else !}").match({ab: 1, ac: 2}).hasMatch()
// => false (values differ)
```

### Object Remainder

```javascript
// % matches unmatched keys
Tendril("{a: 1, %}").match({a: 1, b: 2}).hasMatch()
// => true (remainder is {b:2})

Tendril("{a: 1, %}").match({a: 1}).hasMatch()
// => false (empty remainder)

// %#{0} requires closed object (no remainder)
Tendril("{a: 1, %#{0}}").match({a: 1}).hasMatch()
// => true

Tendril("{a: 1, %#{0}}").match({a: 1, b: 2}).hasMatch()
// => false (b is unexpected)

// Bind remainder
Tendril("{a: 1, (%? as %rest)}").match({a: 1, b: 2}).solutions().first()
// => {rest: {b: 2}}
```

### Paths and Breadcrumbs

```javascript
// Dot notation descends through objects
Tendril("{a.b.c: $x}").match({a: {b: {c: 3}}}).solutions().first()
// => {x: 3}

// Array indexing
Tendril("{a[1].b: $x}").match({a: [null, {b: 5}]}).solutions().first()
// => {x: 5}

// ** skips arbitrary depth (glob-style)
Tendril("{a.**.c: $x}").match({a: {p: {q: {c: 7}}}}).solutions().first()
// => {x: 7}

// Leading ** finds at any depth (including root)
Tendril("{**.password: $p}").match({user: {password: "secret"}}).solutions().first()
// => {p: "secret"}
```

### Array Quantifiers

```javascript
// * matches zero or more
Tendril("[1 2* 3]").match([1, 2, 2, 3]).hasMatch()
// => true

Tendril("[1 2* 3]").match([1, 3]).hasMatch()
// => true

// + matches one or more
Tendril("[1 2+ 3]").match([1, 3]).hasMatch()
// => false

// {m,n} matches specific count
Tendril("[1 2{2,3} 3]").match([1, 2, 2, 3]).hasMatch()
// => true

// Greedy vs lazy
Tendril("[@x=(1*) @y=(1*)]").match([1, 1]).solutions().count()
// => 3 (greedy matches all possibilities)
```

### Object Quantifiers

```javascript
// Count matching pairs
Tendril("{/a.*/: _#{2,4}}").match({a1: 1, a2: 2, a3: 3}).hasMatch()
// => true (3 keys match /a.*/)

Tendril("{/a.*/: _#{5,}}").match({a1: 1, a2: 2}).hasMatch()
// => false (only 2 keys)

// Optional field
Tendril("{a: 1, b: $x?}").match({a: 1}).solutions().first()
// => {x: undefined} or similar (b doesn't exist)

Tendril("{a: 1, b: $x?}").match({a: 1, b: 2}).solutions().first()
// => {x: 2}
```

### Alternation

```javascript
// | enumerates all matches
Tendril("[1 (2|3) 4]").match([1, 2, 4]).hasMatch()
// => true

Tendril("[1 (2|3) 4]").match([1, 3, 4]).hasMatch()
// => true

// else is prioritized (first match wins)
Tendril("[1 (2 else 3) 4]").match([1, 2, 4]).hasMatch()
// => true (2 matches, 3 not tried)

Tendril("[1 (2 else 3) 4]").match([1, 3, 4]).hasMatch()
// => true (2 fails, 3 tried)

// Works in objects too
Tendril("{a: (1|2)}").match({a: 1}).solutions().count()
// => 1
```

### Lookaheads

```javascript
// Positive lookahead (? ) - test without consuming
Tendril("[(? $x=(/[ab]/)) $x ...]").match([2, 3]).hasMatch()
// => false (first element doesn't match /[ab]/)

Tendril("[(? $x=(/[ab]/)) $x ...]").match(["a", "b"]).solutions().first()
// => {x: "a"}

// Negative lookahead (! ) - must not match
Tendril("[(! ... 3 4) ...]").match([1, 2, 5]).hasMatch()
// => true (no [3,4] subsequence)

Tendril("[(! ... 3 4) ...]").match([1, 2, 3, 4]).hasMatch()
// => false (contains [3,4])

// In objects
Tendril("{(! secret: _)}").match({public: 1}).hasMatch()
// => true (no 'secret' key)
```

### Editing and Replacement

```javascript
// replaceAll replaces entire match
Tendril("[$x $x]").find([[3, 3], 4]).replaceAll([99])
// => [[99], 4]

// editAll replaces named variables
Tendril("[$x $y]").find([1, 2]).editAll({x: 99, y: 88})
// => [99, 88]

// Function replacements
Tendril("{name: $n}").find({name: "alice"}).editAll({n: $ => $.n.toUpperCase()})
// => {name: "ALICE"}

// Scalar vs group semantics
Tendril("[$x ...]").find([1, 2]).editAll({x: [9, 9]})
// => [[9, 9], 2] (scalar: replaces as one element)

Tendril("[@x ...]").find([1, 2]).editAll({x: [9, 9]})
// => [9, 9, 2] (group: splices elements)
```

### Slice Patterns

```javascript
// %{ } finds and replaces object slices (not the whole object)
Tendril("%{ foo: 1 }").find({foo: 1, bar: 2}).replaceAll({baz: 3})
// => {baz: 3, bar: 2} (only foo:1 replaced, bar kept)

// @[ ] finds and replaces array slices (subsequences)
Tendril("@[ 2 3 ]").find([1, 2, 3, 4]).replaceAll([20, 30])
// => [1, 20, 30, 4] (only [2,3] replaced)

// Works with bindings
Tendril("%{ name: $n }").find([{name: "Alice"}, {name: "Bob"}]).solutions().toArray()
// => [{n: "Alice"}, {n: "Bob"}]

// Slice patterns require find() or first(), not match()
Tendril("%{ a: 1 }").match({a: 1})  // Error!
Tendril("%{ a: 1 }").find({a: 1})   // OK
```

### Collecting Directive

```javascript
// <collecting> explicitly collects values from iterations into buckets
// Syntax: <collecting $val in @bucket across ^label> (values into array)
//         <collecting $key:$val in %bucket across ^label> (k:v pairs into object)

// Collect k:v pairs across labeled iteration
const data = {a: {name: "alice"}, b: {name: "bob"}};
Tendril('§L { $key: { name: $n <collecting $key:$n in %names across ^L> }}')
  .match(data).solutions().first()
// => {key: "b", n: "bob", names: {a: "alice", b: "bob"}}
//    (names contains ALL k:v pairs collected across the §L iteration)

// Collect values only (into array)
Tendril('§L { $key: { name: $n <collecting $n in @names across ^L> }}')
  .match(data).solutions().first()
// => {key: "b", n: "bob", names: ["alice", "bob"]}

// The `across ^label` clause is required — there is no default scope
// The label marks where separate buckets are created
// Values are collected across all sub-branches beneath that label

// Type enforcement:
// - k:v form ($key:$val) requires %bucket (object slice)
// - value-only form ($val) requires @bucket (array slice)
```

### Primitives and Literals

```javascript
// Bare identifiers match strings
Tendril("foo").match("foo").hasMatch()
// => true

// Numbers, booleans, null
Tendril("123").match(123).hasMatch()
// => true

Tendril("true").match(true).hasMatch()
// => true

// Typed wildcards match by JavaScript type
Tendril("[_string _number _boolean]").match(["hi", 42, true]).hasMatch()
// => true (_number also matches NaN, Infinity)

// Regex matches substrings
Tendril("/^[A-Z]+$/").match("NASA").hasMatch()
// => true

Tendril("/foo/").match("seafood").hasMatch()
// => true (contains "foo")

// Case-insensitive literal (exact match)
Tendril("foo/i").match("Foo").hasMatch()
// => true

Tendril("foo/i").match("foobar").hasMatch()
// => false (not exact)
```

### Guard Expressions

```javascript
// Constrain bindings with boolean conditions
Tendril("$x=(_number; $x > 100)").match(150).solutions().first()
// => {x: 150}

Tendril("$x=(_number; $x > 100)").match(50).hasMatch()
// => false (50 > 100 is false)

// Guards can reference multiple variables (deferred evaluation)
Tendril("{ min: $a=(_number; $a < $b), max: $b=(_number) }")
  .match({min: 1, max: 10}).hasMatch()
// => true (guard waits for $b, then checks 1 < 10)

// Available operators: < > <= >= == != && || ! + - * / %
Tendril("$x=(_number; $x % 2 == 0)").match(4).hasMatch()
// => true (even number)

// Functions: size(), number(), string(), boolean()
Tendril("$x=(_string; size($x) >= 3)").match("hello").hasMatch()
// => true (length 5 >= 3)

// Errors cause match failure (no exceptions)
Tendril("$x=(_string; $x * 2 > 10)").match("hello").hasMatch()
// => false (can't multiply string)
```