
3. Bare Variable Binding Expansion

README.md (line 67):
$name === $name:_

README-v2-draft.md (lines 139, 419):
$name // shorthand for $name:_*? (array slice context) or $name:_ (singular context)

v2-draft is context-sensitive (arrays vs singletons), README.md always expands to
$name:_.

5. API Naming Inconsistency

README.md:
Pattern('{...}').find(input).each(...)      // Lines 140-149
Pattern("...").replaceAll(input, 'REDACTED')

README-v2-draft.md:
Tendril(pattern).match(data).map(...)       // Line 22
Tendril(`{...}`).find(input).each(...)      // Line 533
Tendril("...").replaceAll(input, "REDACTED")

Uses both Pattern() and Tendril() as constructor names, and both .match() and .find() as
methods.

6. Object Quantifier Syntax

Both documents show the #{} syntax for object quantifiers:
k=v #{2,4} // object has 2-4 keys matching k
k=v #2 // exactly 2
k=v #? // zero or more (optional)
k=v // one or more (default)

However, this syntax is not reflected in the formal grammar in v2-draft (line 359-372),
which only shows:
OBJECT_PATTERN := '{' OBJECT_ASSERTION* '}'

No quantifier syntax on assertions in the grammar.



```

const t = new m.Tendril('[\$x:(_ _), \$y?]').debug();
const input = [['a','a','b'], ['c','c','d']];
const sols = Array.from(t.occurrences(input));

Occurrences:         0  1  2  
------------------------------- 
input
input[0]                   x  
input[0][0]='a'      x        
input[0][1]='a'      ↓      
input[0][2]='b'      y        
input[1]                   ↓  
input[1][0]='c'         x     
input[1][1]='c'         ↓     
input[1][2]='d'         y     
 




```