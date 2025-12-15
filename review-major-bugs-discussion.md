

--------------------------------

# Discussion of issue #1

#1 is the most fundamental and critical of these. It probably went unnoticed because keys are generally literal. What's your feeling about which interpretation is most useful, or whether it is necessary to have syntax to support both types of assertion?

---

If Tendril’s “killer feature” is *relational joins across a tree*, then the **universal** interpretation (“for all keys matching K, values must match V; and at least one such key exists”) is the one that stays stable as patterns get more abstract (regex keys, alternation keys, `$name` keys). It also matches how people read *assertions* in an object literal: you’re stating a constraint about the object, not “pick one witness key”.

The **existential** interpretation (“there exists at least one matching key/value pair”) is still very useful—but it behaves more like *search* than *assertion*, and it’s exactly the thing that quietly breaks `remainder` / closed-object reasoning unless you’re extremely careful.

So my gut:

* **Default `K:V` should be universal + requires existence** (your README semantics).
* You should also support an explicit **existential** predicate because it’s convenient and often what people want for “does this structure contain *some* thing”.

### Is it necessary to support both?

I think yes, *if* you want Tendril to feel good both as:

1. a **validator / constraint language** (universal semantics), and
2. a **query language** (existential semantics).

Trying to make one semantics serve both roles is where the weirdness comes from (especially with `remainder`, negation, and joins).

### A clean way to support both without confusion

Keep your current operators but give them distinct meanings:

* `K:V` — **universal + exists**
  “At least one key matches K, and every matching key’s value matches V.”

* `K?:V` — **universal + optional existence**
  “Every matching key’s value matches V (and it’s fine if none match).”

Then introduce one explicit existential form, e.g. one of these (pick the one that reads best in your DSL):

* `K!:V` — **exists** (my favorite; mirrors “there exists” / “bang” often reads as “at least one”)
* `K~:V` — **exists** (tilde = “somewhere-ish”)
* `K?:V` could be repurposed as existential, but you already documented it as optional-universal, and that’s a useful concept—so I’d keep it.

With `K!:V`, your examples become nicely orthogonal:

* `{ a:b }` = “all `a` keys are `b`, and there is an `a`”
* `{ a?:b }` = “if `a` exists, it’s `b`”
* `{ /a/:1 }` = “every key matching /a/ has value 1, and at least one such key exists”
* `{ /a/!:1 }` = “there exists a key matching /a/ with value 1”

### Why this split is especially important for `remainder`

`remainder` is only “principled” if object terms are **set constraints** (universal-ish), because then you can define remainder as “keys not matched by any assertion key-pattern” (or “not covered by any declared clause”). With existential semantics, remainder becomes hostage to which witness you happened to pick, which is rarely what users mean.

### TL;DR

Most useful default: **universal assertions** (your README).
Also worth having: an explicit **existential assertion** operator so querying stays ergonomic.

---

So the meaning of remainder should probably be conjunction of NOT (k ~ K_n AND v ~ V_n), whether the matching was existential or universal.
---

Yes — if you want `remainder` to be well-defined and not depend on “which witness key did we pick”, it has to be computed from **coverage**, not from the search path.

A good way to state it:

Let the object be a set of pairs (P = {(k,v)}). Let the object pattern contain *assertions* (A_1..A_n), where each assertion (A_i) has a key pattern (K_i) and a value pattern (V_i) (and possibly breadcrumbs, but those just change what “value” means).

Then define:

[
\text{covered}(k,v) := \bigvee_{i=1..n}\big(;k \sim K_i ;\wedge; v \sim V_i;\big)
]

and

[
\text{remainder} := {(k,v)\in P \mid \neg \text{covered}(k,v)}
]

That’s exactly your “conjunction of NOT (k ~ K_n AND v ~ V_n)” idea, but expressed as “not covered by *any* assertion”.

### Why this is the right notion even if assertions are existential

Even if you add an existential operator like `K!:V` (“there exists a pair matching”), you still want `remainder` to mean “stuff not matched by any clause”, otherwise:

* `{ a:1 (?!remainder) }` could become true just by choosing `a:1` as the witness, even if `b:2` exists.
* `@rest=(remainder)` would capture different things depending on which witness branch you happened to take.

With “coverage remainder”, those become stable.

### The catch: bindings and “~”

