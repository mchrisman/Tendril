# V5 Constraint Limitations

## Overview

Tendril v5 implements **declarative object semantics** where object terms are existential constraints and negative assertions (`(?!Q)`) check for non-existence of matches. However, the current implementation uses a recursive-descent evaluation strategy that processes patterns left-to-right. This creates limitations when negations need to **constrain unbound variables bidirectionally**.

## What Works ✓

### 1. Simple Negative Assertions
```javascript
// Check that key 'c' does not exist
{(?!c=_) a=1}  // ✓ Matches {a:1}

// Check that value 1 does not exist
{(?!_=1) a=2}  // ✓ Matches {a:2}
```

### 2. Negations with Already-Bound Variables
```javascript
// $x is bound first, then negation checks it
{$x=5 (?!b=$x)}  // ✓ Matches {a:5} but not {a:5, b:5}
```

### 3. Closed Object Assertions
```javascript
// No residual keys allowed
{a=1 (?!..)}  // ✓ Matches {a:1} but not {a:1, b:2}
```

### 4. Variable Unification Across Assertions
```javascript
// $x unifies across multiple terms
{a=$x b=$x}  // ✓ Matches {a:5, b:5}
```

## What Doesn't Work (Yet) ⚠️

### Bidirectional Constraint Patterns

Patterns where a **negation must constrain an unbound variable** that is **bound later** will not work correctly:

```javascript
// LIMITATION: Cannot constrain $x before it's bound
{(?!_=$x) $x=_}
// Intent: "$x must not equal any existing value"
// Current behavior: Negation evaluates with $x unbound,
//                  uses existential scope, may succeed incorrectly
```

### Why This Happens

The recursive-descent engine evaluates terms left-to-right:

1. Evaluates `(?!_=$x)` with $x unbound
2. Creates existential scope for $x within the negation
3. Negation succeeds/fails based on whether ANY binding exists
4. Then binds $x in outer scope (no connection to step 3)

### Workaround

**Reorder your pattern** to bind variables before the negation references them:

```javascript
// WORKS: Bind $x first
{$x=_ (?!_=$x)}
// Now the negation can check the bound value of $x
```

**Caveat:** This only works if the semantic intent allows reordering. Some constraints are inherently bidirectional and cannot be reordered.

## Technical Root Cause

Negations like `(?!Q)` are evaluated as:
1. Try to find solutions to Q under current bindings
2. Succeed if no solutions exist

When Q contains unbound variables, they are treated as **existentially quantified within Q** (correct per the semantics), but this creates a **constraint** rather than an **immediate check**. The current engine doesn't have a constraint store to defer evaluation until variables become bound.

## Future: Constraint Propagation (V6+)

The proper solution is a **constraint propagation layer**:

- Reify `(?!Q)` as constraints with variable watchlists
- When a variable in the watchlist becomes bound, re-evaluate the constraint
- Use domain inference to prune invalid bindings early

This would enable true bidirectional constraints without sacrificing declarative semantics.

### Design Sketch

```javascript
// Constraint store tracks dependencies
constraints = [
  { type: 'negative', pattern: '_=$x', watchVars: ['x'] }
];

// When $x binds, re-evaluate all constraints watching 'x'
// Fail the current solution branch if constraint violated
```

## Recommendations for V5 Users

1. **Bind variables before referencing them in negations** when possible
2. **Test your patterns** to verify constraint evaluation order
3. **Consider explicit tests** rather than complex bidirectional constraints
4. **Document patterns** that rely on evaluation order

## Related Issues

- Group bindings (`@x`) are partially implemented but not fully integrated
- Negation + group interaction needs testing
- Array negative lookaheads have a separate bug (see test suite)

---

**Last Updated:** 2025-10 (v5 development)
