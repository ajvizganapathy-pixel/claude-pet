import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PoseMachine } from '../src/renderer/rig/poseMachine.js';
import { POSES } from '../src/renderer/rig/poses.js';
import { REST_POSE, type RigValues } from '../src/renderer/rig/rig.js';

const buffer = (): RigValues => ({ ...REST_POSE });

/** Runs the machine forward, returning the blended pose at the end. */
function settle(machine: PoseMachine, seconds: number, time = 0): RigValues {
  const dt = 1 / 60;
  const target = buffer();
  for (let t = 0; t < seconds; t += dt) {
    machine.update(dt);
    machine.evaluate(target, { time: time + t, rate: 1 });
  }
  return target;
}

test('starts idle and settled', () => {
  const machine = new PoseMachine();
  assert.equal(machine.current, 'idle');
  assert.equal(machine.isSettled, true);
});

test('a transition crossfades rather than snapping', () => {
  const machine = new PoseMachine();
  machine.transitionTo('sleeping', 0);

  const midway = settle(machine, 0.12);
  const sleeping = POSES.sleeping({ time: 0.12, stateTime: 0.12, rate: 1 });

  // Part-way through, the blend must sit between the two poses.
  assert.ok(midway.crouch > REST_POSE.crouch);
  assert.ok(midway.crouch < (sleeping.crouch ?? 0));
  assert.equal(machine.isSettled, false);
});

test('a transition completes and prunes its outgoing layer', () => {
  const machine = new PoseMachine();
  machine.transitionTo('sleeping', 0);
  const settled = settle(machine, 2);

  assert.equal(machine.current, 'sleeping');
  assert.equal(machine.isSettled, true);
  assert.ok(Math.abs(settled.crouch - 1.15) < 1e-6);
});

test('channels a pose omits fall back to rest, not to the previous state', () => {
  const machine = new PoseMachine();
  machine.transitionTo('executing', 0); // sets driftX 26
  settle(machine, 2);
  machine.transitionTo('reading', 2); // mentions no driftX
  const settled = settle(machine, 2, 2);

  assert.ok(Math.abs(settled.driftX - REST_POSE.driftX) < 1e-6);
});

test('rapid state changes stay bounded and land on the last state', () => {
  const machine = new PoseMachine();
  for (const state of ['thinking', 'reading', 'typing', 'executing', 'error'] as const) {
    machine.transitionTo(state, 0);
    settle(machine, 0.03);
  }
  const settled = settle(machine, 3);

  assert.equal(machine.current, 'error');
  assert.equal(machine.isSettled, true);
  // The blend must never leave a channel outside the range its poses define.
  assert.ok(Math.abs(settled.brow - 0.7) < 1e-6);
});

test('re-entering a fading state reuses its layer instead of stacking', () => {
  const machine = new PoseMachine();
  machine.transitionTo('typing', 0);
  settle(machine, 0.05);
  machine.transitionTo('idle', 0.05);
  settle(machine, 0.05);
  machine.transitionTo('typing', 0.1);
  const settled = settle(machine, 2, 0.1);

  assert.equal(machine.current, 'typing');
  assert.equal(machine.isSettled, true);
  assert.ok(Math.abs(settled.crouch - 0.35) < 1e-6);
});

test('the same state twice is a no-op', () => {
  const machine = new PoseMachine();
  machine.transitionTo('working', 0);
  settle(machine, 2);
  machine.transitionTo('working', 2);
  assert.equal(machine.isSettled, true);
});
