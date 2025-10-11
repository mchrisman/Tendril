

# Tendril

**Object graphs grow in all directions. Your pattern matching language should too.**

Tendril = structural pattern matching **+** relational logic, in a small, regex-inspired language for **match** and **replace** across JSON-like graphs.

## Hello, world

data = {
          "planets": { "Jupiter": {"size":"big"}, "Earth": {"size":"small"}, "Ceres": {"size":"tiny"} },
          "aka": [["Jupiter","Jove","Zeus"],["Earth","Terra"],["Ceres","Demeter"]] 
       }
pattern = "{
          planets.$name.size= $size
          aka= [.. [$name .. $alias .. | $alias:$name ..] .. ]   // Treat $name itself as a possible alias
       }"

Tendril(pattern).match(data).map((m)=> `Hello, ${m.$size} world ${m.$alias} `)

=> [
"Hello, big world Jupiter",
"Hello, big world Jove",
"Hello, big world Zeus",
"Hello, small world Earth",
"Hello, small world Terra",
"Hello, tiny world Ceres",
"Hello, tiny world Demeter",
]

## API decoding comparison

<table><tr><td colspan="2"><pre>
<b>Data</b>
    {
        "requests": {
            "87499"  : { "user": { "name": ["John", "T.", "Doe"],           }, "query": "gardening" },
            "1818872": { "user": { "name": ["Jane", "Doe"],                 }, "query": "houses" },
            "384122" : { "user": { "name": ["Mary", "Sue", "Ellen", "Doe"], }, "query": "medicine" },
        },
        "responses": [
            { "requestId": "1818872", "status": "ok", "output": "2 houses available" },
            { "requestId": "20097",   "status": "fail"},
            { "requestId": "384122",  "status": "ok", "output": {"type":"text", "content":"Here is your medicine info" }},
        ]
    }

<b>Desired output</b>

    Jane: 2 houses available
    Mary: Here is your medicine info
</pre></td></tr><tr><td><pre>
<b>// using Tendril</b>
pattern = {
        requests= {
            $reqId.user.name= [$first .. $last]
        }
        responses= [
            ..
            {
                requestId= $reqId
                status= ok
                output= ( $text as string | { type=text content=$text } )
            }
            ..
        ]
    }
Tendril(pattern).match(data).map((m)=>`${m.$first}: ${m.$text}`)
</pre></td><td><pre>
<b>// using plain JS</b>
    const results = data.responses
    .filter(r => r.status === "ok" && data.requests[r.requestId])
    .map(r => {
        const request = data.requests[r.requestId];
        const name = request.user.name;
        const first = name[0];
        const last = name[name.length - 1];
        let text;
        if (typeof r.output === 'string') {
            text = r.output;
        } else if (r.output?.type === 'text') {
            text = r.output.content;
        }
        return text ? `${first}: ${text}` : null;
    })
    .filter(Boolean);
    console.log(results.join('\n'));

</pre></td><td><pre>
<b>// using Lodash</b>
    const results = _(data.responses)
        .filter({ status: 'ok' })
        .map(r => {
            const request = data.requests[r.requestId];
            if (!request) return null;
            const name = request.user.name;
            const text = _.isString(r.output) ? r.output : r.output?.content;
            return text ? `${_.first(name)}: ${text}` : null;
        })
        .compact()
        .value();
    console.log(results.join('\n'));
</pre></td></tr></table>

## Password Redaction Comparison

<table>
<tr><th>Tendril</th><th>Plain JavaScript</th><th>Lodash</th></tr>
<tr><td><pre>
Tendril("{ (_.)*password= $target }").replaceAll(input, "$target", 'REDACTED')
</pre></td><td><pre>
function redactPasswords(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

if (Array.isArray(obj)) {
return obj.map(redactPasswords);
}

const result = {};
for (const [key, value] of Object.entries(obj)) {
if (key === 'password') {
result[key] = 'REDACTED';
} else {
result[key] = redactPasswords(value);
}
}
return result;
}

const redacted = redactPasswords(data);
</pre></td><td><pre>
function redactPasswords(obj) {
  return _.cloneDeepWith(obj, (value, key) => {
    if (key === 'password') {
      return 'REDACTED';
    }
  });
}

const redacted = redactPasswords(data);
</pre></td></tr>
</table>

# Quick Start

## Atoms

```
123,                                   // coerce to number
true, false                            // coerce to bool
"a", bareword, /regex/,                // coerce to string
_                                      // any single object or primitive
```
   
## Slices, grouping, containers

```
a b c                               // 3 patterns in a consecutive sequence (only appears within arrays)
[ a b c ]                           // 1 pattern (matching an array)
a ( b c )*2   === a b c b c         // Repeating a group.
a [ b c ]*2   === a [b c] [b c]     // Repeating an array.

a=b c=d e=f                         // 3 key/value patterns present simultaneously (only appears within objects)
{ a=b c=d e=f }                     // 1 pattern (matching an object)
{ a=b c=d e=f } as Map              // or as SomeClass

a b c                               // 3 Set members (only appears within Sets)
{{ a b c }}                         // 1 pattern (matching a Set)

>> a b c <<                         // Designate a slice to be replaced
>> k << = v                         // Designate a key to be replaced
k = >> v <<                         // Designate a value to be replaced
```
   
Precedence high to low:  Parentheses (grouping), quantifiers, . (key descent), space (adjacency), `&`, `|`

```
pattern1 | pattern2                 // Alternation
pattern1 & pattern2                 // The single object must match both patterns.
``` 
   
   
## Anchoring

