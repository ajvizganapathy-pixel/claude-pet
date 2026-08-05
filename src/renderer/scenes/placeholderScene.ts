/**
 * Temporary scene proving the engine end to end: a breathing disc in the
 * character's accent colour. Milestone 3 replaces it with the rig.
 */

import type { Frame } from '../engine/loop.js';
import type { Scene } from '../engine/scene.js';
import type { Viewport } from '../engine/surface.js';

export class PlaceholderScene implements Scene {
  private phase = 0;
  private accent = '#7E9CC4';
  private motion = 1;
  private scale = 1;

  setAccent(accent: string): void {
    this.accent = accent;
  }

  setMotion(motion: number): void {
    this.motion = motion;
  }

  setScale(scale: number): void {
    this.scale = scale;
  }

  update(frame: Frame): void {
    this.phase += frame.dt * 1.5 * this.motion;
  }

  draw(ctx: CanvasRenderingContext2D, view: Viewport): void {
    const radius = 42 * this.scale * (1 + Math.sin(this.phase) * 0.04);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = this.accent;
    ctx.beginPath();
    ctx.arc(view.width / 2, view.height * 0.6, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
