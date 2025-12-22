## Hello, world

In this example, we join two parts of a structure on the *name of a planet*.

```js
const data = {
  planets: {
    Jupiter: {size: "big"},
    Earth: {size: "small"}
  },
  aka: [["Jupiter", "Jove", "Zeus"], ["Earth", "Terra"]]
};
````

The same match can be expressed in two styles.

**“Pattern imitates data” style:**

```js
const pattern = `{
    planets: {
        $canonicalName: { size: $size }
    }
  aka: [.. [?=($canonicalName) .. $name ..] ..]
}`;
```

**“Query-like constraints” style:**

```js
const pattern = `{
    planets.$canonicalName.size: $size
    aka[$i][0]: $canonicalName
    aka[$i][_]: $name
}`;
```

```js
Tendril(pattern)
.match(data)
.solutions()
.map($ => `Hello, ${$.size} world ${$.name}`);
```

```txt
[
  "Hello, big world Jupiter",
  "Hello, big world Jove",
  "Hello, big world Zeus",
  "Hello, small world Earth",
  "Hello, small world Terra"
]
```