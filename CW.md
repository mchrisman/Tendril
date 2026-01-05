# Current work (CW)

## CW 2. Language pruning

The language has got too complex and messy, and we need to prune or streamline some features. A large part of this will be solved in documentation by relegating more complex features to the reference section or a separate "advanced" section. But there are some specific language changes:

1.
2. Retire positive and negative look-aheads for object field clauses.Replace with simple boolean expressions with better defined semantics for the remainder.
3. Retire quantifiers for object field clauses. Replace them with CW 4, which includes a simplified quantifier scheme for buckets.
4. Retire item repetition numeric quantifiers a{m,n}. Keep the notation for greedy, lazy, possessive quantifiers, but relegate it to a footnote. Possessive is an 'advanced' escape hatch.
5. Allow anonymous guards on wildcards: `(_ where _ % 2 == 0)` short for `(_ as $tmp where $tmp % 2 == 0)`
6. Allow the top level pattern to be a slice, for find/edit/replace:

```
Tendril("{ a:b }").find(data).replaceAll("X") // Cross out any object that contains key 'a'. 
Tendril("a:b").find(data).replaceAll("X:X") // Replace only that key, not the whole object. 
```

7. Retire quantifiers for object remainders. Retain only '%','!%','%?'.
8.

Commit harder to the Core subset. Make it possible—maybe even default—to use Tendril with just literals, $x, arrays, objects, and breadcrumbs. No @, no ->, no guards. That's already more powerful than JSONPath.
Make explosion visible.
Simplify object semantics. The weak/strong distinction is too subtle. Consider making else ! the default (fail-fast) and requiring explicit opt-in to weak semantics.
Document the cost model. Users need to know what's O(1), O(n), and O(n^k). Right now it's opaque.

## CW 2A. Object slice quantifiers

Retire O_KV_QUANT and O_REM_QUANT.

To replace the lost quantifiers (which are infrequently needed), support '#' in EL:

Bare K:V clauses (no change to existing)

```
     K:V,   K:V else !    // asserts #{1,Infinity}
     K:V ?, K:V else !?   // asserts #{0,Infinity}; 
                          // - note this acts like a quantifier, 
                          // not a branching alternation. 
```

Slice variables bound to K:V clauses (Previously not supported at all.)

```
    // assuming CW 2b
      
    (K:V? as @foo where m < #@foo < n)
    
    // K:V already asserts a nonempty result; the 'where' clause is a second constraint.
    (K:V as @foo where m < #@foo < n)
    
```

More examples, make sure we support these.

```
    [ ... (@slice where #@slice>5) ...]
    { (K:V as @S where #@S>5) }
     // With '->', the sizes of the A/B buckets are not known until iteration is complete. Evaluation is deferred until then.
    { K: (V -> @A where #@A>5) else (V2 -> @B where #@B>5)}
    ( { K: (V -> @A) else (V2 -> @B) } where #@A==#@B )
    
```

### 2. Interaction with `?`

The `?` (optional slice) composes as expected:

```
K:V           // weak, at least one witness required
K:V?          // weak, no existence requirement
K:V else !    // strong, at least one witness required
K:V else !?   // strong, no existence requirement
```

### 3. Documentation

Document the categorization and validation idioms enabled by CW 14's `->` operator. See CW 14 for examples.

### Note on composition

The pattern `K:V else V2 else !` is not an additional special case. It is the normal interpretation of `K:(V else V2) else !`, i.e., `K:W else !` where W = `(V else V2)`. The strong semantics apply to W as a whole.

## CW 15. Seq nodes inside array alternation branches

**Bug:** When a parenthesized sequence like `({kind:"A"} {kind:"B"})` appears as a branch in an array alternation, the parser correctly creates a `Seq` node, but the engine's `matchItem` function does not know how to handle `Seq` nodes (it throws "Unknown item type: Seq").

**Example pattern that fails:**

```
[ ({kind:"A"} {kind:"B"}) | ({kind:"C"}) ]
```

**Current AST:**

```json
{
  "type": "Alt",
  "alts": [
    {
      "type": "Seq",
      "items": [
        /* {kind:"A"}, {kind:"B"} */
      ]
    },
    {
      "type": "Obj"
      /* {kind:"C"} */
    }
  ]
}
```

**Expected behavior:** The engine should recognize that when matching an `Alt` in array context, each branch could be a `Seq` and should be matched as a sub-sequence, not as a single item.

