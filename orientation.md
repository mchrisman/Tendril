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

AI Assistant, please add to your immediate to-do list, documenting here how to run tests and how to add them. If this takes more than a paragraph to describe, it is a symptom of our test process being non-ergonomic, which should be fixed.

## Map

AI Assistant, please add to your immediate to-do list, documenting here the directory structure and highlighting important files.

We have a lot of .md documentation files that are obsolete, tentative, or scratchpad-type notes. Ignore all of them except README.md
