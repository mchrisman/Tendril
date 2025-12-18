# Completed Issues (Second Batch)

## 1) Array `+` quantifier accidentally possessive — FIXED

The check `op.endsWith('+')` incorrectly made plain `+` possessive. Fixed to explicitly check for `++`, `*+`, `?+`.

## 2) Array lookahead doesn't enumerate binding possibilities — FIXED

Array lookahead now uses `patternHasBindings()` to decide whether to enumerate all solutions or stop at first match, consistent with ITEM-level and object-level lookahead behavior.

## 3) `:>` bad entry detection with bindings — NOT A BUG (documented)

The current behavior is correct. When V contains an unbound variable, matching binds that variable, so the entry is in the slice (not bad). `:>` means "no bad entries" — not "universal equality."

**Key clarifications added to README:**
- Object terms produce results consistent with left-to-right evaluation
- Bindings from earlier terms are visible to later terms
- Each term selects a "witness" and branches if multiple qualify
- To enforce universal equality: `{ /a.*/:$x  /a.*/:>$x }`

## 4) Alt in key position doesn't try all alternatives for binding — FIXED

When an alternation like `($k|foo)` appears in key position, `bindKeyVariables()` tried the first syntactically matching alternative and returned false if binding failed, without trying other alternatives.

Example that was broken:
```javascript
{ tag:$k  ($k|foo):1 }  // matching { tag: "bar", foo: 1 }
```
The pattern should succeed: the second alternative `foo` matches key `"foo"`, and no binding is needed from that branch. But the old code tried `$k` first (which syntactically matches `"foo"` as a variable), failed to unify `"foo"` with the bound value `"bar"`, and gave up.

Fixed by cloning the solution before each alternative's binding attempt and only committing on success.
