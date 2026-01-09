/**
 * Debug Hooks Tests
 *
 * Tests for the debug listener hooks that allow observing
 * the matching process.
 *
 * Run with: node --test test/debug-hooks.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tendril } from '../src/tendril-api.js';

test('debug hooks capture enter/exit/bind events', () => {
  const events = [];

  const debugListener = {
    onEnter: (type, node, path) => {
      events.push({event: 'enter', type, node, path: [...path]});
    },
    onExit: (type, node, path, matched) => {
      events.push({event: 'exit', type, matched, path: [...path]});
    },
    onBind: (kind, varName, value) => {
      events.push({event: 'bind', kind, varName, value});
    }
  };

  const t = Tendril('$x').debug(debugListener);
  const result = t.match(42);

  assert.ok(result.hasMatch(), 'Should match');

  // Check that we captured events
  assert.ok(events.length > 0, 'Should have captured events');

  // Check for enter events
  const enterEvents = events.filter(e => e.event === 'enter');
  assert.ok(enterEvents.length > 0, 'Should have enter events');

  // Check for exit events
  const exitEvents = events.filter(e => e.event === 'exit');
  assert.ok(exitEvents.length > 0, 'Should have exit events');

  // Check for bind events
  const bindEvents = events.filter(e => e.event === 'bind');
  assert.ok(bindEvents.length > 0, 'Should have bind events');

  // The bind event should capture x = 42
  const xBind = bindEvents.find(e => e.varName === 'x');
  assert.ok(xBind, 'Should bind x');
  assert.equal(xBind.value, 42);
});

test('debug hooks on complex pattern', () => {
  const events = [];

  const debugListener = {
    onEnter: (type) => events.push({event: 'enter', type}),
    onExit: (type, node, path, matched) => events.push({event: 'exit', type, matched}),
    onBind: (kind, varName, value) => events.push({event: 'bind', kind, varName, value})
  };

  const t = Tendril('{a: $x, b: $y}').debug(debugListener);
  const result = t.match({a: 1, b: 2});

  assert.ok(result.hasMatch());

  // Should have bound both x and y
  const binds = events.filter(e => e.event === 'bind');
  const varNames = binds.map(b => b.varName).sort();
  assert.ok(varNames.includes('x'));
  assert.ok(varNames.includes('y'));
});

console.log('\n[debug-hooks] Test suite defined\n');
