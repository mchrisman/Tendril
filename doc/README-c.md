
**Tendril: Pattern Matching and Transformation for Tree Structures**

## Overview

Tendril is a declarative pattern matching and transformation engine for JSON-like tree structures (objects, arrays, primitives). It combines regex-like pattern syntax with Prolog-style unification to **match** structural patterns and **replace** matched data.

**Core capabilities:**

- **Pattern matching** - Describe data shapes with variables, wildcards, and constraints
- **Unification** - Variables that appear multiple times must match equal values (relational logic)
- **Transformation** - Find patterns and replace them with computed results
- **Generator-style iteration** - Produces multiple solutions when patterns match ambiguously

**Key use cases:**

- Structural transformations of AST/VDOM trees (macro expansion)
- Relational queries across nested JSON (joining data from multiple paths)
- Search-and-replace operations on complex data structures
- Validation and extraction from semi-structured data

---

## Design Philosophy

- Adopting some of the principles of regexes:
    - Patterns should look like the data they model.
    - Concise code is important.
- As with regex and Sql, Tendril a







- 
Tendril occupies a unique position between simpler and more complex alternatives:

| Tool | Capability | Complexity |
|------|-----------|------------|
| JSONPath / JMESPath | Query only, limited expressiveness | Simple |
| **Tendril** | **Pattern match + transform + relational logic** | **Moderate** |
| Full Prolog | Complete logic programming | Complex |

**The key tradeoff:** More powerful than path queries, more constrained than general logic programming.

---

## Two Syntax Styles

Tendril supports both **compact** (path-like) and **verbose** (structure-mirroring) syntax:

```javascript
// Compact: concise, path-focused
const pattern = `{
  planets.$name.size=$size
  aka[$idx][0]=$name
}`;

// Verbose: visual similarity to data structure
const pattern = `{
  planets = {
    $name = {size = $size}
  }
  aka = [
    ..
    [(?=$name) .. $alias ..]
    ..
  ]
}`;
```

**Both are equivalent.** The compact form is generally recommended for consistency and brevity.

---

## Core Concepts

**1. Variables and Unification**

```javascript
// $var binds scalar values (exactly one)
// @var binds slices (zero or more items)

[ $x .. $x ]  // matches ["a", "other", "stuff", "a"]
              // $x unifies to "a" (appears twice, must be equal)

[ @x @y ]     // matches [1, 2, 3, 4]
              // Multiple solutions by different splits:
              // {x:[], y:[1,2,3,4]}
              // {x:[1], y:[2,3,4]}
              // {x:[1,2], y:[3,4]}
              // etc.
```

**2. Arrays: Sequencing and Quantifiers**

```javascript
[ a b c ]       // Exact sequence (anchored)
[ a b .. ]      // Unanchored (.. = lazy wildcard)
[ a? b+ c* ]    // Quantifiers: optional, one-or-more, zero-or-more
[ a{2,5} ]      // Bounded repetition (2-5 times)
```

**All quantifiers are greedy by default** - longer matches come first. This ensures `.replace()` uses the best match.

**3. Objects: Key-Value Assertions**

```javascript
{ key = value }         // Required assertion (at least one match)
{ key ?= value }        // Optional assertion (zero or more matches)
{ @rest:(remainder) }   // Bind residual keys not matched by any assertion
```

**4. Paths: Descending Through Structures**

```javascript
{ a.b.c = d }              // Descend through nested objects
{ a[3].c = d }             // Array index then object key
{ foo(.bar)* = baz }       // Repeated descent (zero or more .bar steps)
```

**5. Alternation and Lookaheads**

```javascript
( a | b )        // Match either a or b
(?= pattern)     // Positive lookahead (zero-width, may bind variables)
(?! pattern)     // Negative lookahead (zero-width, discards bindings)
```

---

## API Overview

**Query API:**

```javascript
const matcher = Tendril(pattern);

// Get all solutions
matcher.solutions(data)  // Returns array of binding objects

// Example
Tendril("{ users.$id.name=$name }")
  .solutions(data)
  .forEach($ => console.log($.id, $.name));
```

**Transformation API:**

```javascript
// Replace entire input using first (longest) match
matcher.replace(data, vars => newValue)

// Replace all non-overlapping occurrences
matcher.replaceAll(data, vars => ({varName: newValue}))
```

**Replacement examples:**

```javascript
// Swap array elements
Tendril("[$x $y]").replace([3,4], $ => [$.y, $.x])
// Result: [4, 3]

// Replace slice variables
Tendril("[@x 99 @y]").replace([1,2,99,4], $ => [...$.y, 99, ...$.x])
// Result: [4, 99, 2]

// Transform object structures
Tendril("{ _(._)*.password = $p }")
  .replaceAll(data, $ => ({ p: "REDACTED" }))
// Redacts all password fields at any depth
```

---

## When to Use Tendril

### ✅ **Perfect fit (10%):**

**1. Structural tree transformations (AST/VDOM manipulation)**

```javascript
// Macro expansion: <When>/<Else> → If node
Tendril(`[
  ..
  @whenelse:(
    {tag = /^when$/i, children = $then}
    {tag = /^else$/i, children = $else}?
  )
  ..
]`).replaceAll(vdom, $ => ({
  whenelse: Slice.array({
    tag: 'If',
    thenChildren: $.then,
    elseChildren: $.else || []
  })
}))
```

**2. Relational queries joining data across paths**

