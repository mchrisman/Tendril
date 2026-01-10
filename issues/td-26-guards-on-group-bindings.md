# TD-26: Allow Guards on Group Bindings (@x)

## Summary

Remove the parser restriction that prevents guard expressions on group bindings (`@x`). The infrastructure already exists to support this.

## Current Behavior

```javascript
[(@items where size(@items) > 2)]  // Parse error: "guard expressions are not supported on group bindings (@var)"
```

The parser explicitly rejects this in `parseParenWithBindingAndGuard`:
```javascript
if (p.peek('where')) {
  p.fail('guard expressions are not supported on group bindings (@var)');
}
```

## Proposed Behavior

```javascript
[(@items where size(@items) > 2)]     // capture at least 3 elements
[(@head where size(@head) <= 2) ...]  // capture at most 2 from front
[(... as @nums where size(@nums) > 0)] // non-empty capture
```

## Why It Should Work

The infrastructure is already in place:

1. **Deferred guards exist**: `addGuard()` queues guards with their `requiredVars`, `checkGuards()` evaluates when vars are bound, `allGuardsClosed()` verifies completion.

2. **`size()` handles arrays**: From `tendril-el.js`:
   ```javascript
   if (Array.isArray(val)) return val.length;
   ```

3. **Backtracking already handles @**: Patterns like `[(@x) 3 (@y)]` already try multiple splits. Adding a guard just prunes branches.

## Implementation

1. Remove the parser restriction (the `p.fail(...)` check)
2. Allow `GroupBind` nodes to carry a guard (may need AST change)
3. In engine, call `addGuard()` after group binding completes
4. Test backtracking behavior

## Design Considerations

1. **Backtracking cost**: `[(@x where size(@x) == 2) @y]` on `[1,2,3,4]` tries @x=[], @x=[1], @x=[1,2]... until guard passes. This is O(n) guard evaluations, but no worse than existing @ backtracking.

2. **Guard expression scope**: What variables are visible in the guard? Just the bound @x, or also earlier bindings? (Probably all bindings, like scalar guards.)

3. **Collection buckets**: Guards on `%bucket` collected via `->` are harder — bucket isn't complete until label scope closes. That's a separate problem (see deferred guard timing discussion).

## Test Cases

```javascript
// Length constraints
[(@x where size(@x) >= 2)]  // at least 2 elements
[(@x where size(@x) == 0)]  // empty only (same as [])

// Combined with other patterns
[1 (@middle where size(@middle) <= 3) 9]  // 1, up to 3 middle, 9

// Multiple groups with guards
[(@a where size(@a) > 0) (@b where size(@b) > 0)]  // non-empty split
```

## Related

- TD-25: Universal `!` suffix syntax (alternative approach)
- Deferred guard system in `tendril-engine.js`
