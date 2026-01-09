---
id: td-0020
title: Explicit collect syntax
status: backlog
priority: medium
type: feature
created: 2026-01-05T00:49:25-08:00
updated: 2026-01-05T00:49:25-08:00
tags: [buckets, syntax]
---

# DESCRIPTION

## CW 20 - REVISED

Doing without the label was too subtle. We now always require the label for <collecting>. The canonical form is

```
    COLLECTING:=  '<collecting' COLLECT_EXPR ':' COLLECT_EXPR in '%' IDENT across '^' IDENT '>'
               |  '<collecting' COLLECT_EXPR in '@' IDENT across '^' IDENT '>'
    COLLECT_EXPR = '$' IDENT | '(' EL_EXPRESSION ')'
```

where '^' IDENT references a label §IDENT higher up in the structure, and COLLECT_EXPR references bound variables. During evaluation, when §IDENT is first seen on a branch, it is initialized to an empty array or object, and *persists across downstream branches* by copying its reference rather than by deep clone. "X,Y in %foo" collects into an object slice, "Y in @foo" into an array slice.

```
data=
{ a1 : { b11: {c111: 111, c112:112},
         b12: {c121: 121, c122:122} },

  a2 : { b21: {c211: 211, c212:212},
         b22: {c221: 221, c222:222} } }
         
pattern=
"{$a: §L {$b: {$c:$v <collecting $c:$v in %bucket across ^L>  }}}"

solutions:
[
   {a='a1', b='b11', c='c111', v='111', bucket={c111:'111',c112:'112',c121:'121',c122:'122'} },
   {a='a1', b='b11', c='c112', v='112', bucket={c111:'111',c112:'112',c121:'121',c122:'122'} },
   {a='a1', b='b12', c='c121', v='121', bucket={c111:'111',c112:'112',c121:'121',c122:'122'} },
   {a='a1', b='b12', c='c122', v='122', bucket={c111:'111',c112:'112',c121:'121',c122:'122'} },

   // we backtrack past §L to $a, therefore a new bucket. 
   {a='a2', b='b21', c='c211', v='211', bucket={c211:'211',c212:'212',c221:'221',c222:'222'} },
   {a='a2', b='b21', c='c212', v='212', bucket={c211:'211',c212:'212',c221:'221',c222:'222'} },
   {a='a2', b='b22', c='c221', v='221', bucket={c211:'211',c212:'212',c221:'221',c222:'222'} },
   {a='a2', b='b22', c='c222', v='222', bucket={c211:'211',c212:'212',c221:'221',c222:'222'} },
]
  
pattern=
"{$a: §L {$b: {$c:$v <collecting $c:$v in @bucket across ^L>  }}}"

solutions:
[
   {a='a1', b='b11', c='c111', v='111', bucket={'111','112','121','122'} },
   {a='a1', b='b11', c='c112', v='112', bucket={'111','112','121','122'} },
   {a='a1', b='b12', c='c121', v='121', bucket={'111','112','121','122'} },
   {a='a1', b='b12', c='c122', v='122', bucket={'111','112','121','122'} },

   // we backtrack past §L to $a, therefore a new bucket. 
   {a='a2', b='b21', c='c211', v='211', bucket={'211','212','221','222'} },
   {a='a2', b='b21', c='c212', v='212', bucket={'211','212','221','222'} },
   {a='a2', b='b22', c='c221', v='221', bucket={'211','212','221','222'} },
   {a='a2', b='b22', c='c222', v='222', bucket={'211','212','221','222'} },
]
```

The -> operator can go anywhere within the scope of a `each K:V` construction, and desugars "A->B" to "<collecting $k:A into B>" over the nearest such construction. Thus

```
{ each /a/: $p->%p1 else [ [ $q->%q1 ] ] }
```

desugars to
'''
§__1 { each (/a/ as $__k1) :
    $p <collecting $__k1,$p in %p1 across §__1>,
    else [ [ $q <collecting $__k1:$q in %q1 across §__1 ] ] }

'''

## BOTTOM LINE

There are these forms:
`<collecting K:V in %B across ^L>` within a substructure labeled §L
`<collecting K:V in @B across ^L>` within a substructure labeled §L
`<collecting V in @B across ^L>` within a substructure labeled §L
`A->B` within the V of `{ each K:V }`, automatically takes `each K:V` as the scope and `K` as the key.
