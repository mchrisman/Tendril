
# Proposal: Short-circuiting `hasMatch()` / `first()` + eager scalar binding

## Goals

1. **Make `hasMatch()` and `first()` short-circuit** without changing matching semantics (i.e., still do the necessary backtracking; stop only after a full solution is found).

2. Add **eager scalar binding** syntax:

* `"$x=eager(PATTERN)"` behaves like `"$x=(PATTERN)"` except it **takes at most one witness** for that binding.
* It is a **fixed idiom with no whitespace/comments** inside the operator token: `=eager(` must be contiguous.

## Non-goals

* No global cut/atomic semantics beyond the binding site.
* No promise of solution ordering (“first” remains “first in current engine exploration order”).
* No attempt to fully stream *all* solutions through the public API yet (only to short-circuit in `hasMatch()` / `first()`).

---

# Part 1: Short-circuiting `hasMatch()` and `first()`

## Rationale

Today, `match()`/`scan()` in `tendril-engine.js` fully enumerate solutions into arrays. That means:

* `hasMatch()` pays full enumeration cost.
* `first()` pays full enumeration cost.

We can stop as soon as the engine **emits the first complete solution** (i.e., when `emit(sol)` is called at the top level).

## Approach (recommended): Sentinel exception for early termination

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
* `PatternImpl.first(input)` should use `scanFirst` to stop scanning early, then (optionally) create a `MatchSet` containing only the first match group.

**Minimal viable:** keep current `MatchSet` materialization for everything, but add *new* convenience methods on `PatternImpl`:

* `PatternImpl.hasMatch(input)` (anchored)
* `PatternImpl.hasAnyMatch(input)` (scan)
* `PatternImpl.firstMatch(input)` (scan first match)

Then update call sites of `.hasMatch()` / `.first()` to use those. (This avoids refactoring `MatchSet` immediately.)

### Future-proofing note

This exception-based stop is intentionally localized:

* Later you can replace it with a `ctx.cancelled` token or “emit returns boolean” without changing semantics.
* Planning/reordering/memoization optimizations are not blocked by this.

## Tests to add

* `hasMatch()` returns true for cases where success is *not* on the first local branch (prove we didn’t “freeze at first branch point”).
* `first()` returns a valid match and does not traverse the full tree (can assert by step counter: `ctx.steps` stays under a small bound for a constructed input).
* `find().first()` stops scanning after first match (again via step counter or instrumentation).

---

# Part 2: `$x=eager(pattern)` scalar binding

## Semantics

`$x=eager(P)` means:

* Evaluate subpattern `P` at the binding site.
* If `P` can produce multiple successful bindings for `$x`, **take only the first one** (in exploration order) and do not enumerate further alternatives *for that binding site*.
* Unification still applies: if `$x` is already bound, this is effectively a validation (first success or fail).

This is a deliberate trade: **can miss solutions** if the first witness later causes failure but a later witness would succeed.

This is exactly the “trading completeness for speed” feature.

## Syntax + whitespace rule

There is no white space inside this operator, which is a fixed idiom. It makes the feature unmistakable (“this is an eager binding operator”) and avoids ugly ambiguity / precedence questions.

So:

* ✅ `$x=eager(P)`
* ❌ `$x = eager (P)`
* ❌ `$x= eager(P)`
* ❌ `$x=eager (P)`

### Implementation detail: tokenize `=eager(` as a single token

This is the cleanest way to enforce the “fixed idiom” rule without needing token end-positions.

#### Tokenizer changes (`microparser.js`)

In the tokenizer, before single-char operators, add:

```js
if (src.slice(i, i + 7) === '=eager(') {
  push('=eager(', '=eager(', 7);
  continue;
}
```

(And optionally support `=hasty(` etc later the same way, but not now.)

#### Parser changes (`tendril-parser.js`)

Extend scalar binding parsing in both:

* `parseItemTerm` (top-level `$x`)
* `parseAGroupBase` (array context `$x`)
* and any other place `$` binding is parsed.

Currently you do:

```js
if (p.maybe('=')) { p.eat('('); ... p.eat(')'); return SBind(name, pat); }
```

Add a second branch:

```js
if (p.peek('=eager(')) {
  p.eat('=eager(');          // already consumed '('
  const pat = parseItem(p);  // or parseABody(...) in array context
  p.eat(')');
  return SBind(name, pat, {mode: 'eager'});
}
```

You’ll need to extend the AST node:

* `SBind(name, pat, mode='all')` (or `eager: true`)

Do the same in array-context `$x` where you currently parse `$x=(A_BODY)` into a Seq if needed.

## Engine changes (`tendril-engine.js`)

In the `SBind` case inside `matchItem`, wrap the inner `matchItem(item.pat, ...)` enumeration so that for eager binds you only proceed with the **first** successful inner solution:

Conceptually:

```js
case 'SBind': {
  const isEager = item.mode === 'eager';
  if (!isEager) { /* existing behavior */ }

  // eager: find first inner success, then bind+emit exactly once
  let done = false;
  matchItem(item.pat, node, path, sol, (s2) => {
    if (done) return;
    done = true;
    const s3 = cloneSolution(s2);
    if (bindScalar(s3.env, item.name, node)) {
      recordScalarSite(s3, item.name, path, node);
      emit(s3);
    }
  }, ctx);
  return;
}
```

### Important: key-binding sites

You also bind scalar variables in **object keys / breadcrumbs** (e.g. `{ planets: { $name: {...} } }` and `.foo.$x.bar` cases). Those are handled in `navigateSingleBreadcrumb` and `navigateSkipLevels` by explicitly looping keys and calling `bindScalar`.

If you want `eager` to apply there too (you probably do), then when the key pattern is `SBind` with `mode:'eager'`, stop after the first successful key binding in those loops.

## Tests to add

* `$x=eager(_|_)` only yields one solution where `$x=(...)` yields multiple.
* A “completeness loss” test: eager picks the first witness that later fails while a second witness would succeed; confirm eager version fails while non-eager succeeds.
* Key-binding test: `{ $k=eager(/a|b/):1 $k:2 }` (or similar) proves eager affects which key is chosen.

---

# Notes on “no whitespace” decision

The no-whitespace rule is good **if** you enforce it lexically (single token `=eager(`). It gives you:

* a crisp “this is a special operator” signal,
* easy parsing,
* no surprising “is eager a keyword?” questions.

Downside: it’s a bit less forgiving for users. But since this is an advanced, intentionally-incomplete operator, that’s acceptable—and the lexer-enforced rule makes the sharp edge visible.
