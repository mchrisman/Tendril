---
id: td-0020
title: Explicit collect syntax
status: backlog
priority: medium
type: feature
created: 2026-01-05T00:49:25-08:00
updated: 2026-01-05T00:49:25-08:00
tags: [buckets, syntax]
---

# DESCRIPTION

## CW 20

I've just realized that instead of using labels, there's a much better spelling. instead of
`§L { $key: { name: ($n -> %names<^L>) } }`
you could say
`{ $key: { name: $n <collect $key:$n in %names> }}`

Note, this adopts the proposal that % is an object slice and @ is an array slice. If you only wanted to collect the values, it would be something like.
`{ $key: { name: $n <collect $n in @names across $key>}}`

If you just want to collect from the local iteration and not from a key-loop at a higher level:
`{ _: { name: $n <collect $n in @names>}}`

If you want to collect a derived value, use the EL.

### **ChatGPT's response**

This is a genuinely nicer *mental model* than labels: it makes the “wiring” explicit at the point of collection, and it reads like an English side-condition rather than a second scoping language. It also avoids the biggest label problem: labels are metadata you have to chase to understand what a collector is keyed by.

A few thoughts on how it lands, and what I’d tweak to keep it sharp.

Your first example:

```tendril
{ $key: { name: $n <collect $key:$n in %names> } }
```

reads well. It says: “while matching `name:$n`, also collect `$key:$n` into `%names`.” That’s much more discoverable than `-> @names<^L>` because it explains both *what* you’re collecting and *where* it goes in one place.

A couple of design tensions to watch:

### 1) The angle-bracket payload is its own mini-language

That’s not necessarily bad, but you’ll want it to be very small and regular so it doesn’t become “second DSL.” Your proposed forms are already close to a tiny grammar:

* `<collect EXPR in TARGET (across KEYEXPR)?>`

That’s good. I’d keep it to exactly that, plus maybe one optional policy later (collisions).

### 2) “across $key” vs “collect $key:$n”

You’ve shown two ways to express keying:

* explicit pair: `collect $key:$n in %names`
* implicit keying via `across`: `collect $n in @names across $key`

Pick one as canonical. I’d lean toward the **explicit pair** form because it’s self-contained and doesn’t invent a new preposition:

* object collector: `in %names` expects a `{k:v}` expression
* array collector: `in @names` expects a scalar (or slice) value

Then your “values only” example becomes:

```tendril
{ $key: { name: $n <collect $n in @names> } }
```

and if you actually want the association to the outer key while still collecting “values,” you can just collect pairs into an object-slice collector instead:

```tendril
{ $key: { name: $n <collect $key:$n in %names> } }   // values keyed by $key
```

This eliminates `across` entirely, and the reader doesn’t have to learn two keying mechanisms.

(If you truly need “array bucket per outer key” you can still model it by collecting nested objects: collect `$key:[$n]`-ish, but that’s a separate feature.)

### 3) Where does it attach?

You’re attaching the collect-clause after `$n`, which is nice because it’s local and reads like an annotation. But you should specify attachment rules:

* It should be **zero-width** (doesn’t consume / doesn’t affect matching).
* It should run **only on successful branches** (your rollback property).
* It should be allowed after any ITEM, not just scalar bindings, if you want to collect derived values.

If you support EL, the derived-value story is clean:

```tendril
{ $key: { name: $n <collect $key:(string($n)+"!") in %names> } }
```

### 4) This obsoletes labels in the common case

Mostly, yes. Labels were doing two jobs: naming scopes and selecting which loop provides the key. Your `<collect …>` form selects the key by *expression* (`$key`) rather than by “which ancestor loop,” which is strictly more direct.

You might still want labels for other things (debugging, readability, maybe future constraints), but for collection scoping, this is a big simplification.

### 5) `%` vs `@` for slice type is a good clarification

If `%names` is “object slice collector” and `@names` is “array slice collector,” then the target itself communicates the shape. That makes the collect syntax easier to read and to type-check.

---

If I rewrite your three examples in the “explicit pair for objects, plain value for arrays” style (no `across`), they look like:

**Collect key→value pairs into an object slice:**

```tendril
{ $key: { name: $n <collect $key:$n in %names> } }
```

**Collect values into an array slice (local loop):**

```tendril
{ _: { name: $n <collect $n in @names> } }
```

**Collect derived value:**

```tendril
{ _: { name: $n <collect string($n) in @names> } }
```

That’s extremely readable.

The only missing piece is collision policy (do we fail, dedupe, append?), but you can punt that exactly the way you’ve been punting other “advanced” knobs: default to fail, and leave a future hook in the collect clause.

Net: this is a strong improvement. It moves “where does this collect and what key does it use?” from an out-of-band label mechanism into a **local, intention-revealing annotation**, which is exactly the direction your whole “clarifying / affirming intent” theme has been heading.

# LOG [2026-01-05T00:49:25-08:00]

Opened.
