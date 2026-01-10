# Tendril Language Levels

This document proposes a stratification of Tendril features into three levels: **Core**, **Advanced**, and **Arcane**. The goal is to reduce perceived complexity by giving users a clear learning path and helping documentation, tutorials, and AI coding assistants focus on the right subset for each task.

## Design Principles

1. **Core** covers 80% of use cases and is learnable in under an hour
2. **Advanced** adds power but requires understanding of multiplicity and branching
3. **Arcane** features break locality, cause solution explosion, or have subtle semantics
4. The division is by **idiom**, not just syntax—the same feature may appear at multiple levels depending on how it's used

---

## Core Level

Core Tendril is essentially "regex for JSON structures." Users who know regex will feel at home. This level preserves local reasoning and makes most bugs unrepresentable.

### Literals and Wildcards

| Feature | Example | Notes |
|---------|---------|-------|
| String literals | `foo`, `"hello world"` | Barewords or quoted |
| Numbers | `42`, `-3.14` | |
| Booleans/null | `true`, `false`, `null` | |
| Wildcard | `_` | Matches any single value |
| Typed wildcards | `_string`, `_number`, `_boolean` | Type-constrained wildcard |
| Regex | `/pattern/`, `/foo/i` | Substring match (use anchors for exact) |
| Case-insensitive | `foo/i`, `"Bar"/i` | Exact match, case-insensitive |

### Arrays

| Feature | Example | Notes |
|---------|---------|-------|
| Positional match | `[1 2 3]` | Exact sequence |
| Wildcard element | `[1 _ 3]` | Any middle element |
| Spread | `[1 ... 5]` | Any subsequence between |
| Trailing spread | `[1 2 ...]` | Prefix match |

### Objects

| Feature | Example | Notes |
|---------|---------|-------|
| Field clause | `{a: 1}` | Key 'a' has value 1 |
| Multiple clauses | `{a: 1, b: 2}` | Conjunctive (AND) |
| Wildcard value | `{name: _}` | Any value for 'name' |
| Optional field | `{name: _, age?: _}` | Age may be absent |

### Variables

| Feature | Example | Notes |
|---------|---------|-------|
| Scalar binding | `$x` | Capture a single value |
| Explicit binding | `(_ as $x)` | Bind pattern result to $x |
| Unification | `[$x ... $x]` | Same value at both positions |

### Paths

| Feature | Example | Notes |
|---------|---------|-------|
| Dot notation | `{a.b.c: $x}` | Nested object access |
| Array index | `{items[0]: $x}` | Specific array position |
| Variable index | `{items[$i]: $x}` | Bind or constrain index |

### API (Core)

```javascript
// Pattern creation
const p = Tendril(patternString);

// Matching
p.match(data)           // Anchored at root
p.find(data)            // Find anywhere
p.hasMatch(data)        // Boolean: matches at root?
p.hasAnyMatch(data)     // Boolean: matches anywhere?

// Extracting
result.solutions()      // Get solution set
result.first()          // First match/solution
sol.toObject()          // Plain bindings object
sol.x, sol.name         // Direct property access
```

### Core Idioms

```javascript
// Extract a value
Tendril("{name: $x}").match({name: "Alice"}).solutions().first()
// => {x: "Alice"}

// Check structure
Tendril("{type: user, id: _number}").hasMatch(data)

// Simple join (shared variable)
Tendril("{users[$i].id: $uid, orders[$j].user_id: $uid}")

// Search and extract
Tendril("{name: $n}").find(deepData).solutions().toArray()
```

---

## Advanced Level

Advanced features introduce multiplicity (multiple solutions), conditional matching, and transformations. Users should understand that patterns can branch and produce many solutions.

### Group Variables

| Feature | Example | Notes |
|---------|---------|-------|
| Array group | `@x` | Capture subsequence |
| Object group | `%x` | Capture key-value subset |
| Explicit group | `(_* as @x)` | Bind repeated match |

**Key insight**: `$x` captures ONE value; `@x` captures ZERO OR MORE values as an array.

