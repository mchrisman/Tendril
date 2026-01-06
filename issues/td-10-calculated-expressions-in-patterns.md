---
id: td-0010
title: Calculated expressions in patterns
status: backlog
priority: low
type: feature
created: 2026-01-05T00:49:25-08:00
updated: 2026-01-05T00:49:25-08:00
tags: [el, keys]
---

# DESCRIPTION

## CW 10. Calc

Proposal: support calculated expressions in the pattern (not just in guards).

This allows some usages to preserve the O(1) behavior and pruning optimizations for key-matching.

Syntax: ==expr
Semantics: It is equivalent to writing the resulting primitive literal in the pattern, and it never binds variables.

list indices:

```
{
    list[==2*$idx]: $name
    list[==2*$idx+1]: $number
}
```

Path notation

```
{
    user: {id:$id}
    data: personal.prefs.=="P"+$id: { some:pref }
}
```

Keys in normal notation

```
{
    user: {id:$id}
    data: {personal: prefs: { =="P"+$id: { some:pref } } }
}
```

It may only be used for list indices and object keys.
It would **not** support deferred calculation for free variables. It fails with an error, not a silent mismatch, if it contains free variables.
It must evaluate to a primitive.
Once evaluated, it must be memoized (AST identity + bindings).

TBD: Clarify precedence and how it might combine with other syntactic structures.

# LOG [2026-01-05T00:49:25-08:00]

Opened.
