# Tendril v5-A Spec Compliance Evaluation

## Executive Summary

**Verdict: The codebase requires a SIGNIFICANT REWRITE of the parser and moderate refactoring of the engine.**

The current implementation is built on a **path-centric grammar** fundamentally incompatible with the v5-A spec's **expression-centric grammar**. While the engine has good bones (generator-based backtracking, proper binding/unification), the parser architecture must be rebuilt from scratch.

---

## Critical Architectural Mismatch

### Current Implementation (Path-Based)

The parser treats all patterns as **paths** (sequences of segments):

```
Program := Path ('AND' Path)*
Path := Seg+
Seg := KeySeg | IndexSeg | ValueSeg

Examples:
  .a.b.c=1              // Path: [KeyLit(a), KeyLit(b), KeyLit(c), ValPat(1)]
  ={a=1}                // Path: [ValPat(Obj(...))]  -- workaround!
  .planets.$name=_      // Path: [KeyLit(planets), KeyVar(name), ValPat(_)]
```

### v5-A Spec (Expression-Based)

The spec treats patterns as **expressions** that can be items, arrays, objects:

```
ROOT_PATTERN := ITEM
ITEM := '(' ITEM ')' | S_ITEM | S_ITEM ':' '(' ITEM ')' | '_' | LITERAL | OBJ | ARR | ...

Examples:
  { a.b.c=d }           // OBJ containing path assertion
  [ 1 2 3 ]             // ARR with three items
  { planets.$name.size=$size }  // OBJ with breadcrumb assertion
```

**The fundamental difference:** Current code expects paths starting with `.` or `=`. v5-A expects a top-level ITEM (which can be an object, array, etc.) containing assertions/patterns.

---

## Missing Features in Current Implementation

### 1. **Top-Level Object/Array Patterns** ❌

**v5-A Spec:**
```js
Tendril(`{
  planets.$name.size=$size
  aka[$idx][_]=$alias
  aka[$idx][0]=$name
}`)
```

**Current Implementation:**
- Cannot parse this at all
- Would require wrapping in `=` prefix: `={...}`
- Even then, cannot express multiple path assertions within the object

### 2. **Slice Variables (@x)** ❌

**v5-A Spec:**
```
[ @x .. ]    ~= ['a','b']       // {x:[]}, {x:['a']}, {x:['a','b']}
{ @rest:(..) }                  // bind untested key-value pairs
```

**Current Implementation:**
- No `@` token in lexer
- No `@` variable support in parser
- No slice binding in engine
- AST has no node type for slice variables

### 3. **Breadcrumb Quantifiers** ❌

**v5-A Spec:**
```
{ ((.a)*3).b=c }               // quantified breadcrumb segments
{ _(._)*.password = $value }   // nested path with quantifier
```

