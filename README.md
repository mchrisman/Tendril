# Tendril

Tendril is a declarative language for matching, joining, and transforming JSON-like data—especially when structure matters more than paths.

## Status

**Alpha.** The language and the API are still not entirely stable.

Performance: The engine uses symbol unification to prune branches early, avoiding unnecessary traversals. Performance is reasonable for development and testing, untried at large scale.

## Getting started

1. `npm run build`
2. `<script src="dist/tendril.cjs">`

### Hello, Worlds

```
const data = {
  planets: {
    Jupiter: {size: "big"},
    Earth: {size: "small"},
    Ceres: {size: "tiny"}
  },
  aka: [
    ["Jupiter", "Jove", "Zeus"],
    ["Earth", "Terra"],
    ["Ceres", "Demeter"]
  ]
}

const pattern = `{
  planets: { 
      $name: { size: $size } 
  }
  aka: [
    ...
    [ (?$name) ... $alias ... ]  // (?$name) is a lookahead. 
    ...
  ]
}`

Tendril(pattern).on(data).solutions()
.map(({size,alias})=>`Hello, ${size} world ${alias}!`)

```
---


Do you want **find and replace**?
```
Tendril("{ password:$p }").in(data).mutate({p: "REDACTED"});
```

---

Do you want **joins across different structures** (in memory)?

*No preprocessing, no indexes, no foreign keys — just paths + unification.*

```
const users = [
    {id: 1, name: "Alice"},
    {id: 2, name: "Bob"}];
const orders = [
    {user_id: 1, item: "laptop"},
    {user_id: 2, itemList: ["mouse", "mousepad"]} ];

Tendril(`{
  users[$i].id: $userId
  users[$i].name: $name
  orders[$j].user_id: $userId
  orders[$j].item: $item? 
  orders[$j].itemList[_]: $item?
}`)
.on({users, orders})
.solutions()
```

Do you want to **restructure a VDOM**?

Replace a `<label>` tag with a `placeholder` on the associated `<input>` tag,
regardless of how distant the two nodes are in the tree.
```
<input id="x"> ... <label for="x">Name</label>
→ <input id="x" placeholder="Name">.
```
```
Tendril(`{
    ** ({ 
        tag:'label', 
        props:{
            for:$id, 
            children:[(_string* as @labelText)]  
        } 
    } as $L)
    **  { 
        tag:'input', 
        props:{
            id:$id,
            (placeholder:_? as %p) 
        } 
    }
}`)
.in(vdom)
.mutate({
  L: undefined,                    // delete the <label>
  p: $ => ({placeholder: $.labelText})  // move its text into the <input>
});
```

Or **summarize a config**?

```
const input = {
  metadata: {name: "api-7d9c9b8c6f-abcde", namespace: "prod"},
  spec: {
    containers: [
      {name: "api", image: "ghcr.io/acme/api:1.42.0"},
      {name: "side", image: "ghcr.io/acme/sidecar:3.1.0"}
    ]
  },
  status: {
    containerStatuses: [
      {name: "api", ready: true, restartCount: 0},
      {name: "side", ready: false, restartCount: 7}
    ]
  }
};

Tendril(`{
  metadata:{ name:$pod namespace:$ns }
  spec.containers[_]: { name:$c image:$img } 
  status.containerStatuses[_]: { name:$c ready:$ready restartCount:$restarts }
}`)
.on(input)
.solutions() 
.map(({pod, ns, c, img, ready, restarts}) =>
        `${ns}/${pod}  ${c}  ${img}  ready=${ready}  restarts=${restarts}`
);
```

Do you want to **validate semi-structured data** without writing a schema?

```
// Assert: every service has a port, ports are numbers, and no service exposes port 22.
// todo validate this
Tendril(`{
  services: [{
    port: _number
    (! port: 22)
  }*]
}`)
.on(config)
.test();

```
## Documentation

- **[Core Guide](doc/core.md)** — Learn Tendril in 20 minutes. Covers 80% of use cases.
- **[Advanced Guide](doc/advanced.md)** — Group variables, guards, flow operators.
- **[Arcane Guide](doc/arcane.md)** — Lookaheads, labels, edge cases.
- **[Reference](doc/reference.md)** — Grammar, detailed semantics.

## License

MIT
