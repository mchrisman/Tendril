Does this definition make sense and clarify everything?

Object patterns are conjunctions of K:V assertions, where K and V are patterns. For example:

    `{ status:good userId:$id } // match all good users, enumerating userIds`

Syntax:

    `K:V` matches all k,v in the object such that (k~K and v~V), and asserts there is at least one such.

    `K::V` matches all k,v in the object such that (k~K), and asserts that there is at least one such, and that k~K implies v~V.

    `K:V ?` or `K::V ?` is the same, without the 'at least one such' assertion

More formally

    Objects are matched by predicates over key/value pairs. Let O be an object. A predicate has a key pattern K and value pattern V.
    
    **Domain.** Dom(O,K,E) = { (k,v) ∈ entries(O) | k matches K is satisfiable in environment E }. Computation of the domain involves testing each k individually, discarding any bindings created (bindings do not persist/unify between keys).

    **Else.**  `A else B` matches an item X in environment E if (x~A is satisfiable in some extension of E (such extensions are then enumerated)) OR (x~A is not satisfiable in any extension of E AND x~B is satisfiable in some extension of E (such extensions are then enumerated))

    **Plain predicate `K::V`** matches O in environment E iff Dom(O,K,E) is nonempty and for every (k,v) in Dom(O,K,E), the match (k~K ∧ v~V) is satisfiable in some extension of E.
    Solutions are enumerated by enumerating each witness (k,v) ∈ Dom(O,K,E) and returning the bindings produced by matching (k~K ∧ v~V) on that witness, then continuing left-to-right with unification against E.
    
    **Plain lenient predicate `K:V`** matches O in environment E iff Dom(O,K,E) is nonempty and there exists (k,v) in Dom(O,K,E) such that (k~K ∧ v~V) is satisfiable in some extension of E.
    Solutions are enumerated by enumerating each (k,v) ∈ Dom(O,K,E) and returning the bindings produced by matching (k~K ∧ v~V) on that witness, then continuing left-to-right with unification against E.

    **predicates `K::V?' and 'K:V?'** are similar except that they do not assert that at least one such key exists; the slice they define may be empty.

Example:

```
    "{ /a/:1 }" ~= {ab:1, ac:1} // => true
    "{ /a/:1 }" ~= {ab:1, ac:1, ad:0} // => true
    "{ /a/:1 }" ~= {ab:1, ac:1, d:0} // => true
    "{ /a/::1 }" ~= {ab:1, ac:1} // => true
    "{ /a/::1 }" ~= {ab:1, ac:1, ad:0} // => false
    "{ /a/::1 }" ~= {ab:1, ac:1, d:0} // => true
```

Unbound variables in K:V create branches, as usual. Slice variables in objects denote sets of K:V pairs, as before.

```
    "{ @X=(/a/:_ /b/:_) ($y=/c/):_ } ~= {a1:1,a2:2,b:3,c1:4,c2:5,d:6} 
     // ==> True, solutions:
     // {X:{a1:1,a2:2,b:3},y:'c1'}, {X:{a1:1,a2:2,b:3},y:'c2'}, 
```     

Unification happens normally:

```
  "{ _: [$x $x]}" ~= {a: [3,3], b:[3,3] }   // ==> true, 
       // one solution {x:3} deduped from multiple locations 
  "{ a: [$x $x]}" ~= {a: [3,4]}   // ==> false
  "{ $x: [$x $x]}" ~= {a: ['a','a']}   // ==> true, one solution {x:'a'}
```

Variables unify across terms:
```
    { name:$name creditCard:{name:$name} } 
    // => Matches if the person's name is equal to the name on their credit card. 
```
Variables unify between K and V:
```
    // Reminder: bare $id is shorthand for ($id=_)
    { $id:{id:$id} }  // The items are correctly indexed by ID
    
    matches { "3", {name='Mark', id:3},
              "4", {name='Sue', id:4}}
    doesn't match  { "3", {name='Mark', id:3},
                     "4", {name='Sue', id:3}}      
```
Variables do not unify across keys (we always iterate over properties):
```
    { ($k=/color/):$c }  // Does not demand that all the IDs are the same.
    // => matches {backgroundColor:"green", color:"white"}
    // => Solutions = [{k:"backgroundColor", c:"green"}, {k:"color",c:"white"}] 