**Workaround:** Use patterns that don't require sequences within alternation branches. For bucket rollback testing, use value-level alternation in object context instead.

**Test case (preserved in test/cw4-cw14-conformance.test.js):**

```js
// Currently fails with "Unknown item type: Seq"
const pat = `{ box: [ ({kind:"A"}->@picked {kind:"B"}) | ({kind:"B"}->@picked) ] }`;
```

# Future ideas

These ideas have not been thoroughly thought out and are not on the roadmap. Treat this as just brainstorming.

## CW 5. Defaults for nomatching bindings?

## CW 6. Recursive descent

A breadcrumb path is really just an array of instructions for navigating somewhere else in the structure.

We already have p.**.q indicating remote ancestry. This works only for the simple case of chained parent-child relationships. It is equivalent to `p(._)*.q` -- We are already treating this path as a **pattern on the array of navigation instructions**.

This could be generalized to navigations other than simple keyed/indexed child descent.

For example, what if you wanted to find a cycle in a directed graph like `[ [$from,$to]* ]`?

Introduce a descent rule syntax `**↳($from, $to where PATTERN )` Which for this directed graph example would be
`↳($a,$b where $b=($a[1]))`

Then a cyclic graph is `[... $start.**↳($a,$b where $b=($a[1])):$start) ...]`

(You don't need to point out that this particular example would be very inefficient, and that we'd need a 'visited' flag and a depth limit, and that this is a complication to the language that is prima facie unjustified. )
``

## CW 7. **Static analysis / linting **

This proposal introduces a **clarifying mode** for Tendril that asks users to *affirm intent* in cases where an expression is precise and correct, but plausibly misread.

The motivation is conversational rather than corrective. When a careful human hears a statement that is clear but easily mistaken, they naturally ask for confirmation: *“Just to be sure I understood you correctly…”* Clarifying mode applies the same principle to Tendril patterns.

#### What clarifying mode does

When clarifying mode is enabled, Tendril checks for **clauses whose surface form is commonly read as universal**, even though their semantics are existential. This typically occurs when:

* the key pattern can match many keys (e.g. `_`, regexes, alternation), and
* the value pattern is constraining, and
* no variable binding makes the existential intent explicit.

In such cases, Tendril emits a diagnostic that:

1. **States the actual meaning** of the clause (e.g. “this means *some* matching value satisfies …”).
2. **Asks for confirmation** if that is the intended meaning.
3. **Offers a clear alternative** for the universal interpretation.

Example message:

> This clause means **“some matching value satisfies …”**.
> Confirm with `/*intent:some*/`, or use `else !` (or `else !?`) for **“all”**.
> *(Clarifying mode.)*

Importantly, the tool never claims the clause is ambiguous or incorrect. The request is about *plausible miscommunication*, not semantics.

#### Affirming comments

To confirm existential intent, users add a short **affirming comment**, such as `/*intent:some*/`, adjacent to the clause. This comment does not change runtime semantics. It serves only to affirm intent and satisfy clarifying mode.

This mirrors well-established patterns like `@ts-expect-error`: an explicit acknowledgment that a potentially surprising construct is intentional.

#### Scope and philosophy

Clarifying mode is not “training wheels” or “don’t trust the user” mode. It is a precision mode that enhances readability and teachability by placing semantic emphasis on **intent**, not on suppressing warnings.

The mode is especially recommended for generated patterns (e.g. LLM output), but remains useful for humans working in high-precision contexts.

When clarifying mode is disabled, Tendril behaves exactly as it does today.

-----------

## CW 8. EL assertions applied to structural pieces other than bindings.

ChatGPT recommends against this, or if we do it, make it explicit, such as a zero width `guard(expr)`

Support something like

```
"{
    securityLevel:$securityLevel;
    "some_huge_record": {
         // deeply inside here...
             { 
                 hasClearance:(true ; $securityLevel>10) | false
             }
    }
}"

or perhaps leverage lookaheads
"{
    securityLevel:$securityLevel;
    "some_huge_record": {
         // deeply inside here...
             { 
                 hasClearance:(?;$securityLevel>10)true | false
             }
    }
}"
```

#### CW 9. Currently If a variable in an EL expression is unbound, the evaluation is deferred. If the variable never gets bound by the time the entire pattern is matched, then it fails.

