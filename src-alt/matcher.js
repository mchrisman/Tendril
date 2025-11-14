// matcher.js — single recursive engine with early unification + local counts
import * as A from './ast.js';
import {
  deepEq, unify, rxFull, isObject,
  pathStepKey, pathStepIndex, cloneEnvShallow
} from './semantics.js';

export function* matchSolutions(ast, data, options={}){
  const env = {};
  yield* matchNode(ast, data, env, []);
}

function* matchNode(node, data, env, path){
  switch(node.k){

    case A.K.WC:
      yield env; return;

    case A.K.LIT:
      if (deepEq(node.v, data)) yield env; return;

    case A.K.RE:
      if (rxFull(node.rx, String(data))) yield env; return;

    case A.K.VAR: {
      if (unifyWithMeta(env, node.name, data, 'scalar', path, 'value')) yield env;
      return;
    }

    case A.K.SVAR: {
      // Sugar: in arrays, treat specially in sequence matcher; here default to empty
      const empty = Array.isArray(data) ? [] : (isObject(data) ? {} : []);
      if (unifyWithMeta(env, node.name, empty, 'group', path, 'group')) yield env;
      return;
    }

    case A.K.BIND: {
      // Evaluate inner pattern first (no new external bindings should leak here)
      let matched = false;
      for (const _ of matchNode(node.pat, data, cloneEnvShallow(env), path)){
        matched = true; break;
      }
      if (!matched) return;

      const kind = node.isGroup ? 'group' : 'scalar';
      const site = node.isGroup && Array.isArray(data) ? 'group' : 'value';
      if (unifyWithMeta(env, node.name, data, kind, path, site)) yield env;
      return;
    }

    case A.K.OR:
      yield* matchNode(node.a, data, cloneEnvShallow(env), path);
      yield* matchNode(node.b, data, cloneEnvShallow(env), path);
      return;

    case A.K.LOOK: {
      const before = Object.keys(env);
      let ok=false, leaked=false;
      const probe = cloneEnvShallow(env);
      for (const e of matchNode(node.pat, data, probe, path)){
        ok=true;
        // Check no new bindings appeared
        const after = Object.keys(probe);
        if (after.length!==before.length) leaked=true;
        break;
      }
      if (!leaked && ((node.pos && ok) || (!node.pos && !ok))) yield env;
      return;
    }

    case A.K.QUANT:
      // Should only appear inside arrays
      yield* matchNode(node.node, data, env, path);
      return;

    case A.K.ARR:
      if (!Array.isArray(data)) return;
      yield* matchArray(node.seq, data, 0, env, path);
      return;

    case A.K.OBJ:
      if (!isObject(data)) return;
      yield* matchObject(node.groups, data, env, path);
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

  // '..' as lazy wildcard group: quant(wc, 0..∞, greedy:false)
  if (isDotDot(head)){
    for (let take=0; i+take<=arr.length; take++){
      yield* matchSeq(tail, arr, i+take, cloneEnvShallow(env), path);
    }
    return;
  }

  // Group binder in arrays: @x:( item*{m,n} ) or bare @x
  if (head.k===A.K.SVAR){
    // sugar for @x:(_*) (greedy)
    const name = head.name;
    const maxTake = arr.length - i;
    // choose greedy by default
    const take = maxTake; // possessive/greedy default
    const env2 = cloneEnvShallow(env);
    const groupVal = arr.slice(i, i+take);
    if (unifyGroupArray(env2, name, groupVal, path, i, i+take)) {
      yield* matchSeq(tail, arr, i+take, env2, path);
    }
    return;
  }

  if (head.k===A.K.BIND && head.isGroup){
    // @x:( QUANT(node, q) )  — capture the contiguous segment that matches
    if (head.pat.k===A.K.QUANT){
      const q = head.pat;
      const {min, max, greedy, poss} = q;
      const capMin = Math.max(0, min);
      const capMax = Math.min(max===Infinity? (arr.length - i) : max, arr.length - i);

      const tries = chooseTakes(capMin, capMax, greedy, poss);
      for (const take of tries){
        let j=i, ok=true, env2=cloneEnvShallow(env);
        for (let c=0;c<take;c++){
          if (j>=arr.length){ ok=false; break; }
          let stepOK=false;
          for (const e2 of matchNode(q.node, arr[j], cloneEnvShallow(env2), path.concat([pathStepIndex(j)]))){ env2=e2; stepOK=true; break; }
          if (!stepOK){ ok=false; break; }
          j++;
        }
        if (!ok) continue;
        const groupVal = arr.slice(i, j);
        if (!unifyGroupArray(env2, head.name, groupVal, path, i, j)) continue;
        yield* matchSeq(tail, arr, j, env2, path);
        if (poss) return; // commit (no backtrack) for possessive
      }
      return;
    }

    // Minimal: if not QUANT, treat as one-item capture if inner matches single element
    if (i>=arr.length) return;
    for (const e2 of matchNode(head.pat, arr[i], cloneEnvShallow(env), path.concat([pathStepIndex(i)]))){
      const env2=e2;
      const groupVal = [arr[i]];
      if (unifyGroupArray(env2, head.name, groupVal, path, i, i+1)){
        yield* matchSeq(tail, arr, i+1, env2, path);
      }
    }
    return;
  }

  // Quantified item
  if (head.k===A.K.QUANT){
    const q = head;
    const {min, max, greedy, poss} = q;
    const capMin = Math.max(0, min);
    const capMax = Math.min(max===Infinity? (arr.length - i) : max, arr.length - i);
    const tries = chooseTakes(capMin, capMax, greedy, poss);
    for (const take of tries){
      let j=i, ok=true, env2=cloneEnvShallow(env);
      for (let c=0;c<take;c++){
        if (j>=arr.length){ ok=false; break; }
        let stepOK=false;
        for (const e2 of matchNode(q.node, arr[j], cloneEnvShallow(env2), path.concat([pathStepIndex(j)]))){ env2=e2; stepOK=true; break; }
        if (!stepOK){ ok=false; break; }
        j++;
      }
      if (ok){
        yield* matchSeq(tail, arr, j, env2, path);
        if (poss) return;
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
  return n.k===A.K.QUANT && n.node && n.node.k===A.K.WC && n.greedy===false && n.min===0 && n.max===Infinity;
}

function chooseTakes(min, max, greedy, possessive){
  if (possessive){
    // commit to greedy or lazy single choice
    const one = greedy ? max : min;
    return [one];
  }
  const arr=[];
  if (greedy){
    for (let t=max;t>=min;t--) arr.push(t);
  } else {
    for (let t=min;t<=max;t++) arr.push(t);
  }
  return arr;
}

function unifyGroupArray(env, name, groupVal, pathToArray, start, end){
  const cur = env[name];
  const meta = { type:'array', pathToArray, start, end };
  if (!cur){
    env[name] = { kind:'group', value: groupVal, path: pathToArray, site:'group', group: meta };
    return true;
  }
  if (cur.kind!=='group') return false;
  if (!deepEq(cur.value, groupVal)) return false;
  // keep deepest pathToArray
  if (!cur.group || (pathToArray.length > (cur.group.pathToArray?.length||0))) cur.group = meta;
  return true;
}

// ---------------- Objects ----------------
function* matchObject(groups, obj, env, path){
  const keys = Object.keys(obj);

  // Split and track residual binder if present
  const asserts = [];
  let residCount = null;
  let residBindName = null;

  for (const s of groups){
    if (s.k===A.K.O_RESID){
      residCount = s.count || null;
      residBindName = s.bindName || null;
    } else {
      asserts.push(s);
    }
  }

  // Pre-pass: compute matched keys for each assertion by KEY predicate only
  const touched = new Set();
  const per = [];
  for (const a of asserts){
    const matchedKeys = keys.filter(k => testKeyPred(a.key, k));
    if (a.count){
      if (matchedKeys.length < a.count.min || matchedKeys.length > a.count.max) return;
    }
    matchedKeys.forEach(k=>touched.add(k));
    per.push({a, matchedKeys});
  }

  // Residual checks and (optional) binding
  const residualKeys = keys.filter(k=> !touched.has(k));
  if (residCount){
    if (residualKeys.length < residCount.min || residualKeys.length > residCount.max) return;
  }

  // Now validate VALUE patterns for each matched key; also bind key-site vars here
  let env2 = cloneEnvShallow(env);
  for (const {a, matchedKeys} of per){
    for (const k of matchedKeys){
      // key-site binders unify now (site:'key')
      if (!bindKeyVars(a.key, k, env2, path.concat([pathStepKey(k)]))) return;

      // Descend breadcrumbs on value side
      const {valueAt, pathAt, okStep} = descendValue(obj[k], a.steps, path.concat([pathStepKey(k)]), env2);
      if (!okStep) return;

      // Apply value predicate
      let ok=false;
      for (const e3 of matchNode(a.val, valueAt, cloneEnvShallow(env2), pathAt)){
        env2 = e3; ok=true; break;
      }
      if (!ok) return;
    }
  }

  // Bind residual group if requested: @rest:(..)
  if (residBindName){
    const kv = {};
    for (const k of residualKeys) kv[k] = obj[k];
    const meta = { type:'object', pathToObject: path, keys: residualKeys.slice() };
    const cur = env2[residBindName];
    if (!cur){
      env2[residBindName] = { kind:'group', value: kv, path, site:'group', group: meta };
    } else {
      if (cur.kind!=='group' || !deepEq(cur.value, kv)) return;
      if (!cur.group || (path.length > (cur.group.pathToObject?.length||0))) cur.group = meta;
    }
  }

  yield env2;
}

// Test-only key predicate (no bindings)
function testKeyPred(expr, rawKey){
  switch(expr.k){
    case A.K.RE: return rxFull(expr.rx, String(rawKey));
    case A.K.LIT: return String(expr.v)===String(rawKey);
    case A.K.WC: return true;
    case A.K.OR: return testKeyPred(expr.a, rawKey) || testKeyPred(expr.b, rawKey);
    case A.K.VAR:
    case A.K.BIND: // allow; actual binding & checks occur later
      return true;
    default: return false;
  }
}

// Bind key-site variables (and ensure binders' inner predicates hold)
function bindKeyVars(expr, rawKey, env, keyPath){
  switch(expr.k){
    case A.K.VAR:
      return unifyWithMeta(env, expr.name, String(rawKey), 'scalar', keyPath, 'key');
    case A.K.BIND: {
      if (expr.isGroup) return false;
      if (!testKeyPred(expr.pat, rawKey)) return false;
      return unifyWithMeta(env, expr.name, String(rawKey), 'scalar', keyPath, 'key');
    }
    case A.K.OR:
      // try left, else right
      const leftEnv = cloneEnvShallow(env);
      if (bindKeyVars(expr.a, rawKey, leftEnv, keyPath)){ Object.assign(env, leftEnv); return true; }
      const rightEnv = cloneEnvShallow(env);
      if (bindKeyVars(expr.b, rawKey, rightEnv, keyPath)){ Object.assign(env, rightEnv); return true; }
      return false;
    default:
      return true;
  }
}

// Descend value with breadcrumbs; steps may use bound $vars
function descendValue(start, steps, basePath, env){
  let cur = start; let p = basePath;
  for (const st of steps){
    if (st.type==='key'){
      const k = evalKeyExpr(st.key, env);
      if (k === NO_KEY) return { valueAt: undefined, pathAt: p, okStep:false };
      p = p.concat([pathStepKey(k)]);
      cur = cur?.[k];
    } else {
      const idx = evalKeyExpr(st.key, env);
      if (idx === NO_KEY) return { valueAt: undefined, pathAt: p, okStep:false };
      p = p.concat([pathStepIndex(idx)]);
      cur = cur?.[idx];
    }
  }
  return { valueAt: cur, pathAt: p, okStep:true };
}

const NO_KEY = Symbol('NO_KEY');

function evalKeyExpr(expr, env){
  switch(expr.k){
    case A.K.LIT: return expr.v;
    case A.K.VAR: {
      const b = env[expr.name];
      if (!b || b.kind!=='scalar') return NO_KEY;
      return b.value;
    }
    case A.K.BIND: {
      if (expr.isGroup) return NO_KEY;
      if (expr.pat.k===A.K.LIT) return expr.pat.v;
      return NO_KEY;
    }
    default: return NO_KEY;
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
  if (!cur.path || (path && path.length > cur.path.length)) cur.path = path;
  // keep earliest site preference order: key > value > group? (leave as-is)
  return true;
}
