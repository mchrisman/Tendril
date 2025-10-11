

# Tendril

**Object graphs grow in all directions. Your pattern matching language should too.**

# Quick Start

This serves as the primary specification. In these examples, `foo =~ bar` is short for `Pattern("foo").matches(bar)`, and `===` denotes equivalence of patterns

## Atoms

```
123,                                   // number literal
true, false                            // boolean literal
"a", bareword, /regex/,                // string literal or regex
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
   
## Binding

```
$name:pattern                           // If the pattern matches, binds the variable.
$name          === $name:_

[ $x $x:/[ab] $y ]   =~  ['a','a','y']  // Values must be consistent in global scope.
[ $x $x:/[ab] $y ]  !=~  ['a','b','y']
[ $x $x:$y $y ]      =~  ['q','q','q']
[ $x:($z $y) $y $z ] =~  ['r','q','q','r']

k1=v1 k2=v2          // 2 key/value pair patterns (only appears within objects)
$key= $val           // binds to anything
$key:k= $val:v       // binds to matching obj
``` 
   
## Quantifiers in array context

```
a*{2,3}        === a a | a a a
a*3            === a*{3,3}
a*             === a*{0,}           // unbounded
a+             === a*{1,}           // one or more
a?             === a*{0,1}
a              === a*1              // default

..            === _*              // matches zero or more elements

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

// Multiple spreads allowed but redundant (validator warns)
// { .. a=1 .. b=2 } is valid but the second .. is unnecessary
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

   
# Implementation

Compiles to immutable Matcher generator subclasses in the style typical of RegEx implementations, with backtracking,
scope (variable binding) tracking, source map for debugging, pruning of branches when bound variable constraints
are encountered. API supports iterating over all matches (giving the variable bindings), optional pre-initialized variables, variables that bind to slices, e.g. `Pattern("_ $x:( _ _ )")`. Variable binding works as expected within repetitions/alternations. 

---