```


More examples:

```
    `{ _:$x }`  // Todo: lint this as a probable bug
                // With $x unbound: cannot fail 
                // and will cause every value to become a solution.
                // With $x previously bound: all props have the same value
    `{ $x:$x }` // All keys must have values equal to the keys
```

And the idiom for categorization/fallback is

    `K:A else B` - rules of precedence make this `K:(A else B)`

And while the idiom for binding a slice generally and logically encompasses *sets of k,v pairs*,

    `{ (@s= K1:V1 K2:V2) }`, if it matches, defines the slice of all properties k,v matching (k~K1 AND v~V1 OR k~K2 AND v~V2)

This idiosyncratic idiom is for binding slices defined by the 'else' branches:

    `{ K: @S1=V1 else @S2=V2 }`

for example,

```
    { _: @goodStatus=OK|perfect @others=_ }
    // matches { proc1:"OK", proc2:"perfect", proc3:"bad"}
    // with solution = 
    // {
    //    goodStatus: { proc1:"OK", proc2:"perfect"}
    //    others:     { proc3:"bad"}
    // }

```

**Remainder**

The "remainder", symbolized '%', is the slice containing all *keys* that don't fall into any of the "domains". The *values* are immaterial. Example:

```
   "{ /a/:1 /b/:1 % }" ~= { a1:1 a2:2 b:3 c:4 } => true; remainder is {c:4}
```

Syntax:

```
   "{ KV_TERMS % }" - Asserts the remainder is not empty.  
   "{ KV_TERMS (!%) }" - Asserts the remainder is empty, i.e. "anchored" pattern.  
   "{ KV_TERMS (@S=%) }" - Binds the remainder to @S and asserts not empty
   "{ KV_TERMS (@S=%?) }" - Binds the remainder to @S, may be empty
   
```










--------------------------------------------------
1. In the same places '|' is accepted, i.e. ITEM in the grammar spec. However, the special idiom that combines 'else' with slice binding.
2. It should have the same priority as '|', but you cannot mix and match them without using parentheses:  'A|B else C" => error, "A else B|C" => error, "A|(B else C)" => OK, "(A|B) else C" => OK
3. When A yields multiple solutions, all of them should be emitted and no B solutions (even if some or all of the A solutions later fail downstream).
4. Choose A if any branch works. :
```
[ 
  [(.. @x $y) else (.. (@x=1))] 
  [$y]
]:
 
  [[ 1 2 3][2]] 
      matches, solutions= {x:[],y:2}, {x:[1],y:2}
  
       
5. 





const store = {
  activities: [
    { id: 'a1', targetType: 'user', targetId: 'u1', action: 'promoted' },
    { id: 'a2', targetType: 'team', targetId: 't1', action: 'archived' },
    { id: 'a3', targetType: 'project', targetId: 'p1', action: 'created' },
    { id: 'a4', targetType: 'user', targetId: 'u2', action: 'invited' }
  ],
  users: [
    { id: 'u1', name: 'Alice', teamId: 't1' },
    { id: 'u2', name: 'Bob', teamId: 't1' }
  ],
  teams: [
    { id: 't1', name: 'Frontend', projectIds: ['p1'] }
  ],
  projects: [
    { id: 'p1', name: 'Dashboard' }
  ]
};
Goal: For each team, produce an object containing all activities that transitively affect it — meaning direct team activities, but also activities targeting any user on that team, and activities targeting any project owned by that team. Group them by action type.


Tendril("{
  activities[$i].id:$aid
  activities[$i].targetType:$tt
  activities[$i].targetId:$tid
  activities[$i].action:$action
  (users|teams|projects)[_]:{id:$tid, name:$name}
}").match(data).solutions().first().group("action").flat("aid","tt","name").collect()

let map={user:'users',project:'projects',team:'teams'}
Tendril("{
  // relate activities
  data.activities[_]:{id:$aid, targetType:$mapk, targetId:$targid, action:$action}
  map:{$mapk,$mapv}
  
  // to entities that may impact teams
  (
      data[($mapv=teams)][_]?:{id:($impacted=$targid), name $tname, projectIds?:[...$projId...]}
     | data[($mapv=users)][_]?:{id:$targid, name:$uname, teamId?:($impacted=$tid)}
     | data[($mapv=projects)][_]?:{id:$targid, name:$pname}
       data[($mapv=teams)][_]?:{id:$impacted, projectIds?:[...$targId...]}
  )
  
}")
.match({map,data})
.solutions().first().group("action").flat("tname","uname","pname").collect()






