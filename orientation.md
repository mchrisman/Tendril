# Tendril Orientation

This document is the cold start knowledge map. It answers:

- Where do I find _?
- What is file _ and how does it relate?
- How do I run the app, run the tests, etc?
- What are the general instructions or coding standards?

It is *not*

- A change log (see Git)
- A backlog or to-do list (see issues/ or Github issues)
- A historical document (describe the *current* project only; delete obsolete info)

Update this file after every change, to reflect the *current* project (as noted, this is not a historical document).

## Start here

Read the full contents of README.md and doc/core.md into your context at the start of the session or after every memory compaction to enhance your contextual understanding.

## Design Philosophy

Functional, useful, and usable are non-negotiable goals, but the language should also have a strong and distinctive character. Aim for beauty, elegance, and the reaction "oooh, nice." When making design decisions, prefer solutions that are both powerful and delightful to use.

## General instructions

Before making any changes, consider carefully how the change fits into the overall architecture, and whether the change is consistent with the project philosophy and goals. It will ultimately be the user's choice whether to proceed with a change, but push back on changes that seem detrimental.

When ambiguities arise, resolve them yourself without further discussion if there is an obviously better solution and no architectural implications. But call them out.

When making decisions, consider the *entire* architecture and choose the design that keeps Tendril coherent, minimal, and internally consistent.

Never defer part of the requested change or leave "do later" placeholders without approval from the user.

## Development Workflow

1. Consider the request. Judge it in the context of architectural quality and alignment with project goals.
2. Offer alternative suggestions or designs, even if a particular design was proposed. (But don't offer clearly inferior designs.)
3. Write tests first. If this step is not straightforward, write a test plan first and ask for approval. It is important to explore edge cases as these can highlight gaps in the design.
4. Run unit tests to establish baseline. If any are failing, ask the user for instructions before continuing.
5. Complete the change.
6. Review the change with fresh eyes for consistency with the intent and for completeness.
7. Run tests and fix any bugs.
8. Update `README.md` if API changes
9. Update this file if structure changes

### Coding style

Comment non-obvious algorithms, not obvious code 

Use existing patterns (see Scope, Handle classes, microparser)

The code must be compact — not by abridgment or code-golf, but by finding elegantly simple solutions and expressing them with clarity.  **But do not sacrifice required semantics to minimize line count**.

**Priorities:**

1. Correctness & completeness
2. Simplicity
3. Clarity
4. Brevity

### How to run tests

```bash
npm test           # Run all tests
node test/foo.js   # Run a specific test file
```

Tests use Node's built-in test runner (`node:test`). To add a new test file, create `test/foo.test.js` and import from `node:test` and `node:assert/strict`.

### Debugging

Tendril has two phases: **parsing** (pattern string → AST) and **matching** (AST + data → solutions). Each has its own debugging approach.

#### Debugging the Parser

Use when: syntax errors, understanding how a pattern is parsed, parser performance.

```javascript
import { parsePattern } from './src/tendril-parser.js';
import { createTraceDebugger, createReportDebugger } from './src/microparser.js';

// Parse errors include a detailed report
try {
  parsePattern('{ foo: bar baz }');
} catch (e) {
  console.log(e.parseReport);  // Shows context, tried alternatives, token window
}

// Trace debugger - logs parsing activity to console
parsePattern(src, { debug: createTraceDebugger() });
parsePattern(src, { debug: createTraceDebugger({ showTokens: true }) });
parsePattern(src, { debug: createTraceDebugger({ filter: l => l.startsWith('obj-') }) });

// Report debugger - collects data silently, then summarize
const dbg = createReportDebugger();
try { parsePattern(src, { debug: dbg }); } catch(e) {}
console.log(dbg.getReport());  // Shows hotspots, token count, failures
```

Parser debug hooks:
```javascript
const debug = {
  onEnter: (label, idx) => {},     // entering labeled rule
  onExit: (label, idx, success) => {}, // exiting rule
  onEat: (tok, idx) => {},         // consuming token
  onBacktrack: (label, startIdx, success) => {}, // backtrack result
  onFail: (msg, idx, contextStack) => {}, // parse failure
};
```

Key parser hotspots: `parseItemTermCore`, `parseAGroupBase`, `parseOGroup`, `parseORemnant`, `parseBreadcrumb`.

#### Debugging the Engine/Matcher

Use when: pattern doesn't match as expected, understanding variable bindings, match performance.

```javascript
import { match, scan } from './src/tendril-engine.js';
import { parsePattern } from './src/tendril-parser.js';

const ast = parsePattern('{ name: $x }');

// Simple trace debugger
const debug = {
  onEnter: (type, node, path) => console.log(`ENTER ${type} at /${path.join('/')}`),
  onExit: (type, node, path, matched) => console.log(`EXIT ${type} -> ${matched ? 'MATCH' : 'FAIL'}`),
  onBind: (kind, name, value) => console.log(`BIND ${kind} $${name} = ${JSON.stringify(value)}`),
};

const solutions = match(ast, data, { debug });
```

Engine debug hooks:
```javascript
const debug = {
  onEnter: (type, node, path) => {},  // entering AST node (type = node.type like 'Object', 'Scalar', etc.)
  onExit: (type, node, path, matched) => {}, // exiting (matched = true/false)
  onBind: (kind, name, value) => {},  // variable bound (kind = 'scalar'|'group')
};
```

**Key differences:**
| Aspect | Parser | Engine |
|--------|--------|--------|
| Input | pattern string | AST + data |
| Output | AST | solutions (bindings) |
| Errors | syntax errors (bad pattern) | match failures (pattern doesn't match data) |
| Traces | grammar rules, tokens | AST nodes, bindings |

## Map

```
src/
  tendril-api.js      # Public API (Tendril(), match/find/solutions/etc)
  tendril-engine.js   # Core matching engine (the heart of the system)
  tendril-parser.js   # Pattern parser (AST construction)
  microparser.js      # Low-level tokenizer + Parser class with debug hooks
  ...                 # other impl files
  
test/
  engine.test.js               # Main engine tests
  else.test.js                 # 'else' operator (prioritized choice)
  flow-operator.test.js        # Flow operator (->) for bucket collection
  cw4-cw14-conformance.test.js # CW4/CW14/CW16 conformance (buckets, labels)
  guarded-patterns.test.js     # CW 2B: anonymous guards (PATTERN where EXPR)
  label-parsing.test.js        # Label syntax (§label, <^label>)
  object-semantics-v2.test.js  # Slice-based object matching
  residual-tracking.test.js    # Coverage-based remainder
  optional-patterns.test.js    # K:>V? syntax
  tokenizer.test.js            # Tokenizer edge cases
  ...
```


## Documentation Notes

**Authoritative documentation hierarchy:**

- `README.md` — Project intro, quick examples, links
- `doc/core.md` — Core language (10 minutes, 80% use cases)
- `doc/advanced.md` — Advanced features (groups, guards, quantifiers)
- `doc/arcane.md` — Expert features (lookaheads, labels, collecting)
- `doc/reference.md` — Full grammar, detailed semantics
- `doc/design.md` — Philosophy, language levels, roadmap

**API Levels:**

- Simple API: `.on(data)` and `.in(data)` — returns plain objects
- Advanced API: `advancedMatch()` and `advancedFind()` — returns rich objects with full control
