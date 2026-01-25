# Tendril Core Guide

Learn Tendril in 20 minutes.

Coming soon. For now see [cheat-sheet.md](cheat-sheet.md)

---

## 1. The basics

**Tendril describes JSON-like data.**  (It will remind you of how regular expressions describe strings. A little.)

The wildcard `_` represents any primitive or single object.
```
Tendril(`["foo", _ , 3]`)            // the pattern
    .on( ["foo", "bar", 3.0])        // the data
    .test()                          // ✅ true, it matches
```
$x is a named wildcard. Use solutions() to extract the value.
```
Tendril(`[$x $y]`)                // the pattern
    .on( ["foo", "bar"])          // the data
    .solutions()                  // ✅ [{x:"foo", y:"bar"}]
```
To **match the whole data**, use .on(data).  To **search** within data, use .in(data).
```
Tendril(`{(name|nickname):$n}`)     
    .in([{name:"Joe"},{name:"Sue"},{nickname:"Alice"}])
    .solutions()                  // ✅ [{n:"Joe", n:"Sue", n:"Alice"}]
```
Learn by example:
```
`[foo bar]`        // ✅ matches ["foo","bar"] - Commas are optional; 
                   // bare words are string literals.
                   // ❌ does not match [foo,bar,baz] - You must match entire array  
 
`[$x $x]`          // ✅ matches [3,3], or [ [5,6,7], [5,6,7] ]
                   // ❌ does not match [3,4] - Two '$x' references must match 
                   // ❌ does not match [5,6,7,5,6,7] - $x can only match a *single* item 

`[@y @y]`          // ✅ matches [5,6,7,5,6,7]; solutions=[{y:[5,6,7]}]
                   //   @y can match multiple items (a **slice**, an array fragment).
                   
`{a:1 b:$b}`       // ✅ matches {a:1,b:2,c:3}; solutions=[{b:2}]
                   // ✅ A partial match is OK



That gives you the ability to perform relational joins, tying together two structures that have a data point in common ($userId in this example).
```
users = {
    1: { name: "Alice" },
    2: { name: "Bob" }
};
orders = {
    1000: { user_id: 1, itemList: ["laptop"]},
    1001: { user_id: 2, itemList: ["cleaning kit"]},
    1002: { user_id: 1, itemList: ["mouse", "mousepad"]}
};

