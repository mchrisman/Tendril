# Nitpicky details and resolved ambiguities

Additional details and disambiguations too nit-picky to be included in the main documentation.  

n.b. Most of these are of the "just do the obvious thing" variety and could be open to debate.

## Reserved words (deduced from spec)

* **Literals:** `true`, `false`, numeric forms (excluding `Infinity` and `NaN`), string literals `".."`, regex `/../ims`.
* **Special tokens:** `_`, `..`, `as`, `Map`, `Set`, class names after `as`.
* **Operators/symbols:** `[ ] { } {{ }} ( ) : , | & >> << = .* ? + #{ } .
* **Vars:** `$name` (bindables).
  (Everything else matching `[A-Za-z_]\w*` is a bareword string.)

## Types & coercion (idiomatic JS recommendations)

**Value types supported**: `null`, `boolean`, `number`, `bigint`, `string`, `Array`, plain `Object`, `Map`, `Set`, user classes (matched structurally like Object unless `as Class` is used).

**Recommended matching/coercion rules**

* **Numbers:** compare numerically for atomic equality using finite numbers only (`NaN` and `Infinity` do not match numeric atoms); when matched by regex or coerced to string, use `String(value)` (so `NaN` → `"NaN"`, `Infinity` → `"Infinity"`).
* **Booleans:** strict coercion - pattern `true` matches boolean `true` or string `"true"` only; pattern `false` matches boolean `false` or string `"false"` only. All other values (numbers, arrays, objects) are rejected. Use `_` (wildcard) for truthy/falsy matching.
* **BigInt:** only equals the **same BigInt**; no implicit cross-equality with Number. When coerced to string (e.g., regex), use `value.toString()`.
* **null / undefined:** match only `_` or explicit `null`/`undefined` atoms if you choose to include them as atoms; avoid auto-coercion to `"null"`/`"undefined"` unless a regex forces stringification.
* **Date / Function / Symbol:** **do not match** except via `_`; if coerced by regex, convert with `String(value)` (Symbol → throws in JS; safer to **reject** Symbols at compile-time or fail match).
* **User classes:** as Objects by default; if pattern uses `as Class`, require `value instanceof Class`.
* **Objects vs Maps:**

    * Object keys are strings; regex keys test on the string key.
    * Map keys can be any value; regex on keys tests `String(key)`.

## Unicode normalization

* JS regex `/u` **does not** do canonical equivalence. **Default:** no normalization.
* **Option:** `normalize: 'NFC' | 'NFD' | false` in Pattern options; when enabled, normalize **all** strings (input and pattern barewords/strings) before equality/regex.

## Slice wildcard (`..`)

* **Arrays:** `..` ≡ `_*?` (lazy wildcard). Can appear anywhere and multiple times: `[a .. b .. c]` matches `[a, x, y, b, z, c]`. All arrays are anchored; `..` is just syntactic sugar.
* **Objects:** `..` ≡ `_:_ #?` (allows unknown keys). Multiple slice wildcards are allowed but redundant if adjacent; implementations should warn.
* **Sets:** `..` ≡ `_ *?` (allows extra members). Same semantics as arrays.

## Sets and "extras"

* `{{ a b }}` means exactly those two members (size==2).
* Use `..` sugar in sets too: `{{ a b .. }}` ≡ allow extras (`_ *?`).
* Quantifier-style set cardinality: `{{ a b }} #?` (if you expose per-set cardinality), but your `..` sugar is sufficient.

## Object quantifier composition (final wording)

* Each `k:v #{m,n}` clause counts **independently** over the full set of matching pairs in the object. Matching is **non-consuming**; compute matches, then validate counts. No backtracking to satisfy counts. (Keep this highlighted in docs.)

## Lookahead assertions (`(?=..)` and `(?!..)`)

