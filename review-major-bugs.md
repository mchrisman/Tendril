Here’s my read, focusing on *spec ↔ implementation fit*, correctness traps, and what I’d change first.

## What’s strong

* **The DSL is genuinely compelling.** The “JSON regex + unification” mental model is easy to teach, and the README examples are persuasive (especially the join).
* **Good separation of concerns.** `microparser` (tokenization + env/unify), `tendril-parser` (AST), `tendril-engine` (evaluator), `tendril-api` (user-facing match/find/edit) is a solid layout.
* **Editing model is thoughtful.** Tracking “sites” for bindings and then applying edits with structural checks (`deepEqual` vs stored `valueRef`) is a good approach to avoid accidental edits when the tree has shifted.
* **Step budget guardrail** in the engine is a pragmatic way to avoid catastrophic backtracking.

## Big spec/implementation mismatches (these will bite users)

### 1) **Object assertion semantics in README are *universal*, but engine is *existential***

README defines `K:V` as:

> exists at least one key matching K … and **for every** key matching K, value must match V.

In `matchObject`, you compute `keys = objectKeysMatching(...)` then **branch per key** and only require `term.val` to match that specific key’s value. You never check that *other* keys matching K also satisfy V. Same issue for `K?:V`.

Consequence: patterns like `{ /a/:1 }` will match `{a:1, aa:2}` (because it can pick `a` and ignore `aa`), even though the README semantics say it should fail.

If you keep the README semantics, you probably want:

* Find all keys matching K under the current env
* Fail if none and op is `:`
* Assert `V` holds for **all** those keys (with consistent bindings across all), not “choose one”

This is the single most important correctness gap.

### 2) **`remainder` is computed from “testedKeys”, but your matching strategy makes that meaningless**

You treat “residual” keys as those not in `testedKeys`. But since you only add keys you happened to pick in existential branching, “remainder” becomes “keys you didn’t pick”, not “keys unmatched by any assertion.”

So `{ a:b (?!remainder) }` is not reliably “closed object” under the README’s definition; it can be satisfied by simply selecting keys in a particular way.

Once object semantics become universal (“all matching keys must satisfy”), you can define remainder as: keys that match **no** predicate key pattern (or no term) — but you need a separate accounting mechanism than “keys visited in a branch”.

### 3) **Positive lookahead commits bindings; README says lookaheads don’t commit**

README:

> Lookaheads test without consuming … **without committing bindings**

Engine `Look`:

* runs `matchItem` on a cloned solution
* if it matches, you **emit the matchedSol**, so bindings from the lookahead persist
* additionally, it captures only the *first* successful lookahead solution (`matchedSol`), discarding other possible binding possibilities

That’s both a semantic mismatch and a completeness issue (lookahead can silently prune solution space). Decide what you want:

* If lookahead should not bind: always emit `cloneSolution(sol)` on success.
* If it *can* bind, the README should say so, and you likely want to propagate **all** successful lookahead solutions, not just the first.

### 4) Regex matches aren’t restricted to strings

README says regex patterns “match against string values only”. Engine does:

```js
if (item.re.test(String(node))) ...
```

So numbers, objects, etc get stringified and can match accidentally (`/1/` matches `1`, `/object/` matches `{}` via `"[object Object]"`).

If you want README behavior: `typeof node === 'string'` before testing.

## Likely correctness bugs in current code

### 1) Object group binding collects keys incorrectly

In object `GroupBind` for `@var=(pattern)`, you do:

```js
const matchedKeys = new Set();
matchObject(term.pat.groups, ..., (s2) => {
  const capturedObj = {};
  for (const k of matchedKeys) capturedObj[k] = obj[k];
  ...
}, ..., matchedKeys);
```

But `matchedKeys` is a single set shared across **all** emitted solutions for that branch, and you union keys from every successful path into that one set (because `outMatchedKeys` aggregates across solution branches). That means one successful solution can cause later solutions to capture too many keys.

You need matched-keys tracking **per emitted solution**, not per whole recursive call.

### 2) Parser/README drift on quantifier syntax

README documents object quantifiers like:

```js
{ /a.*/:_ #{2,4} }
```

Parser implements `O_QUANT` as `#` followed by `{...}` (or `#?`) and attaches it to `OTerm`, but the README uses `#{...}` (no space) which will tokenize as `#` then `{` so that’s fine. However:

* README says `remainder #{0}`; your `parseORemnant` supports `remainder?` but not `remainder #{...}`.
* Engine’s `Spread` in objects accepts `quant` but currently only supports `?`-like behavior in a few spots; general “remainder #count” semantics aren’t really implemented.

### 3) “Scalar bindings can’t bind sequences” is enforced inconsistently

Engine rejects `$x=(Seq)` at top-level (`SBind` case checks `item.pat.type === 'Seq'`), but the parser can generate `SBind(name, Seq)` inside arrays for `$x=(1? 2?)`-style constructs. That means patterns the README explicitly advertises can fail unexpectedly depending on where they occur.

You probably want a clearer rule:

* `$x=(...)` in *array context* can bind a **single element** only (so inner pattern must match exactly one element), *or*
* allow `$x` to bind a whole subarray only when the value itself is an array (which is what “scalar” currently means in your API examples)

Right now it’s a bit muddled.

## API / UX notes

* The fluent API is pleasant, but the README examples mix `pattern.match(data)` vs `Tendril(pattern).match(data)`; your actual code supports only the latter (PatternImpl has `match/find/first`).
* `Solution.matches()` is neat, but it’s O(N) across the matchset and repeatedly calls `stableKey`. That can be expensive; might be fine for v1 but keep an eye on it.
* The choice to hide `$0` from bindings is good, but it’s worth explicitly documenting how `$0` interacts with `replaceAll`/`replace`.

## What I’d do next (highest leverage)

1. **Pick the semantics you want for objects**, then make README + engine match.

   * If you keep the README semantics (universal constraints), refactor `matchObject` so each `OTerm` checks *all matching keys*.
   * Re-derive remainder based on “keys not matched by any term key pattern”, not “keys visited”.

2. **Fix lookahead semantics and completeness** (commit/no-commit + “first solution only” behavior).

3. **Make regex only match strings** (or update spec to say stringify).

4. **Fix object group-bind key collection** (keys must be per-solution, not unioned across branches).

If you want, I can sketch a concrete algorithm for universal object assertions that still supports variable binding/unification without exploding the search space (it’s basically: compute matching key set, then fold constraints across that set while threading solutions).
