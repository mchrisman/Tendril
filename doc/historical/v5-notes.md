Appendix: Object Pattern Semantics and Optional Assertions

Problem Statement

During development of Tendril v5, we discovered ambiguities in how object patterns
should behave, particularly around:

1. Existential vs Universal semantics: Should {_=5} mean "all values equal 5" or
   "exists a value equal 5"?
2. Variable key bindings: How should {$k=$v} create solutions?
3. Optional assertions: What does {a=?5} mean and how does it interact with
   bindings?

This appendix documents the design decisions and their rationale.

Array-Object Equivalence Principle

The key insight is that object patterns should behave analogously to array
patterns. Consider:

Arrays:

- [.. 5 ..] means "exists a 5 somewhere" (existential)
- [5] means "the array is exactly [5]" (structural)
- [.. 5 6 ..] is like having implicit anonymous bindings that must be adjacent

Objects (proposed):

- {_=5} should mean "exists a key with value 5" (existential)
- {a=5 b=6} means "keys 'a' and 'b' exist with those values"
- This treats object terms as existential assertions that iterate over keys

Formal Semantics

Pattern Matching as Constraint Satisfaction

Pattern matching works via backtracking search:

1. Start with infinite solution space (all possible variable bindings)
2. At each step, create branches for alternatives (key iteration, alternation,
   etc.)
3. Each branch adds constraints that narrow the solution space
4. Branches that fail constraints are pruned
5. Surviving branches that complete the pattern are solutions

A solution is:

- A complete path through the search tree (a branch that succeeded)
- Associated with a binding-set: the variable bindings accumulated along that path
- Each binding-set represents necessary and sufficient conditions for that match

Object Term Semantics

For an object pattern {K1=V1 K2=V2 ... Kn=Vn}:

1. Each term Ki=Vi is existential: means ∃k,v where Kik and Viv
2. Terms are conjunctive: all assertions must hold (with unification)
3. Pattern matches iff: the solution set (join of all term solution-sets) is
   non-empty

Key iteration (existential semantics):

- {$k=5} iterates over object keys, creating one solution branch per key
- Each branch tests if value equals 5
- $k binds to the key name in successful branches
- Result: multiple solutions, one per matching key

Example 1: {$k=$v} against {a:1, b:2}
Start: {}
├─ try k="a" → {k:"a"}
│ └─ bind v=1 → {k:"a", v:1} ✓ Solution 1
└─ try k="b" → {k:"b"}
└─ bind v=2 → {k:"b", v:2} ✓ Solution 2

Example 2: {$x=$x} against {a:"a", b:"c"}
Start: {}
├─ try key="a", bind x="a" → {x:"a"}
│ └─ value must equal $x → "a"=="a" ✓ Solution 1: {x:"a"}
└─ try key="b", bind x="b" → {x:"b"}
└─ value must equal $x → "c"=="b" ✗ pruned

Example 3: {a=$x b=$x} against {a:5, b:6}
Start: {}
└─ assert a=$x → {x:5}
└─ assert b=$x → try to unify x=6 with x=5 ✗ fails
No solutions (unification failed)

Equivalence with Array Lookaheads

Object pattern {K1=V1 K2=V2} is equivalent to array pattern:
[(?=.. [K1 V1]) (?=.. [K2 V2]) ..]

Both are conjunctive assertions where:

- Each term/lookahead checks for existence of a matching pair
- Variables bind and must unify across all assertions
- Pattern succeeds iff all assertions hold with compatible bindings

This requires lookaheads with escaping bindings (Prolog-style, not regex-style):

- Bindings made inside lookaheads participate in unification
- (?=$x) both checks and binds $x

Optional Assertions: K=?V

The Problem

How do we express "if key K exists, it must match V, otherwise OK"?

This is a conditional constraint: (K exists → V matches) ∧ (K doesn't exist →
true), which simplifies to: ¬K ∨ (K ∧ V).

Our search paradigm iterates over what exists in the data. We can't iterate over
"keys that don't exist" (infinite set).

Solution: Desugaring to Negative Lookaheads

K=?V desugars to: (K=V | (?!K))

Where:

- K=V: first alternative checks if K exists and matches V
- (?!K): second alternative uses negative lookahead to check K doesn't exist
- Negative lookahead (?!K) is sugar for (?!(K=_))

Examples:

{a=?5} desugars to {a=5 | (?!a)}

