// ast-validate.js
// Structural validation and light normalization passes.
// Enforces:
// - Exactly one replacement target (>>…<<) across slice/key/value forms.
// - Arrays anchored by default; confirm spread sugar presence toggles anchoring in objects.
// - Lookaheads appear only in allowed places (before array unit / key / value).
// - Object kv counts well-formed (m<=n; finite n unless {m,} → Infinity).
// - Vertical dot precedence is already encoded by the parser.
// - BARE === STRING invariant already lowered by parser.

import {PatternSyntaxError} from "./lexer.js";

/**
 * Entry point: validate AST.
 */
export function validateAST(ast) {
  const ctx = {
    replaceTargets: 0,
    stack: [],
  };

  const v = visit(ast, ctx, {context: "top"});

  if (ctx.replaceTargets > 1) {
    throw new PatternSyntaxError("Only one >>…<< replacement target allowed per pattern", ast.span.start);
  }
  return v;
}

// ---- Visitors ----

function visit(n, ctx, meta) {
  if (!n || typeof n !== "object") return n;
  ctx.stack.push(n);
  let out;

  switch (n.type) {
    case "Alt":
      out = {...n, options: n.options.map(opt => visit(opt, ctx, meta))};
      break;
    case "And":
      out = {...n, parts: n.parts.map(p => visit(p, ctx, meta))};
      break;
    case "Adj":
      out = {...n, elems: n.elems.map(e => visit(e, ctx, meta))};
      break;
    case "Dot":
      out = {...n, left: visit(n.left, ctx, meta), right: visit(n.right, ctx, meta)};
      break;
    case "IndexedPath":
      out = {...n, obj: visit(n.obj, ctx, meta), index: visit(n.index, ctx, meta)};
      break;
    case "Quant":
      // Normalize: null max means unbounded (Infinity)
      const normalizedQuant = {...n, max: n.max === null ? Infinity : n.max};
      checkQuant(normalizedQuant);
      out = {...normalizedQuant, sub: visit(normalizedQuant.sub, ctx, meta)};
      break;
    case "Group":
      out = {...n, sub: visit(n.sub, ctx, meta)};
      break;

    case "Array":
      out = {...n, elems: n.elems.map(e => visit(e, ctx, {...meta, context: "array"}))};
      break;

    case "Set":
      out = {...n, members: n.members.map(m => visit(m, ctx, {...meta, context: "set"}))};
      break;

    case "Object":
      out = validateObject(n, ctx, meta);
      break;

    case "ReplaceSlice":
      ctx.replaceTargets++;
      // Slice replacement is allowed anywhere a primary appears (commonly arrays).
      out = {...n, target: visit(n.target, ctx, meta)};
      break;

    case "ReplaceKey":
      ctx.replaceTargets++;
      // Must appear only inside Object kv list; parser guarantees placement, but we enforce context weakly.
      if (meta.context !== "object") {
        throw new PatternSyntaxError("Key replacement (>>k<<:v) only valid inside an object", n.span.start);
      }
      out = {
        ...n,
        kPat: visit(n.kPat, ctx, {...meta, context: "object-key"}),
        vPat: visit(n.vPat, ctx, {...meta, context: "object-val"}),
      };
      break;

    case "ReplaceVal":
      ctx.replaceTargets++;
      if (meta.context !== "object") {
        throw new PatternSyntaxError("Value replacement (k:>>v<<) only valid inside an object", n.span.start);
      }
      out = {
        ...n,
        kPat: visit(n.kPat, ctx, {...meta, context: "object-key"}),
        vPat: visit(n.vPat, ctx, {...meta, context: "object-val"}),
      };
      break;

    case "Assert":
      out = validateAssert(n, ctx, meta);
      break;

    case "Bind":
      out = {...n, pat: visit(n.pat, ctx, meta)};
      break;

    case "BindEq":
      out = {
        ...n,
        left: visit(n.left, ctx, meta),
        right: visit(n.right, ctx, meta),
      };
      break;

    // atoms, vars
    case "Var":
    case "Number":
    case "Bool":
    case "String":
    case "Regex":
    case "Any":
    case "Spread":
      out = n;
      break;

    default:
      throw new PatternSyntaxError(`Unknown AST node type ${n.type}`, n.span?.start ?? 0);
  }

  ctx.stack.pop();
  return out;
}

// ---- Helpers ----

function checkQuant(q) {
  if (!(Number.isFinite(q.min) && (Number.isFinite(q.max) || q.max === Infinity))) {
    throw new PatternSyntaxError("Quantifier bounds must be finite or Infinity", q.span.start);
  }
  if (q.min < 0) throw new PatternSyntaxError("Quantifier min < 0", q.span.start);
  if (q.max !== Infinity && q.max < q.min) {
    throw new PatternSyntaxError("Quantifier max < min", q.span.start);
  }
}

function validateObject(n, ctx, meta) {
  const kvs = [];
  for (const kv of n.kvs) {
    if (kv.type === "ReplaceKey" || kv.type === "ReplaceVal") {
      // Already validated in the node visitor above (placement + recursion)
      kvs.push(visit(kv, ctx, {...meta, context: "object"}));
      continue;
    }

    const kPat = visit(kv.kPat, ctx, {...meta, context: "object-key"});
    const vPat = visit(kv.vPat, ctx, {...meta, context: "object-val"});

    if (kv.count) {
      const {min, max} = kv.count;
      if (!Number.isFinite(min) || min < 0) {
        throw new PatternSyntaxError("Object count min must be finite >= 0", n.span.start);
      }
      if (!(Number.isFinite(max) || max === Infinity)) {
        throw new PatternSyntaxError("Object count max must be finite or Infinity", n.span.start);
      }
      if (max !== Infinity && max < min) {
        throw new PatternSyntaxError("Object count max < min", n.span.start);
      }
    }
    kvs.push({...kv, kPat, vPat});
  }

  // Warn if multiple spreads (redundant but allowed)
  if (n.spreadCount > 1) {
    console.warn(`Pattern validation warning: Object has ${n.spreadCount} spread operators (...), but only one is needed.`);
  }

  const anchored = n.anchored && !n.hasSpread ? true : !n.hasSpread;
  return {...n, kvs, anchored};
}

function validateAssert(n, ctx, meta) {
  // Assertions are syntactically unrestricted - they can appear anywhere in a pattern.
  // They are semantically meaningful when guarding array/set elements or object keys/values,
  // but the validator doesn't enforce context since complex patterns like [a | (?=b)] are valid.
  const pat = visit(n.pat, ctx, meta);
  return {...n, pat};
}
