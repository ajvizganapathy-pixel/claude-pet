import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SETTINGS, normaliseSettings } from '@shared/settings.js';

test('returns defaults for junk input', () => {
  assert.deepEqual(normaliseSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(normaliseSettings('nonsense'), DEFAULT_SETTINGS);
  assert.deepEqual(normaliseSettings({ unknown: true }), DEFAULT_SETTINGS);
});

test('clamps out-of-range numbers into the supported window', () => {
  const settings = normaliseSettings({ scale: 99, motion: -4, frameRateCap: 1000 });
  assert.equal(settings.scale, 1.6);
  assert.equal(settings.motion, 0);
  assert.equal(settings.frameRateCap, 144);
});

test('treats a patch as an overlay on the current settings', () => {
  const base = normaliseSettings({ scale: 1.2, showTaskPanel: false });
  const patched = normaliseSettings({ motion: 0.5 }, base);
  assert.equal(patched.scale, 1.2);
  assert.equal(patched.showTaskPanel, false);
  assert.equal(patched.motion, 0.5);
});

test('accepts a valid position and rejects a malformed one', () => {
  assert.deepEqual(normaliseSettings({ position: { x: 10.4, y: -3.6 } }).position, {
    x: 10,
    y: -4,
  });
  assert.equal(normaliseSettings({ position: { x: 'left' } }).position, null);
  assert.equal(normaliseSettings({ position: { x: Infinity, y: 0 } }).position, null);
});

test('an explicit null position clears a stored one', () => {
  const base = normaliseSettings({ position: { x: 10, y: 10 } });
  assert.equal(normaliseSettings({ position: null }, base).position, null);
  // ...while an absent key preserves it.
  assert.deepEqual(normaliseSettings({ motion: 1 }, base).position, { x: 10, y: 10 });
});

test('falls back to the base value for invalid enums', () => {
  const base = normaliseSettings({ anchor: 'top-left' });
  assert.equal(normaliseSettings({ anchor: 'middle' }, base).anchor, 'top-left');
  assert.equal(normaliseSettings({ logLevel: 'loud' }).logLevel, DEFAULT_SETTINGS.logLevel);
});

test('sound stays off unless explicitly enabled', () => {
  assert.equal(DEFAULT_SETTINGS.sound, false);
  assert.equal(normaliseSettings({ sound: 'yes' }).sound, false);
  assert.equal(normaliseSettings({ sound: true }).sound, true);
});
