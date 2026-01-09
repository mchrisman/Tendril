---
id: td-24
title: OGroup quantifiers (union of slices)
status: backlog
priority: low
type: feature
created: 2026-01-09
tags: [objects, syntax, quantifiers]
---

# DESCRIPTION

Allow quantifiers on parenthesized object groups to constrain the union of multiple slices.

## Current behavior

- `K:V#{m,n}` applies quantifier to a single field clause's slice
- `(K1:V1 K2:V2)` groups clauses but cannot be quantified

## Proposed behavior

- `(K1:V1 K2:V2)#{m,n}` - quantifier applies to the *union* of all slices in the group
- Corollary: `(K:V)#{m,n}` === `K:V#{m,n}`

## Semantics

- Each clause defines a slice (k:v pairs where k matches K and v matches V)
- Group's slice = set union of member slices
- Quantifier asserts cardinality of union is in [m,n]
- Overlapping matches (same key in multiple slices) count once (set semantics)

## Examples

```javascript
{ (a:_ b:_)#{2} }           // exactly 2 keys total between 'a' and 'b'
{ (a:_ b:_)#{1,2} %}        // 1-2 of a/b, plus some remainder
{ (/x/:_ /y/:_)#{0} %}      // neither x-keys nor y-keys exist
{ (K:V)#{3} }               // equivalent to K:V#{3}
```

## Edge case

```javascript
{ (a:1 a:2)#{1} }  // key 'a' could satisfy either clause
// {a:1} -> first slice={a:1}, second slice={}, union=1 element. Match.
// {a:2} -> first slice={}, second slice={a:2}, union=1 element. Match.
// {a:3} -> both slices empty, union=0. Fail #{1}.
```

## Implementation notes

- Track covered keys per group
- Compute union cardinality after evaluating all clauses in group
- Apply quantifier constraint to that count
