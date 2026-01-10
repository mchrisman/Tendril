// golden-tests.test.js — End-to-end tests exercising parser → engine → API → edit/replace
//
// These tests hit most of Tendril's surface area with realistic data fixtures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

// =============================================================================
// Golden 1: OpenAI Chat Completions response → stitch all text
// Purpose: deep paths + array scanning + binding enumeration + solution aggregation
// =============================================================================

test('Golden 1: OpenAI Chat Completions - extract all output_text', () => {
  const resp = {
    id: "chatcmpl_x",
    object: "chat.completion",
    choices: [
      { index: 0, message: { role: "assistant", content: [
        { type: "output_text", text: "Hello" },
        { type: "output_text", text: ", world" },
        { type: "refusal", text: "nope" }
      ]}},
      { index: 1, message: { role: "assistant", content: [
        { type: "output_text", text: "!" }
      ]}}
    ]
  };

  // Find all text fragments of type output_text anywhere using find()
  const pat = `{ type: output_text, text: $t }`;
  const sols = Tendril(pat).find(resp).solutions().toArray();

  // Should find exactly 3 output_text entries
  assert.equal(sols.length, 3);

  // Stitched text should be "Hello, world!"
  const stitched = sols.map(s => s.t).join("");
  assert.equal(stitched, "Hello, world!");

  // No "refusal" text should appear
  assert.ok(!sols.some(s => s.t === "nope"));
});

// =============================================================================
// Golden 2: OpenAI streaming delta chunks → extract content only
// Purpose: alternation + optional keys + find() vs match() + field clauses
// =============================================================================

test('Golden 2: OpenAI streaming deltas - extract content, ignore refusal', () => {
  const chunks = [
    { choices: [{ delta: { content: "Hel" } }] },
    { choices: [{ delta: { content: "lo" } }] },
    { choices: [{ delta: { refusal: "no" } }] },
    { choices: [{ delta: { content: "!" }, finish_reason: "stop" }] }
  ];

  // Extract content from each chunk
  const pat = `{ **.content: $t }`;
  const texts = [];
  for (const chunk of chunks) {
    const sols = Tendril(pat).match(chunk).solutions().toArray();
    texts.push(...sols.map(s => s.t));
  }

  assert.deepEqual(texts, ["Hel", "lo", "!"]);
  assert.equal(texts.join(""), "Hello!");

  // Verify finish_reason exists in last chunk
  const finishPat = `{ **.finish_reason: stop }`;
  assert.ok(Tendril(finishPat).match(chunks[3]).hasMatch());
});

// =============================================================================
// Golden 3: VDOM macro expansion - FormattedAddress → div
// Purpose: array group binding + object matching + editAll group replacement
// =============================================================================

test('Golden 3: VDOM macro expansion - replace FormattedAddress with div', () => {
  const vdom = [
    { tag: "p", children: ["Ship to:"] },
    { tag: "FormattedAddress", props: { type: "oneLine", model: "uAddress" }, children: [] },
    { tag: "p", children: ["Thanks!"] }
  ];

  // Match the FormattedAddress node as a group for in-place replacement
  const pat = `[
    ...
    ({ tag: FormattedAddress, props: { type: oneLine, model: $m } } as @x)
    ...
  ]`;

  const result = Tendril(pat).find(vdom).editAll($ => ({
    x: [{ tag: "div", children: [`{${$.m}.name}, {${$.m}.street}`] }]
  }));

  // FormattedAddress should be replaced with div
  assert.equal(result[1].tag, "div");
  assert.equal(result[1].children[0], "{uAddress.name}, {uAddress.street}");

  // Surrounding nodes unchanged
  assert.equal(result[0].tag, "p");
  assert.equal(result[2].tag, "p");
});

// =============================================================================
// Golden 4: Config validation with universal object semantics
// Purpose: universal each K:V, optional ?:, closed object (! %)
// =============================================================================

test('Golden 4: Config validation - x_* keys must have numeric string values', () => {
  const cfgOK = { x_port: "8080", x_host: "443", id: "abc" };
  const cfgBad = { x_port: "eight", x_host: "443", id: "abc" };

  // Pattern: all x_* keys must have digit-only string values
  const pat = `{ each /^x_/: /^\\d+$/ }`;

  assert.ok(Tendril(pat).match(cfgOK).hasMatch());
  assert.ok(!Tendril(pat).match(cfgBad).hasMatch());
});

test('Golden 4b: Closed object - no unexpected keys', () => {
  const valid = { id: "abc", x_port: "8080" };
  const invalid = { id: "abc", x_port: "8080", unexpected: "key" };

  // Closed object: only id and x_* keys allowed
  const closedPat = `{ id: _, each /^x_/?: /^\\d+$/, %#{0} }`;

  assert.ok(Tendril(closedPat).match(valid).hasMatch());
  assert.ok(!Tendril(closedPat).match(invalid).hasMatch());
});

// =============================================================================
// Golden 5: JSON join across paths (planets/aka example)
// Purpose: root match + key binding + lookahead + array ... + many solutions
// =============================================================================

