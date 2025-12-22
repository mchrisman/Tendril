# Implementation Plan: `once(P)` operator + short-circuit `hasMatch()`/`first()`

Based on the proposal in `doc/propoosal-eager-short-circuit.md`.

---

## Overview

Two independent features:
1. **Part 1**: Short-circuiting `hasMatch()` and `first()` via `StopSearch` sentinel
2. **Part 2**: `once(P)` operator (Prolog-style local cut)

These can be implemented in either order. Part 1 is simpler and self-contained. Part 2 adds new syntax and semantics.

---

## Part 1: Short-circuit `hasMatch()` / `first()`

### Step 1.1: Add `StopSearch` sentinel class

**File:** `src/tendril-engine.js` (top of file, after imports)

```js
class StopSearch extends Error {
  constructor(payload) { super('StopSearch'); this.payload = payload; }
}
```

This is internal, not exported.

---

### Step 1.2: Add short-circuit match helpers

**File:** `src/tendril-engine.js` (after existing `match()` function, ~line 112)

Add four new exported functions:

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
    if (e instanceof StopSearch) return e.payload;
    throw e;
  }
}
```

---

### Step 1.3: Add short-circuit scan helpers

**File:** `src/tendril-engine.js` (after existing `scan()` function, ~line 149)

These need to wrap the scan logic. Looking at the existing `scan()`:

```js
export function scanExists(ast, input, opts = {}) {
  const ctx = makeCtx(opts);
  try {
    function scanValue(node, path) {
      matchItem(ast, node, path, newSolution(), () => { throw new StopSearch(true); }, ctx);
      // Recurse into children
      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) scanValue(node[i], [...path, i]);
      } else if (node && typeof node === 'object') {
        for (const k of Object.keys(node)) scanValue(node[k], [...path, k]);
      }
    }
    scanValue(input, []);
    return false;
  } catch (e) {
    if (e instanceof StopSearch) return true;
    throw e;
  }
}

export function scanFirst(ast, input, opts = {}) {
  const ctx = makeCtx(opts);
  try {
    function scanValue(node, path) {
      matchItem(ast, node, path, newSolution(), (sol) => { throw new StopSearch(sol); }, ctx);
      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) scanValue(node[i], [...path, i]);
      } else if (node && typeof node === 'object') {
        for (const k of Object.keys(node)) scanValue(node[k], [...path, k]);
      }
    }
    scanValue(input, []);
    return null;
  } catch (e) {
    if (e instanceof StopSearch) return e.payload;
    throw e;
  }
}
```

---

### Step 1.4: Wire up API fast paths

**File:** `src/tendril-api.js`

**Option A (minimal):** Add convenience methods on `PatternImpl`:

```js
// Around line 875, after existing methods
hasMatch(input) {
  return engineMatchExists(this._ast, input, this._opts);
}

hasAnyMatch(input) {
  return engineScanExists(this._ast, input, this._opts);
}

