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
