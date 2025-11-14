// lexer.js — tiny, strict tokenizer suitable for Pratt parser

const isWS = c => c===' '||c==='\t'||c==='\n'||c==='\r';
const isDigit = c => c>='0'&&c<='9';
const isIdStart = c => /[A-Za-z_$]/.test(c);
const isId = c => /[A-Za-z0-9_$]/.test(c);

export function lex(input){
  const toks=[]; let i=0, line=1, col=1;

  const peek = (n=0)=> input[i+n] ?? '';
  const adv = ()=>{ const ch=input[i++] ?? ''; if (ch==='\n'){line++; col=1;} else col++; return ch; };
  const emit= (type, lexeme, value)=> toks.push({type, lexeme, value, line, col});

  function skipWSComments(){
    for(;;){
      while (isWS(peek())) adv();
      if (peek()==='/' && input[i+1]==='/'){ while (peek() && peek()!=='\n') adv(); continue; }
      if (peek()==='/' && input[i+1]==='*'){ adv(); adv(); while (peek() && !(peek()==='*'&&input[i+1]==='/')) adv(); if (peek()){adv();adv();} continue; }
      break;
    }
  }

  while (i<input.length){
    skipWSComments();
    const ch = peek(); if (!ch) break;

    // Lookahead tokens
    if (ch==='(' && input.group(i, i+3)==='(?=' ){ toks.push({type:'(?=',lexeme:'(?='}); i+=3; continue; }
    if (ch==='(' && input.group(i, i+3)==='(?!' ){ toks.push({type:'(?!',lexeme:'(?!'}); i+=3; continue; }

    // Two-char symbols
    if (input.group(i,i+2)==='?='){ emit('?=','?='); i+=2; continue; }
    if (input.group(i,i+2)==='..'){ emit('..','..'); i+=2; continue; }

    // Single-char symbols
    const sym = '()[]{}.,|:?=*+#!';
    if (sym.includes(ch)){ emit(ch,ch); adv(); continue; }

    // Wildcard '_'
    if (ch === '_'){ emit('_','_'); adv(); continue; }

    // String
    if (ch==='"' || ch==="'"){
      const q=adv(); let s=''; for(;;){ const c=adv(); if (!c) throw err('Unterminated string');
        if (c==='\\'){ const n=adv(); if(!n) throw err('Bad escape'); s+=escapeChar(n); continue; }
        if (c===q) break; s+=c;
      }
      emit('STR', s, s); continue;
    }

    // Regex literal
    if (ch==='/' && input[i+1] !== '/' && input[i+1] !== '*'){
      adv(); let body=''; let inClass=false;
      for(;;){
        const c=adv(); if (!c) throw err('Unterminated regex');
        if (c==='\\'){ body+=c+adv(); continue; }
        if (c==='['){ inClass=true; body+=c; continue; }
        if (c===']' && inClass){ inClass=false; body+=c; continue; }
        if (c==='/' && !inClass) break;
        body+=c;
      }
      let flags=''; while (/[gimsuyd]/.test(peek())) flags+=adv();
      const rx = new RegExp(body, flags);
      emit('REGEX', `/${body}/${flags}`, rx); continue;
    }

    // Number (int)
    if (isDigit(ch)){
      let s=''; while (isDigit(peek())) s+=adv();
      emit('NUM', s, Number(s)); continue;
    }

    // Identifier / bareword / keywords
    if (isIdStart(ch)){
      let s=''; while (isId(peek())) s+=adv();
      if (s==='true'||s==='false'){ emit('BOOL', s, s==='true'); continue; }
      emit('ID', s, s); continue;
    }

    throw err(`Unexpected character ${JSON.stringify(ch)}`);
  }

  toks.push({type:'<eof>', lexeme:'<eof>'});
  return toks;

  function err(m){ const e=new Error(`${m} at ${line}:${col}`); e.pos={line,col,index:i}; return e; }
}

function escapeChar(n){
  switch(n){
    case 'n': return '\n';
    case 'r': return '\r';
    case 't': return '\t';
    case '"': return '"';
    case "'": return "'";
    case '\\': return '\\';
    default: return n;
  }
}
