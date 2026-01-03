/**
 * CW4/CW14 Conformance Tests
 *
 * Tests for:
 * - CW4: `else !` strong semantics (replacement for `:>`)
 * - CW14: `->` bucket accumulation and categorization
 *
 * Run with: node --test test/cw4-cw14-conformance.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

// ==================== Basic CW14 Tests ====================

// FIXED: The `else` belongs INSIDE the value pattern, not between K:V terms.
// Original: "{ /[ab]/:$v->@good else _:$v->@bad }" - WRONG (two K:V terms)
// Correct: "{ $k: (match_good->@good else _->@bad) }" - ONE K:V term with value alternation
test('CW14: basic categorization into buckets by value', () => {
  const data = {a:1, b:1, c:2};  // Categorize by VALUE (1s vs 2s)

  const result = Tendril("{ $k: (1->@ones else _->@rest) }")
    .match(data)
    .solutions()
    .first();

  assert.deepEqual(result.ones, {a:1, b:1});
  assert.deepEqual(result.rest, {c:2});
});

test('CW4: strong semantics via else !', () => {
  const ok   = {a:1, b:1};
  const bad  = {a:1, b:2};

  assert.ok(
    Tendril("{ /[ab]/:1 else ! }").match(ok).hasMatch()
  );

  assert.ok(
    !Tendril("{ /[ab]/:1 else ! }").match(bad).hasMatch()
  );
});

test('CW14 + CW4: categorize then validate exhaustively', () => {
  const data = {a:1, b:2, c:3};

  const pat = "{ /[abc]/:(1->@ones else 2->@twos else 3->@threes) else ! }";

  const sol = Tendril(pat).match(data).solutions().first();

  assert.deepEqual(sol.ones,   {a:1});
  assert.deepEqual(sol.twos,   {b:2});
  assert.deepEqual(sol.threes, {c:3});
});

// FIXED: Use correct value-pattern syntax
test('CW14: bucket accumulates all matching kv-pairs', () => {
  const data = {x:1, y:1, z:2};

  const sol = Tendril("{ $k: (1->@ones else _) }")
    .match(data)
    .solutions()
    .first();

  assert.deepEqual(sol.ones, {x:1, y:1});
});

test('CW14: unpopulated bucket is undefined', () => {
  const data = {a:1};

  const sol = Tendril("{ a: (1->@hit else _->@miss) }")
    .match(data)
    .solutions()
    .first();

  assert.deepEqual(sol.hit, {a:1});
  assert.strictEqual(sol.miss, undefined);
});

// FIXED: Use correct value-pattern syntax
test('CW14: else prevents double collection', () => {
  const data = {a:1};

  const sol = Tendril("{ $k: (1->@x else _->@y) }")
    .match(data)
    .solutions()
    .first();

  assert.deepEqual(sol.x, {a:1});
  assert.strictEqual(sol.y, undefined);
});

test('CW14: else _ gives total coverage without failure', () => {
  const data = {a:1, b:2};

  const sol = Tendril("{ $k: (1->@ones else _->@rest) }")
    .match(data)
    .solutions()
    .first();

  assert.deepEqual(sol.ones, {a:1});
  assert.deepEqual(sol.rest, {b:2});
});

// CW16: Nested categorization using labels to avoid inner key collisions.
// Without labels, inner key 'a' from both row1 and row2 would collide.
// With §L and <^L>, we use the OUTER key ($k) for the bucket key.
test('CW16: nested categorization using labels', () => {
  const data = {
    row1: {a:1, b:2},
    row2: {a:1}
  };

  // §L labels the outer object; <^L> uses the outer iteration key ($k)
  // So instead of bucket key 'a' (inner), we use 'row1' or 'row2' (outer)
  const pat = `§L {
    $k: ({
      $k2: (1->@ones<^L> else _)
    }->@rows)
  }`;

  const sol = Tendril(pat).match(data).solutions().first();

  // @ones now has outer keys: row1 and row2 (no collision!)
  assert.deepEqual(sol.ones, {row1: 1, row2: 1});
  // @rows has the whole sub-objects
  assert.deepEqual(sol.rows, {row1: {a:1, b:2}, row2: {a:1}});
});

test('CW4: strong + optional (else !?)', () => {
  const empty = {};
  const ok    = {a:1};
  const bad   = {a:2};

  const pat = "{ a:1 else !? }";

  assert.ok(Tendril(pat).match(empty).hasMatch());
  assert.ok(Tendril(pat).match(ok).hasMatch());
  assert.ok(!Tendril(pat).match(bad).hasMatch());
});

test('CW14: categorization iterates all matching keys', () => {
  const data = {a:1, b:1, c:1};

  const sol = Tendril("{ /[abc]/:1->@all }")
    .match(data)
    .solutions()
    .first();

  assert.deepEqual(sol.all, {a:1, b:1, c:1});
});

// ==================== Nested Maps Tests ====================

// FIXED: Expect undefined for unpopulated buckets, not {}
test('CW14: nested maps — categorize inner kv pairs per outer record', () => {
  const data = {
    row1: {a: 1, b: 2, c: 1},
    row2: {a: 2, d: 2}
  };

  const pat = `{
    (row1|row2 as $row): {
      $k: (1->@ones else 2->@twos else _->@rest)
    }
  }`;

  const sols = Tendril(pat).match(data).solutions().toArray();

  // One solution per $row witness
  const byRow = Object.fromEntries(sols.map(s => [s.row, s]));

  assert.deepEqual(byRow.row1.ones, {a:1, c:1});
  assert.deepEqual(byRow.row1.twos, {b:2});
  assert.strictEqual(byRow.row1.rest, undefined);  // No "rest" values in row1

  assert.strictEqual(byRow.row2.ones, undefined);  // No 1s in row2
  assert.deepEqual(byRow.row2.twos, {a:2, d:2});
  assert.strictEqual(byRow.row2.rest, undefined);  // No "rest" values in row2
});

// FIXED: Use correct value-pattern syntax
test('CW14: nested maps — bucket whole sub-objects based on their contents', () => {
  const data = {
    u1: {profile: {role: "admin"}},
    u2: {profile: {role: "user"}},
    u3: {profile: {role: "admin"}}
  };

  const sol = Tendril(`{
    $k: ({ profile:{ role: admin } }->@admins else _->@others)
  }`).match(data).solutions().first();

  assert.deepEqual(sol.admins, {
    u1: {profile:{role:"admin"}},
    u3: {profile:{role:"admin"}}
  });
  assert.deepEqual(sol.others, {
    u2: {profile:{role:"user"}}
  });
});

// ==================== Backtracking / Rollback Tests ====================

// Flow inside arrays uses outer key; same key+same value is deduplicated
test('CW14: bucket rollback when array * backtracks (no ghost kvs)', () => {
  const data = {
    k: [ {t:1}, {t:1}, {t:2} ]   // forces backtracking for the * below
  };

  // Explanation:
  // - Greedy ({t:1})* will first try to eat both {t:1} items.
  // - Then it must match {t:1} {t:2} — which fails (only {t:2} remains),
  //   so it backtracks to eat only ONE {t:1}.
  // Bucket @ones should end up containing exactly ONE witness.
  const sol = Tendril(`{
    k: [
      ({t:1} as $x)*
      ({t:1}->@ones)
      {t:2}
    ]
  }`).match(data).solutions().first();

  // The bucket key is 'k' (from the outer K:V), value is the matched {t:1}
  assert.deepEqual(sol.ones, {k: {t:1}});
});

// ==================== CW 15: Seq in Alternation ====================
// Tests for Seq nodes inside alternation branches (now fixed).

test('CW15: Seq in Alt - first branch succeeds', () => {
  const data = {box: [ {kind:"A"}, {kind:"B"} ]};

  // Branch 1: matches {kind:"A"} (flows it), then {kind:"B"} - succeeds
  // Branch 2: tries {kind:"B"} at index 0 which is {kind:"A"} - fails
  const pat = `{
    box: [
      ({kind:"A"}->@picked {kind:"B"})
      |
      ({kind:"B"}->@picked)
    ]
  }`;

  const sol = Tendril(pat).match(data).solutions().first();
  assert.deepEqual(sol.picked, {box: {kind:"A"}});
});

test('CW15: fallback to second branch when first fails', () => {
  const data = {k: [ {p:1}, {q:2} ]};

  // Branch 1: {p:1}->{r:3} fails because arr[1] is {q:2} not {r:3}
  // Branch 2: {p:1} succeeds, flows to @seen, then {q:2} matches
  const pat = `{
    k: [
      ({p:1}->@seen {r:3})
      |
      ({p:1}->@seen)
      ,
      {q:2}
    ]
  }`;

  const sol = Tendril(pat).match(data).solutions().first();
  assert.deepEqual(sol.seen, {k: {p:1}});
});

// ==================== Working Rollback Tests (no Seq in Alt) ====================

// Test bucket rollback using object value alternation (avoids Seq nodes)
test('CW14: bucket rollback - losing value branch does not pour', () => {
  // Pattern tries to match [{x:1}] first, else [{x:2}]
  const data = {
    k1: [{x:2}],  // first branch fails, second succeeds
    k2: [{x:1}]   // first branch succeeds
  };

  const sol = Tendril(`{
    $k: ([{x:1}]->@ones else [{x:2}]->@twos)
  }`).match(data).solutions().first();

  assert.deepEqual(sol.ones, {k2: [{x:1}]});
  assert.deepEqual(sol.twos, {k1: [{x:2}]});
});

// Flow inside arrays uses outer key; same key+same value is deduplicated
test('CW14: greedy * backtracking does not leave ghost bucket entries', () => {
  const data = {
    items: [1, 1, 1, 2]  // greedy * will try to eat all 1s, must backtrack
  };

  // Greedy (1)* tries to eat [1,1,1], then must match 1->@last, 2
  // That fails (only 2 left), so backtrack to eat [1,1], match 1->@last, 2
  const sol = Tendril(`{
    items: [(1 as $x)* (1->@last) 2]
  }`).match(data).solutions().first();

  // Only ONE 1 should be in @last (the third 1), not multiple from retry paths
  assert.deepEqual(sol.last, {items: 1});
});

console.log('\n[cw4-cw14-conformance] Test suite defined\n');