```javascript
// Group splits
Tendril("[@x @y]").match([1,2,3]).solutions().count()
// => 4 solutions: different ways to split

// Difference in replacement
Tendril("[$x ...]").find([1,2]).editAll({x: [9,9]})  // => [[9,9], 2]
Tendril("[@x ...]").find([1,2]).editAll({x: [9,9]})  // => [9, 9, 2]
```

### Branching

| Feature | Example | Notes |
|---------|---------|-------|
| Alternation | `(a \| b)` | Both branches explored |
| Prioritized | `(a else b)` | First match wins |
| Object alt | `{a: (1 \| 2)}` | Key with either value |

**Key insight**: `|` enumerates ALL matches; `else` commits to FIRST match.

### Strong Semantics

| Feature | Example | Notes |
|---------|---------|-------|
| Each clause | `{each K: V}` | ALL keys matching K must have V |
| Each optional | `{each K?: V}` | If K exists, must have V |

```javascript
// Weak: at least one
{/a.*/: 1}         // OK if any /a.*/ key has value 1

// Strong: all must match
{each /a.*/: 1}    // FAIL if any /a.*/ key has value != 1
```

### Quantifiers

| Feature | Example | Notes |
|---------|---------|-------|
| Zero or more | `[a*]` | |
| One or more | `[a+]` | |
| Optional | `[a?]` | |
| Count range | `[a{2,4}]` | 2-4 occurrences |
| Object count | `{K:V #{2,4}}` | 2-4 matching pairs |
| Remainder | `{a:1 %}` | Non-empty remainder |
| Closed object | `{a:1 %#{0}}` | No extra keys |

### Depth Navigation

| Feature | Example | Notes |
|---------|---------|-------|
| Glob descent | `{a.**.c: $x}` | Match 'c' at any depth under a |
| Leading glob | `{**.password: $p}` | Find anywhere including root |

### Guards

| Feature | Example | Notes |
|---------|---------|-------|
| Guard expression | `(_ as $x where $x > 0)` | Boolean constraint |
| Multi-var guard | `...where $a < $b` | Deferred until both bound |
| Anonymous | `(_ where _ % 2 == 0)` | No binding, just constraint |

Functions: `size()`, `number()`, `string()`, `boolean()`
Operators: `< > <= >= == != && || ! + - * / %`

### Transformation API

```javascript
// Replace entire match
pattern.find(data).replaceAll(newValue)
pattern.find(data).replaceAll(sol => transform(sol))

// Edit specific bindings
pattern.find(data).editAll({x: 99})
pattern.find(data).editAll(sol => ({x: sol.y, y: sol.x}))

// Pure by default (returns copy); use {mutate: true} for in-place
```

### Slice Patterns

```javascript
// Object slice (replace part of object)
Tendril("@{foo: 1}").find({foo: 1, bar: 2}).replaceAll({baz: 3})
// => {baz: 3, bar: 2}

// Array slice (replace subsequence)
Tendril("@[2 3]").find([1,2,3,4]).replaceAll([20,30])
// => [1, 20, 30, 4]
```

### Flow Operator

```javascript
// Collect matching pairs into buckets
{$k: 1 -> %ones}                    // All k:v where v=1
{$k: 1 -> %ones else 2 -> %twos}    // Partition by value
{$k: 1 -> %ones else _ -> %rest}    // Categorize with fallback
```

### Advanced Idioms

```javascript
// Partition object entries
Tendril(`{
  $item: {type: fruit} -> %fruits
    else {type: vegetable} -> %veggies
}`).match(inventory)

// Validate all fields match pattern
Tendril("{each /.*_id/: _number}").hasMatch(data)

// Transform with computed values
Tendril("{price: $p}").find(data).editAll({p: $ => $.p * 1.1})
```

---

## Arcane Level

Arcane features break locality, have subtle semantics, or can cause solution explosion. Use only when necessary, with full understanding of behavior.

### Lookaheads

| Feature | Example | Notes |
|---------|---------|-------|
| Positive | `(?pattern)` | Must match, doesn't consume |
| Negative | `(!pattern)` | Must NOT match |

