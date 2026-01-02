## CW 8. **Magic Template**

https://chatgpt.com/c/69514bdd-6a94-8329-b954-88f13b2257b8

I've been thinking for the last day or two about the problem that we have no way to create a transformation that requires collecting individual solutions into an array or another structure. It is certainly possible to create a basic api like .solutions().groupBy("x").groupBy("y").enumerate(). I started thinking along the lines of how to make that more flexible, and I'm starting to have the intuition that a more general "make it look like this" transformation might be possible. For example:

a. You should be able to invert a map by saying

```
Tendril("{$k:$v}").match(data).render("{$v:[...$k...]}")
```

b. we would obviate the need for any such groupBy API by saying

```
Tendril(pattern).match(data).render("{$x = {$y = [...[$z $w]...]}")
```

or (this time using path notation)

```
Tendril(pattern).match(data).render("{$x.$y[_]=[$z $w]}")
```

c. This earlier example

```
// Macro expansion: <When>/<Else> → If node
const result = Tendril(`[
  ..
  @whenelse=(
    {tag:when/i children:$then}
    {tag:else/i children:$else}?
  )
  ..
]`).find(vdom).editAll($ => ({
  whenelse: [{
    tag: 'If',
    thenChildren: $.then,
    elseChildren: $.else || []
  }]
}))
```

could become (this one's more difficult, involves a conditional structure)

```
// Macro expansion: <When>/<Else> → If node
const result = Tendril(`@(
    {tag:when/i children:$then}
    {tag:else/i children:$else}?
)`).find(vdom).transformAll(`
         {tag:if thenChildren:$then elseChildren:(?_)$else}
    else {tag:if thenChildren:$then}
  }]
`)
```

After some discussion with ChatGPT, I think we have a viable strategy that would be able to produce results like the following. 
### input
```
const pod = {
  metadata: { name: "api-7d9c9b8c6f-abcde", namespace: "prod" },
  spec: { containers: [
    { name: "api",  image: "ghcr.io/acme/api:1.42.0", env: [{name:"A",value:"1"}] },
    { name: "side", image: "ghcr.io/acme/sidecar:3.1.0" }
  ]},
  status: { containerStatuses: [
    { name: "api",  ready: true,  restartCount: 0, state: {running:{}} },
    { name: "side", ready: false, restartCount: 7, state: {waiting:{reason:"CrashLoopBackOff"}} }
  ]},
  // lots of other fields you don’t want to enumerate…
  other: { huge: { blob: 1 } }
};

Tendril(`{
  metadata:{ name:$pod namespace:$ns }
  spec.containers[_]:          { name:$c image:$img env:@env? }
  status.containerStatuses[_]: { name:$c ready:$ready restartCount:$restarts state:$state }
  @extra=(%?)   // optionally capture untouched top-level stuff
}`)
.match(pod)
.transformTo(`{
  pod: $ns "/" $pod
  containers: {
    $c: {
      image: $img
      ready: $ready
      restarts: $restarts
      // keep env if present; otherwise omit
      env: @env?
      // classify state without an if-statement: try one shape, else another
      status:
        { running: _ }   // satisfiable only if state has running
      else
        { waiting: { reason: $reason } }  // binds reason if waiting
      else
        { other: $state } // fallback: preserve raw state
    }
  }
  extra: @extra?  // preserve everything not mentioned, if you want
}`);


```
### output shape
```
{
  pod: "prod/api-7d9c9b8c6f-abcde",
  containers: {
    api: {
      image: "ghcr.io/acme/api:1.42.0",
      ready: true,
      restarts: 0,
      env: [{name:"A",value:"1"}],
      status: { running: "_" }
    },
    side: {
      image: "ghcr.io/acme/sidecar:3.1.0",
      ready: false,
      restarts: 7,
      status: { waiting: { reason: "CrashLoopBackOff" } }
    }
  },
  extra: { other: { huge: { blob: 1 } } }
}

```

## Transparency and safety. 

We wouldn't do this as a black box magic thing, although it would support that usage. We would do it as a code generation tool that transpiles your output template into JavaScript. If you wanted the black box magic, you could just do that at runtime, but most people would generate the JavaScript, review it, and test it. 

With regard to transform two templates looking very close to patterns, the goal is that they should look exactly like patterns because the selling point is that you only have to learn one and you also have a pattern that can be used for parsing the output. A lot of your comments are around determinism. And as an engineer, I completely appreciate that. But let me point out that there are multiple levels of indeterminism. Here 'output' refers to the transformed data:

0. The output is not deterministic.
   A. The output is underspecified, With major structural differences from what the user intended.
   B. The output is underspecified with differences that are acceptable to the user, for example, reorderings; the visible shape of the pattern determines what is specified and what isn't.
   C. The output is completely specified by the visible shape of the pattern; all 'hints' are meaningful pattern-matching assertions.
   D. The output is completely specified, formally and stably, by the visual shape of the pattern, plus additional hints that are not part of ordinary tendril patterns.

- Nobody is suggesting (0).
- Your position is that (C) is impossible in general (in theory) and therefore (D) is necessary and should be mandatory.
- My position is that (C) is often possible (in practice, If the metric is what's in the user's head rather than a formal specification), and that (B), (C), (D) all have their place in a spectrum of tradeoffs between simplicity, LOE, and predictability; and that (A) Should be generally prevented by the structure of the language. 



# Proposal as expanded by ChatGPT

Here is a consolidated, updated proposal that reflects the direction you’ve converged on, incorporating all of the clarifications, constraints, and design commitments we’ve discussed. I’ve written it as something you could drop into a design doc or “vNext proposal” section.

---

