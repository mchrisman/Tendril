---
id: td-0022
title: Grammar for meta directives
status: backlog
priority: low
type: feature
created: 2026-01-05T00:49:25-08:00
updated: 2026-01-05T00:49:25-08:00
tags: [syntax, future]
---

# DESCRIPTION

## **CW 18 Grammar for directives**

That makes sense — and if angle brackets are *the* general attachment point for “meta that affects matching/execution but isn’t a data-shape pattern,” then it’s worth leaning into that and making it feel like a coherent subsystem rather than an ad-hoc exception for collection.

Two things to get right so it doesn’t become a second DSL:

You want a **very small, regular core** that can host multiple commands, and you want a **crisp semantic contract** for all meta commands (when they run, whether they backtrack, how they scope, whether they can bind, etc.). If you nail those, the mini-grammar will feel like “attributes” in Rust, not like a new language.

### 1) A uniform attachment model

Make `<…>` an “attached meta clause” that can follow any ITEM (or maybe any ITEM_TERM) in any context (array/object/value/key), with this contract:

* It is **zero-width**: it never consumes input.
* It is **branch-local**: it runs only if the match branch containing it succeeds.
* It is **rollback-safe**: if later matching fails/backtracks, its effects are reverted (same property you already want for buckets).
* It cannot introduce new branching (unless you deliberately allow that, but I’d forbid it).
* It sees the current bindings/environment at the attachment point.

This makes all meta commands behave predictably.

### 2) A tiny command grammar, not a freeform language

Even if you allow multiple commands, keep each command a single, fixed-shape form with optional modifiers. Something like:

```
META := '<' META_CMD ( ';' META_CMD )* '>'
META_CMD :=
    'collect' EXPR 'in' TARGET
  | 'assert'  EXPR
  | 'trace'   STRING?
  | 'limit'   INTEGER
  | ...
TARGET := '%' IDENT | '@' IDENT
EXPR := <EL expression> | <pair expr for % targets>
```

Now `<collect …>` is just one instance. You can later add `<assert …>` for your “training wheels / boundedness” ideas without inventing new syntactic corners.

### 3) Your collect proposal fits this beautifully

With the contract above, `<collect …>` becomes a straightforward effectful meta command:

```tendril
{ $key: { name: $n <collect $key:$n in %names> } }
```

and because it’s attached after `$n`, it naturally means “collect when this submatch succeeds.” No labels, no “across,” no implicit scope selection.

If you ever need to refer to *which key loop* you’re in, that’s already explicit: you use `$key` (or any expression) as the collected key. The “scope” becomes data in the environment, not a separate label system.

### 4) A naming suggestion: call them “annotations” or “directives”

To keep the mental model clean, I’d give the `<…>` forms a name that signals “not a pattern” but also “not a comment”:

* “annotations” is good (Rust/TS vibes).
* “directives” is okay but can feel compiler-ish.
* “meta clauses” is accurate but a bit jargon.

“Attached annotations” reads nicely in docs: “You can attach annotations like `<collect …>` to any subpattern.”

### 5) Keep the no-branching rule

If angle brackets are the “meta convention,” your best guardrail is the one you already hinted at earlier with brackets:

> Meta annotations may **constrain, record, or limit**, but may not **enumerate**.

That single rule prevents the subsystem from turning into a second pattern language.

So: I think making `<…>` a real grammatical feature is a strong move, as long as you treat it as a tiny, regular “attribute language” with a strict semantic contract. If you do, the collect syntax you proposed feels like the first obviously-good use case rather than a one-off.

# LOG [2026-01-05T00:49:25-08:00]

Opened.
