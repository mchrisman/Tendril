# Tendril Design Notes

Philosophy, architecture decisions, and roadmap.

---

## Philosophy

### Pattern Matching for Trees

Tendril treats JSON structures as trees and provides a declarative query language. The core insight: most tree operations are pattern matching problems.

- **Extraction**: Pattern with variables → bindings
- **Search**: Pattern + traversal → locations
- **Validation**: Pattern → boolean
- **Transformation**: Pattern + replacement → new tree

### Unification as Join

Variable unification enables joins without explicit join syntax. When the same variable appears in multiple positions, Tendril finds all consistent bindings.

```javascript
// SQL-style thinking: SELECT * FROM users JOIN orders ON users.id = orders.user_id
// Tendril: shared variable $uid creates the join
{users[$i].id: $uid, orders[$j].user_id: $uid}
```

### Pure Operations

All Tendril operations return new data structures. The original data is never mutated. This makes operations safe, composable, and predictable.

---

## Language Levels

Tendril features are stratified into three levels to reduce perceived complexity.

### Core Level

Covers 80% of use cases. Learnable in under an hour.

| Category | Features |
|----------|----------|
| Literals | `foo`, `"hello"`, `123`, `true`, `null` |
| Wildcards | `_`, `_string`, `_number`, `_boolean` |
| Regex | `/pattern/`, `/foo/i`, `foo/i` |
| Arrays | `[a b c]`, `[a ... b]`, `[a ...]` |
| Objects | `{k: v}`, `{k?: v}`, `{/regex/: v}` |
| Variables | `$x`, `(_ as $x)` |
| Paths | `{a.b.c: $x}`, `{items[0]: $x}`, `{items[$i]: $x}` |

### Advanced Level

Adds multiplicity, branching, and transformations.

| Category | Features |
|----------|----------|
| Groups | `@x` (array), `%x` (object) |
| Alternation | `(a \| b)`, `(a else b)` |
| Each | `{each K: V}`, `{each K?: V}` |
| Remainder | `%`, `%#{0}`, `(%? as %rest)` |
| Quantifiers | `*`, `+`, `?`, `{m,n}`, `#{m,n}` |
| Glob | `{a.**.c: $x}`, `{**.k: $v}` |
| Guards | `(_ as $x where $x > 0)` |
| Slices | `%{ }`, `@[ ]` |

### Arcane Level

Expert features for complex scenarios.

| Category | Features |
|----------|----------|
| Lookaheads | `(? ...)`, `(! ...)` |
| Labels | `§L`, `^L` |
| Collecting | `<collecting $v in @bucket across ^L>` |
| Possessive | `*+`, `++`, `?+` |

### Design Principle

The same syntax may appear at multiple levels depending on idiom complexity:

- `$x` in a simple extraction → Core
- `$x` with unification across paths → Core
- `$x` in a guard with deferred evaluation → Advanced
- `$x` in cross-iteration collection → Arcane

---

## Semantic Model

### Match vs Find

- **match** (`.on()`, `advancedMatch()`): Pattern must match the entire root value
- **find** (`.in()`, `advancedFind()`): Pattern can match anywhere in the tree

### Solutions and Occurrences

An **occurrence** is a location in the tree where the pattern matched.
A **solution** is a complete set of variable bindings for one occurrence.

One occurrence can have multiple solutions (when pattern has alternation or overlapping matches).

### Branching

Patterns can branch at:
- Alternation `(a | b)`
- Spread `[... $x ...]`
- Regex keys `{/k/: $v}`
- Group splits `[@x @y]`

Each branch produces separate solutions. Use `solutions()` to enumerate, or `solve()` for first only.

---

## Implementation Notes

### Symbol Unification

The engine uses symbol unification to prune branches early. When a variable is bound, future occurrences immediately unify, avoiding unnecessary traversals.

### Lazy Evaluation

Solutions are generated lazily. Methods like `first()`, `hasMatch()`, and `take(n)` short-circuit without computing all possibilities.

### Path Tracking

Every binding tracks its **site** — the location(s) in the tree where the variable matched. This enables surgical edits with `editAll()` and `mutate()`.

---

## API Design

### Simple vs Advanced

The API has two tiers:

**Simple API** (`.on()`, `.in()`): Returns plain objects, suitable for 90% of use cases.

```javascript
Tendril("{name: $x}").on(data).solve()  // => {x: "Alice"} or null
Tendril("{name: $n}").in(data).count()  // => 2
```

**Advanced API** (`advancedMatch()`, `advancedFind()`): Returns rich objects with full control.

```javascript
const result = Tendril(pattern).advancedFind(data);
result.occurrences()   // Iterate occurrences
result.solutions()     // Get SolutionSet
result.editAll({...})  // Transform with site tracking
```

### Transformation Methods

| Method | Scope | Use |
|--------|-------|-----|
| `replace()` | Entire match ($0) | Replace whole matched value |
| `mutate()` | Specific bindings | Edit values at variable sites |
| `editAll()` | All occurrences | Transform across all matches |
| `replaceAll()` | All occurrences | Replace all matched values |

---

## Roadmap

### Planned

- **Streaming**: Process large files without loading entirely
- **Compilation levels**: `Tendril(pattern, {level: 'core'})` to restrict features
- **Source maps**: Track pattern positions for better errors
- **REPL**: Interactive pattern exploration

### Considered

- **Pattern composition**: Combine patterns with operators
- **Named patterns**: Define reusable pattern fragments
- **Schema generation**: Generate JSON Schema from patterns

### Non-Goals

- SQL-complete semantics (aggregation, sorting, etc.)
- Full programming language features
- Binary format support

---

## Influences

- Regular expressions (syntax, quantifiers)
- Prolog (unification, backtracking)
- XPath/XQuery (path expressions)
- JSONPath (navigation syntax)
- Datalog (declarative queries)

---

## Contributing

See [GitHub Issues](https://github.com/your-repo/tendril/issues) for current work.

Areas of interest:
- Performance benchmarks
- Additional test cases
- Documentation improvements
- Language binding ideas
