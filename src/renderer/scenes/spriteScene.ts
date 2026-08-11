/**
 * The sprite companion scene: the baked cartoon cat, played from a sheet.
 *
 * It implements the same `CompanionScene` contract the procedural rig does, so
 * the app, the state protocol and the hit-testing above it are untouched —
 * state events arrive through `setState` and turn into a clip.
 *
 * Two things are still damped rather than baked, because they depend on inputs
 * the sheet cannot know at bake time: the lean towards the cursor and the
 * ground glow's colour. Everything else is a frame index.
 *
 * The procedural rig stands in until the sheet has decoded, and stays if it
 * never does. It needs no assets, so there is no moment — at startup or after a
 * missing file — where the overlay is simply blank.
 */

import type { StateEvent } from '@shared/protocol.js';
import { descriptorFor } from '@shared/states.js';
import type { Frame } from '../engine/loop.js';
import type { CompanionScene as CompanionSceneContract } from '../engine/scene.js';
import type { Viewport } from '../engine/surface.js';
import { clipForState, isIdleVariant, pickIdleVariant, POKE_CLIP } from '../rig2d/clipForState.js';
import { clipByName } from '../rig2d/sheetManifest.js';
import { SpritePlayer, SpriteSheet } from '../rig2d/spriteSheet.js';
import { CompanionScene } from './companionScene.js';

/** Resolved against the bundle, not the page, so any host page works. */
const SHEET_URL = new URL('assets/cat-sheet.png', import.meta.url).href;

/** Token rate that counts as "normal" pace when scaling the typing clip. */
const REFERENCE_RATE = 24;

/** Share of the viewport height kept clear above the character for the bubble. */
const BUBBLE_HEADROOM = 0.12;

/** The character's extent inside its frame, measured from the artwork. */
const SILHOUETTE = { x0: 0.08, y0: 0.03, x1: 0.95, y1: 0.96 };

/** How far the character leans towards the cursor, as a share of its size. */
const LEAN_X = 0.045;
const LEAN_Y = 0.022;

/** Seconds for the lean to cover most of the distance to its target. */
const LEAN_DAMPING = 6;

export class SpriteScene implements CompanionSceneContract {
  private sheet: SpriteSheet | null = null;
  /**
   * Draws until the sheet is ready. Every input is forwarded to it while it
   * exists, so it is always current and there is nothing to replay if the sheet
   * never arrives.
   */
  private standIn: CompanionScene | null = new CompanionScene();
  private disposed = false;

  private readonly player = new SpritePlayer();
  /** The clip the current state wants, which `poke` temporarily overrides. */
  private stateClip = clipForState('idle');
  private poking = false;

  private state: StateEvent['state'] = 'idle';
  private accent = descriptorFor('idle').accent;
  private motion = 1;
  private rate = 1;
  private viewport: Viewport = { width: 0, height: 0, dpr: 1 };

  private pointer: { x: number; y: number } | null = null;
  private lean = { x: 0, y: 0 };

