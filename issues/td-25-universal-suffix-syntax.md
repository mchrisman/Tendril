# TD-25: Universal `!` Suffix Syntax

## Summary

Unify "for all" / "no bad entries" semantics across objects, arrays, and paths using a `!` suffix on patterns and wildcards.

## Motivation

Currently, the `each` keyword provides universal quantification in objects:
```
{each K: V}     // all keys matching K must have values matching V
```

But there's no elegant equivalent for arrays. The `!` suffix could unify both contexts.

## Proposed Syntax

### Objects

| Syntax | Meaning | Current Equivalent |
|--------|---------|-------------------|
| `K: V` | existential: at least one | `K: V` |
| `K!: V` | universal: all K must have V | `each K: V` |
| `K?: V` | optional existential | `K: V ?` or `K?: V` |
| `K!?: V` | optional universal | `each K?: V` |

### Arrays via Path Notation

| Syntax | Meaning |
|--------|---------|
| `_[$x]` | existential: some element matches |
| `_[$x!]` | universal: ALL elements must match |

### Paths

```
{items[$i].id: $x}      // some item has id
{items[$i!].id: $x}     // ALL items have id

{users._!.active: true} // all fields of users have active:true

{foo[$i!].bar[$j!]: $x} // every foo element's every bar element
{foo[$i!].bar[$j]: $x}  // every foo element has at least one bar
{foo[$i].bar[$j!]: $x}  // some foo element has all bars matching
```

### Combining with Implication

The `!` suffix works orthogonally with `=>` (implication):
```
{items[$i!]: ({} => {type:_})}
// Every item: if it's an object, it must have a 'type' field
```

## Design Questions

1. **Deprecate `each`?** Is `K!:V` clear enough on its own, or keep `each K:V` as verbose synonym?

2. **Syntax conflicts?** Does `!` conflict with negative lookahead `(!...)`? Context should disambiguate: `(!` is lookahead, `!:` or `!]` is universal suffix.

3. **Binding semantics:** Does `_[$x!]` yield:
   - One solution with all elements (like `[(P* as @x)]`)
   - N solutions, one per element (like iteration)
   - Both depending on `$` vs `@`?

4. **Standalone `_!`:** Does `_!` alone mean anything? Current thinking: no, `!` only meaningful on wildcards in paths/indices.

## Related

- TD-2: Language pruning and simplification
- TD-17: Simplified object field semantics
- `=>` implication syntax (not yet ticketed)
