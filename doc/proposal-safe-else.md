


Proposal and original requirement: introduce 'A else B' as preferred alternation. Make sure the semantics are consistent with the use case: "I want to parse scheme A, but if scheme A is not found, I want to fall back to parsing scheme B (legacy); But never treat it as B if it could be A. "

The semantics should also support its use as categorization in future: `{ K:(V1 else V2) }` should effectively partition the object's fields into a V1 bucket and a V2 bucket, which we can then capture as slices.

---------------------------------

Everything below this line is not an original requirement, but is a proposed clarification of the semantics.  Is it consistent?

---

## `(A else B)` — Declarative Semantics and Implementation Guidance

### Purpose

`(A else B)` is a **prioritized disjunction** with exclusion:
**B is allowed only when A does not apply.**
This exclusion is semantic, not procedural, and must be independent of evaluation order.

The construct must behave predictably under conjunction with other patterns and must not depend on left-to-right matching order.

---

## Declarative Meaning

For any complete solution assignment `S` (i.e. a candidate variable environment for the whole pattern):

> `(A else B)` is satisfied under `S` **iff**
>
> * either `A` is satisfied under `S`,
> * or `B` is satisfied under `S` **and** `A` is *not* satisfied under `S`.

Equivalently:

```
(A else B)  ≡  A  ∪  (B \ A)
```

This is **set subtraction on solutions**, not backtracking control, and not a cut.

Important consequences:

* `(A else B)` is **not symmetric**
* `(A else B)` is **commutative with respect to surrounding conjuncts**
* `(A else B)` does **not** depend on which variables were bound “earlier”

---

## Interface Variables (Critical Concept)

To make the above definition implementable and order-independent, `(A else B)` operates relative to a fixed set of **interface variables**.

### Definition

Let:

* `FV(P)` = free variables appearing in pattern `P`
* `P = (A else B)`
* `Context = the whole pattern excluding P`

Then the **interface variables** of `(A else B)` are:

```
I = FV(P) ∩ FV(Context)
```

These are the variables visible to and constrained by the rest of the pattern.

All other variables appearing only inside `A` or `B` are **local** to those branches.

---

## Operational Interpretation (What to Implement)

You can think of `(A else B)` as producing a set of **projected solutions** over the interface variables.

Given an incoming environment `E` (possibly partial):

1. **Enumerate all solutions of `A` extending `E`.**

    * For each solution, project it onto interface variables `I`.
    * Let this set be `SA`.

2. **Enumerate all solutions of `B` extending `E`.**

    * Project each onto `I`.
    * Let this set be `SB`.

3. **Resulting solutions of `(A else B)` are:**

   ```
   SA  ∪  (SB − SA)
   ```

   where subtraction is by equality on interface variables only.

Key rules:

* Local variables introduced inside `A` or `B` **must not leak**.
* Interface variables **must leak** (they participate in joins with the rest of the pattern).
* If `A` matches for a given interface assignment, `B` is ignored for that assignment — even if `A` would later fail to join with other terms.

---

## Why This Is Order-Independent

Because:

* The definition depends only on **sets of solutions**, not evaluation sequence.
* Interface variables are computed **statically** from the AST, not dynamically from binding order.
* `(A else B)` is evaluated as a self-contained operator that returns a set of admissible interface assignments.

Therefore:

```tendril
{ q:(A else B)  p:$x }
{ p:$x  q:(A else B) }
```

must yield identical results.

---

## Constraints and Non-Goals

* `(A else B)` is **not** a procedural “fallback.”
* It is **not** allowed to backtrack into `B` once `A` applies for a given interface assignment.
* It does **not** require or imply universal quantification.
* It must work under full solution enumeration (`solutions()`), not only under `hasMatch`.

---

## Implementation Notes

* This is easiest to implement if patterns already enumerate solutions as environments.
* You will need:

    * a way to **project environments** to a subset of variables,
    * and a way to compare projected environments for equality.
* You do **not** need to modify core matching logic; `(A else B)` can be implemented as a combinator over solution sets.
* Optimizations (short-circuiting, pruning with bound interface vars) remain valid and safe.

---

## Summary in One Sentence

> `(A else B)` means “use `A` wherever it applies; otherwise use `B`,” where applicability is determined **per interface variable assignment**, not by evaluation order and not by backtracking behavior.

### Interop with optimizations (what the implementer must preserve)

`(A else B)` is a *solution-set combinator* with **preclusion by interface-projection**, so most optimizations still apply, but a few need guardrails.

1. **Compute interface vars once, statically.** For each Else node `E = (A else B)`, precompute
   `I = FV(E) ∩ FV(context-outside-E)`. This is what makes Else order-independent and join-friendly.

2. **Projection is the contract.** Else must:

* *keep* bindings for vars in `I` (“globals” for this Else),
* *drop* branch-local bindings (vars not in `I`) before results escape the Else node.

3. **Fast path when `I` is fully bound by the incoming env.** If every var in `I` already has a value in the incoming solution, you can evaluate Else without buffering:

* try to match `A` under the env; if it yields any solution consistent with `I`, commit to `A` and skip `B` entirely,
* otherwise try `B`.

This is the key pruning behavior for joins.

4. **General path requires buffering (but only projections).** When `I` is not fully bound:

