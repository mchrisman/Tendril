# Comprehensive Design Changes for Tendril


## 0. Buckets

A group capture applied to a scalar within a pattern.




## 1. Remove Implication Operator (`:>`)

**Old syntax:**

```javascript
{/password.*/: encrypted}           // at least one matches
{/password.*/:> encrypted}          // ALL must match (implication)
{/a.*/: $x, /a.*/:> $x}            // universal equality idiom
```

**New approach: Categorization with bucket quantifiers**

```javascript
// Partition into buckets, assert bucket properties
{/password.*/: encrypted ->@good else _ ->@bad!}  // bad bucket must be empty
{status: ok ->@passed else error ->@failed}       // categorize with no assertion

// Universal equality through categorization
{/a.*/: $x ->@same else _ ->@different!}
```

**Details:**

- Arrow syntax `V ->@bucket` routes matching values into named buckets
- Buckets are captured as object slices (group variables)
- Bucket quantifiers: `!` (must be empty), `+` (must be non-empty)
- Sugar: `K:V else !` shorthand for `K:V else ->!@_` (assert no fallthrough)
- More powerful than implication: shows *which* keys fail, not just yes/no

## 2. Lookaheads → Boolean Operators on Field Clauses

**Old syntax:**

```javascript
[(? $x=(/[ab]/)) $x ...]            // positive lookahead
[(! ... 3 4) ...]                    // negative lookahead
{(! secret: _)}                      // negative lookahead in objects
```

**New approach: Boolean operators**

```javascript
// Objects are boolean expressions over K:V slices
{ a:1 b:2 }                         // implicit AND (conjunction)
{ a:1 | b:2 }                       // OR (branching/enumeration)
{ !password:_ }                     // NOT (negation)
{ (a:1 & b:2) | c:3 }              // explicit grouping

// Complex validations
{ !{password:_} }                   // no password field
{ a:1 !a:2 }                       // a exists but isn't 2
```

**Details:**

- `&` (AND): slices combine via union
- `|` (OR): branching generator, explores all alternatives
- `!` (NOT): empty slice, constrains remainder, cannot bind variables
- Implicit AND when multiple clauses listed (JSON-like)
- Prefix `!` to avoid confusion with categorization sugar `else !`

## 3. Remainder Operators Simplified

**Old syntax:**

```javascript
{a: 1, %}                           // nonempty remainder
{a: 1, %#{0}}                       // empty remainder (closed)
{a: 1, @rest=(%?)}                  // optional remainder with binding
```

**New syntax:**

```javascript
{a: 1, %}                           // nonempty remainder
{a: 1, !%}                          // empty remainder (closed)
{a: 1, %?}                          // optional/don't care
{a: 1, @rest=(%)}                   // bind nonempty remainder
```

**Details:**

- Removed numeric quantifiers `#{m,n}`
- Three operators: `%` (required), `!%` (forbidden), `%?` (optional)
- Symmetric with bucket quantifiers (`!`, `+`)
- Remainder is what's left after accounting for all matched slices

## 4. Quantifiers Simplified

**Old syntax:**

```javascript
a?, a??, a?+                        // optional (greedy, lazy, possessive)
a*, a*?, a*+                        // zero or more variants
a+, a+?, a++                        // one or more variants
a{m,n}, a{m,}, a{m}                // specific repetitions
...                                  // lazy wildcard group (_*?)
```

**New syntax:**

```javascript
a?                                  // optional
a*                                  // zero or more
a+                                  // one or more
...                                 // zero or more (equivalent to _*?)
```

**Details:**

- Dropped greedy/lazy/possessive modifiers entirely
- Dropped `{m,n}` range quantifiers
- Arrays aren't strings; precise repetition control rarely needed
- Homogeneous collections don't exhibit same backtracking issues
- If precise count needed, write it out or use guards

## 5. Guard Expression Syntax Enhanced

**Old syntax:**

```javascript
$x=(_number; $x > 100)
$x=(_number; $x > 100 && $x < 200)
$tmp=(_; $tmp % 2 == 0)             // need named variable
```

**New syntax:**

```javascript
$x=(_number where $x > 100)
$x=(_number where 100 < $x < 200)   // chained comparisons
(_ where _ % 2 == 0)                // anonymous _ reference
$x where (...)                      // short for $x=(_ where ...)
```

**Details:**

- `where` keyword replaces semicolon separator
- Chained comparisons: `100 < $x < 200` instead of `$x > 100 && $x < 200`
- `_` referenceable within its own constraint (local scope)
- No new binding created by `_`—just filter expression
- Type patterns still explicit: `_number where ...`
- Full expression language (arithmetic, boolean, functions) available but relegated to "advanced"

