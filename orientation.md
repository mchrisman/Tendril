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

Update this file after every change.

## Start here

Read the full contents of doc/user-guide.md and src/tagmark.js into your context at the start of the session or after every memory compaction to enhance your contextual understanding.

This repository holds new frontend framework, **TagMark**. This is a mini-framework which is anticipated to be under **2000 LOC**, not counting the libraries mentioned below. It is implemented in **pure JavaScript**, **no build step**, and should run directly in the browser.

The primary specification is original-spec.md and user-guide.md. The latter is the more up-to-date document. The former is the more complete.

## General instructions

Before making any changes, consider carefully how the change fits into the overall architecture, and whether the change is consistent with the project philosophy and goals. It will ultimately be the user's choice whether to proceed with a change, but push back on changes that seem detrimental.

When ambiguities arise, resolve them yourself without further discussion if there is an obviously better solution and no architectural implications. But call them out.

When making decisions, consider the *entire* architecture and choose the design that keeps TagMark coherent, minimal, and internally consistent.

Never defer part of the requested change or leave "do later" placeholders without approval from the user.

## Development Workflow

1. Consider the request. Judge it in the context of architectural quality and alignment with project goals.
2. Offer alternative suggestions or designs, even if a particular design was proposed. (But don't offer clearly inferior designs.)
3. Write tests first. If this step is not straightforward, write a test plan first and ask for approval. It is important to explore edge cases as these can highlight gaps in the design.
4. Run unit tests to establish baseline. If any are failing, ask the user for instructions before continuing.
5. Complete the change.
6. Review the change with fresh eyes for consistency with the intent and for completeness.
7. Run tests and fix any bugs.
8. Update `doc/user-guide.md` if API changes
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

Playwright & test.mjs, I think. Please look at that file and the other files in test/. Complete this section at the next opportunity.

## Map

tagmark/
├── src/
│ └── tagmark.js # Core implementation (~2000 LOC target)
├── lib/
│ ├── ActDown.js # VDOM reconciliation
│ ├── DeepProxy.js # Reactivity system
│ ├── actdown-ext-forms.js # Optional forms logic; we are using this.
│ ├── diff_utils.js # Debug only
│ └── tendril/ # Structural pattern matching (optional)
├── test/ # Browser-based test suite
├── doc/
│ ├── user-guide.md # Primary spec (most current)
│ ├── original-spec.md # Complete reference
│ └── [historical]/ # Ignore unless referenced
└── prototype/ # Reference only, do not use directly

## Doc files

Ignore most of what is in the doc folder except for original-spec.md and user-guide.md. The other files contain a lot of historical proposals.

## Library code

The project references several libraries in lib/. Make **no modifications** unless correcting an essential bug.

### `lib/ActDown*` and `lib/DeepProxy*`

These supply VDOM reconsiliation and reactivity to a global state, as explained in the spec.

The preamble of `ActDown.js` describes its usage; the whole library is small enough to read fully.
We will also use `actdown-ext-forms.js`.

### `lib/diff_utils.js`, `lib/plf.js`

Do **not** use these in the implementation. They may be used only for **debugging** (e.g., printing readable diffs via `ObjectDiff`).

### `lib/tendril/`

Tendril is “regex for structures.” It is available but *not expected* to be needed. If structural pattern matching becomes useful, this is the preferred library.

## Prototype code

Some historical code may be helpful for reference.

### `urlSync.js`

This **should be heavily re-used**. It already does almost exactly what we need; refactor it into the TagMark architecture and move the updated version into `src/`.

### `prototype/Phoenix.js`

**Must not be used directly.**
It is provided only to illustrate ideas about component integration.
Phoenix implemented its own storage mechanism; TagMark will now provide the local state. Phoenix’s state keys were an early form of TagMark’s SID concept.
