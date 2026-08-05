/**
 * Reactions to the user, layered on top of whatever state is playing.
 *
 * These are overrides rather than a pose: the companion keeps doing its job
 * while it looks at you. The influence fades in and out on its own weight so
 * the head does not snap to the cursor the instant it arrives.
 */

import { clamp, damp, lerp } from '../engine/math.js';
import type { Viewport } from '../engine/surface.js';
import type { RigValues } from './rig.js';

/** How quickly attention is given and withdrawn. */
const ATTENTION_RATE = 6;
/** A poke decays over roughly this many seconds. */
const POKE_DECAY = 1.6;

/** Where the character's eyeline sits in the viewport, as a fraction. */
const EYELINE = { x: 0.62, y: 0.62 };

export class Reactions {
  private pointer: { x: number; y: number } | null = null;
  private attention = 0;
  private poke = 0;

  /** Canvas-space cursor position, or null when the cursor has left. */
  setPointer(point: { x: number; y: number } | null): void {
    this.pointer = point;
  }

  /** A click: a quick perk-up that decays on its own. */
  triggerPoke(): void {
    this.poke = 1;
  }

  get isActive(): boolean {
    return this.attention > 0.001 || this.poke > 0;
  }

  update(dt: number): void {
    this.attention = damp(this.attention, this.pointer ? 1 : 0, ATTENTION_RATE, dt);
    if (this.poke > 0) this.poke = Math.max(0, this.poke - dt * POKE_DECAY);
  }

  /** Applies the overrides to an already-blended pose. */
  apply(target: RigValues, view: Viewport): void {
    if (this.pointer && this.attention > 0.001) {
      const dx = (this.pointer.x - view.width * EYELINE.x) / (view.width * 0.5);
      const dy = (this.pointer.y - view.height * EYELINE.y) / (view.height * 0.5);
      const w = this.attention;

      target.eyeX = lerp(target.eyeX, clamp(dx * 1.6, -1.6, 1.6), w);
      target.eyeY = lerp(target.eyeY, clamp(dy * 1.2, -1.2, 1.2), w);
      target.headYaw = lerp(target.headYaw, clamp(dx * 0.4, -0.5, 0.5), w);
      target.headPitch = lerp(target.headPitch, clamp(dy * 0.35, -0.4, 0.4), w);
      // Being watched softens the face and wakes the tail.
      target.mouth = Math.max(target.mouth, 0.22 * w);
      target.brow = lerp(target.brow, Math.min(target.brow, 0.1), w);
      target.tailAmp = Math.max(target.tailAmp, 0.4 * w);
      target.tailSpeed = Math.max(target.tailSpeed, lerp(target.tailSpeed, 2.6, w));
    }

    if (this.poke > 0) {
      const p = this.poke;
      target.earA += 0.5 * p;
      target.earB += 0.45 * p;
      target.crouch -= 0.5 * p;
      target.headTilt += 0.25 * p;
      target.mouth = Math.max(target.mouth, 0.4 * p);
    }
  }
}
