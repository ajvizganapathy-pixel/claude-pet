import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contains } from '../src/renderer/input/hitTest.js';
import { allowsCompanion } from '../src/main/platform/foregroundWatcher.js';

const rect = { x: 100, y: 50, width: 200, height: 120 };

test('hit testing accepts points inside and on the edge', () => {
  assert.equal(contains(rect, 200, 100), true);
  assert.equal(contains(rect, 100, 50), true);
  assert.equal(contains(rect, 300, 170), true);
});

test('hit testing rejects points outside', () => {
  assert.equal(contains(rect, 99, 100), false);
  assert.equal(contains(rect, 301, 100), false);
  assert.equal(contains(rect, 200, 49), false);
  assert.equal(contains(rect, 200, 171), false);
});

test('padding grows the region symmetrically', () => {
  assert.equal(contains(rect, 95, 100, 6), true);
  assert.equal(contains(rect, 93, 100, 6), false);
});

test('an unknown foreground owner keeps the companion visible', () => {
  // Hiding the overlay because a Win32 query failed is worse than showing it
  // for a moment too long, so only a confirmed other app hides it.
  assert.equal(allowsCompanion('unknown'), true);
  assert.equal(allowsCompanion('claude'), true);
  assert.equal(allowsCompanion('self'), true);
  assert.equal(allowsCompanion('other'), false);
});
