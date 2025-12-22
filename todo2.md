Overall: **this matches the “pattern/site determines semantics” goal well**. The main semantics change is correctly concentrated in `convertValueForSite()`, and you’ve avoided exposing `Group` in user-facing APIs.

That said, there are a few concrete issues + a couple of sharp edges worth addressing.

## Must-fix correctness / wiring

1. **Missing import: `engineMatch` / `engineScan` not available**
   You call `engineMatch()` and `engineScan()` in `PatternImpl.match/find`, but your imports only include `matchExists/scanExists/scanFirst`.

Add:

```js
  match as engineMatch,
  scan as engineScan,
```

to the import list from `./tendril-engine.js`.

2. **`OccurrenceSet.take/filter` rebuild uses wrong shape**
   `OccurrenceSet` expects `groups` shaped like `{path, rawSolutions}`.
   But `take/filter` currently builds groups from `o._rawSolutions` which is already “rawSolutions”, good — but you’re passing `new OccurrenceSet(this._root, groups)` where `groups` is correctly shaped. ✅ (This one looks fine.)

3. **Array splices conflict: offset logic is not safe for overlapping or same-start splices**
   You sort by `groupStart` and maintain `offset`, but if two edits target the same array and overlap, or if edits earlier change indices such that later “captured refs” no longer align, you silently skip later ones. That might be fine, but it’s worth being explicit:

* either declare overlaps undefined behavior
* or sort by `(start asc, end desc)` and/or apply **from the back** (descending start) to avoid offset math.

Given your “realistic use cases won’t conflict” premise, I’d at least add a comment or a debug mode assertion.

## Semantic review: does this achieve the intended ergonomics?

### ✅ Scalar sites ($x)

* Replacement uses value “as-is”, including arrays/objects as literal values.
* That solves the ambiguity that originally forced `Group` into user space.

### ✅ Group sites (@x)

* Arrays splice as elements if replacement is an array.
* Non-array replacement becomes a single-element splice.
* Objects require a plain object replacement and do key replacement semantics.

This is exactly the “pattern determines semantics” story.

## Two sharp edges (not blockers, but you should decide)

1. **Object group replacement semantics might surprise people**
   You currently interpret replacing an object-slice as:

* delete captured keys
* assign provided props

This is reasonable, but users may assume it *replaces the captured subset exactly* (i.e., only those keys, no extras), or that it merges. You’ve chosen “replace captured subset with provided props” (which can add keys not in the captured set).

That’s probably okay, but document it clearly.

2. **Plan keys accept `$x`/`@x` but are treated identically**
   You strip `$` and `@` from plan keys:

```js
const varName = (varNameRaw.startsWith('$') || varNameRaw.startsWith('@'))
  ? varNameRaw.slice(1)
  : varNameRaw;
```

This is ergonomic, but it also means users can write `@x: [...]` even if `x` is scalar in this match; the site kind is what matters. That’s consistent with your design, but again: document it.

## Design consistency notes

* `Occurrence.edit()` defaulting to **first solution only** is consistent with your “don’t mix solutions unless you opt in” stance, and you provide `{allSolutions:true}` as an escape hatch. Good.
* `Solution.edit()` always operates on just that solution. Also good.

One thing: in `Occurrence.replace()` you also always use first solution (deterministic). That’s consistent.

## Suggestion: add one tiny user-facing hook for debugging sites

Since Group is now invisible, a quick way to explain “why did my array splice happen?” would help:

* `Solution.sites("x")` already exists and returns site descriptors. 👍
* Consider documenting that as the way to “see” whether `x` is scalar/group.

## Minimal patch set I’d apply immediately

Here’s the smallest patch I’d do right now (just fixes the missing imports):

```diff
 import {
-  match as engineMatch,
-  scan as engineScan,
   matchExists as engineMatchExists,
   scanExists as engineScanExists,
   scanFirst as engineScanFirst,
 } from './tendril-engine.js';
+import {
+  match as engineMatch,
+  scan as engineScan,
+} from './tendril-engine.js';
```

…but cleaner is just editing the existing import:

```diff
 import {
+  match as engineMatch,
+  scan as engineScan,
   matchExists as engineMatchExists,
   scanExists as engineScanExists,
   scanFirst as engineScanFirst,
 } from './tendril-engine.js';
```

If you want, I can also give you a **tight diff** to switch array splices to “apply from end” (safer, no offset), but it’s not strictly required if you’re comfortable with “conflicts = undefined behavior.”
