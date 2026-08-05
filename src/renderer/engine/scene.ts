/**
 * The contract between the loop and whatever is being drawn.
 *
 * Update and draw are kept separate so simulation stays independent of
 * painting: the rig damps its channels in `update`, and `draw` is a pure
 * function of the resulting values.
 */

import type { StateEvent } from '@shared/protocol.js';
import type { Frame } from './loop.js';
import type { Viewport } from './surface.js';

export interface Scene {
  update(frame: Frame): void;
  draw(ctx: CanvasRenderingContext2D, view: Viewport, frame: Frame): void;
  /** Optional teardown for scenes that hold listeners or caches. */
  destroy?(): void;
}

/**
 * A scene that represents the companion. The app hands it presentation inputs
 * and the current state; everything else the scene derives for itself.
 *
 * There is no scale input: the character auto-fits the viewport, and the
 * user's scale setting resizes the window, which resizes the viewport.
 */
export interface CompanionScene extends Scene {
  setAccent(hex: string): void;
  /** Global motion multiplier, already adjusted for reduced-motion. */
  setMotion(motion: number): void;
  setState(event: StateEvent): void;
}
