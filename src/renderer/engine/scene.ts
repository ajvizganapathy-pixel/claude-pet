/**
 * The contract between the loop and whatever is being drawn.
 *
 * Update and draw are kept separate so simulation stays independent of
 * painting: the rig damps its channels in `update`, and `draw` is a pure
 * function of the resulting values.
 */

import type { Frame } from './loop.js';
import type { Viewport } from './surface.js';

export interface Scene {
  update(frame: Frame): void;
  draw(ctx: CanvasRenderingContext2D, view: Viewport, frame: Frame): void;
  /** Optional teardown for scenes that hold listeners or caches. */
  destroy?(): void;
}

/**
 * A scene that represents the companion. The app configures these three
 * presentation inputs; everything else the scene derives for itself.
 */
export interface CompanionScene extends Scene {
  setAccent(hex: string): void;
  /** Global motion multiplier, already adjusted for reduced-motion. */
  setMotion(motion: number): void;
  setScale(scale: number): void;
}