Proposal. Permit defaults. An expression with a default may be evaluated immediately if the expression is closed. Otherwise, it is deferred, but evaluated as soon as it becomes closed (to allow pruning ASAP).
If after the entire pattern is matched, it is still open and cannot be evaluated, then we evaluate the expression using the defaults. (If there are still free variables without defaults, then it fails. )
This honors our current support for forward reference expressions having deferred evaluation.

`{
    sum: $sum=(_ where $sum==default($n,0)+default($s,0))
    ( 
      number: $n ?
      string: $s ?
    )
}`
For now, we only propose to support primitive defaults.
It is a syntax error to declare a default for a variable that does not appear anywhere else in the pattern. (guard against typos).

To rephrase:

Treat default($x, v) as a three-valued reference at evaluation time:

If $x is bound, it evaluates to that value.

If $x is unbound but might still be bound later, the whole guard is not yet evaluable (defer).

Only if the guard reaches the end of pattern evaluation and $x is still unbound, then default($x, v) evaluates to v.

Operationally: defaults don’t make expressions “closed”; they only change what happens at the final “still-open” check.

Tiny doc-friendly phrasing

Something like:

default($x, v) does not count as binding $x. Guards are still deferred until all referenced variables are bound. Defaults apply only at the end of matching, if some referenced variables remain unbound.

## CW 10. Calc

Proposal: support calculated expressions in the pattern (not just in guards).

This allows some usages to preserve the O(1) behavior and pruning optimizations for key-matching.

Syntax: ==expr
Semantics: It is equivalent to writing the resulting primitive literal in the pattern, and it never binds variables.

list indices:

```
{
    list[==2*$idx]: $name
    list[==2*$idx+1]: $number
}
```

Path notation

```
{
    user: {id:$id}
    data: personal.prefs.=="P"+$id: { some:pref }
}
```

Keys in normal notation

```
{
    user: {id:$id}
    data: {personal: prefs: { =="P"+$id: { some:pref } } }
}
```

It may only be used for list indices and object keys.
It would **not** support deferred calculation for free variables. It fails with an error, not a silent mismatch, if it contains free variables.
It must evaluate to a primitive.
Once evaluated, it must be memoized (AST identity + bindings).

TBD: Clarify precedence and how it might combine with other syntactic structures.

## CW 11. Optimized primitives for common cases

In practice people need: “key absent,” “no keys matching regex,” “no values matching predicate,” “closed object,” and “only keys from this set.” If you don’t make those primitives obvious and idiomatic, users will recreate them with enumeration-heavy patterns (wildcard keys + negative constraints) and you’re back in explosion land. So I’d put on the cut line a small set of object-level constraints that are syntactically distinct from matching clauses. Concretely, something like absent(K) / forbid(K:V) / closed (your !%) / allowExtras (default) / captureExtras (%? plus binding). Whether it’s spelled as guards, a where block, or a dedicated !{...} constraint form doesn’t matter as much as: it must not enumerate, and it must read like a constraint, not like a pattern that backtracks.

## CW 12. Simplify and integrate regex.

1. Make /foo/ anchored.
2. In RE group syntax: /.*[.](?<$ext>\w+)/ -- Named groups that start with the $ sigil are lifted into Tendril land and participate in binding logic.. By default, this will not cause branching in Tendril (at most one regex solution per Tendril branch, as is usual for regexes). nitpicky details are mostly answered by the following equivalence:
   `[ /(?<$x>[ab])|[bc]/ ]`
   acts *exactly* like
   [ $x=(/[ab]/) else /[bc]/ ]
   (where 'else' is the non-backtracking form of '|' as desscribed earlier), with regard to backtracking, binding, and so on.
3. Provide consistent ergonomic quoting options:

'...' "..." «...» --- literals
/.../, r'...' r"..." r«...» --- Tendril regex (like JS regex, but with (1)+(2))
jr/.../ - JavaScript compatible regex (disables (1) and (2))

~ LITERAL_OR_REGEX --- Substring match (unanchored)

This is brainstorming, not a polished proposal. Any suggestions? (Ignore missing details with obvious resolutions.)

Below is how I would rewrite **CW 12** as a *user-guide* section.
It assumes no prior knowledge of the old rules, avoids grammar talk, and focuses on “what you type” and “what it means,” with motivation first and corner cases last.

---

        Below is how I would rewrite **CW12** in *user-guide style*, with:

1. a **short, high-level summary** about the size/density of your original CW12, and
2. the **longer explanatory section** (the one you liked earlier), revised so that **Plan B is the default** and explained using your “bind-if-unknown, assert-if-known” framing rather than “constrain the search.”