* **Syntax:** Lookaheads are syntactically unrestricted - they can appear anywhere in a pattern (top-level, inside alternations, groups, etc.).
* **Semantics:** Lookaheads test if a pattern matches the current value without consuming it or committing bindings. They are most useful when guarding:
  - Array/set elements: `[(?=foo) _]` matches an array whose first element matches `foo`
  - Object keys: `{(?=/^id/) k : v}` matches if a key matching `/^id/` exists
  - Object values: `{k : (?=123) _}` matches if a value equals `123`
* **Placement notes:**
  - At top-level (`(?=foo) _`) they guard the entire input value
  - At end of array/object they check but don't advance position (may not be useful but allowed)
  - Nested in alternations like `[a | (?=b)]` they work as expected
* **Implementation:** Lookaheads execute their pattern in a shadow environment; bindings made during lookahead execution are discarded.

## Slices

* Represent a slice with an explicit type, e.g. `Slice { arrayRef, start, end }` (half-open `[start,end)`).
* Empty slice allowed. Examples in your note stand.

## Replacement collisions (objects/Maps)

When a key replacement **produces an existing key**:

* **Default**: overwrite existing key **last-write-wins** for deterministic behavior.
* Optionally support `collision: 'error' | 'merge' | 'overwrite'` in replace API:

    * `'error'`: throw with both keys reported.
    * `'merge'`: deep-merge only when both values are plain objects; otherwise error.
    * `'overwrite'` (default): replace value.
* Preserve property insertion order where the runtime does (JS keeps own property order); on rename, keep the **new key** placed where the old one was.

For **Set** replacement: `set.delete(old); set.add(new)` (idempotent).

## Vertical chains into Maps/Sets

* Objects and Maps behave the same; Map key can be any value.
* Sets: treat as `Map<value,true>`; `kPat.vPat` on a Set binds `vPat` against `true` (or require `vPat=_`), which is a bit odd; **recommend**: allow only key-pattern testing in Sets (`{{ kPat }}`), not `k:v` access style. For `{a.b[2].c:d}`, stepping into a Set → **fail** unless you only test membership.

## Numeric index coercion

* `a[$n]` asserts `$n` numeric and uses it as array index.
* `a.$n` coerces `$n` to string and uses it as an object key (e.g., property `"3"`).
* If value is array and you write `a.$n`, treat it as property key (`"0"`, `"1"`, …), not index semantics.

## Backtracking/pruning/termination

* **Semantics:** equivalent to exploring all branches then discarding variable-inconsistent scopes; engine short-circuits as soon as a binding conflict arises and backtracks to nearest choice point (quantifier or alternation).
* **Timeouts:** expose an optional `budget` (steps/ms) in options. On exceed, throw `PatternTimeoutError` with partial diagnostics (last input path, pattern span).
* **Cycles:** on encountering cyclic inputs during traversal, throw `CyclicInputError` (runtime). Pattern cycles aren’t possible in this grammar.

## API (ergonomic proposal)

```ts
type Scope = Record<string, unknown> & { slices?: Record<string, Slice> };

class Pattern {
    constructor(source: string, opts?: {
        unicodeNormalize?: false | 'NFC' | 'NFD',
        budget?: number,              // step/time budget
        collision?: 'overwrite' | 'error' | 'merge', // for replace
    });

    matches(value: unknown, seed?: Scope): boolean;

    exec(value: unknown, seed?: Scope):
        | { scope: Scope, path: string[] } | null; // first match

    find(value: unknown, seed?: Scope): IterableIterator<{ scope: Scope, path: string[] }>;

    replaceAll(value: unknown, replacement: unknown, seed?: Scope): unknown;       // pure
    mutateAll(value: unknown, replacement: unknown, seed?: Scope): void;           // in-place

    // Optional:
    explainLast(): { patternSpan: [start, end], inputPath: string[], message: string };
}
```

## Quantifier syntax

