Looking through the spec, here are some things that jump out:

## Ambiguities/Unclear Points

**1. Object quantifiers default is surprising:**

```
k=v            === k=v #{1,}          // default (one or more)
k=v #?         === k=v #{0,}
```

This is inconsistent with arrays where `a` matches exactly one. Why does `k=v` mean "one or more keys matching this pattern"? I'd expect it to mean "exactly one key" by default. The current design means you can't easily express "exactly one key named 'id'" without `k=v #{1,1}`.

**2. Set quantifiers are unspecified:**

```
{{ a b c }}                         // 1 pattern (matching a Set)
```

Do Sets support quantifiers? `{{ a* }}` - does that mean anything? What about `{{ a #? }}`? The spec doesn't say.

**3. Space (adjacency) meaning varies by context:**

- In arrays: `a b c` = sequence
- In objects: `a=b c=d` = simultaneous patterns
- In sets: `a b c` = members

This isn't wrong, but it's cognitively heavy. Users need to remember context to parse.

**4. Bareword ambiguity:**

```
bareword                            // string literal
```

Does `{ class: "MyClass" }` match `{ class=MyClass }`? What about `{ myVar= value }` - is `value` a bareword string or an undefined variable reference (should it be `$value`)?

**5. Slice replacement scope unclear:**

```
>> a b c <<                         // Designate a slice to be replaced
```

Can this appear anywhere? `[x >> a* << y]`? What does `>> $x:a* <<` mean - replace each binding or the whole sequence?

## Probable Design Issues

**6. Greedy vs lazy defaults are inconsistent:**

```
a*             // greedy (maximal match)
..            === _*?              // lazy
```

Why is `..` lazy by default but `a*` greedy? This seems like it'll cause confusion. I'd expect `..` to be `_*` (greedy wildcard).

**7. The `/regex/` literal is underspecified:**

```
/regex/                             // regex pattern (matches strings only)
```

- Does it support flags? `/regex/i`?
- Can it be used as a key pattern? `{ /^user_/=_ }`?
- What about in bindings? `$x:/[ab]/` works in your examples, but does `$x:/regex/` bind to the string or to the regex match?

**8. Vertical pattern whitespace rule:**

```
{ a.b.c:d }                         // No whitespace around the dot
```

This feels fragile. `{ a. b.c:d }` is an error? What about `{a.b. c:d}`? The "no whitespace" rule will be hard to remember and annoying to debug.

**9. Missing: how do quantifiers interact with alternation?**

```
(a|b)*         // Does this work as expected?
a|b*           // Is this (a|b)* or a|(b*)?
```

Your precedence says `|` is lowest, so `a|b*` → `a|(b*)`, but this might surprise users.

**10. Assertion consumption is unclear:**

```
(?=pattern)      // positive lookahead - succeeds if pattern matches, doesn't consume
```

What does "doesn't consume" mean in a structural pattern matcher? In an array `[(?=a) b]`, does this match `[a]` or `["a", "b"]`? If lookahead doesn't consume, does the `b` pattern then try to match the same element?

**11. Multiple spreads semantics:**

```
// Multiple spreads allowed: [a .. b .. c] matches [a x y b z c]
```

How does the matching work? Greedy left-to-right? Does `[.. a .. a]` match `[a]` (both `..` match zero, both `a` match same element)? What about `[a .. a]` on `[a]`?

**12. Regex operators don't compose well:**
You have `/regex/` literals but no way to compose them with your structural operators. Can you write `/a|b/+` to mean "one or more strings matching a or b"? Or do you need `(/a|b/)+`?

---

## Suggestions

**Priority fixes:**

1. Clarify or reconsider object quantifier defaults
2. Specify Set quantifier behavior
3. Define bareword vs variable syntax clearly
4. Make greedy/lazy consistent or well-motivated
5. Elaborate on lookahead semantics with examples

**Nice to have:**

- More examples of slice replacement
- Vertical pattern whitespace rationale (or relax the rule)
- Explicit alternation + quantifier examples
  . Clarifications to Add to Spec

allow [ a.b.c ] meaning [ {a.b.c= ..} ]

-------

Allow whitespace around . in vertical patterns: { a.b.c= d } is fine
Clarify that regex bindings ($x:/pattern/) bind the matched string, not regex internals
Better explain "lookahead" semantics without using "consume".
Call them symbols, not variables.
Add examples showing ($x:pattern)* vs $x:(pattern*) distinction with actual match/no-match cases

Explain the symbol or the slice versus unit thing better. Everything is a slice.
---

$x defaults to $x:_+ in arrays, $x:_ in key paths

# Draft CHANGE PROPOSAL TO CLARIFY AND SIMPILIFY TYPE COERCION

## Type coercion

**this is a specification change**

No coercion of input data is done automatically.

For primitive patterns, you can use the coercion operator `~` to coerce the data to the patterns's expected type. The operator binds more tightly than everything except grouping.

