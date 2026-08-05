import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { StateArbiter } from '../src/main/sources/stateArbiter.js';
import type { StateEvent } from '@shared/protocol.js';

function collect(arbiter: StateArbiter): StateEvent[] {
  const seen: StateEvent[] = [];
  arbiter.on('state', (event) => seen.push(event));
  return seen;
}

test('a higher-confidence source wins over a fresher low-confidence one', () => {
  const arbiter = new StateArbiter();
  const seen = collect(arbiter);

  arbiter.submit({ source: 'tool', state: 'executing', label: 'Running tests…', ts: Date.now() });
  arbiter.submit({ source: 'log', state: 'reading', label: 'Reading…', ts: Date.now() });

  assert.equal(seen.length, 1);
  assert.equal(arbiter.state.state, 'executing');
});

test('a low-confidence source takes over once the higher one goes stale', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'] });
  const arbiter = new StateArbiter();

  arbiter.submit({ source: 'tool', state: 'executing', label: 'Running…', ts: Date.now() });
  t.mock.timers.tick(7_000);
  arbiter.submit({ source: 'log', state: 'reading', label: 'Reading…', ts: Date.now() });

  assert.equal(arbiter.state.state, 'reading');
});

test('executing is promoted to working once it outlives the threshold', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'] });
  const arbiter = new StateArbiter();
  const seen = collect(arbiter);
  arbiter.start();

  arbiter.submit({
    source: 'tool',
    state: 'executing',
    label: 'npm install…',
    task: 'installing',
    ts: Date.now(),
  });
  t.mock.timers.tick(9_000);

  const promoted = seen.at(-1);
  assert.equal(promoted?.state, 'working');
  // The promotion is the same task, not a new one.
  assert.equal(promoted?.label, 'npm install…');
  assert.equal(promoted?.task, 'installing');
  arbiter.stop();
});

test('a terminal state holds, then returns to idle', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'] });
  const arbiter = new StateArbiter();
  arbiter.start();

  arbiter.submit({ source: 'tool', state: 'success', label: 'Finished', ts: Date.now() });
  t.mock.timers.tick(2_000);
  assert.equal(arbiter.state.state, 'success');

  t.mock.timers.tick(3_000);
  assert.equal(arbiter.state.state, 'idle');
  arbiter.stop();
});

test('an unrefreshed state decays rather than being claimed forever', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'] });
  const arbiter = new StateArbiter();
  arbiter.start();

  arbiter.submit({ source: 'log', state: 'reading', label: 'Reading…', ts: Date.now() });
  t.mock.timers.tick(46_000);

  assert.equal(arbiter.state.state, 'idle');
  arbiter.stop();
});

test('losing focus for long enough goes to sleep, and regaining it wakes up', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'] });
  const arbiter = new StateArbiter();
  arbiter.start();

  arbiter.setClaudeFocused(false);
  t.mock.timers.tick(95_000);
  assert.equal(arbiter.state.state, 'sleeping');

  arbiter.setClaudeFocused(true);
  assert.equal(arbiter.state.state, 'idle');
  arbiter.stop();
});

test('identical events are not republished', () => {
  const arbiter = new StateArbiter();
  const seen = collect(arbiter);
  const event = { source: 'tool', state: 'reading', label: 'Reading…', ts: 1 } as const;

  arbiter.submit({ ...event });
  arbiter.submit({ ...event, ts: 2 });

  assert.equal(seen.length, 1);
});

mock.reset();