* Allow `*`, `+`, `?` as primary forms.
* Permit `{m,n}` with **finite** `n` (both `m` and `n` must be integer literals).
* Use `{m,}` for open-ended ranges (equivalent to min=m, max=Infinity internally).
* `Infinity` is **not** a valid literal in pattern syntax; implementations represent unbounded quantifiers internally using JavaScript's `Infinity` value.

## Comments

* Allowed wherever whitespace is allowed; not inside strings or regex.
* Support both `//` and `/* */`. Lexer strips them before parsing.

## Error surfaces (concise)

* Bad regex → `PatternSyntaxError` at regex span.
* Disallowed comment position → `PatternSyntaxError`.
* Missing `>> <<` in `replaceAll` → `PatternUsageError`.
* Key collision per collision policy → `PatternCollisionError`.
* Budget exceeded → `PatternTimeoutError`.
* Cyclic input → `CyclicInputError`.




# Questions

> Whitespace significance —
> 
> Is whitespace always significant for sequence concatenation (a b)?
>
It is significant as a delimiter. Strings containing spaces must be quoted. Regexes containing spaces need not be quoted because their internal grammar will determine their extent. (This is Javascript's regex grammar. It is acceptable to avoid parsing it by starting with the beginning slash and looking for the first ending slash, followed by alphabetic characters, followed by space, such that the whole compiles as a regex. )


> 
> 
> Are newlines treated as spaces?

yes.

> 
> Can commas appear interchangeably with spaces in arrays or objects?
> 
yes

> 
> Barewords vs strings —
> 
> Is bareword coerced to string, or could it match symbols/identifiers?
>
Barewords of the form ([a-zA-Z_]\w*) are always string literals unless they could be parsed in context as one of our few reserved words. No symbols are ever matched except those defined in our grammar. The bindable variables must start with $.
> 
> 
> Are "foo" and foo always equivalent?
> 
yes
> 
> Regex literals —
> 
> Do /regex/ patterns match stringified versions of non-strings (e.g., numbers → "123")?
> 
yes, that is what I meant by coercion: 123 is coerced to "123" and then tested against the regex.
> 
> 
> Are flags (/re/i) supported?
  /ims are supported.  /gy are handled instead by the explicit apis. /u is assumed.
> 
> Anchoring in arrays/objects —
> 
> [a b ..] anchors prefix; [.. a b] anchors suffix?
> 
> 
> Is there syntax for both-ends anchoring (like regex ^/$)?
Arrays are always anchored. The `..` is exactly sugar for `_*?` for an unanchored idiom (and could occur anywhere: [ a .. b .. c])
> 
> 🔹 Object & Set Semantics
> 
> Object order & consumption —
> 
> Object kv-patterns are “non-consuming”; but if multiple keys match the same regex, how are conflicts resolved?
There is no conflict; they are treated as alternations.  
   
   { /[ab]/:_ } =~ { a:1 b:2 c:3 }

first binds to a:1 (success), then backtracks to b:2 (success), then fails to backtrack to c:3.

> 
> 
> When {a:_ c:_} matches {a:1, b:2, c:3}, is b ignored or does it cause mismatch unless .. present?
> 
Mismatch unless `..` is present. In an object context, `..` means _:_??.  
> 
> 
> Set matching —
> 
> Are Set patterns order-insensitive but size-sensitive?

That's true.

> 
> 
> What’s the default quantifier semantics for Sets (must include all vs subset)?

Same as for Map/Object
> 
> 🔹 Quantifiers & Laziness
> 
> Lazy semantics in arrays —
> 
> a*? is non-greedy — but how is that defined in multidimensional backtracking?
> 
Example?
> 
> Are greedy vs lazy modes available for object quantifiers too?

No.

> Quantifiers on groups vs atoms —
> 
> Does a(b c)*2 mean repeat (b c) or repeat the whole a(b c) sequence?

quantifiers have higher predence than adjacency, whether or not a space is used.

> Range boundaries —
> 
> For *{2,3} — inclusive or exclusive upper bound?

inclusive

> 🔹 Binding & Scope
> 
> Variable scope reset —
> 
> Are bindings local to each alternation branch or global across entire pattern?

Global to the pattern (i.e. doesn't matter *where* in the pattern they are), but local to an alternation branch.

> 
> If [ $x=a | $x=b ], is $x unified after alternation?
>

     [[ $x=a | $x=b ] $x ] =~ [[a] a]
     [[ $x=a | $x=b ] $x ] =~ [[b] b]
     [[ $x=a | $x=b ] $x ] !=~ [[a] b]
     [[ $x=a | $x=b ] $x ] !=~ [[b] a]

Does that answer your question?

> 
> Variable equality semantics —
> 
> Is equality strict (===) or structural (deep equality for arrays/objects)?

=== is not part of the language, it's used in the documentation to indicate that two patterns have the same effect

> How are regex-bound variables compared?
> 

Regexes have their own internal bindings and backreferences. Those are local to the regex, which is treated like a black box, and we do not interact with them at all.

> Slice bindings —
> 
> Pattern("_ $x=( _ _ )") — what is $x bound to exactly (tuple? list of two matches?)
> 
$x would be bound to an array slice --- a sequence of adjacent units. That example would fail (ideally compile-time) not compile because the pattern must describe a single unit, not a slice.  But to try to answer your question.

     [_ $x=(_ _) foo $x] =~ [a b b foo b b]
     [_ $x=(_ _) foo $x] !=~ [a b b foo [b b]]
     [_ $x=(_ _) foo [$x]] =~ [a b b foo [b b]]


> 
> Can slices be nested?

  Yes, but unless a container is involved, they just flatten

   a (b (c d) e) === a b c d e
   a [b (c d) e] === a [ b c d e ]



> 
> 🔹 Replacement / Mutation
> 
> > > << constructs —
> 
> When replacing keys/values, do replacements preserve the rest of the object shape?

Yes.
 
> How are multiple replacements in the same match disambiguated?

Only one >>replacement target<< may appear in the whole pattern.

> ReplaceAll return value —
> 
> Is it deep-cloned? Does it mutate the input?

We should have separate apis for those actions.

> 🔹 Vertical Patterns
> 
> Chained field access —
> 
> {a.b.c:d} — if b or a is missing, does that fail or skip?

it fails

> Are numeric indices (a[3]) zero-based, and do they coerce strings to arrays?

zero-based. they do not coerce strings to arrays.  `a[$n]` and `a.$n`  are synonymous except that the first form also asserts that n is a number.

> Quantified vertical chains —
> 
> ((a.b.)*3)c:d — what happens if intermediate nodes aren’t objects?
> 
Match fails
> 
> 🔹 Implementation Details
> 
> Pruning / backtracking —
> 
> Does variable unification prune entire branches eagerly, or lazily?
>
Let's discuss. I'm not sure what you mean. It prunes branches to the extent that the constraint permits pruning.
> 
> Is this a full recursive descent engine or compiled state machine?
>
Discuss.
> Performance / decidability —
> 
> Are patterns guaranteed to terminate (e.g., cyclic structures, infinite recursion in a.b. chains)?

Cyclic structures are detected and prohibited.

> API consistency —
> 
> Is .find() returning an iterator of scopes (like RegExp execAll) or a collection?

No opinion. I'm guessing that an iterator will make more sense.

> Should .matches() return boolean or match object?
>
We need the API to support the obvious set of different types of interactions.
> 
> 
> 
> 
> Reserved words list
> Which barewords are reserved? (e.g., as, true, false, Infinity, quantifiers like ..?) Define the exact set.
You can deduce that from this specification.
> Regex literal edge cases
> Your heuristic defers to JS’s compiler—great. Clarify:
> 
> Handling of escaped closing slashes inside the scan (e.g., /a\/b/).
The parser can attempt to locate the edge of the regex there, but that would fail to compile, so it would keep looking for the correct edge. 
> 
> Are named capture groups OK (/(?<x>.)/)? (You said regex is a black box; likely yes.)
Yes, they're okay. Black box. They are only meaningful within that regex and do not interact with other regexes or with our bound variables.

> Error surface: does a non-compiling /../flags make the whole pattern a compile error?

Yes.

> Comments inside patterns
> Are line (// ..) or block (/* .. */) comments allowed inside pattern strings? If yes, where (e.g., disallowed inside /regex/)?

They are allowed. Whether they are allowed anywhere or only where white space would be allowed can be left as an implementation decision. They are not allowed inside regexes or quoted strings.Use your judgment on this.

> 
> Operator precedence for . (vertical)
> Where does . bind relative to parentheses/quantifiers/adjacency/&/|? (You require no whitespace, but precedence still matters.)
> Suggested: . binds tighter than adjacency and &, looser than quantifiers; same precedence as array/object indexing.
Sounds good.
> 
> 
> Types & Coercion
> 
> Value domain
> Exact runtime types supported? (JSON primitives + Array + Object + Map + Set + user classes?)

Yes, that's right.

> Behavior for null, undefined, NaN, Infinity, BigInt, Date, Symbol (likely rejected), Function?
>
What do you recommend? What would be the most idiomatic JavaScript approach?
> 
> Key domain for objects vs maps

> Objects: keys are strings (symbols ignored?). Regex-key matching coerces to string?
Yes.

> 
> Maps: keys may be non-strings—can /regex/ match non-string keys via coercion?

Yes.

> 
> Unicode normalization
> With /u assumed, do you normalize inputs (NFC/NFD) before string and regex comparisons?

Good question. I don't know. As this is meant to be an idiomatically JS library, I suggest handling it however JavaScript regexes handle it.?

> Arrays / Sets / Objects
> 
> Sets and extra members
> You said “same as Map/Object.” For Objects, extra props cause mismatch unless ...
> 
> Should Sets also require ..-equivalent to allow extras?

Correct.

> Is there a set .. sugar (e.g., {{ a b .. }}) or rely on explicit cardinality (_ #?)?

.. Has the same meaning in sets, i.e. _*?

> 
> Object quantifier composition
> Interactions between multiple k:v #{m,n} clauses: are counts per-clause only, or can a single entry satisfy multiple clauses via backtracking overlap? (You said kvs are non-consuming/overlapping; clarify effect when counts appear.)

The counts are per key value pattern and are completely independent from one another. It is an important and subtle point that backtracking is not relevant here. Unlike array quantifiers, we are not *attempting to satisfy* the quantifier through backtracking. Instead, we make all possible matches. And only after that is done do we assert that the number of matches is in the specified range. This huge semantic difference is why we are using a different syntax for objects versus arrays. If this is at all unclear, please let me know.

> Lookaheads in non-linear contexts
> Exact semantics of (?=pattern) / (?!pattern) inside objects/sets:
> 
> What is the current position they peek from?

They can only appear in prescribed positions:   In front of a key pattern or in front of a value pattern. And they must match a unit, not a slice.

    { (?=/.*a.*/)/(..)*/: _ }   //  Match keys of even length that contain an 'a'


> For objects, do they mean “there exists a match of pattern within this same object” without consuming anything?

There is no need for that semantic; it's redundant, because that's what key value patterns already mean.

> .. sugar equivalence
> 
> Arrays: .. ≡ _ *? (clear).
> 
> Objects: .. ≡ _:_ #? (clear).
> 
> Sets: define explicit sugar (e.g., .. ≡ _ #?) or document no sugar.
> 
> Binding & Equality
> 
> Structural equality details
> When the same variable appears multiple times, equality is structural—define precisely for Maps/Sets (order? reference vs value for Map keys?).

The obvious answer.


> Empty-slice bindings
> Can $x=( .. ) bind to an empty slice ([])? If yes, under what patterns (e.g., (_*))?

Yes, it can bind to an empty slice:

    `[$x=(_*) $y] =~ [a b c]` finds matches { $x:Slice(), $y:'a'}, { $x:Slice('a'), $y:'b'}, { $x:Slice(a b), $y:'c'}.

( We need to have a structure to represent the bound value of $x when it's a slice and not an array. )

> Pre-initialized variables
> API shape for seeding bindings (e.g., Pattern(p).find(input, { $x: 42 })) and failure behavior if the seed conflicts.

Just as with any prior binding, a subsequent binding must match or the branch fails. The exact API shape is up to you.

> Replacement
> 
> No target present
> replaceAll when the pattern has no >> <<: no-op vs error?

Error

> Key replacement on objects with collisions
> If renaming produces an existing key, merge, overwrite, or error? Preserve property order?

Explain this question.

 
> Replace in Maps/Sets
> Semantics of >>k<<:v and k:>>v<< for Map/Set containers (e.g., replacing a Set member).

set.add(value)

> Vertical Patterns
> 
> Mixed containers in a chain
> {a.b[2].c:d} works; what about stepping into Sets ([idx] undefined) or Maps (key not string)? Define allowed transitions and errors.

Behavior is the same as for objects, except that the key need not be a string. Treat sets as if they were Map<?,true>


> Numeric index coercion
> a[$n] asserts numeric—how about a.$n when $n is numeric? Is it coerced to string property name or mismatch unless object has numeric-named key?

Do the expected thing. Idiomatic JavaScript usually demands coercion in order to make things work.
> 
> 
> Engine Semantics
> 
> Backtracking & pruning policy
> You said “to the extent constraints permit.” Define precise rule: occurs immediately on variable unification conflict, and propagates to the nearest quantifier/alternation boundary?

The precise rule is that (1) the outcome is the same as if we had explored all branches and then deleted all matches where the different occurrences of the same variable were not equal and (2)  We optimized this with short-circuiting. The question would be more meaningful if the matching process had side effects, but it doesn't.


> Termination / timeouts
> Any backtracking limits or time budget? What error is raised on timeout (vs returning “no match”)?

Best practice programming guidelines apply. Do something reasonable and then document it.

> Cyclic structure detection
> Detection is “prohibited”—is encountering a cycle a compile-time (for pattern) or runtime (for input) error? What error type?
> 
Ditto. 
> 
> API & UX
> 
> Return types
> 
> .matches(value) → boolean or {scope, range}?
> 
> .find(value) → iterator of {scope, cursor}? Also replaceAll streaming?
> 
> .exec() equivalent that returns the first match?

Make a reasonable and ergonomic API.

> Debuggability
> Source maps exist—how are they surfaced? (e.g., .lastError() with pattern span and input path.)

Design this with ergonomics in mind.

> Immutability boundary
> You plan both mutating and non-mutating replace APIs—name proposals and exact guarantees (deep copy vs structural sharing).

Ditto.

> Grammar Nits
>
> Infinity in quantifiers
> *{0,Infinity}: is Infinity a literal token or must users write */+/? instead? Consider requiring */+/? and restricting {m,n} to finite n.

**Resolution:** `Infinity` is not allowed as a literal in pattern syntax. Use `*`, `+`, or `{m,}` for unbounded quantifiers. Implementations may use JavaScript's `Infinity` value internally.

> Escaping >> <<
> How to match the literal sequences >> or << in strings/regex/barewords?

Strings can be quoted, regexes do not need to escape these, and bare words are alphanumeric. No primitive starts with that sequence of characters, so it's not an issue.


> 
> Whitespace in containers
> Since commas are allowed, confirm that trailing commas and flexible spacing/newlines are all accepted (esp. after regex flags).
> 
Yes, that's reasonable. 