```javascript
// Join users with their projects by ID
Tendril(`{
  users.$userId.name = $userName
  users.$userId.managerId = $managerId  
  projects.$projectId.assigneeId = $userId
  projects.$projectId.name = $projectName
}`).solutions(data)
```

**3. Deep search-and-replace with structural awareness**

```javascript
// Redact sensitive fields at any nesting level
Tendril("{ _(._)*.password = $value }")
  .replaceAll(data, $ => ({ value: "REDACTED" }))
```

### ⚠️ **Works adequately (40%):**

- Complex validation ("does this data match this schema?")
- Data extraction from semi-structured formats
- Tree walking with pattern-based filtering
- Structural refactoring of configuration files

### ❌ **Wrong tool (50%):**

- **Simple path queries** - Use JSONPath/Lodash instead
- **Statistical analysis** - Use dedicated data libraries
- **Graph traversal** - Use graph databases
- **Performance-critical operations** - Backtracking can be expensive
- **Dynamic patterns** - Patterns must be known at "compile time"

---

## Design Goals

**1. Expressiveness for structural patterns**

Tendril can express complex tree patterns that are verbose or impossible in alternatives:

```javascript
// Find objects with overlapping key patterns
{ /user.*/=_  /contact.*/=_  @rest:(remainder) }

// Match recursive structures with quantified paths  
{ foo(.bar)*.baz = quux }

// Unify across array positions and object paths
{ data[$i].id=$id  meta[$i].status="active"  users.$id.name=$name }
```

**2. Correctness through unification**

Variables enforce consistency automatically:

```javascript
// This can't accidentally mismatch IDs
{
  requests.$reqId.user.name = $userName
  responses[..].requestId = $reqId
  responses[..].output = $result
}
```

**3. Composability**

Patterns are first-class values that can be:

- Defined once, reused many times
- Combined with alternation and lookaheads
- Applied recursively to nested structures

---

## Limitations and Tradeoffs

**1. Learning curve**

The distinction between `$scalar` and `@slice`, quantifier semantics, and unification rules require study. This is more complex than JSONPath.

**2. Performance**

Backtracking over large datasets can be expensive. Tendril is not optimized for:

- Matching thousands of patterns against one document
- Real-time pattern matching at scale
- Patterns with many alternations or quantifiers

**3. Pattern syntax complexity**

The grammar includes 13 concepts (literals, variables, slices, arrays, objects, paths, quantifiers, alternation, lookaheads, unification, remainder, breadcrumbs, wildcards). This is manageable but not simple.

**4. Debugging**

When a pattern doesn't match, understanding *why* requires reasoning about:

- Which assertion failed
- Whether unification succeeded
- What values variables captured

Better error messages and debugging tools would help.

---

## Size and Implementation

**Total: ~2,000 lines** (estimated)

Small enough to:

- Read and understand the full implementation
- Include in an LLM context window (if needed for framework development)
- Audit for correctness and security

**However:** End users (app developers) should **not** need to see Tendril internals. It's a framework implementation detail.

---

## Positioning Statement

**Tendril is to tree transformation what regular expressions are to string transformation:**

- Declarative pattern syntax
- Powerful for the right use cases
- Can be cryptic when overused
- Not a general-purpose solution

**Use Tendril when:**

- You're building tools that transform structured data (compilers, macros, preprocessors)
- You need relational logic across nested structures
- You're willing to invest in learning the pattern language

**Don't use Tendril when:**

- Simple path queries suffice (use JSONPath)
- Performance is critical (use specialized tools)
- Pattern complexity would hurt maintainability

---

## Comparison to Alternatives

| Feature | Tendril       | JSONPath | Prolog          | XSLT          |
|---------|---------------|----------|-----------------|---------------|
| Query trees | ✅ Powerful    | ✅ Simple | ✅ Very powerful | ✅ XML only    |
| Transform trees | ✅ Yes         | ❌ No | ⚠️ Indirect     | ✅ Yes         |
| Unification | ✅ Yes         | ❌ No | ✅ Yes           | ❌ No          |
| Multiple solutions | ✅ Yes         | ❌ No | ✅ Yes           | ⚠️ Limited    |
| Learning curve | ⚠️Moderate    | ✅ Easy | ❌ Steep         | ❌ Steep       |
| Syntax | Pattern DSL   | Path strings | Logic clauses   | XML templates |
| Size | ✅ Small (~2K) | ✅ Small | ❌Large           | ❌Large         |
| Performance | ⚠️Variable    | ✅ Fast | ⚠️Variable        | ❌Slow          |

---

## Example Use Cases

**1. Component macro expansion (AppDown)**

```javascript
// Transform <When>/<Else> pairs into canonical If nodes
Tendril(`[.. @pair:({tag=/^when$/i} {tag=/^else$/i}?) ..]`)
  .replaceAll(vdom, $ => /* transformed structure */)
```

**2. API response parsing**

```javascript
// Join user data across requests and responses
Tendril(`{
  requests.$reqId.user.name = [$first .. $last]
  responses[..]{requestId=$reqId status=ok output=$text}
}`).solutions(data)
  .map($ => `${$.first}: ${$.text}`)
```

**3. Deep data sanitization**

```javascript
// Redact all password fields at any nesting depth
Tendril("{ _(._)*.password = $p }")
  .replaceAll(config, $ => ({ p: "REDACTED" }))
```

**4. Configuration validation**

```javascript
// Check if config has required structure
const valid = Tendril(`{
  database.host = $_
  database.port = $port:(/^\d+$/)
  api.endpoints[..].path = $_
}`).solutions(config).length > 0;
```
