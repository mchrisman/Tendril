// semantics.js — deep equality, unification, small helpers

export const isObject = (x)=> x!==null && typeof x==='object' && !Array.isArray(x);
export const isScalar = (x)=> !Array.isArray(x) && !isObject(x);

export function deepEq(a,b){
  if (a===b) return true;
  if (typeof a!==typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)){
    if (a.length!==b.length) return false;
    for (let i=0;i<a.length;i++) if(!deepEq(a[i],b[i])) return false;
    return true;
  }
  if (isObject(a) && isObject(b)){
    const ak=Object.keys(a), bk=Object.keys(b);
    if (ak.length!==bk.length) return false;
    for (const k of ak) if(!deepEq(a[k], b[k])) return false;
    return true;
  }
  return false;
}

// env: { [name]: {kind:'scalar'|'slice', value:any, path?, site?, slice? } }
export function unify(env, name, val, kind){
  const cur = env[name];
  if (!cur){ env[name] = { kind, value: val, path: null, site: 'value' }; return true; }
  return cur.kind===kind && deepEq(cur.value, val);
}

// Regex: UNANCHORED per user request
export function rxFull(rx, s){
  if (typeof s!=='string') return false;
  rx.lastIndex = 0; // avoid stateful flags like /g
  return rx.test(s);
}

export const cloneEnvShallow = (env)=> Object.assign({}, env);

// Path steps for API metadata
export const pathStepKey   = (key)=>({type:'key', key});
export const pathStepIndex = (idx)=>({type:'index', key: idx});

// Defensive clone for replaceAll
export function deepClone(x){
  if (Array.isArray(x)) return x.map(deepClone);
  if (isObject(x)){
    const out = {};
    for (const k of Object.keys(x)) out[k] = deepClone(x[k]);
    return out;
  }
  return x;
}
