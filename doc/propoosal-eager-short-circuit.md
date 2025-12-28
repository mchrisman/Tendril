
# Proposal: Short-circuiting `hasMatch()` / `first()` + `once(P)` operator

## Goals

1. **Make `hasMatch()` and `first()` short-circuit** without changing matching semantics (i.e., still do the necessary backtracking; stop only after a full solution is found).

2. Add **`once(P)` operator** — a general-purpose local cut that:
   * Evaluates subpattern `P` and emits **at most one solution**
   * **Prevents backtracking** into `P` to find alternative solutions
   * Mirrors Prolog's `once/1` semantics exactly

## Non-goals

* No global cut/atomic semantics beyond the `once` scope.
* No promise of solution ordering ("first" remains "first in current engine exploration order").
* No attempt to fully stream *all* solutions through the public API yet (only to short-circuit in `hasMatch()` / `first()`).

---

# Part 1: Short-circuiting `hasMatch()` and `first()`

## Rationale

Today, `match()`/`scan()` in `tendril-engine.js` fully enumerate solutions into arrays. That means:

* `hasMatch()` pays full enumeration cost.
* `first()` pays full enumeration cost.

We can stop as soon as the engine **emits the first complete solution** (i.e., when `emit(sol)` is called at the top level).

## Approach: Sentinel exception for early termination

This is the smallest change that:

* preserves correctness (still explores backtracking paths until success),
* supports early stop for both anchored match and scan,
* and is easy to evolve into cancellation tokens later without changing the external API.

### Engine changes (`tendril-engine.js`)

Add an internal sentinel:

```js
class StopSearch extends Error {
  constructor(payload) { super('StopSearch'); this.payload = payload; }
}
```

Add internal helpers:

* `matchFirst(ast, input, opts) -> rawSolution | null`
* `matchExists(ast, input, opts) -> boolean`
* `scanFirst(ast, input, opts) -> rawSolution | null`
* `scanExists(ast, input, opts) -> boolean`

Each helper calls the existing matcher with an `emit` that throws `StopSearch` on first emission:

```js
export function matchExists(ast, input, opts = {}) {
  const ctx = makeCtx(opts);
  try {
    matchItem(ast, input, [], newSolution(), () => { throw new StopSearch(true); }, ctx);
    return false;
  } catch (e) {
    if (e instanceof StopSearch) return true;
    throw e;
  }
}

export function matchFirst(ast, input, opts = {}) {
  const ctx = makeCtx(opts);
  try {
    matchItem(ast, input, [], newSolution(), (sol) => { throw new StopSearch(sol); }, ctx);
    return null;
  } catch (e) {
    if (e instanceof StopSearch) return e.payload; // raw sol
    throw e;
  }
}
```

Do the same for `scan*` by wrapping `scanValue` similarly and letting `StopSearch` bubble out (do **not** catch it inside recursion).

### API changes (`tendril-api.js`)

Implement these fast paths:

* `PatternImpl.match(input).hasMatch()` should call `matchExists` instead of materializing.
* `PatternImpl.find(input).hasMatch()` should call `scanExists`.
* `PatternImpl.first(input)` should use `scanFirst` to stop scanning early.

**Minimal viable:** keep current `MatchSet` materialization for everything, but add *new* convenience methods on `PatternImpl`:

* `PatternImpl.hasMatch(input)` (anchored)
* `PatternImpl.hasAnyMatch(input)` (scan)
* `PatternImpl.firstMatch(input)` (scan first match)

Then update call sites of `.hasMatch()` / `.first()` to use those. (This avoids refactoring `MatchSet` immediately.)

### Future-proofing note

This exception-based stop is intentionally localized:

* Later you can replace it with a `ctx.cancelled` token or "emit returns boolean" without changing semantics.
* Planning/reordering/memoization optimizations are not blocked by this.

## Tests to add

