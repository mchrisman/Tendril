# TagMark Orientation

This document is the cold start knowledge map. It answers:

- Where do I find _?
- What is file _ and how does it relate?
- How do I run the app, run the tests, etc?
- What are the general instructions or coding standards?

It is *not*

- A change log (see Git)
- A backlog or to-do list (we don't have one yet)
- A historical document (describe the *current* project only; delete obsolete info)

Update this file after every change, to reflect the *current* project (as noted, this is not a historical document).

## Start here

Read the full contents of README.md and src/tendril-engine.js into your context at the start of the session or after every memory compaction to enhance your contextual understanding.


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

### Debugging the parser

The parser has built-in debugging support via the `debug` option:

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

Custom debug hooks (mirrors engine's ctx.debug pattern):
```javascript
const debug = {
  onEnter: (label, idx) => {},     // entering labeled rule
  onExit: (label, idx, success) => {}, // exiting rule
  onEat: (tok, idx) => {},         // consuming token
  onBacktrack: (label, startIdx, success) => {}, // backtrack result
  onFail: (msg, idx, contextStack) => {}, // parse failure
};
```

Key labeled hotspots: `parseItemTermCore`, `parseAGroupBase`, `parseOGroup`, `parseORemnant`, `parseBreadcrumb`.

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
  each-clause.test.js          # 'each' clause for "validate all" semantics
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

We have many `.md` documentation files that may be obsolete, tentative, or scratchpad-type notes. Ignore all of them except README.md.
