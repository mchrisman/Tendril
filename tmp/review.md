 
## Revised Bugs & Gaps Report (Post-Label Design)

This report assumes the clarified semantics:

* Buckets are scoped **per field clause instance**
* Buckets are **branch-local** and participate in backtracking
* Aggregation target is:

    * explicitly named by a label (`^L`), or
    * otherwise the nearest enclosing OBJ/ARR AST node
* Labels (for now) may appear only on OBJ or ARR nodes
* Buckets are always **object slices**
* Default collision policy: **fail the branch**

---

## A. Definite Correctness Bugs (Independent of Labels)

These are bugs even if labels did not exist.

### Bug A1 — Bucket state is merged across branches (violates backtracking)

**Symptom**
Bucket contents are currently merged across multiple solution branches at finalization time. This causes:

* values from failed branches to appear in successful ones
* collisions to be masked or manufactured

**Why this is wrong**
Buckets are semantic state. Like bindings, they must:

* be cloned on branch
* be discarded when a branch fails
* never be merged across independent existential witnesses

**Minimal failing test**

```js
pattern: { k:(1 -> @b | 2 -> @b) }
data:    { k:1 }

Expected: { b:{k:1} }
Buggy:    { b:{k:1,k:2} }   // leaked from failed branch
```

---

### Bug A2 — Bucket finalization happens at the wrong structural boundary

**Symptom**
Buckets are finalized at “object end” or across multiple clause instances instead of per field clause instance.

**Why this is wrong**
Each `K:V` clause instance is an independent aggregation scope. Finalization must occur:

* after all witnesses of that clause have been processed
* before control returns to a parent clause

**Minimal failing test**

```js
pattern: { a:(1->@b), c:(2->@b) }
data:    { a:1, c:2 }

Expected failure (collision: same key-space)
Buggy behavior: silent overwrite or merge
```

---

### Bug A3 — Collision detection is late or ineffective

**Symptom**
Collisions are either not detected or detected after branches are merged.

**Why this is wrong**
Collision detection must be:

* branch-local
* eager (or at least deterministic)
* a hard failure by default

**Minimal failing test**

```js
pattern: { x:(1->@b), x:(2->@b) }
data:    { x:1 }

Expected: no match (collision on key "x")
Buggy:    { b:{x:2} } or nondeterministic result
```

---

## B. Bugs Exposed Once Labels Exist (but caused by current engine behavior)

These will surface immediately once labels are implemented.

### Bug B1 — Nested clause aggregation ignores intended target

**Symptom**
Nested `->` aggregates to the nearest clause rather than the intended ancestor, even when no ambiguity exists.

**Example**

```tendril
$key:{ name:($n->@names) }
```

Expected (conceptually): one bucket aggregated across `$key`
Actual: N buckets, one per nested clause instance

**Root cause**
Aggregation target selection is purely structural and not overrideable.

**Resolution**
Labels must bind aggregation target to a specific OBJ/ARR AST node.

---

### Bug B2 — Aggregation behavior depends on incidental AST shape

**Symptom**
Refactoring with parentheses or object grouping changes aggregation semantics.

**Why this is bad**
Aggregation should depend on *intent* (label or nearest meaningful container), not formatting.

**Minimal failing example**

```tendril
{ k:{ v:(1->@b) } }   // behaves differently from
{ k:( {v:1} ->@b ) }
```

---

## C. Design Gaps (Not Bugs, but Must Be Decided Now)

These are not implementation errors, but unresolved semantics that block test stabilization.

### Gap C1 — Exact definition of aggregation key

Must be specified as:

* object: concrete object key witness
* array: concrete array index witness

Not key patterns, breadcrumbs, or bound variables.

---

### Gap C2 — Timing of collision failure

Choose and document one:

* eager (preferred; simpler and safer)
* finalize-time

Tests depend on this choice.

---

### Gap C3 — Label resolution timing

Labels should be:

* resolved at compile time
* globally unique per code unit (for now)
* attached as annotations to AST nodes

This must happen before any engine bugfix work.

---

## D. Non-Bugs (Things That Are Correct but May Look Wrong)

Important to avoid “fixing” these accidentally.

* Buckets always produce **object slices**, even for arrays
* Order is not preserved
* Multiple flows into same bucket are allowed *only if keys are disjoint*
* Absence of label ⇒ nearest enclosing OBJ/ARR

---

## E. Implication for Work Plan

Because:

* A-class bugs require bucket refactoring
* B-class bugs cannot be tested without labels
* C-class gaps affect test expectations

**Conclusion:**
Bucket correctness must be implemented **against a label-aware target model**, even if labels are initially inert.

This suggests the work plan:

1. Implement labels as AST annotations + resolver
2. Fix bucket scoping, cloning, finalization, collision
3. Enable label-directed aggregation
4. Stabilize and extend regression suite