```
**String patterns**
[ "123" ]         !~=  [ 123 ]   
[ ~"123" ]         ~=  [ 123 ]   
[ ~"123" ]         ~=  [ 123.0 ]  // String(123.0)==="123"

[ /\d+/ ]         !~=  [ 123 ]
[ ~/\d+/ ]         ~=  [ 123.0 ]


**Number patterns**
[ 123 ]           !~= [ "123" ]
[ ~123 ]           ~= [ "123.0" ]  // Number("123.0")===123

**Boolean patterns**
[ ~true ]         !~= [ 123 ]  // Supports only 0,1,"0","1","true","false","True","False","yes","no","Yes","No"
[ ~false           ~= [ "False" ]

**Unsupported**
[ /\d+/ ]         !~=  [ {x:123} ]  // Structures are never coerced to primitives. 
~[ /\d+/ ]        !~=  [ 123 ]      // `~` is not recursive
[ null ]                            // Not yet supported in the language
~( "123" | 456 )                    // Not permitted; '~' may only be used with primitive patterns (except for experimental "structural coercion", see below)
"as Map", "as Set" etc. // retired

**Bindings**

If you want to bind the uncoerced value
[ $x:~123 ]        ~= [ "123.0" ]   // yes, $x=="123.0". Logical, obeys existing rules. It means:
                                    // 1. compare data to 123; fail if no match
                                    // 2. compare data to previously bound value of $x; fail if no *strict* match
                                    // 3. bind $x to data

If you want to bind the coerced value
[ ~$x:~123 ]       ~= [ "123.0" ]   // yes, $x==123. Idiomatic. Must be exactly ~SYMBOL:~PRIMITIVE_PATTERN. It means:
                                    // 1. compare number(data) to 123; fail if no match
                                    // 2. compare number(data) to previously bound value of $x; fail if no *strict* match
                                    // 3. bind $x to number(data)

Unification is strict. **Key to remember**: Each occurrence of $x must *first* successfully match and bind *locally*. *Then* they are compared to each other *strictly* (no coercion).


[ $x $x ]         !~= [ 123, "123" ]      // no (unification fails)
[ $x $x:"123" ]   !~= [ 123, 123 ]        // no (match fails, forgot the ~ operator)
[ $x $x:~123 ]     ~= [ 123, "123" ]      // no, (unification fails)
[ $x ~$x:~123 ]    ~= [ 123, "123" ]      // yes, $x==123
[ $x $x:~123 ]     ~= [ "123", "123" ]    // yes, $x=="123"
[ $x ~$x ]                                // `~$x` does not compile except as part of the idiom ~SYMBOL:~PRIMITIVE_PATTERN.
```

### Object keys and array indices

These strictly match objects, maps, sets, arrays respectively:
OBJECT_PATTERN          := '{' OBJECT_ASSERTION* '}'
MAP_PATTERN             := 'Map{' OBJECT_ASSERTION* '}'
SET_PATTERN             := 'Set{' SINGLETON_PATTERN* '}'

Object key patterns (not Map patterns) containing non-string primitive patterns rewrite them to string patterns at compile time:

```
{ (q|123)=456 } === { ("q""|"123")=456 }  ~= { "123":456 }
```

- Likweise, .foo and [foo] patterns are rewritten as string patterns and number patterns, respectively.

 ```
 { $x:"true"["2"]=$x } === { $x:"true"[2]=$x } ~= { "true": [0,0,"true"] }
                                            !~= { "true": [0,0,true] }
 ```

### Structural coercion

** I'm dubious about allowing this, but here is a possible way to do it**

`~~pattern` recursively modifies the behavior of all primitive matchers within the pattern. `~~$x:~~pattern` is the corresponding "bind to normalized value" idiom.

```
[   $x:~~[ 123 "456" true ] ]    ~= [ [ "123.0", 456, 1 ] ]   // yes, $x == [ "123.0", 456, 1 ]
[ ~~$x:~~[ 123 "456" true ] ]    ~= [ [ "123.0", 456, 1 ] ]   // yes, $x == [ 123, "456", true ]

// Primitive matchers (literals, regexes) are affected; wildcards aren't.
[ ~~$x:~~[ /\w+/+ .. ] ]    ~= [ [ 123, 456, [], 789 ] ]   // yes, $x == [ "123", "456", [], 789 ]


```

```

(1) workhorse fluent api
pattern = tendril(patternString)
matcher = pattern.matcher(input, flags).with(bindings)
matcher.match(...) => iterator of MatchInfo                  
       ...

(2) conveniences
tendril.replaceAll(input, patternString, (bindings)=>structure)
tendril.find(input,patternString)
```


```

Now, suppose we do not feel beholden to regex-like traditions. Which of the following will be more ergonomic and useful?

Plan A:
Introduce traditional lazy / greedy / possessive operators. 

Plan B:
Introduce these operators (for use within array-slice contexts):
( left > right )     // Split the slice before the first occurrance of `right` (no backtracking),
                     // and match `left` to the left side, `right` to the right side.
( left >> right )    // Similarly, split the slice before the last occurrance of `right` (no backtracking)
( left < right )     // Similarly, split the slice after the last occurrance of `left` (no backtracking)
( left << right )    // Similarly, split the slice after the first occurrance of `left` (no backtracking)

Examples:

( '"' $x:(_*) > '"' .. ) ~=  ('"' b '"' c '"' d '"' )   // $x == ( b )  

( .. BEGIN << $x:(_*) >> END .. ) ~=  ( a BEGIN b BEGIN c END d END e )   // $x == ( b BEGIN c END d )  

              
   







```