---

            ## Regex in Tendril — Summary
            
            Tendril integrates regex as a **single, predictable matching step**, not as a second pattern language.
            
            Key rules:
            
            1. **Regexes are anchored by default.**
               `/foo/` matches `"foo"`, not `"seafood"`.
            
            2. **Named capture groups bind Tendril variables.**
               A group named `(?<$x>…)` binds `$x` if it is unbound, or asserts its value if it is already bound.
            
            3. **Regexes do not enumerate solutions.**
               Each regex produces at most one result per Tendril branch.
            
            4. **Substring matching is explicit.**
               Use `~ /foo/` or `~ "foo"` when you want “contains” behavior.
            
            5. **Regex binding follows Tendril’s normal unification rules.**
               A bound variable is tested, not re-chosen.
            
            6. **JavaScript-compatible regex is available as an escape hatch.**
               `jr/.../` disables Tendril-specific behavior.
            
            This makes regex behave like other Tendril matchers:
            *bind if unknown, assert if known, never silently multiply solutions.*
            
            ---
            
            ## Regex in Tendril (Predictable and Integrated)
            
            Regexes are useful in Tendril, but they should not introduce hidden search behavior or surprise interactions with unification. Tendril therefore treats regex as a **single matching operation with optional extraction**, fully integrated into the existing binding model.
            
            This section explains how regex behaves in Tendril and how it differs from JavaScript regex.
            
            ---
            
            ### 1. Regexes match the entire value
            
            In Tendril, a regex literal like:
            
            ```
            /foo/
            ```
            
            matches the **entire string**, not a substring.
            
            ```
            /foo/     // matches "foo"
                      // does NOT match "seafood"
            ```
            
            This aligns regex with all other Tendril patterns: a value either matches or it doesn’t.
            
            If you want substring matching, see **Substring matching** below.
            
            ---
            
            ### 2. Regex alternation does not create Tendril branches
            
            Regex alternation (`|`) is handled entirely inside the regex engine.
            
            Even if a regex has multiple internal matches, Tendril treats it as **one atomic test** and never enumerates alternatives as separate solutions.
            
            ```
            /foo|bar/
            ```
            
            either matches or fails; it does not produce two Tendril branches.
            
            This prevents accidental solution explosion.
            
            ---
            
            ### 3. Named capture groups bind Tendril variables
            
            Regex groups whose names start with `$` participate directly in Tendril binding.
            
            ```
            /(?<$ext>\w+)/
            ```
            
            Example:
            
            ```js
            Tendril("{ file: /.*\\.(?<$ext>\\w+)/ }")
              .match({ file: "report.pdf" })
              .solutions().first()
            // → { ext: "pdf" }
            ```
            
            ---
            
            ### 4. Bound variables turn captures into assertions
            
            A `$`-named capture group behaves differently depending on whether the variable is already bound.
            
            #### If the variable is unbound
            
            The group captures a value and binds it, like a normal regex capture.
            
            #### If the variable is already bound
            
            The group **does not choose a new value**.
            Instead, it **asserts** that the bound value appears at that position and satisfies the group’s pattern.
            
            In effect:
            
            > A `$`-named regex group means “bind if unknown; assert if known.”
            
            This mirrors Tendril’s behavior everywhere else.
            
            ---
            
            ### 5. Example: why this matters
            
            Consider this regex:
            
            ```
            /(?<$x>a)b | a(?<$x>b)/
            ```
            
            On the string `"ab"`, both alternatives are valid.
            
            Now suppose `$x` is already bound to `"b"` elsewhere in the pattern.
            
            Under Tendril semantics:
            
            * The first alternative is rejected (it would require `$x = "a"`).
            * The second alternative succeeds.
            
            So `"ab"` **does match**, and `$x` remains `"b"`.
            
            This is equivalent to the Tendril pattern:
            
            ```
            [ $x=(a) b | a $x=(b) ]
            ```
            
            Once `$x` is known, each occurrence simply tests it.
            
            ---
            
            ### 6. How to think about it
            
            You do **not** need to think about regex backtracking.
            
            The mental model is:
            
            > Regex runs once.
            > `$`-named groups bind variables if they are unknown,
            > and assert those variables if they are already known.
            
            This avoids the “regex picked the wrong witness” surprise and keeps regex commutative with other Tendril matchers in the same way that repeated variables are.
            
            ---
            
            ### 7. Substring matching is explicit
            
            Because regexes are anchored, substring matching must be explicit.
            
            Use the substring operator:
            
            ```
            ~ /foo/
            ~ "foo"
            ```
            
            Examples:
            
            ```
            ~ /foo/    // matches "seafood"
            ~ "foo"    // matches "seafood"
            ```
            
            Substring matching applies only to strings; other types do not coerce silently.
            
            ---
            
            ### 8. Regex vs literals
            
            Often you don’t need regex at all.
            
            ```
            foo/i
            ```
            
            is usually clearer and safer than:
            
            ```
            /foo/i
            ```
            
            Use regex when you need structure or extraction:
            
            ```
            /\d{4}-\d{2}-\d{2}/
            /(?<$user>[a-z]+)@/
            ```
            
            ---
            
            ### 9. Regex flavors
            
            #### Tendril regex (default)
            
            ```
            /.../flags
            ```
            
            * Anchored
            * Supports `$`-named capture groups
            * Participates in unification
            * Disallows stateful flags (`g`, `y`)
            * Allowed flags: `i m s u`
            
            This is the regex you usually want.
            
            #### JavaScript regex (escape hatch)
            
            ```
            jr/.../flags
            ```
            
            * JavaScript behavior
            * Substring matching
            * No Tendril bindings
            * No anchoring changes
            
            Use this only when you need exact JS compatibility.
            
            ---
            
            ### 10. What regex does *not* do in Tendril
            
            Regex does not:
            
            * enumerate alternatives
            * create multiple Tendril solutions
            * override unification rules
            * silently coerce non-strings
            * introduce hidden backtracking across the pattern
            
            If you want enumeration, use Tendril alternation.
            If you want validation, use guards.
            If you want search, use `~`.
            
            ---
            
            ### One-sentence takeaway
            
            > In Tendril, regex is a **single match with optional binding**:
            > it binds unknown variables and asserts known ones, just like the rest of the language.
            
            If you want, next we can:
            
            * tighten this further for README length, or
            * add a migration note showing how existing `/foo/` patterns change under anchoring.

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