Against {a:5}: first alternative succeeds → 1 solutionAgainst {a:3}: first
alternative fails, second fails (a exists) → 0 solutionsAgainst {b:5}: first
alternative fails (a doesn't exist), second succeeds → 1 solution

{a=?$x} desugars to {a=$x | (?!a)}

Against {a:5}: binds x=5 → solution {x:5}Against {b:5}: negative lookahead succeeds
→ solution {} (x unbound)

Complex Patterns

{($x:(/x/)|foo)=?$x} desugars to {($x:(/x/)|foo)=$x | (?!(($x:(/x/)|foo)=_))}

Against {foo:5}:

- First alternative, branch 2: matches "foo", binds x=5 → solution {x:5}

Against {bar:5}:

- First alternative: "bar" doesn't match pattern → fails
- Second alternative: negative lookahead succeeds (no key matches) → solution {} (x
  unbound)

Note: In negative lookaheads, bindings never escape because the lookahead only
succeeds when the interior pattern doesn't match.

Interaction with Unification

{a=?$x b=$x} desugars to {(a=$x | (?!a)) b=$x}

Against {a:5, b:5}: a=$x binds x=5, b=$x unifies → solution {x:5}Against {b:5}:
(?!a) succeeds with no binding, b=$x binds x=5 → solution {x:5}Against {a:3, b:5}:
a=$x binds x=3, b=$x needs x=5 → unification fails, 0 solutions

Grammar Changes

Current Array Grammar (has lookaheads):

A_GROUP := ... | '(?=' A_GROUP ')' | '(?!' A_GROUP ')'

Proposed Object Grammar (add lookaheads):

O_GROUP := '(' O_BODY ')'
| S_GROUP
| S_GROUP ':' '(' O_GROUP* ')'
| O_TERM
| '(?=' O_GROUP ')'      // NEW: positive lookahead
| '(?!' O_GROUP ')'      // NEW: negative lookahead

// REMOVED: '?=' operator (becomes syntactic sugar)

Syntactic Sugar:

- K=?V → (K=V | (?!K)) where (?!K) is sugar for (?!(K=_))
- Desugaring happens during parsing/compilation

Implementation Requirements

1. Make object patterns consistently existential
    - Remove distinction between variable and non-variable keys
    - All key patterns iterate and create solution branches
2. Implement lookaheads for objects
    - (?=O_GROUP) positive lookahead
    - (?!O_GROUP) negative lookahead
    - Bindings escape and participate in unification (Prolog-style)
3. Implement K=?V desugaring
    - Parser or compiler transforms K=?V to (K=V | (?!K))
    - No special runtime handling needed
4. Ensure lookahead bindings work correctly
    - Positive lookahead: bindings escape and unify with outer context
    - Negative lookahead: only succeeds when pattern fails, so no bindings escape
    - Both array and object lookaheads use same mechanism

Test Cases

See test/optional-patterns.test.js for comprehensive test coverage of:

- Simple optional keys
- Optional with value bindings
- Complex key patterns with alternation
- Optional with unification across multiple assertions

  ---

End of Appendix


----------------------------

Overloading ..: it means both lazy group (arrays) and residual keys (objects). That’s elegant but easy to misremember in mixed patterns.

=? optic: visually odd and cognitively heavier than it needs to be; it also reads as “assign maybe,” which is backwards for readers used to ?= or ?..

Whitespace significance in arrays: adjacency-as-sequencing means spaces matter only in [...]. Users must context-switch from “whitespace ignored” to “whitespace is structure.”

Quantified breadcrumbs syntax: foo(.bar)+=baz works, but the parentheses around a single step feel incidental; they beg the question of chaining ((.bar.baz)+?) and precedence.

Lookahead spelling reuse ((?= ...), (?! ...)): familiar from regex, but in a structural language users may accidentally expect stringy behavior (e.g., capture side effects).

Barewords vs strings: unquoted tokens that aren’t keywords are strings—nice shorthand, but easy to collide with future keywords.

Optional commas in objects/arrays: great for terseness, but makes diffs and mechanical formatting trickier; also increases chances of subtle parse surprises.

After some discussion, my recommendations:
1. Quantifiers on path elements should no longer require mandatory parentheses.

2. Keep '..' as sugar for _* in arrays. But in objects, express O_REMNANT as in these examples, both syntaxes valid:
```
   {x=1 y=_ remainder @r}
   {x=1 y=_ remainder }   // Positive assertion of remainder without binding. 
   {x=1 y=_ (?!remainder) } // Denial of remainder without binding 

   {x=1 y=_ @r:(%)}
   {x=1 y=_ % }       // Positive assertion of remainder without binding. 
   {x=1 y=_ (?!%) }   // Denial of remainder without binding 
```
3. Change =? to ?=.  The following means that field 'x' is optional, but if present, its value must be 'a' or 'b'.
```
   { x ?= (a|b) }
```    
This can actually be read two ways: as an '?=' operator, or as a '?' quantifier, `{ x? = (a|b) }`. That works out fine because both readings yield the same sensible interpretation. But as far as the parser is concerned, it should replace `k?=v`

4. change *{m,n} to {m,n}
   There is no ambiguity here because {m,n} cannot be interpreted as an OBJ.


The expressions need to work for array elements as well as object values. How about:

```
// A.
~(p)   // case insensitive substring search, and if one doesn't like that single option, one is free to use a regex. 
       // e.g. `[ ~foo]` or `{ a=~FOO}`
       // Bound form:  `[ $x:(~foo) ]`

// B.
string(exp)  // Asserts that the value is a string and matches optional expression
       // e.g.  `[ string(_.ends("foo"))]` or `{ x=string }`
       // Bound form:  `[ $x:(string(_.len<30)) ]`

// A. and B.
number       // coerce to a number or fail
number(exp)  // Similar, e.g. `[ number(_ < 30) ]`
number!(exp) // Similar; Attempt to coerce it to a number if it's a string.  




number(expr(_)) // asserts numeric with optional condition 
                  // e.g. `{ age = number(_<90 && _%2==0) }` or `[number number]`
                  // If you want a binding: `$v:(number)` or `$v:(number(_>1))`
                  
                  
string(s:expr(s)) // asserts string, `[ string(s:s.len>10) ]`


Or maybe if you want a conditional expression, you must have a binder, and then the condition can actually be a separate entity

{ $x:string = $y:number } where(len($x)<256) where ($y>30)


```


```
number(n:expr(n)) // asserts numeric with optional condition 
                  // e.g. `{ age = number(n:n<90) }` or `[number number]`
                  // Note 'n' is not a binder, it's just a lambda arg.
                  // If you want a binding: `$v:(number)` or `$v:(number(n=>n>3))`

```



