// ast.js — minimal node tags and constructors

export const K = {
  LIT: 'LIT', RE: 'RE', WC: 'WC',
  VAR: 'VAR', SVAR: 'SVAR',            // bare $x / @x sugars
  BIND: 'BIND',                        // $x:(pat) / @x:(slicePat)
  OR: 'OR',
  LOOK: 'LOOK',                        // {pos:boolean, pat}
  QUANT: 'QUANT',                      // {node, min, max, greedy, poss}
  ARR: 'ARR',                          // {seq: Node[]}    // adjacency inside [...]
  OBJ: 'OBJ',                          // {slices: Slice[]}
  O_ASSERT: 'O_ASSERT',                // {key, steps, op:'='|'?=', val, count?}
  O_RESID: 'O_RESID',                  // {count?}         // '..' residual
};

export const lit  = (v)=>({k:K.LIT, v});
export const re   = (rx)=>({k:K.RE, rx});
export const wc   = ()=>({k:K.WC});

export const v    = (name)=>({k:K.VAR, name});
export const sv   = (name)=>({k:K.SVAR, name});
export const bind = (name, pat, isSlice)=>({k:K.BIND, name, pat, isSlice});

export const or   = (a,b)=>({k:K.OR, a,b});
export const look = (pos, pat)=>({k:K.LOOK, pos, pat});
export const quant= (node, q)=>({k:K.QUANT, node, ...q});

export const arr  = (seq)=>({k:K.ARR, seq});
export const obj  = (slices)=>({k:K.OBJ, slices});
export const oAssert = (key, steps, op, val, count)=>({k:K.O_ASSERT, key, steps, op, val, count});
export const oResid  = (count)=>({k:K.O_RESID, count});

// Helpers for breadcrumb steps used in O_ASSERT
export const stepKey  = (key)=>({type:'key', key});     // .key
export const stepIdx  = (key)=>({type:'index', key});   // [expr] (expr must resolve to number or string)
