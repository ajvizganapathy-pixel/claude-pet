import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clamp01, damp, hexAlpha, smoothstep, springPulse } from '../src/renderer/engine/math.js';

test('damp converges toward the target without overshooting', () => {
  let value = 0;
  for (let i = 0; i < 200; i += 1) value = damp(value, 10, 7, 1 / 60);
  assert.ok(value > 9.99 && value <= 10);
});

test('damp is frame-rate independent', () => {
  // The whole rig depends on this: the same motion at 30, 60 and 144 FPS.
  const settle = (steps: number, dt: number): number => {
    let value = 0;
    for (let i = 0; i < steps; i += 1) value = damp(value, 1, 7, dt);
    return value;
  };

  const at30 = settle(15, 1 / 30);
  const at60 = settle(30, 1 / 60);
  const at144 = settle(72, 1 / 144);

  assert.ok(Math.abs(at30 - at60) < 1e-9);
  assert.ok(Math.abs(at60 - at144) < 1e-9);
});

test('smoothstep is flat at both ends and clamped outside 0..1', () => {
  assert.equal(smoothstep(0), 0);
  assert.equal(smoothstep(1), 1);
  assert.equal(smoothstep(-5), 0);
  assert.equal(smoothstep(5), 1);
  assert.ok(smoothstep(0.5) === 0.5);
});

test('springPulse decays to nothing', () => {
  assert.equal(springPulse(0, 6, 1.1), 0);
  assert.ok(springPulse(0.3, 6, 1.1) > 0);
  assert.ok(springPulse(12, 6, 1.1) < 1e-4);
});

test('clamp01 and hexAlpha behave for edge input', () => {
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(2), 1);
  assert.equal(hexAlpha('#7E9CC4', 0.5), 'rgba(126,156,196,0.5)');
  assert.equal(hexAlpha('not-a-colour', 1), 'rgba(255,255,255,1)');
});
