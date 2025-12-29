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