## 6. Slice Patterns: Naked vs Wrapped

**Old syntax:**

```javascript
Tendril("@{a: 1}").find(data)       // find object slices
Tendril("@[1 2 3]").find(data)      // find array slices
Tendril("{a: 1}").match(data)       // match whole objects (at root)
```

**New syntax:**

```javascript
Tendril("a: 1").find(data)          // find field slices (naked)
Tendril("1 2 3").find(data)         // find subsequences (naked)
Tendril("{a: 1}").find(data)        // find whole objects (wrapped)
Tendril("[1 2 3]").find(data)       // find whole arrays (wrapped)
```

**Details:**

- Naked patterns: `a:1` (field), `1 2 3` (subsequence) → slice matching
- Wrapped patterns: `{a:1}` (object), `[1 2 3]` (array) → whole-structure matching
- No special `@{...}` or `@[...]` syntax needed
- Grammatically unambiguous: structural delimiters determine semantics
- For primitives: `find('c')` does value matching (searches all positions)
- `@` only used for group variable binding: `@rest`, `@bucket`

## 7. Categorization Details

**Syntax:**

```javascript
// Basic categorization
{ K: V1 ->@bucket1 else V2 ->@bucket2 else V3 ->@bucket3 }

// With bucket quantifiers
{ status: ok ->@good else _ ->@bad! }     // bad must be empty
{ role: admin ->@admins+ else _ ->@rest } // admins must be non-empty

// Sugar for strict validation
{ type: ok else ! }                        // shorthand for "else ->!@_"

// Can use any pattern as bucket name
{ score: (>90) ->@excellent else (>70) ->@good else _ ->@failing! }
```

**Semantics:**

- `else` creates prioritized alternatives (first match wins)
- Each branch can route to different bucket via `->@name`
- Buckets capture object slices (all K:V pairs matching that branch)
- Bucket quantifiers: `!` empty, `+` non-empty, omitted = no assertion
- `else !` (without bucket name) means "fail if reached"

## 8. What's Being Kept

**Essential features:**

- Unification: `$x` appearing multiple times must match same value
- Paths: `a.b.c`, `a[0].b`, `a.**.c` for deep navigation
- Spread operator: `...` for zero-or-more wildcard
- Basic quantifiers: `?`, `*`, `+` (no modifiers)
- Group variables: `@x` for capturing slices/subsequences
- Alternation: `|` (enumerate all) and `else` (first wins)
- Optional patterns: field quantifier `?` for optional fields
- Expression language: guards with comparisons, arithmetic, functions

**Maintained but simplified:**

- Remainder operators (now just `%`, `!%`, `%?`)
- Object field clauses (now explicitly boolean expressions)
- Quantifiers (just the basic three, no modifiers)

## 9. Categorization Interaction with Optional

**Potential awkwardness:**

```javascript
// Original direction (suffix operators)
K:V      K:V?      K:V!      K:V!?

// New direction (compositional)
K:V      K:V?      K:V else !      K:V else !?
```

**Decision:** Accept the compositional form. The `else !?` ordering is slightly clunky but:

- Maintains consistency with else-chain syntax
- `!?` is rare (strict-but-optional validation)
- Longhand available when needed: categorize with explicit empty-match check
- More powerful to have composable primitives than special-case sugar

## 10. Documentation Strategy

**Core (teach first):**

- Unification and variable binding
- Array/object pattern basics
- Paths and navigation
- Simple quantifiers (`?`, `*`, `+`, `...`)
- Categorization with bucket quantifiers
- Boolean operators on field clauses
- Naked vs wrapped patterns for find()

**Advanced (appendix/separate guide):**

- Full expression language in guards
- Complex guard expressions with arithmetic
- Bucket quantifiers beyond `!` and `+`
- Remainder operator details
- Performance considerations
- Edge cases and gotchas

---

## Summary of Removals

**Completely removed:**

- Implication operator `:>`
- Lookahead syntax `(? ...)` and `(! ...)`
- Object quantifiers `#{m,n}`
- Quantifier modifiers (greedy/lazy/possessive)
- Range quantifiers `{m,n}` (or relegated to advanced)
- Slice pattern prefix `@{...}` and `@[...]`
- Semicolon syntax in guards

**Subsumed by other features:**

- Implication → categorization + bucket quantifiers
- Lookaheads → boolean operators
- Object quantifiers → bucket quantifiers + remainder operators
- Slice patterns → naked vs wrapped pattern syntax