test('Golden 5: Planets/aka join - greet planets by all their names', () => {
  const data = {
    planets: {
      Jupiter: { size: "big" },
      Earth: { size: "small" }
    },
    aka: [
      ["Jupiter", "Jove", "Zeus"],
      ["Earth", "Terra"]
    ]
  };

  // Join planets with their aliases
  const pat = `{
    planets: { $planet: _ },
    aka: [... [... $planet ... $alias ...] ...]
  }`;

  const sols = Tendril(pat).match(data).solutions().toArray();
  const greetings = sols.map(s => `Hello, ${s.alias}`);

  // Should produce greetings for all aliases (not the planet names themselves when they equal $planet)
  // Jupiter->Jove, Jupiter->Zeus, Earth->Terra
  assert.ok(greetings.includes("Hello, Jove"));
  assert.ok(greetings.includes("Hello, Zeus"));
  assert.ok(greetings.includes("Hello, Terra"));
});

test('Golden 5b: Planets/aka join - resilient to reordering', () => {
  const data = {
    planets: {
      Jupiter: { size: "big" },
      Earth: { size: "small" }
    },
    // Reordered aka rows
    aka: [
      ["Earth", "Terra"],
      ["Jupiter", "Jove", "Zeus"]
    ],
    // Unrelated key should be ignored
    unrelated: { foo: "bar" }
  };

  const pat = `{
    planets: { $planet: _ },
    aka: [... [... $planet ... $alias ...] ...]
  }`;

  const sols = Tendril(pat).match(data).solutions().toArray();

  // Should still find all aliases
  const aliases = sols.map(s => s.alias);
  assert.ok(aliases.includes("Jove"));
  assert.ok(aliases.includes("Zeus"));
  assert.ok(aliases.includes("Terra"));
});

// =============================================================================
// Golden 6: Redaction at any depth
// Purpose: find() recursion vs ** path recursion, editAll correctness
// =============================================================================

test('Golden 6: Redaction - find() style', () => {
  const data = {
    user: { password: "secret", profile: { password: "also" } },
    password: "top"
  };

  const result = Tendril("{ password: $p }").find(data).editAll({ p: "REDACTED" });

  assert.equal(result.password, "REDACTED");
  assert.equal(result.user.password, "REDACTED");
  assert.equal(result.user.profile.password, "REDACTED");
});

test('Golden 6b: Redaction - ** path style', () => {
  const data = {
    user: { password: "secret", profile: { password: "also" } },
    password: "top"
  };

  const result = Tendril("{ **.password: $p }").match(data).editAll({ p: "REDACTED" });

  assert.equal(result.password, "REDACTED");
  assert.equal(result.user.password, "REDACTED");
  assert.equal(result.user.profile.password, "REDACTED");
});

test('Golden 6c: Redaction - both methods produce same result', () => {
  const data = {
    user: { password: "secret", profile: { password: "also" } },
    password: "top"
  };

  const result1 = Tendril("{ password: $p }").find(data).editAll({ p: "REDACTED" });
  const result2 = Tendril("{ **.password: $p }").match(data).editAll({ p: "REDACTED" });

  assert.deepEqual(result1, result2);
});

// =============================================================================
// Golden 7: Array slicing + splice offset correctness
// Purpose: group splices on same array; ensures offset logic in applyEdits
// =============================================================================

test('Golden 7: Array splice - replace middle group', () => {
  const arr = [1, 2, 3, 4, 5, 6];

  const pat = `[ ... (3 4 as @mid) ... ]`;
  const result = Tendril(pat).find(arr).editAll({ mid: [30, 40, 50] });

  assert.deepEqual(result, [1, 2, 30, 40, 50, 5, 6]);
});

test('Golden 7b: Array splice - replace two groups (head and tail)', () => {
  const arr = [1, 2, 3, 4, 5, 6];

  const pat = `[ (1 2 as @a) ... (5 6 as @b) ]`;
  const result = Tendril(pat).find(arr).editAll({ a: [10], b: [60, 70, 80] });

  assert.deepEqual(result, [10, 3, 4, 60, 70, 80]);
});

// =============================================================================
// Golden 8: Object group capture + replace with new props
// Purpose: object (... as %x) capture, replacement semantics
// =============================================================================

test('Golden 8: Object group capture and replace', () => {
  const obj = { Big: 1, Cute: 2, Alice: 3, c: 99 };

  // Capture keys matching /a/i or /b/i as a group
  const pat = `{ (/[ab]/i: _ as %x), /c/: _ }`;
  const result = Tendril(pat).find(obj).editAll({ x: { foo: "bar" } });

  // Keys matched by /a/i or /b/i removed (Big, Alice)
  // Replaced with {foo: "bar"}
  // Keys Cute and c remain
  assert.equal(result.foo, "bar");
  assert.equal(result.Cute, 2);
  assert.equal(result.c, 99);
  assert.equal(result.Big, undefined);
  assert.equal(result.Alice, undefined);
});
