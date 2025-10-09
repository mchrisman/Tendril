Looking through the spec, here are some things that jump out:

## Ambiguities/Unclear Points

**1. Object quantifiers default is surprising:**

```
k:v            === k:v #{1,}          // default (one or more)
k:v #?         === k:v #{0,}
```

This is inconsistent with arrays where `a` matches exactly one. Why does `k:v` mean "one or more keys matching this pattern"? I'd expect it to mean "exactly one key" by default. The current design means you can't easily express "exactly one key named 'id'" without `k:v #{1,1}`.

**2. Set quantifiers are unspecified:**

```
{{ a b c }}                         // 1 pattern (matching a Set)
```

Do Sets support quantifiers? `{{ a* }}` - does that mean anything? What about `{{ a #? }}`? The spec doesn't say.

**3. Space (adjacency) meaning varies by context:**

- In arrays: `a b c` = sequence
- In objects: `a:b c:d` = simultaneous patterns
- In sets: `a b c` = members

This isn't wrong, but it's cognitively heavy. Users need to remember context to parse.

**4. Bareword ambiguity:**

```
bareword                            // coerce to string
```

Does `{ class: "MyClass" }` match `{ class:MyClass }`? What about `{ myVar: value }` - is `value` a bareword string or an undefined variable reference (should it be `$value`)?

**5. Slice replacement scope unclear:**

```
>> a b c <<                         // Designate a slice to be replaced
```

Can this appear anywhere? `[x >> a* << y]`? What does `>> $x=a* <<` mean - replace each binding or the whole sequence?

## Probable Design Issues

**6. Greedy vs lazy defaults are inconsistent:**

```
a*             // greedy (maximal match)
...            === _*?              // lazy
```

Why is `...` lazy by default but `a*` greedy? This seems like it'll cause confusion. I'd expect `...` to be `_*` (greedy wildcard).

**7. The `/regex/` literal is underspecified:**

```
/regex/                             // coerce to string
```

- Does it support flags? `/regex/i`?
- Can it be used as a key pattern? `{ /^user_/:_ }`?
- What about in bindings? `$x=/[ab]/` works in your examples, but does `$x=/regex/` bind to the string or to the regex match?

**8. Vertical pattern whitespace rule:**

```
{ a.b.c:d }                         // No whitespace around the dot
```

This feels fragile. `{ a. b.c:d }` is an error? What about `{a.b. c:d}`? The "no whitespace" rule will be hard to remember and annoying to debug.

**9. Missing: how do quantifiers interact with alternation?**

```
(a|b)*         // Does this work as expected?
a|b*           // Is this (a|b)* or a|(b*)?
```

Your precedence says `|` is lowest, so `a|b*` → `a|(b*)`, but this might surprise users.

**10. Assertion consumption is unclear:**

```
(?=pattern)      // positive lookahead - succeeds if pattern matches, doesn't consume
```

What does "doesn't consume" mean in a structural pattern matcher? In an array `[(?=a) b]`, does this match `[a]` or `["a", "b"]`? If lookahead doesn't consume, does the `b` pattern then try to match the same element?

**11. Multiple spreads semantics:**

```
// Multiple spreads allowed: [a ... b ... c] matches [a x y b z c]
```

How does the matching work? Greedy left-to-right? Does `[... a ... a]` match `[a]` (both `...` match zero, both `a` match same element)? What about `[a ... a]` on `[a]`?

**12. Regex operators don't compose well:**
You have `/regex/` literals but no way to compose them with your structural operators. Can you write `/a|b/+` to mean "one or more strings matching a or b"? Or do you need `(/a|b/)+`?

---

## Suggestions

**Priority fixes:**

1. Clarify or reconsider object quantifier defaults
2. Specify Set quantifier behavior
3. Define bareword vs variable syntax clearly
4. Make greedy/lazy consistent or well-motivated
5. Elaborate on lookahead semantics with examples

**Nice to have:**

- More examples of slice replacement
- Vertical pattern whitespace rationale (or relax the rule)
- Explicit alternation + quantifier examples
  . Clarifications to Add to Spec


-------

Allow whitespace around . in vertical patterns: { a.b.c : d } is fine
Clarify that regex bindings ($x~/pattern/) bind the matched string, not regex internals
Better explain "lookahead" semantics without using "consume". 
Call them symbols, not variables.
Add examples showing ($x~pattern)* vs $x~(pattern*) distinction with actual match/no-match cases

Explain the symbol or the slice versus unit thing better. Everything is a slice.
---

$x defaults to $x:_+ in arrays, $x:_ in key paths

$x= -- change to $x~

