To coder: Here’s a clean, standalone **Change Request (CR)** covering \[changes to object semantics] as a unified proposalIt’s written for an implementer who has not seen our prior discussion.

---

## Change Request: Unified Semantics for Object Assertions, Negation, and Variable Binding

### Summary

This change replaces the ambiguous “lookahead” model for object negation with a declarative **existential constraint** model, clarifies how variables behave inside such assertions, and normalizes slice (`$` and `@`) semantics across arrays and objects. The goal is to make object matching logically well-defined and implementation-feasible without relying on procedural evaluation order.

---

### Background

In earlier versions of the grammar, constructs such as `(?! …)` were borrowed from regular-expression syntax and loosely referred to as “lookaheads.” This proved problematic when applied to objects, which are unordered collections of key–value pairs.
Unlike arrays, where a lookahead can literally “peek” at upcoming elements, object membership tests cannot meaningfully be temporal. The prior design also prohibited variable bindings inside negations, which limited expressive power and led to inconsistencies.

---

### 1. Object Negation Redefined (`(?! Q)`)

The `(?! Q)` form is no longer a procedural lookahead. It is now a **non-existence constraint** evaluated declaratively.

* **Definition:**
  In object context, `(?! Q)` succeeds if and only if `Q` has *no solutions* under the current variable bindings.
  Formally, given current environment E, the assertion succeeds when there exists no extension E′ ⊇ E that would satisfy Q.

* **Variable scope:**

    * Variables already bound in E constrain Q.
    * Variables unbound at the point of evaluation are **existentially scoped within Q** and do not leak bindings to the outer environment.
    * Bindings produced inside a negation are therefore *local and non-exported.*

This aligns object negation with standard first-order logic (∄ binding that makes Q true) rather than with regex mechanics.

---

### 2. Consistent Slice Semantics (`$` and `@`)

The `$` and `@` sigils are now explicitly differentiated by their domain of quantification.

* `$x` binds a **single item** (a scalar).
  In arrays, it is shorthand for `$x:(_)`, meaning “match one element and bind it to $x.”
* `@x` binds a **slice**—a contiguous subsequence in an array or a subset of key–value pairs in an object.

    * In arrays, `@x` is equivalent to `@x:(_*)`.
    * In objects, `@x` is equivalent to `@x:(..)` (the full set of matched pairs).

Quantifiers such as `+`, `*`, and `?` may follow either `$x` or `@x`, desugaring to repetition of their canonical slice form (e.g., `$x+` → `($x:(_))+`).
This ensures uniform, predictable expansion rules across data structures.

---

### 3. Object Existential Semantics for Terms

Each object term `K=V` is interpreted as an **existential claim** rather than a deterministic match step:

> `{ K=V }` succeeds if there exists a `(key,value)` pair in the target object such that
> `key` matches `K` and `value` matches `V`.

Conjunctions within an object body are interpreted as the logical **AND** of such existential clauses:

```
{ a=1  b=2 }
⇝  (∃ (a₁,v₁): a₁~"a" ∧ v₁~1) ∧ (∃ (a₂,v₂): a₂~"b" ∧ v₂~2)
```

Variables unify across all clauses in the usual way, so `{ $x=1  y=$x }` implies `y=1`.
This semantics is now the baseline for all object patterns, including those nested inside negations.

---

### 4. Interaction of Negation and Variables

Variables appearing inside `(?! Q)` participate in unification **bidirectionally**:

* If a variable is already bound, the negation checks whether that binding would produce a forbidden match.
* If a variable is unbound, the negation restricts its possible values so that none would make Q true.

This gives the correct behavior for cases like `{ (?! _=$x)  $x=_ }`:
the pattern fails precisely when `$x` would equal any existing value in the object.

Implementations should treat such negations as **constraints** over variables rather than immediate tests.
Evaluation order must not affect correctness.

---

### 5. Future Work — Constraint Propagation Engine

#### Motivation

While the declarative semantics are clear, the naïve recursive-descent implementation is insufficient when variable dependencies are circular or bidirectional. For example, the pattern `{ (?! _=$x)  $x=_ }` requires the negation to restrict `$x` before `$x` is fully bound.

#### Recommendation

Introduce a minimal **constraint propagation layer** to handle these dependencies efficiently:

* Represent each `(?! Q)` as a **reified anti-join constraint** recording the variables it depends on.
* Maintain **watchlists** so that whenever one of those variables becomes more specific, the engine re-evaluates the constraint.
* Use simple **domain inference** (finite candidate sets or type tags) derived from positive matches to prune impossible bindings early.

This “tiny constraint store” provides bidirectional consistency without the complexity of a full logic-programming engine such as miniKanren.
It preserves performance for simple cases while remaining sound for patterns with intertwined negations.

---

### Expected Benefits

* Eliminates order-dependence between object terms.
* Allows negations containing variable references.
* Provides a single, uniform model for `$` and `@` bindings.
* Establishes a clear path toward partial constraint solving without overhauling the runtime.

---

### Implementation Status

This change affects only **semantics** and the **evaluator**, not the surface grammar.
Existing tests using `K=V`, `@x`, `$x`, or `(?! …)` will continue to parse.
However, match results may differ where prior behavior depended on evaluation order or failed to bind variables within negations.

---

**End of Change Request**
