
## Correctness issues vs the spec/README

### 1) Object term quantifiers (`#{m,n}` on `K:V`) are parsed but ignored [fixed]
This is the biggest spec mismatch in this code drop.

### 2) `:>` implication check uses “badKeys” computed without carrying bindings [skip for now]

Your object matching does a pre-pass:

```js
matchItem(term.val, finalNode, finalPath, cloneSolution(s0), () => {
  valueMatches = true;
})
```

This only tests existence of *some* match for V, but it throws away any bindings and it does it independently per key. That’s fine for classifying slice vs bad **if** “matches” means “there exists a solution”. But for `:>` you want “bad means no way to match V given current env”.

The subtle problem: you compute `badKeys` using `cloneSolution(s0)` (no bindings carried forward from other keys/previous term in the same clause) *per key*, but the actual slice enumeration later uses `s1` and then navigates + `matchItem(term.val, ..., s1, ...)` to produce bindings. In most cases this aligns, but it can diverge when:

* `term.val` contains bindings that can succeed by binding fresh vars
* `term.val` contains unification constraints with already-bound vars

You *mostly* intended “bad = fails given current env”, which should be evaluated with the current `s0` bindings (you do that), but since you throw away bindings from breadcrumb navigation that might constrain later breadcrumbs, it’s easy to get edge cases. The safest approach is: when classifying slice/bad, run the same matcher path you use for enumeration (breadcrumbs + matchItem) and define “matches” as “emits at least one solution”.

Right now you do that structurally, but because you set `valueMatches=true` in a callback without guarding for multiple branches, it’s a bit hand-wavy.

### 3) `RootKey` / leading `..` in object paths does not implement "any depth" [fixed]

In `parseOTerm`, leading `..` turns into `key = RootKey()` and the breadcrumbs begin with a `skip` breadcrumb created by `parseBreadcrumb` on the `..password` part. That’s correct structurally.

But in the engine:

```js
if (term.key.type === 'RootKey') {
  navigateBreadcrumbs(term.breadcrumbs, obj, path, s1, (finalNode, finalPath, s2) => {
    matchItem(term.val, finalNode, finalPath, s2, ...)
  })
  continue;
}
```

Problem: `navigateSingleBreadcrumb` for `skip` calls `navigateSkipLevels(...)`, and **navigateSkipLevels only recurses into nested objects, not arrays**:

```js
for (const k of Object.keys(node)) {
  const child = node[k];
  if (isObject(child)) navigateSkipLevels(...child...)
}
```

So `{ ..password:$p }` will *not* find passwords inside arrays-of-objects. Your README says `..` skips arbitrary levels of nesting; that implies both arrays and objects should be traversed.

This is a real “user will notice immediately” bug.

### 4) `find()` redundancy warning depends on semantics you don’t enforce

README says don’t combine `find()` with `..` in root-object terms. Your engine does not detect or normalize that redundancy (which is fine), but it means users *will* do it and get “extra” work. Not a bug, just: your implementation currently doesn’t deliver the friendly behavior your README hints at possibly doing later.

## Parser / tokenizer issues (some are serious)

### 5) Tokenizer never produces an `'any'` token for `_`

In `tokenize()`:

* You match identifiers via `reId = /[A-Za-z_][A-Za-z0-9_]*/y`
* When `w === '_'` you `push('any', ...)`

But **`reId` requires at least 2 characters?** Actually it allows one character, but `_` *does* match the regex. So it will produce `'any'` for `_`.

However: you also list `_` in the “single-character punctuation” set: `'[](){}:,.$@=|*+?!-#%'.includes(c)` — that set does **not** include `_`, so you’re safe.

So this part is OK.

The actual issue is elsewhere:

### 6) Quantifier parsing uses `num` token where it should use INTEGER [fixed]

Your tokenizer produces `'num'` tokens as `Number(...)`, allowing decimals and negatives. Your quantifier parsers (`parseAQuant`, `parseOQuant`, `parseRemainderQuant`) do `p.eat('num').v` for counts. That allows `{1.5}` or `#{-2}` to parse, and then you’ll use those in loops and comparisons.

That should be constrained to non-negative integers at parse time. Right now invalid patterns can sneak through and create weird runtime behavior.

### 7) `parseAQuant` backtracking is noisy

You call `p.backtrack(() => parseAQuant(p))` in places where absence of a quantifier is normal. But `parseAQuant` ends with `p.fail('expected quantifier')`, which gets caught by `backtrack`, so it’s fine functionally; it’s just expensive and makes “farthest error” tracking noisier.

Not fatal, but you may want a `peekIsQuantifier()` fast check to avoid throwing for the common “no quant” case.

## Engine behavior and performance

### 8) Array spread `..` is implemented as a **range loop**, not lazy/greedy

In `matchArray`, `Spread` tries `k = min..maxK` increasing. That’s effectively **lazy-first** behavior (smallest match first), which matches your README statement that `..` is “lazy wildcard group (equivalent to _*?)”.

Good.

But note: you also have quantifiers on regular items that implement greedy via emitting longer matches before shorter ones (reverse emission). That’s fine.

### 9) GroupBind in arrays is always greedy for `Seq`

`@x=(Seq)` tries `k` from max down to 0 (greedy). That’s not necessarily wrong, but it’s a semantic choice. Your README doesn’t explicitly define greediness for group binding with `Seq`; users may infer it behaves like the quantifiers. If you want predictability, document it.

### 10) Step budget is global and coarse

`guard(ctx)` increments `steps` everywhere. That’s okay as a safety brake, but it will make debugging “why did I exceed maxSteps” tricky without richer trace info. Your debug hook helps, but you probably want to attach a “where” (pattern node + input path) to the error when throwing for step budget.

## API layer issues

### 11) `Solution.occurrences()` is O(N*M) and allocates heavily

It:

* walks every occurrence,
* walks solutions in each,
* compares via `stableKey()` which serializes structures and re-hashes.

This will be expensive on non-trivial results. Fine for v1, but consider caching stableKey per Solution or building an index once per MatchSet.

### 12) `applyEdits` conflict semantics are “whatever order Map gives”

You group edits by path and then apply scalar sets then group splices. But:

* Within the same path, scalar edits order is insertion order (depends on solution iteration).
* Group splices are sorted by start index (good), but overlap conflicts still exist.

Given your README “last write wins” discussion, this is acceptable, but you should document the actual deterministic ordering you currently implement (solution enumeration order + splice sorting).

### 13) `$0` capture is implemented cleanly

Wrapping AST in `SBind('0', ast)` is a nice trick. Site tracking supports replace/edit.

## The 3 fixes I’d do first (high leverage)

1. **Fix `..` skip traversal to descend into arrays too** (both in `navigateSkipLevels` and in scan recursion if you ever unify those behaviors).
2. **Implement object term quantifiers `OTerm.quant`** (slice count checks, and likely also `bad` count checks if you ever expose that explicitly).
3. **Tighten quantifier parsing to integers ≥ 0** (tokenize `INTEGER` separately or validate `Number.isInteger` and `>=0` in parser).
