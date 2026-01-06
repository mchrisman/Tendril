---
id: td-0002
title: Language pruning and simplification
status: backlog
priority: high
type: feature
created: 2026-01-05T00:49:25-08:00
updated: 2026-01-05T00:49:25-08:00
tags: [language, syntax, breaking-change]
---

# DESCRIPTION

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

# LOG [2026-01-05T00:49:25-08:00]

Opened.
