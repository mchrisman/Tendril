---
id: td-0019
title: User-friendly API redesign
status: backlog
priority: high
type: feature
created: 2026-01-05T00:49:25-08:00
updated: 2026-01-05T00:49:25-08:00
tags: [api, dx]
---

# DESCRIPTION

## CW 19 Nicer API

Deprecate the existing API. It's too low level and too tied to the implementation. Keep it around as an escape hatch, but focus on better user-level APIs.

Note, all these methods have a Tendril.foo(pattern,)

Query:

"Does this match (whole match)?" → Tendril(pat).fits(data) → boolean
"Give me the pieces" → Tendril(pat).foundIn(data) → array of matching substructures
"Give me the values" → Tendril(pat).extract(data) → solutions

Transform:

"Replace all matches" → Tendril(pat).replaceAll(data, replacement) → new data
"Remove all matches" → Tendril(pat).removeAll(data) → new data
"Transform all matches" → Tendril(pat).transformAll(data, fn) → new data

Validate:

"Does this conform?" → Tendril(pat).fits(data) → boolean
// not supported yet
// "Show me violations" → Tendril(pat).validate(data) → {valid, errors}

### Alternate suggestions

Sure — here’s a **concise list of concrete API candidates**, framed as *use-case–level entry points*, not low-level plumbing. Think of these as *additive* layers on top of your existing model.

---

### **Extraction / Query (relational-style results)**

1. **`rows(data, columns?, options?)`**
   Return an array of plain objects (records).

    * Scans or anchors depending on pattern type or option
    * Projects only selected bindings
    * Normalizes missing fields (omit / `undefined` / error)

2. **`row(data, columns?, options?)`**
   First row only (or `null` / error).

3. **`pluck(data, vars, options?)`**
   Shorthand for extracting one or more bindings without full records.

4. **`get(data, var)`**
   Return the first bound value of a variable.

5. **`getAll(data, var)`**
   Return all bound values of a variable across matches.

6. **Row post-processing helpers (chainable or optional):**

    * `.unique()` / `.distinctBy(vars)`
    * `.groupBy(var)`
    * `.orderBy(vars)`

---

### **Transformation / Rewrite (tree surgery)**

7. **`rewrite(data, rule, options?)`**
   Apply a rewrite rule everywhere (default = per occurrence, first solution).

8. **`rewriteFirst(data, rule, options?)`**
   Rewrite only the first matching occurrence.

9. **`rewriteAllSolutions(data, rule, options?)`** *(explicit / advanced)*
   Opt-in footgun for solution-level rewriting.

10. **`replace(data, value | fn, options?)`**
    High-level `$0` replacement (wrapper around `replaceAll`).

---

### **Validation / Assertion**

11. **`assertMatch(data, options?)`**
    Require anchored match; throw rich error if not.

12. **`assertFind(data, options?)`**
    Require at least one match anywhere.

13. **`check(data, options?)`**
    Return a structured validation report:
    `{ ok, matchCount, samplePaths, warnings }`

---

### **Convenience / Shortcuts**

14. **`firstSolution(data)`**
    Return `{…bindings}` for the first match.

15. **`firstOccurrence(data)`**
    Return `{ path, value, bindings[] }`.

16. **`matches(data)`**
    Iterate `(occurrence, solution)` pairs directly (flattened but contextual).

---

### **Design Notes (implicit in all candidates)**

* Occurrence context is **preserved by default**, but hidden unless requested
* Shape differences across occurrences are **explicitly handled** via projection
* Editing defaults are **deterministic and safe**
* Low-level `match/find/OccurrenceSet/SolutionSet` remain as escape hatches

---

### **Minimal “If You Only Add Two” Recommendation**

If you want the biggest payoff with the least surface area:

* **`rows()`** — extraction / joins become obvious
* **`rewrite()`** — transformation becomes obvious

Those two alone make Tendril feel like a *tool*, not just a *mechanism*.

# LOG [2026-01-05T00:49:25-08:00]

Opened.