**Current Implementation:**
- No `B_QUANT` support
- No quantifier application to breadcrumb segments
- Path segments are atomic (can't be grouped and quantified)

### 4. **Object Slice Bindings** ❌

**v5-A Spec:**
```
{ /user.*/=_  $contacts:(/contact.*/=_)  @rest:(..) }
```

**Current Implementation:**
- Cannot bind subsets of object assertions
- Cannot capture residual (untested) pairs in a variable
- Object `..` exists but cannot be bound

### 5. **Proper ROOT_PATTERN** ❌

**v5-A Spec:**
- `ROOT_PATTERN := ITEM`
- Pattern can be any ITEM (literal, array, object, binding, etc.)

**Current Implementation:**
- `ROOT_PATTERN := Program(Path[])`
- Always parses as paths, never as free-standing items

### 6. **Parenthesized Patterns for Binding** ⚠️

**v5-A Spec:**
```
$x:(pattern)     // required parentheses
@x:(pattern)     // required parentheses
```

**Current Implementation:**
```
$x:pattern       // no parentheses required
```

The parser accepts `$x:atom` but v5-A requires `$x:(pattern)` for all bindings.

---

## What Works (Can Be Preserved)

### 1. **Engine Architecture** ✅

The engine has solid fundamentals:
- Generator-based backtracking
- Proper solution tracking with bindings and sites
- Structural equality for unification
- Non-destructive replacement via site tracking

**Verdict:** Engine can be adapted with moderate refactoring to handle new AST nodes.

### 2. **Tokenizer/Lexer** ✅

The microparser handles:
- Comments, strings, regex, numbers, identifiers
- Operators: `..`, `?=`, `?!`, `#`
- Pratt parsing foundation

**Needs:**
- Add `@` token for slice variables
- Possibly add `??`, `++`, `*+`, `+?` multi-char operators

### 3. **Array Matching** ✅

Current array matching with quantifiers, spreads, and anchoring works well.

**Needs:**
- Adapt to new AST structure
- Support slice variable bindings (`@x`)

### 4. **Object Matching** ⚠️

Current object matching supports:
- `K=V` and `K?=V` assertions
- Regex key patterns
- Overlapping assertions
- `..#{m,n}` residual counting

**Needs:**
- Support binding object slices (`@rest:(..)`)
- Support binding assertion subsets (`$subset:(k=v)`)
- Adapt to breadcrumb-within-assertion structure

### 5. **Unification** ✅

Binding and unification logic works correctly.

**Needs:**
- Extend to handle slice variables (`@x`)
- Ensure `$x` and `@x` collision detection

---

## Specific Grammar Gaps

| Feature | v5-A Spec | Current Parser | Gap |
|---------|-----------|----------------|-----|
| `ROOT_PATTERN` | `ITEM` | `Program(Path[])` | Complete mismatch |
| `ITEM` | Atoms, OBJ, ARR, bindings | N/A | Missing |
| `A_SLICE` | Slice patterns in arrays | Partial (no `@x`) | Missing slice vars |
| `O_TERM` | Key breadcrumb* = value | Path segments | Different structure |
| `BREADCRUMB` | `.KEY`, `[KEY]`, quantified | Seg only | Missing quantifiers |
| `S_SLICE` | `@` IDENT | N/A | Missing entirely |
| `@_` | Wildcard slice | N/A | Missing |
| `B_QUANT` | `?`, `+`, `*` on breadcrumbs | N/A | Missing |
| Parenthesized bindings | Required: `$x:(pat)` | Optional: `$x:atom` | Inconsistent |

---

## Test Coverage Analysis

**Current v5-core.test.js covers:**
- ✅ Literals, wildcards, regex
- ✅ Arrays with quantifiers and spread
- ✅ Objects with K=V / K?=V
- ✅ Path patterns (breadcrumbs)
- ✅ Scalar binding ($x) and unification
- ✅ Alternation (|)
- ✅ Lookaheads (?= / ?!)

**But all tests use the workaround syntax:**
```js
matches('=pattern', data)  // Force value-pattern parsing
matches('.a.b=1', data)    // Path-based
```

**v5-A requires:**
```js
matches('pattern', data)   // Pattern IS the root item
```

**Missing test coverage:**
- ❌ Slice variables (@x)
- ❌ Object slice bindings
- ❌ Breadcrumb quantifiers
- ❌ Top-level item patterns (no `=` prefix needed)
- ❌ Nested breadcrumbs within objects

---

## Rewrite vs. Fix Assessment

### Can it be Fixed?

**No.** The architectural mismatch is too fundamental:

1. **Parser must be completely rewritten** to follow v5-A grammar
2. **AST node types must change** to support ITEM-based structure
3. **Engine must be refactored** to consume new AST shape
4. **All 2000+ lines of tests** must be updated to new syntax

### Rewrite Strategy

#### Phase 1: New Parser (HIGH PRIORITY)
- Implement v5-A grammar precisely
- Start with ROOT_PATTERN := ITEM
- Build ITEM, A_SLICE, O_TERM, BREADCRUMB productions
- Add S_SLICE (@x) support
- Add B_QUANT (breadcrumb quantifiers)
- Require parentheses for all bindings

#### Phase 2: AST Adaptation (HIGH PRIORITY)
- Remove: `Program`, `Path`, `Seg` nodes
- Add: `S_SLICE`, `B_QUANT` nodes
- Restructure: `O_TERM` to support breadcrumb chains
- Extend: `Bind` to support slice patterns

#### Phase 3: Engine Refactoring (MEDIUM PRIORITY)
- Adapt entry point to consume ITEM instead of Program(Path[])
- Add slice variable binding logic
- Add object slice binding
- Add breadcrumb quantifier evaluation
- Preserve existing backtracking/unification

#### Phase 4: Test Migration (MEDIUM PRIORITY)
- Remove `=` prefix workarounds from all tests
- Add tests for slice variables
- Add tests for breadcrumb quantifiers
- Add tests for object slice bindings
- Migrate to v5-A syntax throughout

#### Phase 5: API Preservation (LOW PRIORITY)
- Keep public API unchanged (`Tendril(pattern).solutions()`)
- Ensure backward compatibility where possible
- Update documentation

---

## Estimated Effort

| Component | Lines to Rewrite | Effort | Risk |
|-----------|------------------|--------|------|
| Parser | ~400 (full rewrite) | 3-5 days | High |
| AST Nodes | ~50 (add/modify) | 1 day | Low |
| Engine | ~200 (refactor) | 2-3 days | Medium |
| Tests | ~2000 (update syntax) | 2-3 days | Medium |
| **Total** | **~2650** | **8-12 days** | **High** |

---

## Recommendation

**REWRITE the parser from scratch following v5-A grammar.**

**Reasons:**
1. Trying to adapt the path-based parser to expression-based would be more complex than rewriting
2. Clean slate ensures v5-A spec compliance
3. Current engine can be preserved with moderate adaptation
4. Tests provide good regression coverage once updated

**Approach:**
1. Write new parser in parallel (don't modify existing)
2. Use test-driven development (port one test at a time)
3. Validate against v5-A grammar at each step
4. Swap parsers when feature-complete
5. Delete old path-based parser

**Timeline:**
- Week 1: New parser + AST nodes
- Week 2: Engine adaptation + test migration
- Week 3: Integration, debugging, documentation

---

## Conclusion

The current codebase is well-structured and the engine is solid, but the parser is fundamentally incompatible with v5-A. A clean rewrite of the parser following the v5-A grammar is the only viable path forward. The good news: the engine's backtracking/unification logic can be preserved, reducing risk.

**Status: REQUIRES REWRITE (Parser only, ~40% of codebase)**

