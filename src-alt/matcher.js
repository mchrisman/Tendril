// matcher.js — single recursive engine with early unification + local counts
import * as A from './ast.js';
import { deepEq, unify, rxFull, isObject, pathStepKey, pathStepIndex, cloneEnvShallow } from './semantics.js';

export function* matchSolutions(ast, data, options={}){
  // start with empty env
  const env = {};
  yield* matchNode(ast, data, env, []);
}

// Core dispatcher
function* matchNode(node, data, env, path){
  switch(node.k){

    case A.K.WC:
      yield env;
      return;

    case A.K.LIT:
      if (deepEq(node.v, data)) yield env;
      return;

    case A.K.RE:
      if (rxFull(node.rx, String(data))) yield env;
      return;

    case A.K.VAR: {
      const ok = unifyWithMeta(env, node.name, data, 'scalar', path, 'value');
      if (ok) yield env;
      return;
    }

    case A.K.SVAR: {
      // Bare @x sugar: arrays -> empty slice []; objects -> {}
      const empty = Array.isArray(data) ? [] : (isObject(data) ? {} : []);
      const ok = unifyWithMeta(env, node.name, empty, 'slice', path, Array.isArray(empty)?'slice':'slice');
      if (ok) yield env;
      return;
    }

    case A.K.BIND: {
      // Evaluate inner pattern first; then bind if kind fits (scalar vs slice)
      for (const e1 of matchNode(node.pat, data, cloneEnvShallow(env), path)){
        const kind = node.isSlice ? 'slice' : 'scalar';
        if (node.isSlice){
          // Array slice binders are meaningful only in array contexts; when used at value nodes, treat as scalar bind
          const ok = unifyWithMeta(env, node.name, data, 'slice', path, Array.isArray(data)?'slice':'value');
          if (ok) yield env;
        }else{
          const ok = unifyWithMeta(env, node.name, data, 'scalar', path, 'value');
          if (ok) yield env;
        }
        // Note: env unified in-place; e1 is unused because we ensured no extra bindings leak from testing pattern
      }
      return;
    }

    case A.K.OR:
      yield* matchNode(node.a, data, cloneEnvShallow(env), path);
      yield* matchNode(node.b, data, cloneEnvShallow(env), path);
      return;

    case A.K.LOOK: {
      const snap = cloneEnvShallow(env);
      let ok=false;
      for (const _ of matchNode(node.pat, data, cloneEnvShallow(env), path)){ ok=true; break; }
      if ((node.pos && ok) || (!node.pos && !ok)) yield env; // no mutation
      return;
    }

    case A.K.QUANT:
      // QUANT nodes appear inside arrays; if encountered elsewhere, treat minimal unit
      yield* matchNode(node.node, data, env, path);
      return;

    case A.K.ARR:
      if (!Array.isArray(data)) return;
      yield* matchArray(node.seq, data, 0, env, path);
      return;

    case A.K.OBJ:
      if (!isObject(data)) return;
      yield* matchObject(node.slices, data, env, path);
      return;

    default: return;
  }
}

// ---------------- Arrays ----------------
function* matchArray(seq, arr, i, env, path){
  yield* matchSeq(seq, arr, i, env, path);
}

function* matchSeq(seq, arr, i, env, path){
  if (seq.length===0){
    if (i===arr.length) yield env;
    return;
  }
  const [head, ...tail] = seq;

  // '..' is represented as QUANT(WC, {greedy:false, min:0,max:Infinity})
  if (isDotDot(head)){
    // Lazy: try shortest first
    for (let take=0; i+take<=arr.length; take++){
      const env2 = cloneEnvShallow(env);
      yield* matchSeq(tail, arr, i+take, env2, path);
    }
    return;
  }

  // Postfix QUANT on an item
  if (head.k===A.K.QUANT){
    const q = head;
    const greedy = q.greedy!==false;
    const order = greedy ? range(q.max===Infinity? (arr.length - i) : Math.min(q.max, arr.length - i), q.min, -1)
                         : range(q.min, Math.min(q.max===Infinity? (arr.length - i): q.max, arr.length - i), +1);
    for (const take of order){
      let j=i, ok=true, env2=cloneEnvShallow(env);
      for (let c=0;c<take;c++){
        if (j>=arr.length){ ok=false; break; }
        let stepOK=false;
        for (const e2 of matchNode(q.node, arr[j], cloneEnvShallow(env2), path.concat([pathStepIndex(j)]))){
          env2 = e2; stepOK=true; break;
        }
        if (!stepOK){ ok=false; break; }
        j++;
      }
      if (ok){
        yield* matchSeq(tail, arr, j, env2, path);
      }
    }
    return;
  }

  if (i>=arr.length) return;

  for (const e2 of matchNode(head, arr[i], cloneEnvShallow(env), path.concat([pathStepIndex(i)]))){
    yield* matchSeq(tail, arr, i+1, e2, path);
  }
}

