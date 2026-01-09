---
id: td-23
title: Object fields redesign
status: backlog
priority: high
type: feature
created: 2026-01-05
tags: [objects, syntax, buckets, breaking-change]
---

# DESCRIPTION

## PART 1, spelling change


### Current design

- `K:V` Asserts there is at least one matching k:v in the object
- `K:V?` Asserts nothing (useful for bindings)
- `K:V else !` Asserts there is at least one matching k:v, and that for all k, k~K implies v~V.  (Validate all fields.)
- `K:V else !?` Asserts that for all k, k~K implies v~V.  (Validate all fields.)

All of the above 'consume' all matching keys, for the purpose of commuting the remainder %.

- 'K:V' and 'K:V else !' are referred to as "weak" and "strong" field clauses, respectively. 
- 'K:V else !' is a hard-coded expression in the grammar. 
- The idiom 'K:V1 else V2 else V3 else !' is merely the strong field clause, with V:='V1 else V2 else V3'. (Not sure if this is true.)

Backward compatibility is not required because nobody is using this language yet. Retire the "else !" form and update docs and tests.

### New design

This is only a change in spelling, not a change in semantics.

- `K:V`: No change.
- `K:V?`: No change.
- `K:V else !` Change to `each K:V` (new keyword) 
- `K:V else !?` Change to `each K:V ?`

In documentation, just call these 'field clauses' but do not mention "strong" or "weak".

## PART 2 - May have already been implemented.

Currently `K:V` means "There must be at least one matching field." `K:V#{m,n}` adds an additional condition: There must be between m and n matching fields. Therefore `K:V#{0,}` has the surprising meaning "There must be at least one, and there must be at least zero."

Fix this by saying that the quantifier is not an *additional condition*, it is merely *the* condition, so that `K:V` is understood to be short for `K:V#{1,}`, and `K:V?` is short for `K:V#{0,}`.

Ditto for `each K:V`, with 'each' signifying (for all k in the object, k~K implies v~V).

In the case of the object validation idiom `each K:V1 else V2`, illustrate in the documentation that the quantifier must go at the end. Add a unit test to prove that `K:V1#{1} else V2` is a syntax error. Support also, for clarity, the form with parentheses `(K:V)#{m,n}.

## PART 3

Implement TD-20 (This may have already been partly or fully implemented.)