  constructor(private readonly random: () => number = Math.random) {
    this.player.play(this.stateClip);
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const sheet = await SpriteSheet.load(SHEET_URL);
      if (this.disposed) return;
      this.sheet = sheet;
      // Hand over only once there is something to hand over to.
      this.standIn?.destroy();
      this.standIn = null;
    } catch (err) {
      if (this.disposed) return;
      // The stand-in is already drawing, so there is nothing to switch to —
      // just say why the character is not the one the user configured.
      console.error('saber: sprite sheet unavailable, keeping the procedural rig', err);
    }
  }

  setAccent(hex: string): void {
    this.accent = hex;
    this.standIn?.setAccent(hex);
  }

  setMotion(motion: number): void {
    this.motion = motion;
    this.standIn?.setMotion(motion);
  }

  setState(event: StateEvent): void {
    this.state = event.state;
    this.rate = event.rate === undefined ? 1 : normaliseRate(event.rate / REFERENCE_RATE);
    this.stateClip = event.state === 'idle' ? pickIdleVariant(this.random) : clipForState(event.state);
    // A poke in flight keeps playing; it is short, and cutting it off mid-jump
    // to show the state that caused it looks like a dropped frame.
    if (!this.poking) this.player.play(this.stateClip);
    this.standIn?.setState(event);
  }

  setPointer(point: { x: number; y: number } | null): void {
    this.pointer = point;
    this.standIn?.setPointer(point);
  }

  poke(): void {
    const clip = clipByName(POKE_CLIP);
    if (clip) {
      this.poking = true;
      this.player.play(clip, { restart: true });
    }
    this.standIn?.poke();
  }

  update(frame: Frame): void {
    if (this.standIn) {
      this.standIn.update(frame);
      return;
    }

    // Only the typing clip is paced by the model's output; scaling every clip
    // by it would make the character visibly speed up while merely thinking.
    const rateScale = this.state === 'typing' ? this.rate : 1;
    this.player.advance(frame.dt, this.motion * rateScale);

    if (this.poking && this.player.finished) {
      this.poking = false;
      this.player.play(this.stateClip, { restart: true });
    }

    // Re-roll the idle variant each time it comes round, so the blink lands on
    // an irregular cadence rather than every loop.
    if (!this.poking && this.state === 'idle' && isIdleVariant(this.player.current)) {
      if (this.player.loops > 0) {
        this.stateClip = pickIdleVariant(this.random);
        this.player.play(this.stateClip, { restart: true });
      }
    }

    this.updateLean(frame.dt);
  }

  private updateLean(dt: number): void {
    let targetX = 0;
    let targetY = 0;
    if (this.pointer && this.viewport.width > 0 && this.viewport.height > 0) {
      targetX = clamp((this.pointer.x / this.viewport.width) * 2 - 1, -1, 1);
      targetY = clamp((this.pointer.y / this.viewport.height) * 2 - 1, -1, 1);
    }
    // Exponential damping, frame-rate independent, per the rig convention: the
    // lean is never assigned, only moved towards.
    const k = 1 - Math.exp(-LEAN_DAMPING * dt);
    this.lean.x += (targetX * this.motion - this.lean.x) * k;
    this.lean.y += (targetY * this.motion - this.lean.y) * k;
  }

  draw(ctx: CanvasRenderingContext2D, view: Viewport, frame: Frame): void {
    this.viewport = view;
    if (this.standIn) {
      this.standIn.draw(ctx, view, frame);
      return;
    }
    const sheet = this.sheet;
    const clip = this.player.current;
    if (!sheet || !clip) return;

    const box = this.frameBox(view);
    this.drawGlow(ctx, box);
    sheet.draw(ctx, clip, this.player.frame, box.x, box.y, box.size);
  }

  /** A soft accent-coloured pool under the character, tying it to the state. */
  private drawGlow(ctx: CanvasRenderingContext2D, box: FrameBox): void {
    const cx = box.x + box.size * 0.5;
    const cy = box.y + box.size * 0.90;
    const rx = box.size * 0.40;
    const ry = box.size * 0.075;
    if (rx <= 0 || ry <= 0) return;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    gradient.addColorStop(0, withAlpha(this.accent, 0.34));
    gradient.addColorStop(1, withAlpha(this.accent, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Where the frame lands in the viewport: as large as fits, sitting on the
   * bottom edge, with headroom left for the status bubble.
   */
  private frameBox(view: Viewport): FrameBox {
    const size = Math.max(0, Math.min(view.width, view.height * (1 - BUBBLE_HEADROOM)));
    return {
      size,
      x: (view.width - size) / 2 + this.lean.x * size * LEAN_X,
      y: view.height - size + this.lean.y * size * LEAN_Y,
    };
  }

  silhouetteBounds(view: Viewport): { x: number; y: number; width: number; height: number } {
    if (this.standIn) return this.standIn.silhouetteBounds(view);
    const box = this.frameBox(view);
    return {
      x: box.x + SILHOUETTE.x0 * box.size,
      y: box.y + SILHOUETTE.y0 * box.size,
      width: (SILHOUETTE.x1 - SILHOUETTE.x0) * box.size,
      height: (SILHOUETTE.y1 - SILHOUETTE.y0) * box.size,
    };
  }

  destroy(): void {
    this.disposed = true;
    this.standIn?.destroy();
    this.standIn = null;
    this.sheet = null;
  }
}

interface FrameBox {
  x: number;
  y: number;
  size: number;
}

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

const normaliseRate = (rate: number): number =>
  !Number.isFinite(rate) || rate <= 0 ? 1 : Math.min(2.5, Math.max(0.3, rate));

/** `#rrggbb` plus an alpha, which canvas gradients need as a colour string. */
function withAlpha(hex: string, alpha: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return `rgba(255, 255, 255, ${alpha})`;
  const value = Number.parseInt(match[1] as string, 16);
  return `rgba(${(value >> 16) & 0xff}, ${(value >> 8) & 0xff}, ${value & 0xff}, ${alpha})`;
}