The only subtle part is what “(k \sim K_i) and (v \sim V_i)” means when patterns contain variables.

You basically have two choices (both defensible):

1. **Remainder is computed per-solution (recommended).**
   For a given solution/binding environment (\theta), define coverage using matches under (\theta). This means `remainder` can legitimately differ across solutions (because `$name` might bind differently), but it still won’t depend on arbitrary witness choices within a solution.

2. **Remainder is computed existentially over possible bindings.**
   A pair is “covered” if there exists *some* consistent binding making it match some assertion. This makes remainder smaller and can be surprising when variables are unconstrained.

Most systems with Prolog-ish solutions end up with (1): remainder is a function of the solution.

### Practical implication for your engine

To implement this cleanly, you want to track, for each solution branch, a **covered-set** of keys (or pairs) derived from the assertions’ *full matching*, not “testedKeys”. Then:

* bare `remainder` asserts `remainder != ∅`
* `(?!remainder)` asserts `remainder = ∅`
* `@x=(remainder)` binds exactly that remainder set (with whatever quantifier rule you choose)

This also nudges you toward universal semantics for `K:V`, because then coverage naturally aligns with “this assertion applies to these pairs”.

---

Let's think about syntax for a minute. It may be wise ergonomically, even if it isn't necessary, to make the existential (E) vs universal (A) interpretation consistent for the whole object pattern, i.e. `E {K:V K2:v2}` instead of `{E K:V E K2:V2}`

---

Yeah, that’s a really strong ergonomic move.

If people are going to *mentally categorize* an object pattern as either:

* “a **schema/constraint** over the object” (universal), or
* “a **query/search** over the object” (existential),

then making that a **mode on the whole `{…}`** is both readable and hard to misuse.

### Why object-level mode is nicer than per-assertion flags

* **It matches intent.** Most patterns are either “validate-ish” *or* “find-ish”. Mixing both is rarer.
* **It avoids visual noise.** `{ E K:V E K2:V2 }` gets ugly fast, especially once keys/values are complex.
* **It makes `remainder` sane.** In universal mode, `remainder` naturally reads as “stuff not covered by my constraints”. In existential mode, `remainder` is often not what you meant unless you’re very explicit.

### But you probably still want an escape hatch

Sometimes you do want: “universally constrain one family of keys, and also assert existence of one special thing”. Example:

* “All `/^x_/` keys must be ints, and there exists `id`.”

That’s a common real-world shape. If you only have a whole-object mode, you’ll want a way to express the “one-off” without forcing a second pass.

So: **object-level mode as default ergonomics**, plus an **optional per-assertion override** for the rare mixed cases.

### Concrete syntax options that read well

**Option 1 (simple): prefix modifier**

* `A{ ... }` = universal mode (probably default; you can even omit `A`)
* `E{ ... }` = existential mode

This is exactly what you suggested.

**Option 2: braced keyword**

* `exists { ... }`
* `all { ... }`

More verbose but self-documenting.

**Option 3: operator inside braces**

* `{:: ... }` vs `{:? ... }` etc

I’d avoid this; harder to scan.

### Semantics suggestion (tight + predictable)

Let `mode` apply to **how each `K:V` clause contributes to success**, but keep your “coverage-based” `remainder` definition independent (as we discussed).

* **Universal mode (`A{...}`):** each `K:V` is “for all matching keys, values match; and at least one key matches”.
* **Existential mode (`E{...}`):** each `K:V` is “there exists a matching key/value pair”.

Then keep `K?:V` meaning consistent in both modes as “no existence requirement”:

* In **A mode**: “for all matching keys, values match (maybe none)”
* In **E mode**: honestly, `K?:V` becomes a little weird because existential already doesn’t force “all”; I’d either:

    * keep `?:` as “optional existence” (so in E-mode it’s basically redundant), **or**
    * forbid/strongly discourage it in E-mode to keep the language crisp.

### The escape hatch: per-assertion override

If you do add it, it should be lightweight and visually obvious, like:

* `E{ a:1  A /x_.*/:int  }` (per-clause overrides inside)
* or `E{ a:1  (all /x_.*/:int) }`

I’d personally prefer parentheses for overrides, because they already mean “grouping” in your grammar.

### My recommendation

