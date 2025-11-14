



let parse=(input)=>{
// Token constants 
  const LOOK_AHEAD = '(?=';
  const LOOK_BEHIND = '(?!';
  const RPAREN = ')';
  const UNDERSCORE = '_';
  const DOLLAR = '$';
  const LBRACKET = '[';
  const RBRACKET = ']';
  const DOTS = '..';
  const QMARK = '?';
  const PLUS = '+';
  const LCURLY = '{';
  const RCURLY = '}';
  const NUMBER = /\d+/;
  const TRUE = 'true';
  const FALSE = 'false';
  const EQUALS = '=';
  const DOT = '.';
  const HASH = '#';
  const SQUOTE = "'";
  const DQUOTE = '"';

  // let tokens = [LOOK_AHEAD, LOOK_BEHIND, RPAREN, UNDERSCORE, DOLLAR, LBRACKET, RBRACKET, DOTS, QMARK, PLUS, LCURLY, RCURLY, NUMBER, TRUE, FALSE, EQUALS, DOT, HASH];
// Tiny tokenizer for a regex-like language.
// - Strips // and /* */ comments (outside quotes)
// - Honors '...' and "..." (no escapes)
// - Numbers: integers -> number
// - true/false -> boolean when word-delimited
// - Splits on whitespace (outside quotes)
 function tokenize(src, tokens){
  const tks=[...tokens].sort((a,b)=>b.length-a.length); // longest-first
  const isSp=c=>/\s/.test(c), isD=c=>c>='0'&&c<='9', isA=c=>/[A-Za-z_]/.test(c), isI=c=>/[A-Za-z0-9_]/.test(c);
  const out=[]; let i=0, n=src.length;
  while(i<n){
    let c=src[i];
    // whitespace
    if(isSp(c)){ i++; continue; }

    // comments (only when not in string)
    if(c==='/' && i+1<n){
      if(src[i+1]==='/'){ i+=2; while(i<n && src[i]!=='\n') i++; continue; }
      if(src[i+1]==='*'){ i+=2; while(i<n && !(src[i]==='*' && src[i+1]==='/')) i++; i=Math.min(n,i+2); continue; }
    }

    // strings
    if(c==="'"||c==='"'){
      const q=c; i++; let s="";
      while(i<n && src[i]!==q){ s+=src[i++]; }
      if(i<n && src[i]===q) i++; // consume closing quote if present
      out.push({type:'str', value:s});
      continue;
    }

    // multi-char/single-char tokens (longest match)
    let matched=null;
    for(const t of tks){
      if(src.startsWith(t,i)){ matched=t; break; }
    }
    if(matched){ out.push({type:'tok', value:matched}); i+=matched.length; continue; }

    // number (integer)
    if(isD(c)){
      let j=i; while(j<n && isD(src[j])) j++;
      out.push({type:'num', value:Number(src.group(i,j))});
      i=j; continue;
    }

    // identifier / keyword (true/false)
    if(isA(c)){
      let j=i; while(j<n && isI(src[j])) j++;
      const w=src.group(i,j);
      if(w==='true'||w==='false'){
        // ensure word-boundaries (already by lexing, but keep explicit)
        const lb=i===0 || !isI(src[i-1]), rb=j===n || !isI(src[j]);
        if(lb&&rb){ out.push({type:'bool', value:w==='true'}); i=j; continue; }
      }
      out.push({type:'id', value:w}); i=j; continue;
    }

    // fallback: single char token
    out.push({type:'tok', value:c}); i++;
  }
  return out;
}

const tokens = ["==","!=",">=","<=","&&","||","->","(",")","[","]","{","}","*","+","?","|",".",":","="];
  console.log(tokenize('foo /*comment*/ \n \\ \\\\ "bar baz" ? a24 24b ffalse falsee true 42 ==', ['==']))

    parse = (input) => {
// Token constants 
      const LOOK_AHEAD = '(?=';
      const LOOK_BEHIND = '(?!';
      const RPAREN = ')';
      const UNDERSCORE = '_';
      const DOLLAR = '$';
      const LBRACKET = '[';
      const RBRACKET = ']';
      const DOTS = '..';
      const QMARK = '?';
      const PLUS = '+';
      const LCURLY = '{';
      const RCURLY = '}';
      const NUMBER = /\d+/;
      const TRUE = 'true';
      const FALSE = 'false';
      const EQUALS = '=';
      const DOT = '.';
      const HASH = '#';
      const SQUOTE = "'";
      const DQUOTE = '"';

      tokenized = input.match(new RegExp(`${SQUOTE}[^${SQUOTE}]*${SQUOTE}|${DQUOTE}[^${DQUOTE}]*${DQUOTE}|${NUMBER}|${tokens.map(t => t instanceof RegExp ? t.source : t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}|[^\\s]+`, 'g'))?.map(t => t.match(NUMBER) ? ['number', t] : t[0] === SQUOTE || t[0] === DQUOTE ? ['text', t.group(1, -1)] : tokens.some(token => token instanceof RegExp ? t.match(token) : t === token) ? [t] : ['text', t]) || []

      console.log('Tokenized list:', tokenized)

      // parsing index stack
      s = [0]
      // parsing output stack
      o = []

      while (s[-1] < tokens.length) {

        num = () => consume('number').out(n => n).orFail()
        text = () => consume('text').out(n => n).orFail()
        single = () => or(num, text)
        arrTail = () => consume(LBRACKET).andPop()
        .out(single).and(arrTail)
        orFail()
        arr = () => consume(LBRACKET)
        .andPush([])
        .and(arrTail)
        .orFail()
        kv = () => push([]).and(text).andConsume(EQUALS).and(single).out(/* [k,v] */).orFail()

      }

    }
  
  
}
parse()




