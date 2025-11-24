# Review of tendril-api.js vNext

## Overall Assessment

**Very solid implementation** that successfully addresses all the design issues we discussed. The code is clean, well-structured, and the abstractions align with the conceptual model.

## Strengths

### 1. ✅ Clean Separation of Concerns

- `Group` is properly internal-only (not exposed to users)
- `$0` handled transparently (used for tracking, hidden from bindings)
- Clear distinction between engine representation and user-facing API

### 2. ✅ Proper Type Hierarchy

```javascript
PatternImpl → MatchSet → Match/Solution
```

The flow is logical and each type has clear responsibilities.

### 3. ✅ Immutable vs Mutable Distinction

- `.replaceAll()` clones then mutates clone (pure operation)
- `.editAll()` mutates in place
- Naming makes this clear

### 4. ✅ Bidirectional Navigation

```javascript
Match.solutions() → Solution
Solution.matches() → Match
```

Though currently each Solution only knows its parent Match (not all Matches with same bindings).

## Issues & Suggestions

### Issue 1: **Solution.matches() is incomplete**

```javascript
class Solution {
  matches() {
    const match = this._match;
    return {
      [Symbol.iterator]() {
        let done = false;
        return {
          next() {
            if (done) return {done: true};
            done = true;
            return {value: match, done: false};  // Only returns parent match!
          }
        };
      }
    };
  }
}
```

**Problem:** Each Solution only knows about the single Match that created it. The API promises "all positions with these bindings" but delivers only one.

**Fix Options:**

**A) Document as limitation:**

```javascript
/**
 * Iterator of Match objects with these bindings.
 * Currently returns only the parent match; cross-match deduplication not implemented.
 */
matches() { ... }
```

**B) Pass MatchSet to Solution:**

```javascript
class Solution {
  constructor(rawSolution, match, matchSet) {
    this._match = match;
    this._matchSet = matchSet;  // Keep reference to find other matches
    // ...
  }
  
  matches() {
    // Search all matches in matchSet for equivalent bindings
    const myBindings = this._bindings;
    const myKey = stableKey(myBindings);
    const matchSet = this._matchSet;
    
    return {
      [Symbol.iterator]() {
        // Iterate all matches, filter by binding equality
        const allMatches = [];
        for (const m of matchSet) {
          for (const s of m._solutions) {
            if (stableKey(s._bindings) === myKey) {
              allMatches.push(m);
              break;  // One solution per match is enough
            }
          }
        }
        let i = 0;
        return {
          next() {
            if (i >= allMatches.length) return {done: true};
            return {value: allMatches[i++], done: false};
          }
        };
      }
    };
  }
}
```

### Issue 2: **MatchSet.solutions() returns iterator, not SolutionSet**

```javascript
solutions() {
  // Returns bare iterator, not SolutionSet class
  return {
    [Symbol.iterator]() { ... }
  };
}
```

**Problem:** The JSDoc spec says `.solutions()` returns `SolutionSet` with methods like `.filter()`, `.take()`, `.unique()`. Currently it's just a plain iterator.

**Fix:** Create `SolutionSet` class or document that it's a bare iterator:

```javascript
class SolutionSet {
  constructor(matchSet) {
    this._matchSet = matchSet;
  }

  [Symbol.iterator]() {
    // Current logic from MatchSet.solutions()
    const matches = this._matchSet._matches;
    const seen = new Set();
    // ... rest of iteration logic
  }

  filter(pred) {
    const self = this;
    return new FilteredSolutionSet(self, pred);
  }

  take(n) {
    const self = this;
    return new LimitedSolutionSet(self, n);
  }

  first() {
    const it = this[Symbol.iterator]();
    const n = it.next();
    return n.done ? null : n.value;
  }

  toArray() {
    return Array.from(this);
  }
  
  // ... other combinators
}
```

### Issue 3: **Missing Match.replace() and Match.edit()**

The JSDoc spec shows these methods on individual Match objects:

