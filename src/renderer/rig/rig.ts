/**
 * The rig: every animated value in the character, in one flat object.
 *
 * Two rules hold the whole thing together:
 *  1. Poses write to `target`; the loop damps `present` toward it. Nothing is
 *     ever assigned directly, or motion snaps and the character reads as cheap.
 *  2. Every expressive difference between states is a *number* here. The
 *     renderer therefore knows nothing about states, and a new expression is
 *     one pose entry rather than a branch in the drawing code.
 */

import { damp } from '../engine/math.js';

export const RIG_CHANNELS = [
  // head
  'headYaw',
  'headPitch',
  'headTilt',
  // ears
  'earA',
  'earB',
  // face
  'eyeX',
  'eyeY',
  'lid',
  'brow',
  'mouth',
  // tail
  'tailAmp',
  'tailSpeed',
  'tailLift',
  // limbs
  'pawAmp',
  'pawSpeed',
  /** Alternating gait used while pacing; 0 keeps the legs planted. */
  'walkAmp',
  /** Front paw pulled in to scratch at the ground. */
  'scratch',
  // body
  'crouch',
  'driftX',
  'breathAmp',
  /** Ambient light in the state's accent colour, 0..1. */
  'glow',
] as const;

export type ChannelName = (typeof RIG_CHANNELS)[number];
export type RigValues = Record<ChannelName, number>;
/** A pose need only mention the channels it cares about. */
export type Pose = Partial<RigValues>;

/** The neutral animal: what every pose is measured against. */
export const REST_POSE: Readonly<RigValues> = Object.freeze({
  headYaw: 0,
  headPitch: 0,
  headTilt: 0,
  earA: 0,
  earB: 0,
  eyeX: 0,
  eyeY: 0,
  lid: 0,
  brow: 0,
  mouth: 0,
  tailAmp: 0.18,
  tailSpeed: 1.1,
  tailLift: 0,
  pawAmp: 0,
  pawSpeed: 0,
  walkAmp: 0,
  scratch: 0,
  crouch: 0,
  driftX: 0,
  breathAmp: 1,
  glow: 0,
});

/**
 * Per-channel damping rates, in units of "per second".
 *
 * Blinks must be near-instant or they read as a droop; horizontal drift is
 * slow because the character is walking, not teleporting. Everything else
 * shares one rate so the body moves as a single animal.
 */
const DEFAULT_RATE = 7;
const RATES: Partial<Record<ChannelName, number>> = {
  lid: 40,
  driftX: 2.2,
  scratch: 12,
};

/** Channels whose damping must not be slowed by the motion multiplier. */
const MOTION_INDEPENDENT: ReadonlySet<ChannelName> = new Set(['lid']);

export class Rig {
  readonly present: RigValues = { ...REST_POSE };
  readonly target: RigValues = { ...REST_POSE };

  /** Resets `target` to rest so a pose can write only what it changes. */
  beginPose(): RigValues {
    for (const channel of RIG_CHANNELS) this.target[channel] = REST_POSE[channel];
    return this.target;
  }

  /**
   * Damps `present` toward `target`.
   *
   * `motion` scales how briskly the character responds, so the motion slider
   * changes the character's energy rather than merely its amplitude. It is
   * floored so that a motion of 0 stills the animation without freezing the
   * rig mid-transition.
   */
  update(dt: number, motion: number): void {
    const responsiveness = Math.max(0.35, motion);
    for (const channel of RIG_CHANNELS) {
      const base = RATES[channel] ?? DEFAULT_RATE;
      const rate = MOTION_INDEPENDENT.has(channel) ? base : base * responsiveness;
      this.present[channel] = damp(this.present[channel], this.target[channel], rate, dt);
    }
  }

  /** Drops `present` onto `target`, used when the overlay wakes from hidden. */
  snap(): void {
    for (const channel of RIG_CHANNELS) this.present[channel] = this.target[channel];
  }
}
