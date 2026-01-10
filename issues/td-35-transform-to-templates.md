# TD-35: Shape-Directed Transformations via `.transformTo()`

## Summary

Add a `.transformTo(template)` API that compiles a Tendril-like construction template into a deterministic transducer over the solution stream, enabling declarative reshaping, grouping, and inversion without JavaScript glue code.

## Motivation

Currently, transforming solution streams into new shapes requires JavaScript:

```javascript
// Invert a map: {a:1, b:2} → {1:"a", 2:"b"}
const inverted = {};
for (const {k, v} of Tendril("{$k:$v}").match(data).solutions()) {
  inverted[v] = k;
}

// Group by key
const grouped = {};
for (const {x, y, z} of Tendril(pattern).match(data).solutions()) {
  (grouped[x] ??= {})[y] = z;
}
```

With `.transformTo()`, these become:

```javascript
// Invert a map
Tendril("{$k:$v}").match(data).transformTo("{$v: $k}")

// Group by key
Tendril(pattern).match(data).transformTo("{$x: {$y: $z}}")
```

## Proposed API

```javascript
Tendril(A).match(X).transformTo(B) → Y
```

Where:
- `A` is the matching pattern
- `B` is a construction template (restricted Tendril subset)
- `Y` is deterministically constructed from the solution stream

## Core Semantics

### 1. Per-Record Evaluation
Variable references (`$x`) are evaluated per solution record unless lifted by enumeration.

### 2. Enumeration via `...`
```javascript
[ ... E ... ]  // For each solution, evaluate E and append
```
At most one generator per array level (prevents Cartesian explosion).

### 3. Objects Induce Grouping
```javascript
{ $key: $value }  // Dynamic key → implicit groupBy($key)
{ staticKey: $v } // Static key → single construction
```

### 4. Choice via `else`
```javascript
{ running: _ } else { waiting: {reason: $r} } else { other: $state }
```
Ordered, local choice per record. No cross-record backtracking.

### 5. Scalar vs Group Variables
- `$x` must resolve to exactly one value
- `@x` / `...` permit collections

## Example: Kubernetes Pod Transformation

```javascript
Tendril(`{
  metadata:{ name:$pod namespace:$ns }
  spec.containers[_]: { name:$c image:$img }
  status.containerStatuses[_]: { name:$c ready:$ready restarts:$restarts }
}`)
.match(pod)
.transformTo(`{
  pod: $ns "/" $pod
  containers: {
    $c: { image:$img ready:$ready restarts:$restarts }
  }
}`)
```

Output:
```javascript
{
  pod: "prod/api-7d9c9b8c6f-abcde",
  containers: {
    api:  { image: "ghcr.io/acme/api:1.42.0", ready: true, restarts: 0 },
    side: { image: "ghcr.io/acme/sidecar:3.1.0", ready: false, restarts: 7 }
  }
}
```

## Implementation Strategy

1. **Compile B into a construction plan** (deterministic program)
2. **Fold over solution stream** to build output
3. **Bounded backtracking over interpretations**, not values
4. **Fail at compile time** if ambiguous (multiple values for scalar, key collisions)

### Compilation Guarantees

If compilation succeeds:
- Transform is deterministic
- Output matches template B
- No arbitrary value choices

If compilation fails:
- Explainable structural errors (ambiguity, missing lift, collision)
- User can fix by adding `...`, parentheses, or reshaping B

## Non-Goals (v1)

- Value-level choice ("pick one arbitrarily")
- Arbitrary predicates in templates
- Multiple independent generators at same level
- Implicit deduplication or sorting

## Design Philosophy

> "Tendril extracts a stream of records. The construction template says how to fold that stream into a shape. Enumeration and grouping happen only where the shape makes them unavoidable."

This corresponds to a deterministic, bounded tree transducer—expressive enough for joins, inversions, and grouping, without becoming a logic solver.

## Related

- TD-33: Aggregation (count, sum, grouping)
- Current `editAll()` / `replaceAll()` API
