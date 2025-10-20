// parser.js — Pratt parser with compact rule table for Tendril v5
import { lex } from './lexer.js';
import * as A from './ast.js';

const BP = { LOW:1, ALT:10, BIND:20, QUANT:25, DOT:30, OPT:40 };

export function parsePattern(pattern){
  const tokens = lex(pattern);
  const p = new Parser(tokens);
  const node = p.expression(BP.LOW);
  p.eat('<eof>');
  return node;
}

class Parser{
  constructor(tokens){ this.t=tokens; this.i=0; this.nud={}; this.led={}; this.lbp={};
    // Register grammar
    this.prefix('NUM', tok=>A.lit(tok.value));
    this.prefix('BOOL', tok=>A.lit(tok.value));
    this.prefix('STR', tok=>A.lit(tok.value));
    this.prefix('REGEX', tok=>A.re(tok.value));
    this.prefix('_', _=>A.wc()); // not produced by lexer; left for completeness

    // Grouping
    this.prefix('(', _=>{ const e=this.expression(BP.LOW); this.eat(')'); return e; });

    // Arrays
    this.prefix('[', _=> this.parseArray() );

    // Objects
    this.prefix('{', _=> this.parseObject() );

    // Alternation
    this.infix('|', BP.ALT, (tok,left)=> A.or(left, this.expression(BP.ALT)));

    // Bindings: $x and $x:(...)
    this.prefix('$', _=>{
      const id = this.eat('ID').value;
      if (this.peek(':')){ this.eat(':'); this.eat('('); const pat=this.expression(BP.LOW); this.eat(')'); return A.bind(id, pat, false); }
      return A.v(id);
    });
    this.prefix('@', _=>{
      const id = this.eat('ID').value;
      if (this.peek(':')){ this.eat(':'); this.eat('('); const pat=this.expression(BP.LOW); this.eat(')'); return A.bind(id, pat, true); }
      return A.sv(id);
    });

    // Lookaheads
    this.prefix('(?=', _=>{ const pat=this.expression(BP.LOW); this.eat(')'); return A.look(true, pat); });
    this.prefix('(?!', _=>{ const pat=this.expression(BP.LOW); this.eat(')'); return A.look(false, pat); });

    // Postfix item-optional '?'
    this.postfix('?', BP.OPT, (tok,left)=> A.quant(left, {min:0,max:1,greedy:true,poss:false}));

    // Postfix quantifiers: +, *, *?, ++, *+ and counted *{...}
    this.postfix('+', BP.QUANT, (tok,left)=> A.quant(left, {min:1,max:Infinity,greedy:true,poss:false}));
    this.postfix('*', BP.QUANT, (tok,left)=> {
      // Detect *? or *+ or *{...}
      if (this.peek('?')){ this.eat('?'); return A.quant(left, {min:0,max:Infinity,greedy:false,poss:false}); }
      if (this.peek('+')){ this.eat('+'); return A.quant(left, {min:0,max:Infinity,greedy:true,poss:true}); }
      if (this.peek('{')){ const q=this.parseCount(); return A.quant(left, q); }
      return A.quant(left, {min:0,max:Infinity,greedy:true,poss:false});
    });
  }

  // Pratt core
  expression(rbp){
    let tok = this.t[this.i++]; const nud=this.nud[tok.type]||this.nud[tok.lexeme]; if(!nud) this.err(`Unexpected ${tok.lexeme}`);
    let left = nud(tok);
    while (rbp < (this.lbp[this.t[this.i].type]||this.lbp[this.t[this.i].lexeme]||0)){
      tok = this.t[this.i++]; const led=this.led[tok.type]||this.led[tok.lexeme]; if(!led) this.err(`Unexpected ${tok.lexeme}`);
      left = led(tok, left);
    }
    return left;
  }

  // Arrays: [ A_BODY ]
  parseArray(){
    const seq=[];
    while(!this.peek(']')){
      seq.push( this.expression(BP.LOW) );
      if (this.peek(',')) this.eat(',');
    }
    this.eat(']');
    return A.arr(seq);
  }

  // Objects: { O_BODY }
  parseObject(){
    const slices=[];
    while(!this.peek('}')){
      if (this.peek('..')){ this.eat('..'); const cnt=this.maybeObjCount(); slices.push(A.oResid(cnt)); }
      else {
        // KEY ( .KEY | [KEY] )* ('=' | '?=') VALUE (O_QUANT)?
        const key = this.expression(BP.DOT);
        const steps=[];
        while (this.peek('.') || this.peek('[')){
          if (this.peek('.')){ this.eat('.'); const k=this.expression(BP.DOT); steps.push(A.stepKey(k)); }
          else { this.eat('['); const k=this.expression(BP.DOT); this.eat(']'); steps.push(A.stepIdx(k)); }
        }
        const op = this.peek('?=') ? (this.eat('?='), '?=') : (this.eat('='), '=');
        const val = this.expression(BP.LOW);
        const cnt = this.maybeObjCount();
        slices.push(A.oAssert(key, steps, op, val, cnt));
      }
      if (this.peek(',')) this.eat(',');
    }
    this.eat('}');
    return A.obj(slices);
  }

  maybeObjCount(){
    if (!this.peek('#')) return null;
    this.eat('#');
    if (this.peek('?')){ this.eat('?'); return {min:0, max:Infinity}; }
    this.eat('{');
    let min=null, max=null;
    if (!this.peek(',') && !this.peek('}')) min = this.eat('NUM').value;
    if (this.peek(',')){
      this.eat(',');
      if (!this.peek('}')) max = this.eat('NUM').value;
    }
    this.eat('}');
    if (min==null && max==null) return {min:0, max:0};
    if (min!=null && max==null) return {min, max:Infinity};
    if (min==null && max!=null) return {min:0, max};
    return {min, max};
  }

  parseCount(){
    this.eat('{');
    let min=null, max=null;
    if (!this.peek(',') && !this.peek('}')) min = this.eat('NUM').value;
    if (this.peek(',')){ this.eat(','); if (!this.peek('}')) max=this.eat('NUM').value; }
    this.eat('}');
    if (min==null && max==null) return {min:0, max:0};
    if (min!=null && max==null) return {min, max:Infinity};
    if (min==null && max!=null) return {min:0, max};
    return {min, max};
  }

  // mini-API
  prefix(sym,fn){ this.nud[sym]=fn; }
  infix(sym,bp,fn){ this.led[sym]=fn; this.lbp[sym]=bp; }
  postfix(sym,bp,fn){ this.led[sym]=fn; this.lbp[sym]=bp; }

  eat(type){ const tok=this.t[this.i]; if (tok.type!==type && tok.lexeme!==type) this.err(`Expected ${type} got ${tok.lexeme}`); this.i++; return tok; }
  peek(type){ const tok=this.t[this.i]; return tok.type===type || tok.lexeme===type; }
  err(m){ const tok=this.t[this.i]||{lexeme:'<eof>'}; throw new Error(`${m} near ${tok.lexeme}`); }
}