Tendril(`{
    users = {
        $userId: { name: $name }
    };
    orders = {
        $orderId: { user_id: $userId, itemList: [...$item...] },
    };
}`
.on({users, orders})
.solutions()
// ✅ Output:
[
    {orderId: 1000, userId:1, name:"Alice", item:"laptop" },
    {orderId: 1001, userId:2, name:"Bob", item:"cleaning kit" },
    {orderId: 1002, userId:1, name:"Alice", item:"mouse" },
    {orderId: 1002, userId:1, name:"Alice", item:"mousepad" },
]
Tendril(`{
  users[$i].id: $userId
  users[$i].name: $name
  orders[$j].user_id: $userId
  orders[$j].item: $item? 
  orders[$j].itemList[_]: $item?
}`)
```

---

## 2. Simple matchers, primitives, regex

```
foo            // matches the exact string "foo" (bare identifier, 
               // except reserved words: as, when, each, where )
"foo bar"      // single- or double-quotes

foo/i          // case-insensitive bare identifier, matches "Foo", not "foobar"
"f+b"/i        // case-insensitive quoted string, matches "F+B", not "f$bar"

123, -42, 3.14 // matches numeric value (123 and 123.0 equivalent)
true, false    // matches Boolean values only
null           // matches null only
```
Regex patterns use JavaScript regex syntax and match against string values only. 

**Tip** JavaScript regexes match on substrings. If all you want is case insensitivity and whole-string matching, use `foo/i`.
```
/foo/          // regex matches any substring — "seafood" matches (contains "foo")
/foo/i         // case-insensitive regex — "FOOdish", "seaFOOd" both match
/^[A-Z]{2,}$/  // regex anchors match whole string — "NASA", "OK", not "Ok!"
```
Typed wildcards are strict (no coercion)
```
_              // wildcard matches any single value, including 'null', 'undefined', or refs.
_string        // typed wildcard: matches any string
_number        // typed wildcard: matches any number (including NaN, Infinity)
_boolean       // typed wildcard: matches true or false
```
Whitespace separates items but is otherwise insignificant unless quoted. Commas are optional.
```
[foobar]       // matches ["foobar"] only
[foo bar]      // matches ["foo","bar"] only
["foo bar"]    // matches ["foo bar"] only
```
---

## 3. Array patterns (intro)

Square brackets indicate arrays. Items in arrays match in sequence left to right (just as characters in regexes do).
```
[1 2 3]        // matches [1,2,3], does NOT match [3,2,1]
[1 2]          // does NOT match [1,2,3] — too short
[5 ... 5]      // matches [5,9,0,5] — ellipsis `...` matches any number of items 
[5 ...]        // matches [5,2,3] and [5] and [5,{color:'blue'},[123]]
```
**Common idioms** 
```
[...foo...]    // Any array containing "foo" in any position 
[...]          // Any array
[]             // Empty array
```
Regex-inspired operators like * + ? operate on the level of items, not characters. The Tendril operator '*' matches any number of equal repetitions, including zero:
```
[a c* d]       // matches ['a', 'c', 'c', 'c', 'd']
               // matches ['a', [1,2,3], [1,2,3], d]
               // does NOT match ['a', 'ccc', 'd']
               
[a /c*/ d]     // matches ['a', 'ccc', 'd'] - this is the regex operator, 
               // not the Tendril operator
               
[a? b? c+ d{4,5}]  // matches ['b', 'c', 'c', 'd', 'd', 'd', 'd']
```
**Warning:** Parentheses make groups, not substructures:
```
[1 (2 3)*]         // matches [1, 2, 3, 2, 3]
                   // does NOT match [1 [2 3] [2 3]].
```
---
4. Object patterns (intro)

An object pattern is a sequence of KEY:VALUE assertions ("field clauses") about the object's fields. All must be satisfied.

```
{ KEY:VALUE }      // Field must exist with matching value
{ KEY?:VALUE }     // Field is optional, but if present must match

{ foo: bar/i }     // matches { foo:"BAR" , baz:"don't care"}
{ foo?: bar/i }    // matches {} (no foo), or { foo:"BAR" }, but NOT { foo:"xyz" }

{ a:1 b:2 }        // matches {a:1, b:2, c:3}, does not match {a:1}.
```

**Common idioms**
```
{ foo: _ }         // Field 'foo' exists
{}                 // Any object (empty or not)
```
**Note:** If KEY is a pattern that could match multiple field names,
additional semantics apply. See the Advanced guide.
---
5. **Path patterns** (intro)

Object patterns can contain chained keys (path patterns):
```
{
   foo.bar[2].baz:value
   p?.q?[2]?.r?:value
}
```
is equivalent to
```
{ 
   foo: { bar: [_ _ {baz: value} ...] }
   p?: { q ?: [(_ _ {r?: value})? ...] } 
}
```
**Warning** This is pattern matching, not dereferencing:
```
let data = {nothing:0}
let A = data.foo.bar         // Javascript: throw error, no such property
Tendril(`{ foo.bar:_ }`).on(data).test()  // Tendril: it merely fails to match (result=false)

```
**Common idioms**
```
{ foo[_]: value }   // equivalent to { foo:[...value...] }


```

---
<style>
.warn {margin-top:1em; margin-bottom:1em;margin-left:2em;margin-right:2em; padding:.5em; background-color:ffeeee}
.warn pre {margin:0 ; padding:0.2em;}
.info {margin-top:1em; margin-bottom:1em;margin-left:2em;margin-right:2em; padding:.5em; background-color:#eeeeff}
.info pre {margin:0 ; padding:.2em;}
</style>