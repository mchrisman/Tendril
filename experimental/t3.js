




function comment() {
  return peek(i,"/*") && eat(/.*?[*][/]/)
} 
function comment2() {
  return peek(i,"//") && eat(/.*?\n/);
}
function ws() {
  return peek(/\w/) && eat(/\w+/);
}
// Advance to the beginning of the next meaningful token. 
function next() {
  let r=false;
  while (comment()|comment2()|ws()) r=true;
  return r;
}

/////////////////////

function array() {
  return boundary(()=>{
    eat('[').pushConstruct([]).repeat(singleton, ()=>peek(']')).eat(']')
})
  
}

function checkpoint(runnable) {
  try {
    return runnable();
  }  catch(e) {
    return false
  }
}

const BACK="BACK"

function parse(input) {
  
  // backtracking stack, stack of unfinished objects
  let S = new ParseState(input)

  function eat(token) { }//todo
  function peek(token) { }//todo
  
  
  // Each _ function is a backtrack branch that produces an AST object or throws
  function Arr_() {
    eat('[')
    let o = []
    while(!peek(']')) o.push(attempt(ArrGroup_()))
    eat(']')
    o
  }

  function String_ {}// todo
  function Number_ {}// todo
  function Boolean_{}// todo
  
  function Obj_() {
    
  }
  
  function ObjEl(s,o) {
    let x = number() || quotedString() || regex()
  }
  
  
  let i=0;  // index into input token stream
  let s=[]  // Stack of objects under construction. 
  s.push({})
  
  function number() {
    let ns = null;
    return (ns = peek(/d+(?!\w)/)) && {number: ns} || []
  }
  function quotedString() {
    // todo
  }
  
  
  
  
  
  
  //////////////////////////////////////////////////////
```
  let grammar = g => {
    ARRAY: [  ["Eat",'['], 
              ["RepeatUntilPeek", ']', g.Unit],
              ["Eat",']']
            ]
    STRING: ["Or", ["Extract", /^"([^"]*?)"/, 1],
                 ["Extract", /^'([^']*?)'/, 1],
                 ["Extract", /^(?!(\d++)(?!\w))(\w++)(?!\w)/, 1]]
    BOOLEAN: ["Or", g.TRUE, g.FALSE]
    TRUE:    [["Eat",'true'],["Return",true]]  
    TRUE:    [["Eat",'false'],["Return",false]]
    UNIT:    ["Optional", /*label*/ "STRING", ":", g.UNIT] 
        // future extensions...
  }

  class Parser {
    constructor(grammar, allowLineComments, allowBlockComments, breakOnWhitespace) {
         // Set up a lexer that splits the input into tokens. 
         
    }
    // Recursively and with backtracking handle functions such as 
       Eat, RepeatUntilPeek, Or, etc.
    .matches(data,'ARRAY')
  }
```

  Tendril(`[.. $whenelse:(
  {tag = /^[Ww]hen$/, $otherProps:(..)}
  {tag = /^[Ee]lse$/, children = $else, ..}?
 ) ..]`)
  .replaceAll(input, $ => ({
    whenelse: {tag: 'when', children2: $.else, ...$.otherProps}
  }));
