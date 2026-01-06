---
id: td-0013
title: Feature categorization for pedagogy
status: backlog
priority: medium
type: quality
created: 2026-01-05T00:49:25-08:00
updated: 2026-01-05T00:49:25-08:00
tags: [docs, dx]
---

# DESCRIPTION

## CW 13

Categorize features, both for pedagogy and for AI coder prompting

Core (default / safe / first resort).
These features preserve local reasoning and make most bugs unrepresentable. Matching literals, wildcards, $x scalars, basic arrays and objects, breadcrumbs without .., simple joins via repeated $x, and straightforward editAll/replaceAll. Patterns here behave almost like structural assertions with extraction; if something matches, it’s usually obvious why. This is where you want both humans and AIs to start, and where most documentation examples should live.
Advanced (controlled power).
These introduce multiplicity and conditional structure but still keep reasoning mostly compositional. ... / @x grouping, optional ?, else, slice captures, remainder %, and path descent (.. / **). This is where joins get interesting and transforms become expressive, but also where solution counts can grow and where intent must be clearer. The guideline here is “mark every place multiplicity enters,” which Tendril already enforces well.
Arcane (expert-only / footguns acknowledged).
These features break locality or make reasoning global: negative lookaheads, subtle :>/!bad semantics, regex-heavy keys, complex alternation with shared variables, and anything that can cause solution explosion or non-obvious binding behavior. These aren’t bad, but they’re the ones where users (and LLMs) should expect to read the spec or debug traces. They’re also the features you might hide behind explicit opt-ins or warnings.
For AI-assisted programming, this categorization is gold. You can literally encode the rule: “Try Core only; if compilation fails with a specific diagnostic, allow Advanced; never use Arcane unless explicitly requested.” That turns Tendril into a constrained search space instead of an open-ended DSL, which is exactly what LLMs need to be effective and safe.
It also gives you a principled answer to “why so many features?”: most users don’t need most of them, most of the time — but when you do need them, you need them precisely, and Tendril makes you say so.

# LOG [2026-01-05T00:49:25-08:00]

Opened.
