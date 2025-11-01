### Known Limitations (V5)

**Bidirectional Constraint Patterns**

The V5 implementation uses recursive-descent evaluation which processes patterns left-to-right. This creates a limitation when negative assertions need to constrain variables that are bound later:

```javascript
// ⚠️ LIMITATION: Cannot constrain $x before it's bound
{
  (? !_ = $x)
  $x = _
}
// Intent: "$x must not equal any existing value"
// Current: May succeed incorrectly due to evaluation order
```

**Workaround:** Reorder your pattern to bind variables before negations reference them:

```javascript
// ✓ WORKS: Bind $x first
{
  $x = _(? !_ = $x)
}
// Now the negation can check the bound value of $x
```

**Note:** This only works if the semantic intent allows reordering. Some constraints are inherently bidirectional.

**Future:** A constraint propagation layer (planned for V6+) will enable true bidirectional constraints. Variables will have watchlists, and negations will be re-evaluated when watched variables become bound.

For more details, see `doc/v5-constraints-limitations.md`.