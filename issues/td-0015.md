---
id: td-0015
title: Seq nodes inside array alternation branches
status: backlog
priority: high
type: bug
created: 2026-01-05T00:49:25-08:00
updated: 2026-01-05T00:49:25-08:00
tags: [parser, engine]
---

# DESCRIPTION

## CW 15. Seq nodes inside array alternation branches

**Bug:** When a parenthesized sequence like `({kind:"A"} {kind:"B"})` appears as a branch in an array alternation, the parser correctly creates a `Seq` node, but the engine's `matchItem` function does not know how to handle `Seq` nodes (it throws "Unknown item type: Seq").

**Example pattern that fails:**

```
[ ({kind:"A"} {kind:"B"}) | ({kind:"C"}) ]
```

**Current AST:**

```json
{
  "type": "Alt",
  "alts": [
    {
      "type": "Seq",
      "items": [
        /* {kind:"A"}, {kind:"B"} */
      ]
    },
    {
      "type": "Obj"
      /* {kind:"C"} */
    }
  ]
}
```

**Expected behavior:** The engine should recognize that when matching an `Alt` in array context, each branch could be a `Seq` and should be matched as a sub-sequence, not as a single item.

**Workaround:** Use patterns that don't require sequences within alternation branches. For bucket rollback testing, use value-level alternation in object context instead.

**Test case (preserved in test/cw4-cw14-conformance.test.js):**

```js
// Currently fails with "Unknown item type: Seq"
const pat = `{ box: [ ({kind:"A"}->@picked {kind:"B"}) | ({kind:"B"}->@picked) ] }`;
```

# LOG [2026-01-05T00:49:25-08:00]

Opened.