## CW 18. Negated Ancestry Patterns

Tendril cannot currently express "find X that is NOT under Y" in a single pattern. For example, validating that Flow nodes only appear inside Obj or Arr containers requires either:

1. Multiple patterns checked in sequence
2. A recursive function that walks the AST

This came up when attempting to use Tendril to validate its own AST structures (meta-validation). The fundamental issue is that `**` can assert "there exists an ancestor Y containing X", but cannot assert "there is no ancestor Y above X".

Possible future directions:

- Negated path assertions: `(!** Y) X` meaning "X with no Y ancestor"
- Context predicates: `X where !hasAncestor(Y)`
- This may simply be out of scope for a pattern language

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





## CW 17 (simpler form)



**Currently**

`K:V` is 'weak', only requires one matching $k,$v.

    - This is not very well expressed by the syntax, except whene K is a literal or bare var, but we have not found a better syntax that is simple (this is the common case) and also JSON-ish.
      The special construction `K:V else !` is strong, requiring at least one matching `$k,$v`, and also that `$k~K => $v~V`.

` K: V -> @bucket  `  means collect all `K:V` (or `{k:v}`) pairs into a bucket. This is a legitimate object slice. And can be used in search and replace.
` K: [ A -> @bucket ]  `  means collect all `K:A` (or `{k:a}`) pairs into a bucket. This is useful information, but it's not a legitimate object slice and you can't use it for search and replace.
`§L  K: [A -> {name:_->@bucket<^L> }]`  the marked item is a deeper structure in the AST, With an extra layer of branching, so we have to label which of the surrounding object patterns it's collecting over, plus deal with collisions.
`K:V?`  Makes **no assertion** And is used only for binding/joining.
or `K:V else !?` Means that there are no entries such that (k~K and not v~V), but does not assert that there exists k~K.  

**Proposal**

1. **Drop the nominclature 'strong' and 'weak'** Don't mention those terms.

2. **Keep the 'weak' grammar `K:V` but call it the "field existence" operator.**

3. **Replace the 'strong' grammar `K:V else !` with the "field validation operator":**

```
bucket:= '->' (SLICE_EXPR|'ignore')
Field_scan:= `'each' K ':' V bucket? (else V bucket?)* 
```

Examples:  
```
{ $k: _number }  // existence 