* `hasMatch()` returns true for cases where success is *not* on the first local branch (prove we didn't "freeze at first branch point").
* `first()` returns a valid match and does not traverse the full tree (can assert by step counter: `ctx.steps` stays under a small bound for a constructed input).
* `find().first()` stops scanning after first match (again via step counter or instrumentation).

---

# Part 2: `once(P)` operator

## Semantics

`once(P)` mirrors Prolog's `once/1`:

* Evaluate subpattern `P`
* Emit **at most one solution** (the first one found)
* **Prevent backtracking** into `P` — once we've either emitted a solution or exhausted `P`, we're done with this `once` scope
* Each fresh entry into `once(P)` (due to backtracking past it) gets its own independent scope

This is a **local cut**: it prevents backtracking *into* P, but not backtracking *past* the `once(P)` node.

**Trade-off:** This can cause matches to fail that would succeed with exhaustive search. If the first witness from `P` leads to failure downstream, but a later witness would have succeeded, `once(P)` will miss that solution. This is the explicit trade of completeness for performance.

## Use cases

1. **Preventing combinatorial explosion in key bindings:**
   ```
   { once($a):1  once($b):1  once($c):1 }
   ```
   Without `once`, this is O(n³) for n keys. With `once`, it's O(n).

2. **Finding a representative instance:**
   When you need *a* solution, not *all* solutions. "Give me any user who matches this criteria."

3. **Eager scalar binding:**
   ```
   $x=(once(pattern))
   ```
   Binds `x` to the first match of `pattern`, doesn't enumerate alternatives.

4. **Committing to first alternative:**
   ```
   once(A | B | C)
   ```
   Try alternatives in order, take the first success, don't enumerate all successful branches.

## Syntax

`once` is a general-purpose pattern operator, not special binding syntax:

* `once(P)` — anywhere a pattern is expected
* `$x=(once(P))` — eager binding (regular binding with once-wrapped pattern)
* `{ once($k):V }` — eager key binding
* `once(A|B)` — first successful alternative only

No whitespace restrictions needed — `once(` is just a keyword followed by `(`.

## Implementation

### Tokenizer changes (`microparser.js`)

Add `once` as a keyword. When followed by `(`, it begins a `once` expression.

### Parser changes (`tendril-parser.js`)

In `parseItemTerm` (and array/object contexts as needed):

```js
if (p.peek('once') && p.peekAhead(1, '(')) {
  p.eat('once');
  p.eat('(');
  const pat = parseItem(p);
  p.eat(')');
  return { type: 'Once', pat };
}
```

### AST

New node type:
```js
{ type: 'Once', pat: <pattern> }
```

### Engine changes (`tendril-engine.js`)

In `matchItem`:

```js
case 'Once': {
  let done = false;
  matchItem(item.pat, node, path, sol, (s2) => {
    if (done) return;
    done = true;
    emit(s2);
  }, ctx);
  return;  // crucial: exit after matchItem completes, no further exploration
}
```

The `return` after `matchItem` is essential — it ensures we don't continue exploring alternatives in `item.pat` after the first solution (or after exhaustion).

### Key-binding contexts

In object key iteration (`navigateSingleBreadcrumb`, `navigateSkipLevels`, etc.), if the key pattern is wrapped in `Once`, the iteration should respect the once semantics — but this should happen automatically if the key pattern goes through `matchItem`.

If key patterns are handled specially (direct iteration without matchItem), ensure `Once` nodes are recognized and handled with the same "first solution only, no backtracking" logic.

## Tests to add

1. **Basic truncation:**
   * `once(_|_)` yields one solution where `(_|_)` yields multiple
   * `$x=(once(pattern))` binds once vs `$x=(pattern)` binds multiple times

2. **Backtracking prevention:**
   * Pattern where first witness fails downstream but second would succeed
   * Confirm `once` version fails, non-once version succeeds
   * This proves `once` actually prevents backtracking, not just truncates output

3. **Key binding:**
   * `{ once($k):1 }` on object with multiple keys matching — only one solution
   * `{ $a:1 $b:1 }` vs `{ once($a):1 once($b):1 }` — O(n²) vs O(n) solutions

4. **Fresh scope on re-entry:**
   * Pattern like `(A | B) once(C)` where backtracking from A to B causes fresh entry into `once(C)`
   * Confirm each entry gets independent "once" behavior

5. **Composition:**
   * `once(once(P))` — should behave same as `once(P)`
   * `once($x=(P))` — eager binding via wrapping

---

# Design rationale

## Why `once` instead of `eager`, `first`, `hasty`, etc.?

* **`once`** directly describes the backtracking behavior: "this pattern runs once per entry"
* It's established terminology from Prolog with well-understood semantics
* It's about control flow (preventing re-entry), not just output cardinality

## Why a general operator instead of binding-specific syntax?

* **One concept instead of two** — no "eager binding" vs "once operator" distinction
* **Composable** — works anywhere, not just in binding position
* **Same implementation complexity** — wrapping emit is the same either way
* **Cleaner** — `$x=(once(P))` is regular binding with a once-wrapped pattern

## Relationship to cut

`once(P)` is a scoped/local cut. It differs from Prolog's general `!` (cut):

* `once(P)` only prevents backtracking *into* P
* Prolog's `!` prevents backtracking to any choice point before it in the clause

If a general cut is added later, `once` remains useful as a more surgical tool. They're complementary, not competing.
