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

This subsumes TD-20 and TD-17, and focuses on the changes required rather than the motivation. 

# Current design

- `K:V` Asserts there is at least one matching k:v in the object
- `K:V?` Asserts nothing (useful for bindings)
- `K:V else !` Asserts there is at least one matching k:v, and that for all k, k~K implies v~V.  (Validate all fields.)
- `K:V else !?` Asserts that for all k, k~K implies v~V.  (Validate all fields.)

All of the above 'consume' all matching keys, for the purpose of commuting the remainder %.

- 'K:V' and 'K:V else !' are referred to as "weak" and "strong" field clauses, respectively. 
- 'K:V else !' is a hard-coded expression in the grammar. 
- The idiom 'K:V1 else V2 else V3 else !' is merely the strong field clause, with V:='V1 else V2 else V3'. (Not sure if this is true.)

- Both object slices and array slices are referred to using @ variables, e.g. '@foo'

- The flow operator -> operates at the top level of the idiom 'K:V1 else V2 else V3 else !', e.g.
```
    K: else V1 -> @bucket1
       else V2 -> @bucket3
       else V4 -> @bucket4
       else !
```
The flow operator may also operate elsewhere, but I'm not going to describe this because we're going to change it anyway. 
- The flow operator collects `k:a` pairs, where `a` comes from the subject of the flow operator, and `k` comes from an object or array iteration that is designated using a label, defaulting to the closest looping structure. 

# Changes

The following changes must be documented, implemented and tested and committed individually, one by one.

1. Use @foo for array slices and new syntax %foo for object slices.

The grammar enforces the correct usage according to context. The flow operator target is the one place where either form may be used:
- In object context: `->%foo` collects key:value pairs, `->@foo` collects values only
- In array context: `->%foo` collects index:value pairs, `->@foo` collects values only

There cannot be an array slice variable and an object slice variable of the same name (%foo with @foo is a variable name collision. The JavaScript spelling of both is 'foo'.)

Object group bindings now look like `(K:V as %slice)`.

Apart from type safety and readability and the flow operator case, there is no semantic change.

Bare '%' continues to signify "the remainder" (object properties that were not constrained.)

2. Replace the flow operator `->` with the `<collecting>` directive (except in `each` clauses, see #3).

Old syntax:
```
§L { $key: { name: ($n -> %names<^L>) } }
```

New syntax:
```
§L { $key: { name: $n <collecting $key:$n in %names across ^L> }}
```

Or if you only want to collect values (not key:value pairs):
```
§L { $key: { name: $n <collecting $n in @names across ^L> }}
```

The `across ^L` clause is **required** — there is no default scope. The label marks the iteration point at which separate buckets are created. Different branches at that point have different bucket instances; values are collected across all sub-branches beneath it.

If `<collecting ... in @names>` or `<collecting ... in %names>` appears multiple times with the same target, they all contribute to the same bucket (it is additive collection, not unification).

3. Change the syntax `KEY ':' VALUE 'else' '!'`, a hard-coded phrase in the current grammar, to:
```
FIELD_SCAN := 'each' KEY ':' VALUE_CLAUSE ('else' VALUE_CLAUSE)*
VALUE_CLAUSE := VALUE ('->' ('@'|'%') IDENT)?
```

The `each` keyword provides "validate all" semantics: for all k matching K, the value must match one of the VALUE_CLAUSEs.

The `->` flow operator is retained *only* within `each` clauses. For `->%bucket`, the key being collected comes implicitly from the `each` clause's key (whether or not it's bound to a variable). For `->@bucket`, only values are collected.

Quantifiers compose with `each`: `each K:V #{2,5}` means "for all k~K, v~V must hold, AND there must be 2-5 such k." 


5. Currently `K:V` means "There must be at least one matching field." `K:V#{m,n}` adds an additional condition: There must be between m and n matching fields.  Therefore `K:V#{0,}` has the surprising meaning "There must be at least one, and there must be at least zero."

Fix this by saying that the quantifier is not an *additional condition*, it is merely *the* condition, so that `K:V` is understood to be short for `K:V#{1,}`, and `K:V?` is short for `K:V#{0,}`.

Ditto for `each K:V`, with 'each' signifying (for all k in the object, k~K implies v~V).

In the case of the object validation idiom `each K:V1 else V2`, illustrate in the documentation that the quantifier must go at the end. Add a unit test to prove that `K:V1#{1} else V2` is a syntax error. Support for clarity `(K:V)#{m,n}.
