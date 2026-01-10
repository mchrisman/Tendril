Issue 1: $x=(pattern) vs (pattern as $x) — Major Documentation Inconsistency

Finding: Two binding syntaxes appear in documentation, but only ONE works.
┌─────────────────┬──────────────────┬─────────────────────────────────────────────────────┐
│ Syntax │ Status │ Where documented │
├─────────────────┼──────────────────┼─────────────────────────────────────────────────────┤
│ (pattern as $x) │ ✅ Works │ README.md (authoritative)                           │
├─────────────────┼──────────────────┼─────────────────────────────────────────────────────┤
│ $x=(pattern)    │ ❌ Does NOT work │ cheat-sheet.md, parser comments, many proposal docs │
└─────────────────┴──────────────────┴─────────────────────────────────────────────────────┘
Evidence:

- Parser comment (line 53) says $x=(pat) but it's misleading
- cheat-sheet.md lines 184, 232, 358-378 all use $x=(...) syntax
- Actual test: [$x=(1)] → parse error at =

Root cause: The cheat-sheet and proposal documents were written with a planned syntax that was never implemented, or the syntax was removed and docs weren't updated.

Impact: Anyone learning from cheat-sheet.md will write broken patterns.

  ---
Issue 2: re`...` and ci`...` — Nonexistent Syntax

Finding: I invented syntax that doesn't exist based on... nothing?

Correct syntax:

- Case-insensitive: hello/i or "hello"/i (suffix on literal)
- Regex: /pattern/flags (JavaScript-style)

Where did I get the wrong syntax? Likely from seeing common tagged template literal patterns in JavaScript (like sql\...orcss...`). This is actually a usability insight: users may expect this syntax because it's common in modern JS.

  ---
Issue 3: Optional Field Syntax K?: V vs K: V ?

Finding: The intuitive TypeScript-like syntax K?: V doesn't work.

Correct syntax: K: V ? (space before ?)

Documented at: README.md line 253 shows K:V? but the table format makes spacing ambiguous.

Usability insight: K?: V is how TypeScript, JSON Schema, and many other languages do optional fields. The Tendril syntax K: V ? is counterintuitive and easy to get wrong.

  ---
Issue 4: Label Placement §L {...} vs {§L ...}

Finding: Labels must go before the container, not inside.
┌────────────┬────────────────┐
│ Syntax │ Status │
├────────────┼────────────────┤
│ §L {a: $x} │ ✅ Works │
├────────────┼────────────────┤
│ {§L a: $x} │ ❌ Parse error │
└────────────┴────────────────┘
Documented at: Grammar line 1103 shows OBJ := LABEL_DECL? '{' ...

This is documented correctly but counterintuitive. Users might expect labels to work like {§L a: 1} to label the object they're inside.

  ---
Issue 5: Guards on Group Variables — By Design but Perhaps Wrong

Finding: Guards (where) are explicitly forbidden on @ variables.

Documentation: README lines 567-568 say guards only work with $x, not @x.

But is this right? A guard like @items.length > 2 would be useful. The restriction exists because guards evaluate to boolean and group bindings are arrays — but after binding, you have an array, and checking its length makes sense.

This might be a design decision worth reconsidering.

  ---
Issue 6: each in Arrays — Missing Feature

Finding: each only works in objects, not arrays.

What I expected: [(each $x where $x > 0)] to mean "every element must satisfy the condition"

Workaround: None exists. You can't express "all array elements must match" without each.

Usability insight: This is a gap in the language. Arrays often need "for all" semantics just like objects do.

  ---
Issue 7: replaceFirst — Missing API Method

Finding: replaceFirst doesn't exist; only replaceAll does.

The natural expectation: If replaceAll exists, replaceFirst should too.

Workaround: Use .first() chain: pattern.find(data).first()?.edit({...}) but this is awkward.

  ---
Issue 8: % vs %? for Remainder — Subtle Semantics

Finding: % asserts nonempty remainder. For optional remainder, use %?.

This is documented but easy to miss. The intuition "capture whatever's left" doesn't match the "assert nonempty" semantics.

  ---
Summary of Root Causes
┌─────────────────────────────┬───────┬───────────────────────────────────────────────────┐
│ Category │ Count │ Examples │
├─────────────────────────────┼───────┼───────────────────────────────────────────────────┤
│ Wrong syntax in cheat-sheet │ 1 │ $x=(pattern) should be (pattern as $x)            │
├─────────────────────────────┼───────┼───────────────────────────────────────────────────┤
│ Syntax I invented │ 2 │ re`...`, ci`...`                                  │
├─────────────────────────────┼───────┼───────────────────────────────────────────────────┤
│ Counterintuitive API │ 3 │ K: V ? not K?:, labels before not inside, % vs %? │
├─────────────────────────────┼───────┼───────────────────────────────────────────────────┤
│ Missing features │ 2 │ each in arrays, replaceFirst │
├─────────────────────────────┼───────┼───────────────────────────────────────────────────┤
│ Questionable restrictions │ 1 │ Guards on @ variables │
└─────────────────────────────┴───────┴───────────────────────────────────────────────────┘
  ---
Recommendations

1. Fix cheat-sheet.md — Replace all $x=(pattern) with (pattern as $x)
2. Consider implementing $x=(pattern) — It's more concise and appears everywhere in proposal docs. Maybe both syntaxes should work?
3. Consider K?: V syntax — More intuitive than K: V ?
4. Add each for arrays — Natural extension of the language
5. Add replaceFirst — Expected API complement
6. Reconsider guards on @ — Post-binding guards on arrays would be useful
