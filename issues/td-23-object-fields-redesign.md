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

The grammar enforces the correct usage according to context. There's only one place in which either form may be used: the object of the flow operator, where `->%foo` means collect key:value pairs, and `->@foo` means collect only the values. 

There cannot be an array slice variable and an object slice variable of the same name (%foo with @foo is a variable name collision. The JavaScript spelling of both is 'foo'.)

Object group bindings now look like `(K:V as %slice)`.

Apart from type safety and readability and the flow operator case, there is no semantic change.

Bare '%' Continues to signify "the remainder" (Object properties that were not constrained.)

2. Replace

`§L { $key: { name: ($n -> %names<^L>) } }`

with

`{ $key: { name: $n <collecting $key:$n in %names> }}`

Or if you only want to collect values and not keys,

`{ $key: { name: $n <collecting $n in @names across $key>}}`

(You still have to refer to key in order to set the scope of the collection. If `collecting...in @names` or `in %names` appear more than once, They must refer to the same key, and it is not unification, it is just more collecting.

The arrow operator `->` is thus replaced with the `<collecting>` directive, *except* in the case of #3 below.

3. Change the syntax `KEY ':' VALUE 'else' '!'`, a hard-coded phrase in the current grammar, to
```
FIELD_SCAN:='each' KEY ':' VALUE_CLAUSE ('else' VALUE_CLAUSE)*
VALUE_CLAUSE:=VALUE ('->' ('@'|'%') IDENT)*
```
*Only for ->% collectors in this phrase*: You do not need to specify where the key being collected comes from. It implicitly comes from the key in this field scan clause, whether or not you bind it to a variable. 

4. Document the contract for <directives> generally.
* It should be **zero-width** (doesn’t consume / doesn’t affect matching).
* It should run **only on successful branches** (your rollback property).
* It should be allowed after any ITEM, not just scalar bindings, if you want to collect derived values.

5. Currently `K:V` means "There must be at least one matching field." `K:V#{m,n}` adds an additional condition: There must be between m and n matching fields.  Therefore `K:V#{0,}` has the surprising meaning "There must be at least one, and there must be at least zero."

Fix this by saying that the quantifier is not an *additional condition*, it is merely *the* condition, so that `K:V` is understood to be short for `K:V#{1,}`, and `K:V?` is short for `K:V#{0,}`.

Ditto for `each K:V`, with 'each' signifying (for all k in the object, k~K implies v~V).

6. Eliminate the '?' forms `K:V?` and `K:V else !?`, As they are confusing and are redundant, since you can now say `K:V#{0,}` or `each K:V#{0,}`.