const rules = [
  { match: { method: 'POST', path: '/^\/users\/.*$/' }, require: ['admin', 'hr'] },
  { match: { method: '*', path: '/^\/public\/.*$/' }, require: [] },
  { match: { method: 'GET', path: '/^\/users\/.*\/salary\/.*$/' }, require: ['admin', 'payroll'] }
];

const requests = [
  { method: 'POST', path: '/users/123', roles: ['hr'] },
  { method: 'GET', path: '/users/456/salary', roles: ['admin'] }
];




O = { p: 1, q: 2 }
{ q:($x else 2)  p:$x } // fails
{ p:$x  q:($x else 2) } // succeeds


O = { val: "a", a: "a" }
Patterns:

Succeeds:

tendril
Copy code
{ val:$k   $k::$k }
Fails:

tendril
Copy code
{ $k::$k   val:$k }


In the following pattern matching design, discuss the question of commutativity. Will the user have the expectation (rightly or wrongly) that in

"{
    a: PATTERN1
    a: PATTERN2
}"
```
The two predicates are commutative?  

The current implementation is to go left to right, attempting to bind (extend and enumerate solutions) open variables. But the mental model may be: find all solutions, i.e. possible variable assignments that satisfy all the predicates simultaneously.  

I believe that those two interpretations are right now synonymous. However, I'm about to break that. 




I want to introduce `(A else B)`, in which any match to A precludes B. A local cut.

I'm not talking about the non-commutativity of 'else' itself (it won't surprise anyone that `A else B` is not the same as `B else A`.)  I'm talking about the ordering of that phrase with respect to other phrases. Case in point:

```
 data = { p: 1, q: 2 }
{ q:($x else 2)  p:$x } // fails
{ p:$x  q:($x else 2) } // succeeds
``````

This is for general usage but is motivated by the specific use case:  "I want to parse current scheme A, but if scheme A is not found, I want to fall back to parsing legacy scheme B; but never treat it as B if it could be A. "

The use case of legacy scheme versus current scheme is compelling and demanding. If something matches the current scheme, then even if some later join fails, it may be downright dangerous to try to parse it as the legacy scheme. Therefore some kind of delayed resolution fix, in which it might ultimately be possible to backtrack into B, won't work.

I would also like to support the use case of categorization.

Is there any way in which this kind of 'else' has a purely declarative interpretation?










OK. now tell me if I can use this 'else' semantics to solve one of my other big problems: the object pattern matching spec, with its confusing ':' vs. ':>' and 'bad' buckets.

The replacement object pattern specification would look like this.

`(@slice= K::V)` means, in some fashion that is understandable but rigorous and commutative: let @slice be the set of all k:v properties of the object for which k~K; and assert that (for all k:v in @slice, (k~K and v~V)), and that the slice is nonempty.

The phrase `K:: (V_A else V_B)` is then well-defined, from that definition and our definition of 'else'. This categorizes the properties of the slice into two buckets A and B, which may be captured by the special syntax

    `K:: (@A=V_A else @B=V_B)`

which implies @A,@B is a partition of @slice (if I'm right).

`K:V` is shorthand for `K::(V else _)`

'K:V?' and 'K::V?' are similar, except they do not assert that the slice is non-empty.

(The new operators K::V and K:V are the "fixed" versions of the old operators K:>V and K:V respectively. Note that in the old version, K:>V was defined in terms of K:V; in the new version, it's reversed, and K:V is defined in terms of K::V)

With regard to commutativity, a specific ambiguity I want to avoid is

```
  data = { val: "a", a: "a" }
{ val:$k   $k::$k } // succeeds
{ $k::$k val:$k } // fails
```

But we need to be able to support external joins against V or against K. This implies we can't attempt to "fix" the apparently vacuous pattern "{ _:$x }" by interpreting this as "every value is the same". We need to allow a different $x per entry.

Note our definition of K::V can't be expressed in terms of 'bound' or 'unbound' variables, if we are aiming for a commutative, declarative definition.

Discuss what K::V then means, in the following limited case which does not use 'else':
```
data = { users={"mark":"admin", "sue":"admin", "jill":"user"},
         privs={admin:["peek","poke"], user:["peek"]}}
pattern =
"{
    users::{$name::$role}
    privs::{$role::[...$ability...]
}"
```

Perhaps the difficulty comes from the perception that this problem needs some form of 'universal' assertion. I'm dubious. Take the k:v pairs one at a time?