```javascript
match.replace(fnOrValue)
match.edit(arg1, arg2)
```

But the implementation only has them on `MatchSet`, not `Match`.

**Fix:** Add to Match class:

```javascript
class Match {
  // ... existing methods ...
  
  replace(replOrFn) {
    if (!this._zeroSite) return this._root;
    
    const firstSol = this._solutions[0] || null;
    const to = (typeof replOrFn === 'function')
      ? replOrFn(firstSol)
      : replOrFn;
    
    const edits = [{site: this._zeroSite, to}];
    const cloned = cloneDeep(this._root);
    return applyEdits(cloned, edits);
  }
  
  edit(arg1, arg2) {
    const {planFactory} = normalizeEditArgs(arg1, arg2);
    const edits = [];
    
    for (const sol of this._solutions) {
      const plan = planFactory(sol) || {};
      const sitesMap = sol._sites;
      
      for (const [varNameRaw, valueSpec] of Object.entries(plan)) {
        const varName = varNameRaw.startsWith('$')
          ? varNameRaw.slice(1)
          : varNameRaw;
        const sites = sitesMap.get(varName) || [];
        
        for (const site of sites) {
          const to = convertValueForSite(site, valueSpec);
          edits.push({site, to});
        }
      }
    }
    
    return applyEdits(this._root, edits);
  }
}
```

### Issue 4: **MatchSet should have combinators**

JSDoc shows:

```javascript
matches.filter(pred)
matches.take(n)
```

But `MatchSet` doesn't implement these.

**Fix:** Add combinator methods that return new MatchSets:

```javascript
class MatchSet {
  // ... existing ...
  
  filter(pred) {
    const filtered = this._matches.filter(pred);
    return new MatchSet(this._root, 
      filtered.map(m => ({path: m._path, rawSolutions: m._rawSolutions}))
    );
  }
  
  take(n) {
    const limited = this._matches.slice(0, n);
    return new MatchSet(this._root,
      limited.map(m => ({path: m._path, rawSolutions: m._rawSolutions}))
    );
  }
  
  first() {
    return this._matches[0] || null;
  }
  
  count() {
    return this._matches.length;
  }
  
  toArray() {
    return [...this._matches];
  }
}
```

### Issue 5: **Missing convenience methods**

JSDoc shows:

```javascript
export function replace(pattern, data, fnOrValue)
```

But implementation only has `replaceAll`, not singular `replace`.

**Fix:** Add missing convenience:

```javascript
export function replace(pattern, input, builder) {
  return Tendril(pattern).first(input).replaceAll(builder);
}
```

### Issue 6: **Type inconsistency in null returns**

Some places return `null`, others return empty MatchSet:

```javascript
first(input) {
  const all = this.find(input);
  if (!all._matches.length) return new MatchSet(input, []);  // Empty MatchSet
  // ...
}
```

But:

```javascript
extract(pattern, input) {
  const solObj = firstSolutionObject(mset.solutions());
  return solObj;  // Returns null if no solutions
}
```

**Decision needed:** Should we consistently return empty MatchSet (falsy via `.hasMatch()`) or null?

### Minor: **Missing JSDoc comments**

The implementation has good structure but lacks JSDoc annotations. Would help with IDE autocomplete and type checking.

## Summary

| Issue | Severity | Fix Complexity |
|-------|----------|----------------|
| Solution.matches() incomplete | Medium | Medium (need cross-match search) |
| No SolutionSet class | Medium | Medium (new class + combinators) |
| Missing Match.replace/edit | High | Low (duplicate MatchSet logic) |
| Missing MatchSet combinators | Medium | Low (straightforward) |
| Missing replace() convenience | Low | Trivial |
| Type inconsistency | Low | Trivial (decision + small changes) |

**Bottom line:** The architecture is excellent. Needs finishing touches to match the spec, especially:

1. Add individual Match operations
2. Implement SolutionSet properly
3. Add combinator methods

The core insight—MatchSet as bidirectional navigation hub—is implemented correctly.