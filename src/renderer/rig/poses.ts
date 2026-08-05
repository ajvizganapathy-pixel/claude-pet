/**
 * The behavioural surface of the companion: one pose per state.
 *
 * A pose is a pure function from time to rig channel values. It contains no
 * drawing, no DOM and no knowledge of the state machine, which is what makes
 * "add an expression" mean "add one entry here".
 *
 * Ported from the prototype's STATES table; the differences are deliberate:
 * gait and scratching became blendable channels rather than name checks, and
 * `typing` reads its paw speed from the event's token rate.
 */

import { springPulse } from '../engine/math.js';
import type { StateName } from '@shared/protocol.js';
import type { Pose } from './rig.js';

export interface PoseContext {
  /** Seconds since the scene started — the clock for cyclic motion. */
  time: number;
  /** Seconds since this state was entered — the clock for one-shot motion. */
  stateTime: number;
  /**
   * Activity rate reported by the state source (tokens/sec or similar),
   * normalised to roughly 1 for a typical pace. Unknown rates arrive as 1.
   */
  rate: number;
}

export type PoseFn = (context: PoseContext) => Pose;

export const POSES: Record<StateName, PoseFn> = {
  idle: ({ time }) => ({
    tailAmp: 0.2,
    tailSpeed: 1.0,
    // An occasional settle, so idle is not a perfectly repeating loop.
    crouch: Math.sin(time * 0.31) * 0.5 + 0.5 > 0.82 ? 1 : 0,
    headYaw: Math.sin(time * 0.23) * 0.22,
    headPitch: Math.sin(time * 0.17) * 0.1,
    earA: Math.sin(time * 0.4) * 0.06,
    earB: -Math.sin(time * 0.37) * 0.05,
    eyeX: Math.sin(time * 0.19) * 0.5,
    eyeY: Math.sin(time * 0.26) * 0.3,
    breathAmp: 1,
  }),

  thinking: ({ time }) => ({
    tailAmp: 0.02,
    tailSpeed: 0.4,
    tailLift: 0.1,
    walkAmp: 0.28,
    driftX: Math.sin(time * 0.45) * 14, // slow pacing
    headPitch: -0.3,
    headTilt: 0.16,
    headYaw: Math.sin(time * 0.45) * 0.1,
    earA: 0.34,
    earB: 0.26,
    eyeX: 0.25,
    eyeY: -0.85, // looking up and away, the way people do when recalling
    brow: 0.35,
    mouth: 0.05,
    glow: 0.5,
    breathAmp: 0.85,
  }),

  reading: ({ time }) => {
    const scan = Math.sin(time * 5.2);
    return {
      tailAmp: 0.06,
      tailSpeed: 1.6,
      headYaw: scan * 0.42,
      headPitch: 0.08,
      headTilt: scan * 0.05,
      eyeX: scan * 1.5,
      eyeY: 0.2,
      earA: Math.sin(time * 7.3) > 0.9 ? 0.4 : 0.08, // occasional flick
      earB: 0.05,
      brow: 0.15,
      glow: 0.15,
      breathAmp: 0.9,
    };
  },

  typing: ({ time, rate }) => ({
    tailAmp: 0.3,
    tailSpeed: 3.4,
    tailLift: 0.12,
    pawAmp: 1,
    pawSpeed: 13 * rate,
    crouch: 0.35,
    headPitch: 0.22,
    headYaw: Math.sin(time * 2.1) * 0.05,
    eyeX: 0.4,
    eyeY: 0.7,
    brow: 0.1,
    mouth: 0.35 + Math.sin(time * 11) * 0.12,
    earA: 0.05,
    earB: -0.02,
    glow: 0.25,
    breathAmp: 1.1,
  }),

  executing: () => ({
    tailAmp: 0.1,
    tailSpeed: 1.2,
    tailLift: 0.85, // tail up: alert, watching the terminal
    driftX: 26,
    headYaw: -0.1,
    headPitch: 0.05,
    earA: 0.3,
    earB: 0.28,
    eyeX: 1.1,
    eyeY: 0.1,
    brow: 0.4,
    mouth: 0.06,
    glow: 0.35,
    breathAmp: 1.05,
  }),

  working: ({ time }) => ({
    tailAmp: 0.12,
    tailSpeed: 1.0,
    tailLift: 0.2,
    pawAmp: 0.55,
    pawSpeed: 4.5,
    crouch: 0.55,
    headPitch: 0.3,
    headYaw: Math.sin(time * 0.8) * 0.12,
    headTilt: Math.sin(time * 0.6) * 0.07,
    eyeX: 0.2,
    eyeY: 0.6,
    brow: 0.3,
    mouth: 0.25,
    earA: -0.08,
    earB: -0.12,
    glow: 0.2,
    breathAmp: 1.25, // heavier breathing sells the effort
  }),

  success: ({ time, stateTime }) => ({
    // A hop that decays on its own, so success celebrates once and settles.
    crouch: -springPulse(stateTime, 6, 1.1) * 1.6,
    tailAmp: 0.55,
    tailSpeed: 7,
    tailLift: 0.5,
    headPitch: -0.16,
    headTilt: Math.sin(time * 5) * 0.07,
    eyeY: -0.2,
    brow: -0.5,
    mouth: 0.55,
    earA: 0.2,
    earB: 0.18,
    glow: 0.9,
    breathAmp: 1.1,
  }),

  error: () => ({
    tailAmp: 0.05,
    tailSpeed: 0.6,
    tailLift: -0.25,
    pawAmp: 0.8,
    pawSpeed: 8,
    scratch: 1,
    crouch: 0.15,
    headTilt: 0.34,
    headPitch: -0.1,
    headYaw: 0.12,
    eyeX: -0.4,
    eyeY: -0.3,
    brow: 0.7,
    mouth: 0.18,
    earA: -0.3,
    earB: -0.26,
    glow: 0.3,
    breathAmp: 0.95,
  }),

  sleeping: () => ({
    tailAmp: 0.05,
    tailSpeed: 0.35,
    tailLift: -0.3,
    crouch: 1.15,
    headPitch: 0.5,
    headYaw: 0.1,
    headTilt: 0.1,
    lid: 1,
    brow: -0.1,
    earA: -0.2,
    earB: -0.18,
    breathAmp: 1.5, // long, slow breaths
  }),
};
