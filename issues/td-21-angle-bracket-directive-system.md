---
id: td-0021
title: Angle bracket directive system
status: backlog
priority: low
type: feature
created: 2026-01-05T00:49:25-08:00
updated: 2026-01-05T00:49:25-08:00
tags: [syntax, future]
---

# DESCRIPTION

## CW 21

Things we might do in the future with angle brackets.

You already have several *suffix-ish* micro-constructs that are conceptually “options/constraints on the thing to the left.” A `[...]` qualifier could consolidate a lot of them over time (even if you don’t do it now).

A few concrete candidates:

### 1) Quantifiers and “optional” flags

Right now you have postfix `?`, `*`, `+`, `#{m,n}`, and `%?`, `#?` shorthands. Those are all “cardinality constraints.”

A bracket qualifier could become the general host for cardinality, while keeping the punctuation forms as sugar:

* Current: `K:V?`, `K:V#{2,4}`, `%?`, `#?`
* Future-capable: `K:V[count=0..∞]`, `K:V[count=2..4]`, `%[count=0..∞]`

You probably wouldn’t replace `?`/`*`/`+` (they’re too ergonomic), but `#{m,n}` is already “less common / more advanced,” exactly where a bracket form shines.

### 2) Strong semantics (`else !`) and future collision policies

You’ve got strong semantics as a postfix-ish “mode switch” on a field clause. Brackets could house that as an attribute:

* Current: `K:V else !`
* Future: `K:V[strong]` or `K:V[bad=fail]`

Likewise, your bucket collision policy is *exactly* a qualifier:

* Default: collision ⇒ fail
* Future: `-> @b[^L, collide=fail|first|last|merge]`

This is the cleanest “extensibility” win of `@bucket[^label]`: you’re opening a slot for policy.

### 3) Remainder (`%`, `!%`, `%?`)

Remainder is currently a special tail clause with its own mini-syntax. If you ever want to generalize “remainder handling” (capture extras, forbid extras, etc.), a qualifier gives you a consistent story:

* Current: `%`, `(!%)`, `(%? as @rest)`
* Future direction: `%[allow]`, `%[deny]`, `%[optional]`, `(% as @rest)[optional]`

Even if you keep `%` special, putting constraints in brackets makes the mental model uniform.

### 4) Flow / bucket targeting (your immediate case)

`@bucket[^label]` reads like “bucket qualified by anchor.” Great. And it extends naturally:

* `@bucket[^label]` (anchor)
* `@bucket[^label, collide=fail]`
* `@bucket[^label, key=index]` vs `key=objectKey` (if you ever want array buckets keyed differently)

It also makes your earlier “sadistic” temp-bucket joke unnecessary, because the bracket becomes the general wiring space.

### 5) Breadcrumb/path modifiers (if you ever add any back)

You removed breadcrumb quantifiers in v5, but if you later reintroduce any “path traversal options” (bounded depth, stop conditions, etc.), brackets are a natural place:

* `**[maxDepth=3]`
* `.foo[case=i]` (less likely, but you get the idea)

### 6) Guards: probably *don’t* fold them into brackets

Guards already have a good “language-y” slot: `(pattern as $x where expr)`. Brackets could theoretically host `where`, but you’d lose clarity fast. I’d keep guards as-is and treat brackets as “structural modifiers,” not “expression modifiers.”

---

#### The consolidation principle

Brackets are best as a single, uniform place for **non-branching metadata**: scoping/anchoring, cardinality constraints, strictness modes, and policies (especially collision policy). That lines up with your desire to keep the language “punctual” while still searchable and extensible.

If you want one crisp rule to prevent bracket sprawl: *“brackets may not introduce new branching.”* They can only constrain, not enumerate. That keeps them from becoming a second “where.”

So yes: `@bucket[^label]` can be the first member of a broader "qualified suffix" family, and the best nearby consolidation targets are (a) bucket policies, (b) rarely-used count quantifiers, and (c) remainder strictness/optionality.

# LOG [2026-01-05T00:49:25-08:00]

Opened.
