import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseStateEvent } from '@shared/protocol.js';

test('accepts a well-formed event', () => {
  const event = parseStateEvent({
    state: 'reading',
    label: 'Reading project…',
    task: 'Scanning files',
    progress: 0.5,
    meta: { files: 12, tool: 'read_file' },
    ts: 1700000000000,
  });

  assert.equal(event?.state, 'reading');
  assert.equal(event?.progress, 0.5);
  assert.equal(event?.meta?.files, 12);
  assert.equal(event?.ts, 1700000000000);
});

test('rejects unknown states and missing labels', () => {
  assert.equal(parseStateEvent({ state: 'dancing', label: 'x' }), null);
  assert.equal(parseStateEvent({ state: 'idle' }), null);
  assert.equal(parseStateEvent(null), null);
  assert.equal(parseStateEvent('idle'), null);
});

test('omits progress rather than inventing it', () => {
  const event = parseStateEvent({ state: 'working', label: 'Building…' });
  assert.equal(event?.progress, undefined);
  assert.ok(!('progress' in (event as object)));
});

test('clamps progress and drops non-finite numbers', () => {
  assert.equal(parseStateEvent({ state: 'typing', label: 'x', progress: 4 })?.progress, 1);
  assert.equal(parseStateEvent({ state: 'typing', label: 'x', progress: -2 })?.progress, 0);
  assert.equal(parseStateEvent({ state: 'typing', label: 'x', progress: NaN })?.progress, undefined);
});

test('supplies a timestamp when the source omits one', () => {
  const before = Date.now();
  const event = parseStateEvent({ state: 'idle', label: 'Idle' });
  assert.ok(event !== null && event.ts >= before);
});

test('truncates hostile strings instead of rejecting the event', () => {
  const event = parseStateEvent({ state: 'idle', label: 'x'.repeat(5000) });
  assert.equal(event?.label.length, 120);
});

test('drops an empty meta object', () => {
  const event = parseStateEvent({ state: 'idle', label: 'Idle', meta: { nonsense: 1 } });
  assert.equal(event?.meta, undefined);
});
