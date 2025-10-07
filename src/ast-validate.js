// ast-validate.js
// Structural validation and light normalization passes.
// Enforces:
// - One replacement target (>>…<<) per pattern.
// - Arrays anchored by default; confirm spread sugar presence toggles anchoring in objects.
// - Lookaheads appear only in allowed places (before array unit / key / value).
// - Object kv counts well-formed (m<=n; finite n unless {m,} used to mean Infinity).
// - Vertical dot precedence is already encoded by the parser; here we check shape for object paths.
// - BARE === STRING invariant already lowered by parser.
// Produces a validated AST (can also annotate flags).

import {PatternSyntaxError} from "./lexer.js";

/**
 * Entry point: validate AST.
 */
export function validateAST(ast) {
  const ctx = {
    replaceTargets: 0,
    // track path for error reporting
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
      // Dot nodes can appear generally; special handling occurs inside Object kv path compilation.
      out = {...n, left: visit(n.left, ctx, meta), right: visit(n.right, ctx, meta)};
      break;
    case "Quant":
      checkQuant(n);
      out = {...n, sub: visit(n.sub, ctx, meta)};
      break;
    case "Group":
      out = {...n, sub: visit(n.sub, ctx, meta)};
      break;

    case "Array":
      // arrays anchored by default (parser sets anchored:true)
      out = {...n, elems: n.elems.map(e => visit(e, ctx, {...meta, context: "array"}))};
      // validate spreads at top-level of array elements: allow "Spread" anywhere
      break;

    case "Set":
      out = {...n, members: n.members.map(m => visit(m, ctx, {...meta, context: "set"}))};
      break;

    case "Object":
      out = validateObject(n, ctx, meta);
      break;

    case "ReplaceSlice":
      ctx.replaceTargets++;
      out = {...n, target: visit(n.target, ctx, meta)};
      break;

    case "Assert":
      // Placement: must be directly before a unit in array context or key/value in object context.
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
  // kvs independent and non-consuming; counts post-check form is stored.
  const kvs = [];
  for (const kv of n.kvs) {
    // Validate path on the key: right-assoc Dot is fine. No extra constraints here.
    const kPat = visit(kv.kPat, ctx, {...meta, context: "object-key"});
    const vPat = visit(kv.vPat, ctx, {...meta, context: "object-val"});

    // Count shape
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

  // Anchoring: if hasSpread, object is not anchored; otherwise anchored.
  const anchored = n.anchored && !n.hasSpread ? true : !n.hasSpread;
  return {...n, kvs, anchored};
}

function validateAssert(n, ctx, meta) {
  // Must appear immediately before a "unit" depending on context:
  // - array: before an element (OK wherever a primary would be)
  // - object: before key unit (in key pattern) or before value unit (in vPat)
  // - set: before a member unit
  // We can't fully know "immediately before unit" in the AST without context-sensitive parsing,
  // but we can at least forbid global/top usage outside a container context.
  if (!(meta.context === "array" || meta.context === "object-key" || meta.context === "object-val" || meta.context === "set")) {
    throw new PatternSyntaxError("Lookahead assertions must guard a unit in array/set or key/value in object", n.span.start);
  }
  // Validate inner pattern recursively in the same meta-context
  const pat = visit(n.pat, ctx, meta);
  return {...n, pat};
}