firstMatch(input) {
  const raw = engineScanFirst(this._ast, input, this._opts);
  if (!raw) return null;
  // Wrap in MatchSet with single result
  return new MatchSet([raw], input, this._ast);
}
```

Update imports at top to include `matchExists`, `matchFirst`, `scanExists`, `scanFirst`.

**Option B (better UX):** Make existing `match(input).hasMatch()` and `find(input).first()` use fast paths. This requires either:
- Lazy evaluation in `MatchSet` (more complex)
- Or have `PatternImpl` pass a flag to `MatchSet` constructor

For now, Option A is simpler and keeps `MatchSet` unchanged.

---

### Step 1.5: Add tests for Part 1

**File:** `test/short-circuit.test.js` (new file)

Tests:
1. `hasMatch()` returns true when solution is on non-first branch
2. `first()` returns valid match with step count under threshold
3. `hasAnyMatch()` / `firstMatch()` work correctly
4. Step counter proves early termination (mock/instrument ctx.steps)

---

## Part 2: `once(P)` operator

### Step 2.1: Add `Once` AST constructor

**File:** `src/tendril-parser.js` (in AST constructors section, ~line 76)

```js
const Once = (pat) => ({ type: 'Once', pat });
```

Add to exports at bottom of file.

---

### Step 2.2: Parse `once(...)` in parseItemTerm

**File:** `src/tendril-parser.js` (in `parseItemTerm`, ~line 102-125)

Add before other checks (e.g., before lookahead parsing):

```js
// once(P) operator
if (p.peek('id') && p.cur().val === 'once') {
  const next = p.tokens[p.pos + 1];
  if (next && next.kind === '(') {
    p.eat('id');  // consume 'once'
    p.eat('(');
    const pat = parseItem(p);
    p.eat(')');
    return Once(pat);
  }
}
```

This treats `once` as an identifier that's recognized in context, not a reserved keyword. This is cleaner—users can still have variables named `once` elsewhere.

---

### Step 2.3: Handle `Once` in array context (if needed)

**File:** `src/tendril-parser.js`

Check `parseAGroupBase` (~line 294) — if it directly parses items without going through `parseItemTerm`, add similar `once` handling there.

Looking at the code: `parseAGroupBase` calls `parseItemTerm` for most cases, so it should work automatically. But verify during implementation.

---

### Step 2.4: Handle `Once` in object key context (if needed)

**File:** `src/tendril-parser.js`

Object keys in `parseOTerm` (~line 594) have special handling. Check if `once($k)` as a key pattern would parse correctly.

If not, add explicit handling in `parseOKeyPat` or wherever key patterns are parsed.

---

### Step 2.5: Add engine handler for `Once`

**File:** `src/tendril-engine.js` (in `matchItem` switch, ~line 191)

```js
case 'Once': {
  let done = false;
  matchItem(item.pat, node, path, sol, (s2) => {
    if (done) return;
    done = true;
    emit(s2);
  }, ctx);
  return;
}
```

The `return` after `matchItem` is crucial—it prevents continuing to explore alternatives.

---

### Step 2.6: Add tests for Part 2

**File:** `test/once.test.js` (new file)

Tests per proposal:

1. **Basic truncation:**
   - `once(_|_)` on value that matches both branches → 1 solution
   - Without `once` → multiple solutions

2. **Backtracking prevention:**
   - Pattern where first witness fails but second would succeed
   - With `once`: fails
   - Without `once`: succeeds

3. **Key binding:**
   - `{ once($k):1 }` on `{a:1, b:1, c:1}` → 1 solution
   - `{ $k:1 }` on same → 3 solutions

4. **Combinatorial reduction:**
   - `{ $a:1 $b:1 }` on 10-key object → 90 solutions
   - `{ once($a):1 once($b):1 }` → 1 solution (or small fixed number)

5. **Fresh scope on re-entry:**
   - `(A | B) once(C)` — verify each branch gets independent `once` scope

6. **Composition:**
   - `once(once(P))` ≡ `once(P)`
   - `($x=once(P))` for eager binding

---

## Implementation Order

Recommended sequence:

1. **Part 1 first** — it's self-contained, no new syntax
   - Steps 1.1 → 1.2 → 1.3 → 1.4 → 1.5
   - Run existing tests to ensure no regressions

2. **Part 2 second** — depends on understanding the engine flow
   - Steps 2.1 → 2.2 → 2.5 (core path)
   - Steps 2.3 → 2.4 (verify array/object contexts)
   - Step 2.6 (tests)

---

## Risk areas / things to verify

1. **Scan helpers**: Ensure `StopSearch` bubbles out of recursive `scanValue` correctly. Don't catch it inside the recursion.

2. **Object key iteration**: The key matching in `matchObject`/`OTerm` handling may iterate keys directly. Verify `once($k)` as a key pattern goes through `matchItem` so the `Once` handler fires.

3. **Array slicing**: The `quantOnArray` DP-based matcher is complex. Verify `once` inside quantified patterns works correctly (e.g., `[once(A)* B]`).

4. **Solution cloning**: The `Once` handler doesn't clone the solution before emitting. Check if this is consistent with other handlers or if cloning is needed.

5. **Step counting**: Ensure `ctx.steps` is still incremented correctly with short-circuit—important for debugging and preventing infinite loops in other patterns.

---

## Files to modify (summary)

| File | Changes |
|------|---------|
| `src/tendril-engine.js` | Add `StopSearch`, `matchExists`, `matchFirst`, `scanExists`, `scanFirst`, `case 'Once'` |
| `src/tendril-parser.js` | Add `Once` constructor, parse `once(...)` in `parseItemTerm` |
| `src/tendril-api.js` | Add `hasMatch()`, `hasAnyMatch()`, `firstMatch()` on `PatternImpl` |
| `test/short-circuit.test.js` | New test file for Part 1 |
| `test/once.test.js` | New test file for Part 2 |
