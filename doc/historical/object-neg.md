Object lookaheads and optional assertions (?=)
– Described in Appendix but not merged into the main grammar.

[*] There's an ambiguity. { a=1 (?!$x=1) $x=_  c=1} ~= { a:1, b:2, c:1 } ?

I think the fundamental question is: Is it a look *ahead*, or is it simply a negative assertion (unordered with respect to the other assertions), or is an operator that modifies the next term or group, or is it a filter?

Here's an interpretation. A single term K=V defines a slice: a subset of the object's properties that satisfy the term. The *assertion* is that the slice is nonempty, i.e. (∃(k,v)∈obj)(k=~K1 & v=~V1)).

Compound '=' are conjunctions: `{K1=V1 K2=V2}` means `(∃(k,v)∈obj)(k=~K1 & v=~V1) & (∃(k,v)∈obj)(k=~K2 & v=~V2))`. Thus `{@x:(K1=V1) @y:(K2=V2) @z:(K1=V1 K2=V2)}` implies @z = union(@x,@y). Again, you may express this by saying that the slice is not empty.

Because this is a '∃' expression, not '∀', the use of a variable `{$x=1}` does not introduce an ambiguity.

**Negative Assertions. Interpretation A.**

Straight negation: `{(?!K=V)}` implies that the slice is empty, i.e. (∀(k,v)∈obj)(k!~K | v!~V).

The reason `(?!$x=1)` is ambiguous: is $x allowed to restrict the scope of '∀' --- is the term allowed to search for values that would work?

**Negative Assertions. Interpretation B.**

By this definition, it applies to individual keys: `{(?!K=V)}` is not necessarily empty. It means the slice of key/value pairs that do not match the pattern.

By this definition, the above [*] would either (A.) fail to match, because the second term indicates nothing can have value 1, or (B.) match, if the term is allowed to search for values of $x that would work, which to me seems entirely sensible.

**IMPORTANT**: To be clear, I'm rejecting the spec's earlier statement “lookaheads must not introduce bindings”, because I think we can get away with lookaheads introducing bindings, including negative lookaheads.

There are no positive lookaheads in objects because they are redundant. The object terms are already zero-width assertions.

What do I really want?

1. I want (?!..) to mean that '..' is empty
2. I want {(?!_=1)} to deny the presence of a value one in the object.
3. I want $x to be as meaningful if it appears in a negative assertion

