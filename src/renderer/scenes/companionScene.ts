/**
 * The companion scene: rig, poses, blinking, particles and the painter,
 * assembled into something the loop can drive.
 *
 * It owns *how* the character animates. What it should be animating comes in
 * through `setState`, and nothing below this file knows a state event exists.
 */

import type { StateEvent, StateName } from '@shared/protocol.js';
import { descriptorFor } from '@shared/states.js';
import type { Frame } from '../engine/loop.js';
import type { CompanionScene as CompanionSceneContract } from '../engine/scene.js';
import type { Viewport } from '../engine/surface.js';
import { Blink } from '../rig/blink.js';
import { drawCharacter } from '../rig/draw/character.js';
import { ParticleField } from '../rig/particles.js';
import { POSES } from '../rig/poses.js';
import { Rig, type Pose, type RigValues } from '../rig/rig.js';
import type { Point } from '../rig/draw/primitives.js';

/** Particles rise from just above the head. */
const EMIT_OFFSET_Y = -34;

/** Token rate that counts as "normal" pace when scaling the typing animation. */
const REFERENCE_RATE = 24;

export class CompanionScene implements CompanionSceneContract {
  private readonly rig = new Rig();
  private readonly particles = new ParticleField();
  private readonly blink = new Blink();

  private state: StateName = 'idle';
  private stateEnteredAt = 0;
  private rate = 1;
  private accent = descriptorFor('idle').accent;
  private motion = 1;
  private elapsed = 0;
  private emitOrigin: Point = { x: 0, y: 0 };

  setAccent(accent: string): void {
    this.accent = accent;
  }

  setMotion(motion: number): void {
    this.motion = motion;
  }

  setState(event: StateEvent): void {
    if (event.state !== this.state) {
      this.state = event.state;
      this.stateEnteredAt = this.elapsed;
      this.particles.setKind(descriptorFor(event.state).particles ?? null);
    }
    // A source that reports a rate drives the paws; otherwise assume normal pace.
    this.rate = event.rate === undefined ? 1 : clampRate(event.rate / REFERENCE_RATE);
  }

  update(frame: Frame): void {
    this.elapsed = frame.time;

    const target = this.rig.beginPose();
    const pose = POSES[this.state]({
      time: frame.time,
      stateTime: frame.time - this.stateEnteredAt,
      rate: this.rate,
    });
    applyPose(target, pose);

    // Blinking sits underneath every state rather than inside the pose table.
    target.lid = Math.max(target.lid, this.blink.update(frame.dt));

    this.rig.update(frame.dt, this.motion);
    this.particles.update(frame.dt, this.emitOrigin, this.motion);
  }

  draw(ctx: CanvasRenderingContext2D, view: Viewport, frame: Frame): void {
    const anchors = drawCharacter(ctx, view, {
      rig: this.rig.present,
      time: frame.time,
      motion: this.motion,
      accent: this.accent,
    });

    this.emitOrigin = { x: anchors.head.x, y: anchors.head.y + EMIT_OFFSET_Y };
    this.particles.draw(ctx);
  }

  destroy(): void {
    this.particles.clear();
  }
}

function applyPose(target: RigValues, pose: Pose): void {
  for (const key of Object.keys(pose) as (keyof RigValues)[]) {
    const value = pose[key];
    if (value !== undefined) target[key] = value;
  }
}

const clampRate = (rate: number): number =>
  !Number.isFinite(rate) || rate <= 0 ? 1 : Math.min(2.5, Math.max(0.3, rate));