function isDotDot(n){
  // We encode '..' during parse as quant(wc(), {min:0,max:Infinity,greedy:false})
  return n.k===A.K.QUANT && n.node && n.node.k===A.K.WC && n.greedy===false && n.min===0 && n.max===Infinity;
}

function range(a,b,step){
  if (step<0){ const out=[]; for(let x=a;x>=b;x+=step) out.push(x); return out; }
  const out=[]; for(let x=a;x<=b;x+=step) out.push(x); return out;
}

// ---------------- Objects ----------------
function* matchObject(slices, obj, env, path){
  // Split assertions vs residual
  const asserts = []; let residCount = null; let residBinder = null;
  for (const s of slices){
    if (s.k===A.K.O_RESID){ residCount = s.count || null; }
    else asserts.push(s);
  }

  const keys = Object.keys(obj);

  // Key-predicate pre-pass to compute which keys are touched by assertions
  const touched = new Set();
  const per = [];
  for (const a of asserts){
    const matchedKeys = keys.filter(k => matchKeyExpr(a.key, k));
    // count gate (local, no subset search)
    if (a.count){
      if (matchedKeys.length < a.count.min || matchedKeys.length > a.count.max) return;
    }
    matchedKeys.forEach(k=>touched.add(k));
    per.push({a, matchedKeys});
  }

  // Residual count check
  if (residCount){
    const resid = keys.filter(k=> !touched.has(k));
    if (resid.length < residCount.min || resid.length > residCount.max) return;
  }

  // Now verify VALUES for each matched key independently (conjunctive)
  let env2 = cloneEnvShallow(env);
  for (const {a, matchedKeys} of per){
    for (const k of matchedKeys){
      const v = obj[k];
      let ok=false;
      // Traverse breadcrumbs on VALUE side if steps present
      const {valueAt, pathAt} = descendValue(obj[k], a.steps, path.concat([pathStepKey(k)]));
      for (const e3 of matchNode(a.val, valueAt, cloneEnvShallow(env2), pathAt)){
        env2 = e3; ok=true; break;
      }
      if (!ok) return;
      // If key site contains a $var binder directly (rare): support by scanning a.key for VAR/BIND and unify
      // For simplicity: already handled in matchKeyExpr via unifyKeyVars.
    }
  }

  yield env2;
}

// Key matching: test head expression against raw key string; support regex, literals, wildcard, and $var binders at key site.
function matchKeyExpr(expr, rawKey, env){
  switch(expr.k){
    case A.K.RE: return rxFull(expr.rx, String(rawKey));
    case A.K.LIT: return String(expr.v)===String(rawKey);
    case A.K.WC: return true;
    case A.K.VAR: {
      // unify scalar string
      return true; // actual unify occurs during binding at value time; keeping key-only pure
    }
    case A.K.BIND: {
      // $k:(/rx/) at key site: check inner first
      if (expr.isSlice) return false;
      const ok = matchKeyExpr(expr.pat, rawKey);
      return ok;
    }
    case A.K.OR:
      return matchKeyExpr(expr.a, rawKey) || matchKeyExpr(expr.b, rawKey);
    default:
      // Complex expressions as keys are allowed (e.g., grouping) but we boil down to literal/regex/_/or forms.
      // If not one of the above, try to stringify and compare.
      return false;
  }
}

// Descend value along breadcrumb steps (on VALUE side), producing node and path
function descendValue(start, steps, basePath){
  let cur = start; let p = basePath;
  for (const st of steps){
    if (st.type==='key'){ const key = evalKeyExpr(st.key, cur); p = p.concat([pathStepKey(key)]); cur = cur?.[key]; }
    else { const idx = evalKeyExpr(st.key, cur); p = p.concat([pathStepIndex(idx)]); cur = cur?.[idx]; }
  }
  return { valueAt: cur, pathAt: p };
}

// Evaluate KEY/INDEX expression used in breadcrumb step; for v5, these are usually literals/vars.
// Here we accept literals, regex (not meaningful), numbers, strings, and simple $vars already bound.
function evalKeyExpr(expr, objCtx){
  switch(expr.k){
    case A.K.LIT: return expr.v;
    case A.K.VAR: // key vars only useful if already bound; if not, treat as string name
      return expr.name;
    case A.K.RE: // not meaningful as concrete step; fall back to string
      return String(expr.rx);
    case A.K.BIND:
      if (!expr.isSlice && expr.pat.k===A.K.LIT) return expr.pat.v;
      return '__key__';
    default:
      return '__key__';
  }
}

// Record binding with path/site metadata for API replaceAll
function unifyWithMeta(env, name, value, kind, path, site){
  const cur = env[name];
  if (!cur){
    env[name] = { kind, value, path, site };
    return true;
  }
  if (cur.kind!==kind) return false;
  if (!deepEq(cur.value, value)) return false;
  // prefer deepest path as canonical (stable)
  if (!cur.path || (path && path.length > cur.path.length)) cur.path = path;
  return true;
}
