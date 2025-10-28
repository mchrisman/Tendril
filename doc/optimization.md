Here’s a companion **Design Memo: Future Optimization Directions for Tendril’s Logical Core**, written for the same developer audience — practical, technical, and focused on what we can actually build and evolve toward.

---

## Design Memo: Future Optimization and Execution Model

*(For Tendril’s constraint and unification engine)*

### Summary

While the current evaluator behaves like a recursive-descent matcher with unification and constraint checks, it will eventually need a more principled execution model. The declarative semantics introduced in the latest revision (object existential logic, anti-join negation, and variable propagation) point directly toward **constraint logic programming (CLP)**.

This memo outlines how we can evolve Tendril incrementally toward that model — borrowing ideas from **miniKanren**, **Prolog**, and **dataflow constraint solvers** — without abandoning its lightweight design or JSON-native domain.

---

### 1. The Baseline Problem

The current recursive-descent evaluator is:

* Correct for small patterns,
* Easy to reason about, but
* **Inefficient and incomplete** for problems involving:

    * multiple variables interacting across branches,
    * negations that depend on deferred variable bindings,
    * combinatorial explosion from exploring unpruned alternatives.

Right now, Tendril relies on *procedural backtracking*: it tries, fails, and backtracks.
That approach quickly becomes exponential when terms are unordered (as in objects) or when negations delay failure until late in the search.

We want to move toward a model that:

* **prunes early**, using variable-domain information,
* **propagates constraints** automatically in both directions, and
* still works on small embedded data structures (not an external database).

---

### 2. Why MiniKanren Is a Good Fit

**miniKanren** is a family of relational programming systems built around a tiny, purely functional core.
It provides:

* first-class *logic variables* (unification without assignment),
* *goal constructors* (conjunction, disjunction, negation),
* and *delayed, interleaved search* that can explore infinite spaces safely.

Tendril already has similar primitives:

* logic variables (`$x`, `@x`),
* conjunction/disjunction (`{ ... }` and `|`),
* and negation (`(?! …)`).

The missing pieces are:

* a central **goal store** (list of pending logical goals),
* a **constraint store** (inequalities, anti-joins, type restrictions),
* and a **scheduler** to interleave evaluation of pending goals.

miniKanren’s simplicity makes it a good conceptual model even if we don’t embed its full interpreter.

---

### 3. Key Optimization Ideas to Borrow

#### a. **Reified Disequality Constraints**

Instead of “re-checking negations later,” represent `(?! Q)` as a **reified constraint** stored in the environment:

```
⟨constraint_id, predicate: Q, vars: [x,y,...], state: pending⟩
```

Whenever a variable unifies or its domain narrows, the engine re-evaluates Q in a non-committing (check-only) mode.
If Q becomes satisfiable, that branch fails immediately.

This transforms negation from a procedural test into a declarative, incremental filter — a standard miniKanren trick.

#### b. **Constraint Propagation (“narrowing”)**

Keep finite *domains* for each variable when possible — sets of candidate values inferred from the data.
Whenever two domains are unified, take their intersection; if it becomes empty, fail early.
This requires adding lightweight metadata (domains, types, and provenance) to variable bindings.

#### c. **Goal Reordering and Delayed Execution**

In recursive-descent order, the engine may try expensive matches before simpler ones.
By treating every clause as a *goal object* with cost estimates (or variable dependencies), we can reorder execution dynamically — similar to miniKanren’s “interleaving search.”

Example:
When `{ (?! _=$x)  $x=_ }` appears, evaluate `$x=_` lazily; give priority to constraints that can already prune (like `(?! …)` with known domains).

#### d. **Memoization of Subgoals**

Since many Tendril patterns repeatedly check identical subpatterns on overlapping data (e.g., `(..)` expansions), memoizing partial matches saves redundant work.
miniKanren’s `conde` can reuse solved subgoals; we can mimic that with a `(pattern, env) → result` cache.

#### e. **Logical Tabling / Anti-Join Indexing**

For object negations `(?! K=V)`, pre-index object keys/values once per object match, then re-use that index across all negations.
This gives O(1) witness checks for anti-joins, instead of scanning each time.

---

### 4. Intermediate Implementation Strategy

We don’t need to reimplement miniKanren wholesale.
A pragmatic roadmap:

1. **Phase 1 – Reified Constraints (current target)**

    * Represent `(?! …)` and equality/disequality as explicit constraint objects.
    * Maintain watchlists for variable dependencies.
    * Recheck incrementally on each unification.

2. **Phase 2 – Domain Propagation**

    * Track domains for variables.
    * Apply narrowing rules on unification and negation.
    * Fail branches when domains empty out.

3. **Phase 3 – Goal Scheduling**

    * Move from recursive descent to a queue of goals.
    * Implement a simple worklist algorithm (interleaved search).

4. **Phase 4 – Full Relational Kernel (optional)**

    * Factor the engine into “goals,” “substitutions,” and “constraints.”
    * Adopt miniKanren-like combinators (`conj`, `disj`, `fresh`, `negate`) to structure evaluation internally.

At each phase, Tendril’s external syntax and semantics remain stable.

---

### 5. Expected Gains

| Capability                               | Current            | With miniKanren-style kernel            |
| ---------------------------------------- | ------------------ | --------------------------------------- |
| Negations with variables                 | Deferred / partial | Fully bidirectional                     |
| Circular dependencies                    | Often late failure | Early constraint pruning                |
| Complex conjunctions                     | Order-sensitive    | Order-invariant                         |
| Search efficiency                        | Exponential        | Linear or subexponential for many cases |
| Implementation complexity                | Low                | Moderate but manageable                 |
| Extensibility (new constraints, domains) | Limited            | Pluggable                               |

---

### 6. Why Not Full Prolog?

Prolog is overkill for Tendril’s domain.
Its full backtracking engine and clause database model are unnecessary.
Tendril operates on *concrete structured data* (JSON-like objects), not symbolic predicates.
We only need local unification, constraint checking, and controlled nondeterminism — the *lower 10%* of Prolog’s power but with a modern, data-centric focus.

miniKanren’s approach—purely functional, embedded, and easily memoized—is a better conceptual fit.

---

### 7. Implementation Notes

* A minimal miniKanren-like core could fit in **under 300 lines** in a functional style.
* Because Tendril is host-language–agnostic, the implementation can use a lightweight goal monad or coroutine system in the runtime language (e.g., JavaScript generators, Python async).
* Each `(?! …)` or quantifier expansion can yield subgoals lazily into this engine.

---

### 8. Long-Term Vision

If we pursue these optimizations fully, Tendril will effectively become a **constraint logic query language for structured data** — declarative, compositional, and performant.
Developers could then:

* use it for advanced pattern-matching,
* build relational data extractions,
* or compose JSON transformations in purely logical form.

The long-term goal is to keep Tendril’s syntax simple while allowing the runtime to behave like a small, optimized logic solver under the hood.

---

### Conclusion

MiniKanren provides the right conceptual foundation for Tendril’s next stage.
By adopting its core ideas—reified constraints, goal interleaving, and domain propagation—we can eliminate order dependence, support full bidirectional logic, and scale to complex data patterns efficiently.

The implementation can evolve gradually: start with constraint objects and watchlists, then grow toward a full relational kernel.
No syntax changes are required, only a more declarative and optimized runtime.

---

**End of Design Memo**
