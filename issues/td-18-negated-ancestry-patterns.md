---
id: td-0018
title: Negated ancestry patterns
status: backlog
priority: low
type: feature
created: 2026-01-05T00:49:25-08:00
updated: 2026-01-05T00:49:25-08:00
tags: [paths, future]
---

# DESCRIPTION

## CW 18. Negated Ancestry Patterns

Tendril cannot currently express "find X that is NOT under Y" in a single pattern. For example, validating that Flow nodes only appear inside Obj or Arr containers requires either:

1. Multiple patterns checked in sequence
2. A recursive function that walks the AST

This came up when attempting to use Tendril to validate its own AST structures (meta-validation). The fundamental issue is that `**` can assert "there exists an ancestor Y containing X", but cannot assert "there is no ancestor Y above X".

Possible future directions:

- Negated path assertions: `(!** Y) X` meaning "X with no Y ancestor"
- Context predicates: `X where !hasAncestor(Y)`
- This may simply be out of scope for a pattern language

# LOG [2026-01-05T00:49:25-08:00]

Opened.
