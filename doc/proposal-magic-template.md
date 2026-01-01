== CW 8. **Magic Template**

https://chatgpt.com/c/69514bdd-6a94-8329-b954-88f13b2257b8

I've been thinking for the last day or two about the problem that we have no way to create a transformation that requires collecting individual solutions into an array or another structure. It is certainly possible to create a basic api like .solutions().groupBy("x").groupBy("y").enumerate(). I started thinking along the lines of how to make that more flexible, and I'm starting to have the intuition that a more general "make it look like this" transformation might be possible. For example:

a. You should be able to invert a map by saying

```
Tendril("{$k:$v}").match(data).render("{$v:[...$k...]}")
```

b. we would obviate the need for any such groupBy API by saying

```
Tendril(pattern).match(data).render("{$x = {$y = [...[$z $w]...]}")
```

or (this time using path notation)

```
Tendril(pattern).match(data).render("{$x.$y[_]=[$z $w]}")
```

c. This earlier example

```
// Macro expansion: <When>/<Else> → If node
const result = Tendril(`[
  ..
  @whenelse=(
    {tag:when/i children:$then}
    {tag:else/i children:$else}?
  )
  ..
]`).find(vdom).editAll($ => ({
  whenelse: [{
    tag: 'If',
    thenChildren: $.then,
    elseChildren: $.else || []
  }]
}))
```

could become (this one's more difficult, involves a conditional structure)

```
// Macro expansion: <When>/<Else> → If node
const result = Tendril(`@(
    {tag:when/i children:$then}
    {tag:else/i children:$else}?
)`).find(vdom).transformAll(`
         {tag:if thenChildren:$then elseChildren:(?_)$else}
    else {tag:if thenChildren:$then}
  }]
`)
```

After some discussion with ChatGPT, I think we have a viable strategy that would be able to produce results like the following. 

=== input
```
const pod = {
  metadata: { name: "api-7d9c9b8c6f-abcde", namespace: "prod" },
  spec: { containers: [
    { name: "api",  image: "ghcr.io/acme/api:1.42.0", env: [{name:"A",value:"1"}] },
    { name: "side", image: "ghcr.io/acme/sidecar:3.1.0" }
  ]},
  status: { containerStatuses: [
    { name: "api",  ready: true,  restartCount: 0, state: {running:{}} },
    { name: "side", ready: false, restartCount: 7, state: {waiting:{reason:"CrashLoopBackOff"}} }
  ]},
  // lots of other fields you don’t want to enumerate…
  other: { huge: { blob: 1 } }
};

Tendril(`{
  metadata:{ name:$pod namespace:$ns }
  spec.containers[_]:          { name:$c image:$img env:@env? }
  status.containerStatuses[_]: { name:$c ready:$ready restartCount:$restarts state:$state }
  @extra=(%?)   // optionally capture untouched top-level stuff
}`)
.match(pod)
.transformTo(`{
  pod: $ns "/" $pod
  containers: {
    $c: {
      image: $img
      ready: $ready
      restarts: $restarts
      // keep env if present; otherwise omit
      env: @env?
      // classify state without an if-statement: try one shape, else another
      status:
        { running: _ }   // satisfiable only if state has running
      else
        { waiting: { reason: $reason } }  // binds reason if waiting
      else
        { other: $state } // fallback: preserve raw state
    }
  }
  extra: @extra?  // preserve everything not mentioned, if you want
}`);


```
=== output shape
```
{
  pod: "prod/api-7d9c9b8c6f-abcde",
  containers: {
    api: {
      image: "ghcr.io/acme/api:1.42.0",
      ready: true,
      restarts: 0,
      env: [{name:"A",value:"1"}],
      status: { running: "_" }
    },
    side: {
      image: "ghcr.io/acme/sidecar:3.1.0",
      ready: false,
      restarts: 7,
      status: { waiting: { reason: "CrashLoopBackOff" } }
    }
  },
  extra: { other: { huge: { blob: 1 } } }
}

```

== Transparency and safety. 

We wouldn't do this as a black box magic thing, although it would support that usage. We would do it as a code generation tool that transpiles your output template into JavaScript. If you wanted the black box magic, you could just do that at runtime, but most people would generate the JavaScript, review it, and test it. 

With regard to transform two templates looking very close to patterns, the goal is that they should look exactly like patterns because the selling point is that you only have to learn one and you also have a pattern that can be used for parsing the output. A lot of your comments are around determinism. And as an engineer, I completely appreciate that. But let me point out that there are multiple levels of indeterminism. Here 'output' refers to the transformed data:

0. The output is not deterministic.
   A. The output is underspecified, With major structural differences from what the user intended.
   B. The output is underspecified with differences that are acceptable to the user, for example, reorderings; the visible shape of the pattern determines what is specified and what isn't.
   C. The output is completely specified by the visible shape of the pattern; all 'hints' are meaningful pattern-matching assertions.
   D. The output is completely specified, formally and stably, by the visual shape of the pattern, plus additional hints that are not part of ordinary tendril patterns.

- Nobody is suggesting (0).
- Your position is that (C) is impossible in general (in theory) and therefore (D) is necessary and should be mandatory.
- My position is that (C) is often possible (in practice, If the metric is what's in the user's head rather than a formal specification), and that (B), (C), (D) all have their place in a spectrum of tradeoffs between simplicity, LOE, and predictability; and that (A) Should be generally prevented by the structure of the language. 