```javascript
// Array doesn't contain subsequence
[(! ... 3 4) ...]

// Object lacks key
{(! secret: _)}

// Bind from lookahead (positive only)
[(? (/[ab]/ as $x)) ...]
```

**Pitfall**: Positive lookaheads enumerate ALL binding possibilities. Negative lookaheads never bind.

### Labels and Scoping

```javascript
// Label declaration
§L { ... }
§items [ ... ]

// Label reference in flow
{$k: {name: $n -> %names<^L>}}

// Without label, bucket keys come from inner scope
// With ^L, bucket keys come from labeled scope
```

### Collecting Directive

```javascript
// Explicit collection across iterations
§L {$key: {name: $n <collecting $key:$n in %names across ^L>}}

// Always requires label reference
// Type must match: k:v -> %bucket, v -> @bucket
```

### Possessive Quantifiers

| Feature | Example | Notes |
|---------|---------|-------|
| Possessive optional | `?+` | No backtracking |
| Possessive zero+ | `*+` | No backtracking |
| Possessive one+ | `++` | No backtracking |

These consume greedily and NEVER give back. Use for performance when you know backtracking won't help.

### Solution Explosion Scenarios

These patterns can produce exponential solutions:

```javascript
// Wildcard key with unbound variable
{_: $x}           // One solution per key-value pair

// Multiple groups in array
[@x @y @z]        // O(n^2) splits for n elements

// Nested alternation with shared variables
{a: ($x|$y), b: ($x|$y)}  // Combinatorial

// Regex keys with overlapping matches
{/a/: $x, /ab/: $y}  // Multiply across overlaps
```

### Complex Unification Patterns

```javascript
// Universal equality (all values same)
{/a.*/: $x, each /a.*/: $x}

// Cross-path join with guards
{
  a[$i]: (_ as $x where $x == $y),
  b[$j]: (_ as $y)
}
```

### Arcane Idioms

```javascript
// Validate no bad entries exist
{(! each K: bad_value)}

// Collect with explicit scope control
§outer {
  $category: §inner [
    ($item <collecting $item in @all<^outer>>)*
  ]
}

// Short-circuit without exploring all solutions
pattern.first(data)  // Stops after first occurrence
pattern.hasMatch(data)  // Stops after first solution
```

---

## Migration Guide

### From Core to Advanced

When you need:
- Multiple values from one position → use `@x` groups
- Conditional matching → use `else`
- Validation (all must match) → use `each`
- Data transformation → use `editAll()`, `replaceAll()`
- Deep search with unknown structure → use `**`

### From Advanced to Arcane

When you need:
- Negative assertions → use `(!...)`
- Cross-iteration collection → use labels + `<collecting>`
- Performance tuning → use possessive quantifiers
- Complex partitioning → use flow with labels

---

## Recommendations

### For Documentation

1. **Tutorials**: Core only for first 80% of content
2. **How-to guides**: Core + Advanced
3. **Reference**: All levels, clearly marked
4. **Examples**: Tag each example with its level

### For AI Coding Assistants

```
Rule: Try Core only.
If compilation fails or semantics don't match, allow Advanced.
Never use Arcane unless explicitly requested.
```

### For API Design

Consider adding pattern compilation options:

```javascript
Tendril(pattern, {level: 'core'})    // Error on advanced/arcane features
Tendril(pattern, {level: 'advanced'}) // Error on arcane features
Tendril(pattern)                      // Allow all (default)
```

This would enable guardrails for beginners and automated tools.

---

## Summary Table

| Level | Features | When to Use |
|-------|----------|-------------|
| **Core** | Literals, `_`, `$x`, `[]`, `{}`, `.`, `...`, basic quantifiers | Most use cases |
| **Advanced** | `@x`, `%x`, `each`, `else`, `\|`, `**`, guards, `->`, `editAll` | Branching, transforms, validation |
| **Arcane** | `(?...)`, `(!...)`, `§L`, `<collecting>`, `*+` | Expert scenarios only |