* Make **universal the default**: `{ ... }` ≡ `A{ ... }`
* Add `E{ ... }` for query mode
* Decide whether to (a) allow mixed-mode overrides, or (b) require composition (two patterns / two passes) for mixed intent. If Tendril is positioning itself as *join/query heavy*, I’d include the override; it will come up.

---

Is the second pass unreasonable in that case? Combining two assertions may be more readable than individually tagging the assertions. From a performance standpoint, the performance cost is more tied to the assertions than to the iteration, so perhaps iterating twice isn't a big deal. From a syntax standpoint, `A & B` would be equivalent to `(?=@tmp=(A))@tmp=(B)` (if we supported bindings in lookaheads)

---

A second pass is totally reasonable *in the mixed-mode case*, and I agree it’s often *more readable* than peppering per-assertion tags.

### Readability

When you’re expressing “global constraint + existence”, this:

```tendril
A{ /^x_/ : int } & E{ id : _ }
```

reads closer to intent than:

```tendril
A{ /^x_/ : int  E id : _ }
```

because the mode switch is *structural*, not incidental.

### Performance intuition

Your take is basically right:

* The expensive part is usually **assertion evaluation / backtracking / binding explosion**, not “looping over keys” once more.
* If both subpatterns share work (e.g., both compute key matches), a fused evaluator *could* be faster, but it’s also harder to get right (and you’re already juggling binding environments and remainder semantics).
* Two passes also let you short-circuit: fail fast on the “cheap constraint” before doing the “join-y query”, or vice versa depending on a heuristic.

So unless you’re targeting super hot paths, “two passes” is a good default trade.

### Semantics: `A & B` as conjunction

Having an explicit **pattern-level conjunction** is a nice unifier. It also scales beyond object-mode: you can conjoin any two patterns, not just objects.

But the equivalence you wrote:

> `A & B` ≡ `(?=@tmp=(A)) @tmp=(B)` *(if we supported bindings in lookaheads)*

…is exactly where a built-in `&` is cleaner. Binding-in-lookahead is powerful, but it creates tricky corner cases:

* **Which solution(s) from the lookahead bind?** First only? All? (If all, you’ve basically reintroduced full conjunction semantics anyway.)
* **Does the lookahead “commit” bindings?** If yes, it becomes a weird “run A, keep one solution, then run B”. If no, it can’t express conjunction with shared variables.

A first-class `&` can simply mean:

> evaluate A, producing solutions; for each solution, evaluate B under that environment; emit the joined solutions.

That’s “Prolog conjunction” and matches how people expect unification to work.

### How `&` interacts with E/A object modes

If you do *only* object-level mode, `&` becomes the way to mix intent without per-assertion tags:

* `A{...} & E{...}` = “schema-ish constraints plus one existence query”
* `E{...} & E{...}` = “two existential requirements (possibly sharing vars)”
* `A{...} & A{...}` = “compose constraints (nice for modularity)”

This also helps **`remainder`**: each `{...}` can compute its own coverage-based remainder cleanly in its own semantic universe.

### One syntactic caution

If you add `&`, I’d strongly recommend it be **low precedence** (like `|`), and *lower* than alternation, so users don’t need parentheses constantly. Roughly:

* bindings / quantifiers / breadcrumbs
* adjacency
* `&`
* `|`

That way `A & B | C` reads as `(A & B) | C` (usually what you want).

### Bottom line

* Second pass is not just reasonable; it’s arguably the *simplest and most consistent* way to support mixed existential/universal intent.
* A top-level `&` operator is the right abstraction for that, and it avoids the semantic tarpit of “binding lookaheads”.


# End Discussion of issue #1


------ scratch, ignore


> - {$k:$v} → existential (each key-value pair is a solution) ✓ current behavior, correct
>  - {/a/:1} → universal (all matching keys must satisfy) ✗ current behavior is wrong

The correct analysis is:

- {/a/:1} → universal (all matching keys must satisfy) ✗ current existential behavior is wrong
- {literal:1} → universal (all matching keys must satisfy) ✗ current implementation is wrong, but it accidentally works because for constant literals, 'all matching keys' is the same as 'any matching keys'
- {$k:$v} → universal (each key-value pair is a solution) ✗ current implementation is wrong, but it accidentally works because bound variables are, within the context of a single solution, like constant literals.















