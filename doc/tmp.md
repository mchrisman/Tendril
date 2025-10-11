> Identify inconsistencies between @README.md and @README-v2-draft.md
⎿  Read README.md (164 lines)
⎿  Read README-v2-draft.md (607 lines)

⏺ I'll read both README files carefully to identify inconsistencies between them.

⏺ Read(file_path: "/Users/mchrisman/s/Tendril/README.md")
⎿ Read 164 lines

⏺ Read(file_path: "/Users/mchrisman/s/Tendril/README-v2-draft.md")
⎿ Read 607 lines

⏺ I've analyzed both README files and found several significant inconsistencies. Let me
document them systematically:

Critical Inconsistencies

1. Object Anchoring Semantics - CONTRADICTORY

README.md says objects are ANCHORED by default:
{ b=_      }  !=~ { b:1, c:2 } // Line 57

README-v2-draft.md CONTRADICTS ITSELF:

- Lines 122-123 claim: { b=_  c=_ }  !~= { b:1 } // objects anchored by default
- BUT Line 44 claims: { foo = bar } ~= { "foo": "bar", "baz": "buzz" } // objects are
  unanchored by default
- AND Line 265: { a=_ } ~= { a:1, c:2 } // objects unanchored
- AND Line 473: Objects are **unanchored by default**; {a=b} ~= {a:b, c=d}

This is the most critical issue - the v2-draft contradicts itself about whether objects
are anchored or unanchored by default.

2. Set Literal Syntax - MISSING IN V2

README.md (line 33) has dedicated set syntax:
{{ a b c }} // 1 pattern (matching a Set)

README-v2-draft.md only shows:
{ a=_ b=_ } as Set // treat keys as set elements

The {{ }} syntax is completely absent from v2-draft.

3. Bare Variable Binding Expansion

README.md (line 67):
$name === $name:_

README-v2-draft.md (lines 139, 419):
$name // shorthand for $name:_*? (array slice context) or $name:_ (singular context)

v2-draft is context-sensitive (arrays vs singletons), README.md always expands to
$name:_.

4. Object Anchoring Syntax - INCOMPATIBLE

README.md uses spread for unanchored objects:
{ b=_  .. } =~ { a:1, c:2, Z:1 } // Line 58
.. === _=_ #? // Line 105

README-v2-draft.md uses (?!=others) for ANCHORED objects:
{ a=1 b=2 (?!=others) } // anchored object, no extras (line 462)

These are opposite approaches - README.md requires .. to allow extras, v2-draft requires
(?!=others) to disallow extras.

5. API Naming Inconsistency

README.md:
Pattern('{...}').find(input).each(...)      // Lines 140-149
Pattern("...").replaceAll(input, 'REDACTED')

README-v2-draft.md:
Tendril(pattern).match(data).map(...)       // Line 22
Tendril(`{...}`).find(input).each(...)      // Line 533
Tendril("...").replaceAll(input, "REDACTED")

Uses both Pattern() and Tendril() as constructor names, and both .match() and .find() as
methods.

6. Object Quantifier Syntax

Both documents show the #{} syntax for object quantifiers:
k=v #{2,4} // object has 2-4 keys matching k
k=v #2 // exactly 2
k=v #? // zero or more (optional)
k=v // one or more (default)

However, this syntax is not reflected in the formal grammar in v2-draft (line 359-372),
which only shows:
OBJECT_PATTERN := '{' OBJECT_ASSERTION* '}'

No quantifier syntax on assertions in the grammar.

7. "others" Keyword

README-v2-draft.md introduces others keyword:
{ a=_  b=_  $rest:others } // bind residual slice (line 456)
(?!=others)                        // anchor objects (lines 369, 462)

README.md has no mention of others keyword - only uses .. for spreads.

8. Vertical Pattern Formal Semantics

README.md (line 123) has formal definition:
Formally, `kPat.kvPat` matches a `K`/`V` pair such that
`kPat =~ K` and `{ kvPat .. } =~ V`, with right-to-left associativity.

README-v2-draft.md only has informal description (line 220-221) without the formal
semantics.

Minor Inconsistencies

9. Type Guard Comment: README.md line 30 says as Map // or as SomeClass, but v2-draft
   only explicitly documents Map and Set.
10. Unification Detail Level: v2-draft has much more detailed step-by-step explanation
    of unification (lines 420-423) vs README.md's brief comment (line 69).
11. Indexed Path Examples: v2-draft explicitly uses _ for unmatched array elements in
    examples, README.md uses el0, el1, el2 placeholders.

Recommendation

The most urgent issue is resolving the object anchoring contradiction in v2-draft. You
need to decide:

- Are objects anchored or unanchored by default?
- How do you mark the opposite behavior (. vs (?!=others))?

The two READMEs appear to represent different design iterations, with v2-draft
introducing new features (others keyword, (?!=others) syntax) but inconsistently
documenting them.

⏺ Based on my analysis of the codebase, here's the categorization:

IMPLEMENTED (in the code)


2. Set literal syntax {{ }} ✓

- Implementation: parser.js:304-309, 342-355 (fully implemented)
- objects-sets-paths-replace.js:387-416 (matching logic)
- README.md: Documents this correctly
- README-v2-draft.md: MISSING - only shows { a=_ b=_ } as Set

3. Object anchoring by default ✓

- Implementation:
    - parser.js:441: anchored: !hasSpread (true when no ..)
    - objects-sets-paths-replace.js:378-380: enforces anchoring
- README.md: Correctly shows objects anchored by default (line 57)
- README-v2-draft.md: CONTRADICTS ITSELF (claims both anchored AND unanchored in
  different places)

4. Object spread .. to disable anchoring ✓

- Implementation: parser.js:418-421 (parses ..), sets hasSpread: true
- objects-sets-paths-replace.js:378 (anchoring check: if (n.anchored && !n.hasSpread))
- README.md: Correctly documents { b=_ .. } syntax
- README-v2-draft.md: Shows both .. AND (?!=others) - inconsistent

NOT IMPLEMENTED (documentation only)

1. others keyword ✗

- Search result: No matches in source code
- README.md: Does NOT mention others
- README-v2-draft.md: Extensively documents others keyword (lines 180, 456, 369, 462)
    - { a=_ b=_ $rest:others } - bind residual slice
    - (?!=others) - anchor objects
    - These are proposed features not yet implemented

2. (?!=others) syntax ✗

- Search result: Not implemented
- README-v2-draft.md: Shows this as THE way to anchor objects (contradicting the actual
  .. implementation)

3. Bare variable in object context expanding to $key = $val - UNCLEAR

- README.md line 75: Shows $key= $val syntax
- Neither implementation file shows special handling for this

4. Object "unanchored by default" ✗

- README-v2-draft.md claims (lines 44, 265, 473): Objects unanchored by default
- CONTRADICTS IMPLEMENTATION: Objects are anchored by default (parser.js:441)

INCONSISTENCIES TO RESOLVE

Critical:

1. README-v2-draft.md contradicts implementation on object anchoring default
2. README-v2-draft.md documents unimplemented features (others, (?!=others))
3. README-v2-draft.md is internally contradictory about object anchoring

Minor:

4. README-v2-draft.md missing {{ }} syntax for sets (uses as Set only)
5. API naming: Uses both Pattern() and Tendril() as constructor names

Recommendation

README-v2-draft.md needs major corrections to match the actual implementation:

1. Remove all others and (?!=others) documentation (not implemented)
2. Consistently state: "Objects are anchored by default; use .. to allow extras"
3. Add back {{ }} syntax for sets
4. Standardize on one API name (Pattern or Tendril)