## Proposal: Shape-Directed Transformations via Deterministic Construction Plans

### Overview

Extend Tendril with a **shape-directed transformation facility**:

```
Tendril(A).match(X).transformTo(B) → Y
```

where `A` is a matching pattern, `B` is a construction template (a restricted subset of Tendril), and `Y` is deterministically constructed from the solution stream produced by `A.match(X)`.

This facility compiles `B` into a **deterministic structural transducer** operating over the solution stream, not into a general logic solver. The goal is to make common relational reshaping, grouping, inversion, and structural synthesis feel “obvious,” while remaining predictable, explainable, and bounded.

---

## Core Model

### Solution Stream Semantics

`A.match(X)` produces an **ordered stream (multiset)** of solution records:

```
R = [ r₁, r₂, r₃, ... ]
```

Each record binds variables from `A`. Ordering and multiplicity are preserved; no implicit deduplication or sorting occurs.

All transformations consume this stream explicitly. Any change to multiplicity must be expressed structurally or via fluent pipeline stages.

---

## Construction as a Transducer

`transformTo(B)` compiles `B` into a **construction plan**:

* A deterministic program that folds over the solution stream
* Produces output structure by recursive structural evaluation
* Uses bounded backtracking **only over subpattern decompositions**, never over values

The compiler’s job is not to “solve constraints,” but to select a viable **construction plan** from a small candidate set derived from `B`.

---

## Key Principle

> **Backtracking is allowed over interpretations of the template, not over variable values.**

If a construction would require arbitrarily choosing between multiple values for a scalar position, compilation fails unless the user has structurally indicated enumeration or grouping.

---

## Construction Template Language (B)

The construction language is a **restricted subset of Tendril**, with the following properties:

### 1. Per-Record Evaluation

All variable references (`$x`) are interpreted **per solution record** unless lifted by an enclosing enumeration context.

There is no global variable search or pairing.

---

### 2. Enumeration via Structural Context (`...`)

Enumeration is controlled *structurally*, not semantically.

* `[ ... E ... ]` means: for each solution record `r`, evaluate `E(r)` and append the result.
* `E` itself is always evaluated per record.

At any array level:

* **At most one generator** (`...`) is permitted.
* Multiple `...` must be structurally normalized into a single generator span or rejected.

This prevents accidental Cartesian products.

---

### 3. Objects Induce Grouping

Object construction `{ K: V }` has two modes:

* **Static key** → single construction, must be uniquely defined.
* **Dynamic key (mentions `$x`)** → implicit grouping by key value.

Grouping is induced by shape, not by an explicit `groupBy` operator.

Key collisions are compile-time errors unless grouping semantics are structurally evident.

---

### 4. Choice via `else`

`E1 else E2` is ordered, local choice:

* Try `E1`; if it fails for a given record or group, try `E2`.
* No backtracking across records or groups.
* Used for conditional construction, defaults, and fallback shapes.

---

### 5. Scalar vs Group Variables

Existing Tendril distinctions apply:

* `$x` → must resolve to exactly one value in context
* `@x` / `...` → permits collection / repetition

If a scalar site sees multiple candidate values and no enclosing enumeration can absorb them, compilation fails.

---

## Construction Plan Generation

Compilation proceeds by generating a **small candidate set of construction plans**, then selecting the first viable one.

### Plan Generation Sources

Candidates arise from:

* Different possible generator spans in arrays
* Structural normalization of `...` regions
* Branch selection in `else`
* Scalar vs lifted interpretations where allowed

### Pruning (Critical)

Plans are aggressively pruned using cheap facts derived from the current solution environment:

* Variable presence (always / sometimes / never)
* Distinct counts (e.g. is `$k` unique here?)
* Functional dependencies (is `$y` unique per `$x`?)
* Inevitable object key collisions
* Multiple independent generators at same level (illegal)

No plan that would require value-level choice is generated.

### Selection Strategy

Plans are tried in priority order:

1. No enumeration (build once)
2. Minimal generator span
3. Earlier `else` branches
4. Structurally simpler plans

Failure is structural, not semantic.

---

## Determinism and Guarantees

If compilation succeeds:

* The transform is deterministic.
* `Y` is guaranteed to match `B`.
* No data is dropped unless `B` omits variables present in `A`.
* No arbitrary value choices are made.

If compilation fails:

* The failure is explainable in terms of structure:

   * ambiguity
   * missing lift
   * unavoidable collision
   * multiple generators
* Users can resolve failures by adding parentheses, `...`, or reshaping `B`.

---

## Explicit Non-Goals (v1)

To keep this tractable and predictable, v1 deliberately avoids:

* Value-level choice (“pick one arbitrarily”)
* Arbitrary predicates / general EL
* Multiple independent generators at the same structural level
* Implicit deduplication or sorting
* Merging conflicting object fields without explicit structure

These can be layered later via fluent APIs or explicit operators.

---

## Mental Model (for Users)

> *“Tendril extracts a stream of records.
> The construction template says how to fold that stream into a shape.
> Enumeration and grouping happen only where the shape makes them unavoidable.”*

---

## Why This Works

This design corresponds to a **deterministic, bounded tree/stream transducer**:

* Expressive enough for joins, inversions, grouping, and macro-like rewrites
* Powerful without becoming a logic solver
* Explainable, inspectable, and debuggable

It aligns with known theory (tree transducers, attribute grammars) while remaining practical and idiomatic for JSON-like data.

---

If you want, the next natural steps would be:

* defining the internal IR for construction plans,
* specifying the exact failure diagnostics,
* or writing 5–6 “holy grail” examples that this makes dramatically simpler than today’s API.