```
[ a b ]      =~ ["a","b"]
[ a b ]     !=~ ["a","b","c"]
[ a b .. ]  =~ ["a","b","c"]       // ".." is the actual syntax

{ b=_  c=_ }   =~ { b:1, c:2 }      // Every k/v pattern is satisfied, every prop of obj is described
{ b=_  c=_ }  !=~ { b:1 }
{ b=_      }  !=~ { b:1, c:2 }
{ b=_  .. }   =~ { a:1, c:2, Z:1 }
{ /[ab]/=_  /[ad]/=_ }   =~ { a:1 } // k/v patterns are independent, non-consuming, possibly overlapping.
{ /[ab]/=_  /[ad]/=_ }  !=~ { d:1 }
```        

## Quantifiers in array context

```
a*{2,3}        === a a | a a a
a*3            === a*{3,3}
a*             === a*{0,}           // unbounded
a+             === a*{1,}           // one or more
a?             === a*{0,1}
a              === a*1              // default

a*{2,3}? a*?, a+?, a??              // lazy (non-greedy)

..            === _*?              // lazy wildcard (matches zero or more elements)

// Multiple spreads allowed: [a .. b .. c] matches [a x y b z c]
// All arrays are anchored; .. is just sugar for _*? and can appear anywhere
```

## Quantifiers in object/set context

```
k=v #{2,4}     === The object being matched had exactly two to four keys (not more) matching the K pattern.
k=v #2         === k=v #{2,2}
k=v #?         === k=v #{0,}          // watch out, this is different from arrays
k=v            === k=v #{1,}          // default (one or more)

..            === _=_ #?             // allows object to have unknown keys
```
## Binding and relational joins

```
$name:pattern                           // If the pattern matches, binds the symbol.
$name          === $name:_

[ $x $x:/[ab] $y ]   =~  ['a','a','y']  // Values must be consistent in global scope.
[ $x $x:/[ab] $y ]  !=~  ['a','b','y']
[ $x $x:$y $y ]      =~  ['q','q','q']
[ $x:($z $y) $y $z ] =~  ['r','q','q','r']

$key= $val           // binds to any key/value
$key:k= $val:v       // binds to keys/values matching the k,v patterns
``` 
   
Symbol binding has higher precedence than quantifiers: `$x:_+` means `($x:_)+`,
and if you want to bind the repetition, you can use parentheses: `$x:(_+)`.
```
   [$x:/ab/+] =~ [ a a ]    // x=a
   [$x:/ab/+] =~ [ b b b ]  // x=b
   [$x:/ab/+] !=~ [ a b ]    // x must be consistent; it can't be 'a' on the first repetition and 'b' on the second.
   [ _+ ]     =~ [ a b ]    // but the anonymous wildcard can be.

   [$x:(/ab/+)] =~ [ b a b a ]    // x=Slice(b a)

```
## Assertions
```
(?=pattern)      // positive lookahead - succeeds if pattern matches, doesn't consume
(?!pattern)      // negative lookahead - succeeds if pattern doesn't match

``` 
## Vertical patterns
```
{ a.b.c=d } =~ {'a': {'b': {'c':'d'}}}
```

Formally, `kPat.kvPat` matches a `K`/`V` pair such that `kPat =~ K` and `{ kvPat .. } =~ V`, with right-to-left associativity. No whitespace around the dot.

```
{a[3].c=d} =~   {'a': [el0, el1, el2, {'c':'d'}]}
```

Array quantifiers can be used on the `"kPat."` part of the construct:

```
{ ((a.b.)*3)c=d } =~ {'a': {'b': {'a': {'b': {'a': {'b': {'c':'d'}}}}}}}
```



   
# Implementation

Compiles to immutable Matcher generator subclasses in the style typical of RegEx implementations, with backtracking,
scope (symbol binding) tracking, source map for debugging, pruning of branches when bound symbol constraints
are encountered. API supports iterating over all matches (giving the symbol bindings), optional pre-initialized symbols, symbols that bind to slices, e.g. `Pattern("_ $x:( _ _ )")`. Symbol binding works as expected within repetitions/alternations. 

---






# scratch notes



# Examples

**Example 1:**
```javascript
Pattern('{
      users.$userId.contact= [$userName _ _ $userPhone]
      users.$userId.managerId= $managerId
      users.$managerId.phone= $managerPhone
      projects.$projectId.assigneeId= $userId
      projects.$projectId.name= $projectName

  }')
  .find(input)
  .each((scope)=> {console.log( scope.$projectName, scope.$userName, scope.$userPhone, scope.$managerPhone)})
```

Repeated ellipses are redundant and inefficient, and the compiler will either give a warning or optimize it away:
[ .. .. a] === [ ..* a ] === [ .. a ]

// Matches with x=Slice(b a), the identical slice in two different positions
[$x:(/ab/+) .. $x:(_ _)] =~ [ b a b a other stuff b a]

// Fails to match:
// the first $x is constrained to be a slice found at the start of the array, therefore starting with b;
// the second $x is constrained to be a singleton found at the end of the array, therefore equal to a;
// so there is no way for the second $x to be the same as the first $x
[$x:(/ab/+) .. $x] !=~ [ b a b a other stuff b a]

`$x:/ab/{1}` at array position 0? => yes => left $x binds 'b'
..
`$x:_`       at array position 6? => yes => right $x binds 'b' => CONSISTENT
(end of array) at array position 7? => no => FAIL
BACKTRACK
`$x:_`       at array position 7? => yes => right $x binds 'A' => INCONSISTENT, FAIL

BACKTRACK
`$x:/ab/{2}` at array position 0? => yes => left $x binds 'b' 'a'
..
`$x:_`       at array position 6? => yes => right $x binds 'b' => INCONSISTENT, FAIL
etc.
(Actually, that shows lazy matching, not greedy, but outcome is the same)

_

Left $x   matches input at array head? Right $x matches input at array tail? Left $x matches right $x?
/ab/
   
   
   
       
   
   