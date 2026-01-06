---
id: td-0011
title: Optimized primitives for common cases
status: backlog
priority: medium
type: quality
created: 2026-01-05T00:49:25-08:00
updated: 2026-01-05T00:49:25-08:00
tags: [performance, api]
---

# DESCRIPTION

## CW 11. Optimized primitives for common cases

In practice people need: “key absent,” “no keys matching regex,” “no values matching predicate,” “closed object,” and “only keys from this set.” If you don’t make those primitives obvious and idiomatic, users will recreate them with enumeration-heavy patterns (wildcard keys + negative constraints) and you’re back in explosion land. So I’d put on the cut line a small set of object-level constraints that are syntactically distinct from matching clauses. Concretely, something like absent(K) / forbid(K:V) / closed (your !%) / allowExtras (default) / captureExtras (%? plus binding). Whether it’s spelled as guards, a where block, or a dedicated !{...} constraint form doesn’t matter as much as: it must not enumerate, and it must read like a constraint, not like a pattern that backtracks.

# LOG [2026-01-05T00:49:25-08:00]

Opened.