{ each $k: _number -> @numbers 
           else /\w+/ -> @goodStrings }   // "else fail" at the end is now redundant/implicit
{ each $k: _number -> @numbers 
           else /\w+/ -> @goodStrings 
           else "Ignore me" -> ignore
           else _ -> @badStrings }
```
We document that this is both for validation and for partitioning.

The terminal 'else !' is no longer supported, because it is implicit in the meaning of "each K:V". (Note: I have discussed at length whether people will wrongly assume an implicit "else ignore". We are going to address this through examples and through emphasizing that "each" is strict and that "else", like "or", doesn't have an invisible failover, not by adding new syntax.)

We needn't explain to the user that this is a fixed grammatical construct. It still behaves as if it were a composition of ordinary 'else' operators. Making it separate in the grammar is a convenience to aid static analysis.

4. **interaction with slices, remainder, quantifiers**

As before, `(K:V as @slice)` denotes the slice consisting of all key–value pairs `{k:v}` such that `k~K` and `v~V`. The requirement that the slice be nonempty comes from an implicit `#{1,}`, which may be overridden with an explicit cardinality. If the clause succeeds, **all keys `k` such that `k~K` are considered touched** and are therefore excluded from the remainder `%`, regardless of whether their values matched `V`.

The same rules apply to `(each K:V as @slice)`. In this case, success additionally guarantees that `k~K` is equivalent to `k~K ∧ v~V`.


5. **Retire `K:V ?` and `K:V else !?`.**

Those original forms are somewhat confusing, especially the first, which makes no assertion whatsoever.

Instead, those needs can be served with **existing constructs**. For example, the following idioms.
```
    // Makes no assertion but can be used for binding. This time it's not surprising, it's explicit. 
   { K:V #{0,} }  
   
   // The key doesn't have to exist, but if it does, then validate it.
   { each K:V #{0,} }
   
   // It's okay for the normal expectation to fail, but if it succeeds, then we perform the bindings.
   // (? $k:$v)
     
```



## CW 17b.

This is optional, but I like it.

1. Use @foo for array slices and %foo for object slices. This enables the following as well as potentially enabling other behaviors and reducing confusion between array slices and object slices.

The field validation idiom is now
```
{ each $k: _number -> %numbers
           else /\w+/ -> %goodStrings }
```
And these buckets will be object slices collecting the K:V pairs.

Rename '%' (the remainder) to '%%'.

2. Add the ability to use the arrow operator elsewhere, enabling collection of values from within structures.
```
// FORM 1: COLLECTING INTO AN ARRAY SLICE
// Collect both usernames and admin names. All the branches (not counting those that were pruned or backtracked) under the label are contributing to the collector.  
// Because we're collecting into an array slice, not an object slice, there is no concern with collisions or repetitions.  
§SCOPE 
{
 users: { each _:{name:_ -> @names<^SCOPE>} }
 admins: { each _:{adminName:(_ -> @names<^SCOPE>} }
}

// FORM 2: COLLECTING INTO AN OBJECT SLICE
// Collect the names as *values*. Use the *keys* from the labeled map.
// This only works if you can guarantee uniqueness of values per key. If there is a collision, it will be a runtime error.  (In future, this may be a controllable policy.)
// Scope labels are not necessary if you are targeting the nearest "each K:V" validation clause, as in this example.
{ each $k:{name:($name -> %names) }}   // collects $k:$name
```

As is already implemented, the buckets are visible in all of the branches that touched them. The last example, `{ each $k:{name:($name -> %names) }}`, will have a solution set like
```
[
   {k:123, name:'Mark', names: {'123':'Mark', '124':'Sue' }},
   {k:124, name:'Sue',  names: {'123':'Mark', '124':'Sue' }}
]
```
(Yes, there is cross-branch leakage, and that's the point.) 

Test the same value being sent to two buckets, (_ -> @b1) -> @b2 


## **UPDATE**

1. Kept % for remainder (not %%)
2. Object group bindings use %: (K:V as %slice) not @slice
3. Array group bindings use @: (... as @slice) unchanged
4. @bucket in object context collects values only (array output, loses keys)
5. %bucket in array context collects index:value pairs (object output)
6. Flow in fixed-position array elements uses outer object key (not array index)
7. Flow in quantified array elements uses array index ([(_ -> @bucket)*])
8. Wrong sigil in wrong context = parse error (generic, not specific message)


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
