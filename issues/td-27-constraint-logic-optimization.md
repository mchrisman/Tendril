# TD-27: Constraint Logic Programming Optimization

## Summary

Evolve Tendril's engine from recursive-descent backtracking toward a constraint logic programming (CLP) model, borrowing ideas from miniKanren, Prolog, and dataflow constraint solvers.

## Motivation

The current recursive-descent evaluator is:
- Correct for small patterns
- Easy to reason about
- But inefficient for:
  - Multiple variables interacting across branches
  - Negations that depend on deferred variable bindings
  - Combinatorial explosion from exploring unpruned alternatives

We want to move toward a model that:
- Prunes early using variable-domain information
- Propagates constraints automatically in both directions
- Still works on small embedded data structures (not an external database)

## Proposed Optimizations

### 1. Reified Disequality Constraints

Represent `(?! Q)` as explicit constraint objects:
```
⟨constraint_id, predicate: Q, vars: [x,y,...], state: pending⟩
```

Whenever a variable unifies or its domain narrows, re-evaluate Q in check-only mode. If Q becomes satisfiable, fail immediately.

### 2. Constraint Propagation (Domain Narrowing)

Keep finite domains for each variable — sets of candidate values inferred from the data. On unification, intersect domains; if empty, fail early.

### 3. Goal Reordering and Delayed Execution

Treat every clause as a goal object with cost estimates or variable dependencies. Reorder execution dynamically — prioritize constraints that can already prune.

### 4. Memoization of Subgoals

Cache `(pattern, env) → result` for repeated subpattern checks, especially for `(..)` expansions.

### 5. Anti-Join Indexing

For object negations `(?! K=V)`, pre-index object keys/values once per object match, then reuse for O(1) witness checks.

## Implementation Roadmap

**Phase 1 — Reified Constraints**
- Represent `(?! …)` and equality/disequality as constraint objects
- Maintain watchlists for variable dependencies
- Recheck incrementally on each unification

**Phase 2 — Domain Propagation**
- Track domains for variables
- Apply narrowing rules on unification and negation
- Fail branches when domains empty out

**Phase 3 — Goal Scheduling**
- Move from recursive descent to a queue of goals
- Implement worklist algorithm (interleaved search)

**Phase 4 — Full Relational Kernel (optional)**
- Factor engine into "goals," "substitutions," and "constraints"
- Adopt miniKanren-like combinators (`conj`, `disj`, `fresh`, `negate`)

## Expected Gains

| Capability | Current | With CLP kernel |
|------------|---------|-----------------|
| Negations with variables | Deferred / partial | Fully bidirectional |
| Circular dependencies | Often late failure | Early constraint pruning |
| Complex conjunctions | Order-sensitive | Order-invariant |
| Search efficiency | Exponential | Linear or subexponential for many cases |

## Why miniKanren over Prolog?

Prolog is overkill. Tendril operates on concrete structured data (JSON-like), not symbolic predicates. We only need local unification, constraint checking, and controlled nondeterminism — the lower 10% of Prolog's power.

miniKanren's approach — purely functional, embedded, easily memoized — is a better fit. A minimal core could be under 300 lines.

## Notes

- No syntax changes required, only runtime optimization
- Can use JavaScript generators or async for goal scheduling
- Each `(?! …)` or quantifier expansion can yield subgoals lazily

## Related

- TD-26: Guards on group bindings (uses deferred guard infrastructure)
- Current deferred guard system in `tendril-engine.js`