* enumerate `A` and store **only** `project_I(env)` in a set (plus maybe one representative env if you need to emit full envs later),
* enumerate `B`, and emit only those solutions whose `project_I` is **not** present in the `A`-projection set.

You do *not* have to store full solutions if locals are dropped anyway.

5. **Short-circuit APIs remain valid.**

* `matchExists` / `hasMatch`: evaluate `A` first; if any admissible interface projection exists, you can return true immediately without looking at `B`.
* `matchFirst`: you may return the first solution from `A` if any exist; only if `A` has no solutions do you consider `B`.
  This preserves the “A preferred” contract and improves performance.

6. **“Later join fails” must not resurrect B for the same interface assignment.** That’s not a runtime “cut,” it’s a semantic constraint: once an interface projection is in `A`, `(A else B)` must not produce `B` solutions with that same projection—*even if* those `A` solutions don’t extend to a full match after other terms are conjoined. Your optimizer must not “delay” the else decision past conjunction in a way that violates this.

---

### Edge-covering test cases

Below, “solutions” means the set of environments *visible outside the Else*, i.e. after dropping non-interface locals. I’m writing expectations in terms of `hasMatch()` and/or `solutions([...])` style.

#### 1) Baseline: A wins, B ignored

```js
data = 2
pat = "($x=2 else $x=3)"
// Expect: hasMatch true, solutions => [{x:2}]
```

#### 2) Baseline: A fails, B used

```js
data = 3
pat = "($x=2 else $x=3)"
// Expect: solutions => [{x:3}]
```

#### 3) Order-independence under conjunction (your earlier example)

```js
data = {p:1, q:2}

pat1 = "{ p:$x  q:($x else 2) }"
pat2 = "{ q:($x else 2)  p:$x }"
// Expect: both succeed with {x:1}
```

#### 4) Preclusion even if A can’t join later (critical “don’t resurrect B”)

```js
data = { q:2, r:99 }

// A can match q and bind x=2; later term forces x=1, so whole match should fail.
// But B must NOT be tried for x=1 in a way that makes the whole thing succeed.
pat = "{ q:($x else 2)  r:99  (! ($x=1))  ($x=1) }"
// The last ($x=1) is just “force x=1” in your syntax style; any equivalent constraint is fine.
// Expect: overall FAIL (no solutions). If it succeeds, you accidentally allowed “fallback after join failure.”
```

(Use whatever constraint form you have available to force `x=1` after the else; the point is: A matches for some interface projection, then the rest kills it, and B must not revive that projection.)

#### 5) Local bindings do not leak

```js
data = 1
pat = "(($a=1) else ($b=1))"
// If neither a nor b appears outside this Else, interface is empty.
// Expect: hasMatch true, and externally-visible bindings are {} (no a, no b).
```

#### 6) Interface bindings do leak (join variable survives)

```js
data = {p:1, q:1}
pat = "{ p:$x  q:($x else 2) }"
// Expect: {x:1}  (x is interface via p:$x)
```

#### 7) B allowed for interface projections where A has none

```js
data = {q:2}
pat = "{ q:(($x=1) else ($x=2)) }"
// Here x is interface only if observed outside; assume solutions(["x"]).
// Expect: solutions => [{x:2}]
```

#### 8) Multiple A-solutions with same interface projection: B still excluded

```js
data = ["a","a"]
pat = "[ .. ( ($x=/a/ ($t=_)) else ($x=/a/ ($u=_)) ) .. ]"
// Arrange so A produces two different locals t but same interface x="a".
// Expect: B produces nothing with x="a" (even though B would match), because projection x="a" is present in A.
```

(Any construction that gives multiple A solutions differing only in locals is fine.)

#### 9) A and B produce disjoint interface projections: union should appear

```js
data = [1,2]
pat = "[ .. ( ($x=1) else ($x=2) ) .. ]"
// Expect: solutions => [{x:1},{x:2}] depending on occurrences; crucially, x=2 is not excluded because A has no x=2.
```

#### 10) Else inside alternation vs alternation inside else (precedence sanity)

```js
data = 2
pat1 = "((1|2) else 3)"
pat2 = "(1 | (2 else 3))"
// Expect: pat1 matches via A, pat2 matches via second alt; ensure parser/precedence matches spec.
```

#### 11) Nested else: exclusion composes by interface projections

```js
data = 2
pat = "((($x=1 else $x=2) else $x=3))"
// Expect: x=2 (inner else selects 2; outer else sees A has x=2 so excludes 3 for x=2).
```

#### 12) Interaction with positive lookahead (bindings that *do* escape)

```js
data = 1
pat = "((?($x=1)) ($x else 2))"
// Expect: succeeds with x=1. Lookahead binds x=1; else sees interface bound and must choose A quickly.
```

#### 13) Interaction with negative lookahead (bindings never escape)

```js
data = 2
pat = "((!($x=1)) ($x else 2))"
// Expect: x should not be bound by the negative lookahead; else should bind/choose normally -> x=2 if $x is in interface/output.
```

#### 14) Short-circuit behavior (matchFirst prefers A)

```js
data = 2
pat = "($x=2 else $x=2)"
// matchFirst should return the A-branch solution, not B, even though equal.
```
