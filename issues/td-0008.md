---
id: td-0008
title: EL assertions on structural pieces
status: backlog
priority: low
type: feature
created: 2026-01-05T00:49:25-08:00
updated: 2026-01-05T00:49:25-08:00
tags: [el, guards]
---

# DESCRIPTION

## CW 8. EL assertions applied to structural pieces other than bindings.

ChatGPT recommends against this, or if we do it, make it explicit, such as a zero width `guard(expr)`

Support something like

```
"{
    securityLevel:$securityLevel;
    "some_huge_record": {
         // deeply inside here...
             { 
                 hasClearance:(true ; $securityLevel>10) | false
             }
    }
}"

or perhaps leverage lookaheads
"{
    securityLevel:$securityLevel;
    "some_huge_record": {
         // deeply inside here...
             { 
                 hasClearance:(?;$securityLevel>10)true | false
             }
    }
}"
```

# LOG [2026-01-05T00:49:25-08:00]

Opened.
