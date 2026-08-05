/**
 * The companion scene: rig, pose machine, reactions, particles and the
 * painter, assembled into something the loop can drive.
 *
 * It owns *how* the character animates. What it should be animating comes in
 * through `setState`, and nothing below this file knows a state event exists.
 */

import type { StateEvent } from '@shared/protocol.js';
import { descriptorFor } from '@shared/states.js';
import type { Frame } from '../engine/loop.js';
import type { CompanionScene as CompanionSceneContract } from '../engine/scene.js';
import type { Viewport } from '../engine/surface.js';
import { Blink } from '../rig/blink.js';
import { drawCharacter } from '../rig/draw/character.js';
import type { Point } from '../rig/draw/primitives.js';
import { ParticleField } from '../rig/particles.js';
import { PoseMachine } from '../rig/poseMachine.js';
import { Reactions } from '../rig/reactions.js';
import { Rig } from '../rig/rig.js';

/** Particles rise from just above the head. */
const EMIT_OFFSET_Y = -34;

/** Token rate that counts as "normal" pace when scaling the typing animation. */
const REFERENCE_RATE = 24;

export class CompanionScene implements CompanionSceneContract {
  private readonly rig = new Rig();
  private readonly machine = new PoseMachine();
  private readonly reactions = new Reactions();
  private readonly particles = new ParticleField();
  private readonly blink = new Blink();

  private elapsed = 0;
  private rate = 1;
  private accent = descriptorFor('idle').accent;
  private motion = 1;
  private viewport: Viewport = { width: 0, height: 0, dpr: 1 };
  private emitOrigin: Point = { x: 0, y: 0 };

  setAccent(accent: string): void {
    this.accent = accent;
  }

  setMotion(motion: number): void {
    this.motion = motion;
  }

  setState(event: StateEvent): void {
    // `transitionTo` is idempotent for the current state, so repeated events
    // for the same state refresh the rate without restarting the animation.
    this.machine.transitionTo(event.state, this.elapsed);
    this.particles.setKind(descriptorFor(event.state).particles ?? null);
    this.rate = event.rate === undefined ? 1 : normaliseRate(event.rate / REFERENCE_RATE);
  }

  /** Canvas-space pointer position, or null when the cursor leaves. */
  setPointer(point: Point | null): void {
    this.reactions.setPointer(point);
  }

  poke(): void {
    this.reactions.triggerPoke();
  }

  update(frame: Frame): void {
    this.elapsed = frame.time;

    this.machine.update(frame.dt);
    this.reactions.update(frame.dt);

    const target = this.rig.beginPose();
    this.machine.evaluate(target, { time: frame.time, rate: this.rate });
    this.reactions.apply(target, this.viewport);

    // Blinking sits underneath every state rather than inside the pose table.
    target.lid = Math.max(target.lid, this.blink.update(frame.dt));

    this.rig.update(frame.dt, this.motion);
    this.particles.update(frame.dt, this.emitOrigin, this.motion);
  }

  draw(ctx: CanvasRenderingContext2D, view: Viewport, frame: Frame): void {
    this.viewport = view;

    const anchors = drawCharacter(ctx, view, {
      rig: this.rig.present,
      time: frame.time,
      motion: this.motion,
      accent: this.accent,
    });

    this.emitOrigin = { x: anchors.head.x, y: anchors.head.y + EMIT_OFFSET_Y };
    this.particles.draw(ctx);
  }

  /**
   * Canvas-space bounding box of the character, used by the overlay to decide
   * where the window should stop being click-through.
   */
  silhouetteBounds(view: Viewport): { x: number; y: number; width: number; height: number } {
    return characterBounds(view, this.rig.present.driftX);
  }

  destroy(): void {
    this.particles.clear();
  }
}

/**
 * The character occupies a known slice of the viewport; deriving the box from
 * the same constants the painter uses keeps hit-testing honest without
 * reading pixels back from the GPU.
 */
function characterBounds(
  view: Viewport,
  driftX: number,
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(view.width / 360, view.height / 340);
  const centreX = view.width / 2 + driftX * scale;
  const floorY = view.height - 48 * scale;

  // Design-space extents of the drawn body, with a little slack for the tail.
  const left = -132 * scale;
  const right = 78 * scale;
  const top = -128 * scale;
  const bottom = 8 * scale;

  return {
    x: centreX + left,
    y: floorY + top,
    width: right - left,
    height: bottom - top,
  };
}

const normaliseRate = (rate: number): number =>
  !Number.isFinite(rate) || rate <= 0 ? 1 : Math.min(2.5, Math.max(0.3, rate));
