I want to make sure we have clarified semantics around indeterminate keys.

```
Tendril("{ a/i : $x }").match({a:1, A:2})                   // {x:1}, {x:2}
Tendril("{ foo.a/i : $x }").match({foo:{a:1, A:2}})         // {x:1}, {x:2}

Tendril("{ foo[1|2] : $x }").match({foo:[4,5,6,7]})         // {x:5}, {x:6}
Tendril("{ foo[1|2] : $x }").match({foo:[4,5]})             // {x:5}
Tendril("{ foo[1|2] : $x }").match({foo:[4]})               // no match

Tendril("{ foo[1|2][1|2] : $x }").match({
  foo:[[1,2,3],[4,5,6],[7,8,9]]
}) // {x:5},{x:6},{x:8},{x:9}

Tendril("{ foo[($i=1|2)][($j=1|2)] : $x }").match({
  foo:[[1,2,3],[4,5,6],[7,8,9]]
}) // {i:1,j:1,x:5}, {i:1,j:2,x:6}, {i:2,j:1,x:8}, {i:2,j:2,x:9}



Tendril("{ (@s= ($k=a/i) : 2 ) }").match({a:1,A:2,B:0}})  // solutions: {s:{A:2}, k:'A'} 
Tendril("{ a/i :> 2 }").match({a:1,A:2}})  // does not match

Tendril("{ (@s= foo.($k=a/i) : 2 ) }").match({foo:{a:1,A:2,B:0}}})  // solutions: {s:{A:2}, k:'A'} 
Tendril("{ foo.a/i :> 2 }").match({foo:{a:1,A:2}}})  // does not match


// todo, Unification on keys that differ by case (should not unify)

// todo, behavior of "{ foo[@slice]: $x}" Unbound and bound @slice. 

```



