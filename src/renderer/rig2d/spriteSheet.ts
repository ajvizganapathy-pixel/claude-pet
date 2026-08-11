/**
 * Loads the baked character sheet and draws one frame of one clip.
 *
 * Nothing here knows about states, poses or time — it is a grid of images and
 * an index into it. Choosing the clip is `clipForState`'s job, and advancing
 * the index is `SpritePlayer`'s.
 */

import { FRAME_SIZE, type SpriteClip } from './sheetManifest.js';

export class SpriteSheet {
  private constructor(private readonly image: HTMLImageElement) {}

  /**
   * Resolves once the sheet has decoded, and rejects if it cannot be reached.
   * Callers are expected to have a fallback: a missing sheet must degrade, not
   * leave a blank overlay with nothing in the log.
   */
  static async load(url: string): Promise<SpriteSheet> {
    const image = new Image();
    image.src = url;
    // `decode` rather than the load event: it resolves after the bitmap is
    // ready to paint, so the first drawn frame is never a blank.
    await image.decode();
    return new SpriteSheet(image);
  }

  /**
   * Blits one frame into a square of `size` at (dx, dy).
   *
   * `frame` is clamped rather than wrapped: wrapping would silently paper over
   * a clip table that disagrees with the sheet it was generated from.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    clip: SpriteClip,
    frame: number,
    dx: number,
    dy: number,
    size: number,
  ): void {
    const index = frame < 0 ? 0 : frame >= clip.frames ? clip.frames - 1 : frame;
    ctx.drawImage(
      this.image,
      index * FRAME_SIZE,
      clip.row * FRAME_SIZE,
      FRAME_SIZE,
      FRAME_SIZE,
      dx,
      dy,
      size,
      size,
    );
  }
}

/**
 * Advances a clip's frame index over time.
 *
 * Held separately from the sheet so the timing rules — rate scaling, one-shot
 * completion, holding still at zero motion — are testable without a canvas.
 */
export class SpritePlayer {
  private clip: SpriteClip | null = null;
  private clock = 0;

  get current(): SpriteClip | null {
    return this.clip;
  }

  /** True once a non-looping clip has reached its final frame. */
  get finished(): boolean {
    const clip = this.clip;
    if (!clip || clip.loop !== false) return false;
    return this.clock * clip.fps >= clip.frames - 1;
  }

  /** Restarting the clip already playing is a no-op, so repeated state events
   *  for the same state do not stutter the animation back to frame zero. */
  play(clip: SpriteClip, { restart = false } = {}): void {
    if (this.clip?.name === clip.name && !restart) {
      this.clip = clip;
      return;
    }
    this.clip = clip;
    this.clock = 0;
  }

  /** `speed` folds in the motion multiplier and any per-state rate scaling. */
  advance(dt: number, speed: number): void {
    if (!this.clip || speed <= 0) return;
    this.clock += dt * speed;
  }

  /** The frame to draw: wrapped for looping clips, held for one-shots. */
  get frame(): number {
    const clip = this.clip;
    if (!clip) return 0;
    const raw = Math.floor(this.clock * clip.fps);
    if (clip.loop === false) return Math.min(raw, clip.frames - 1);
    return ((raw % clip.frames) + clip.frames) % clip.frames;
  }

  /** How many times a looping clip has come back round to frame zero. */
  get loops(): number {
    const clip = this.clip;
    if (!clip || clip.loop === false) return 0;
    return Math.floor((this.clock * clip.fps) / clip.frames);
  }
}
