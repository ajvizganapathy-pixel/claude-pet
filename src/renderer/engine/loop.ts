/**
 * The render loop.
 *
 * Three properties the companion depends on:
 *  - `dt` is clamped, so a stall (window drag, GC pause) never teleports the rig.
 *  - The frame rate is capped independently of the display refresh rate, which
 *    lets quiet states run at half rate instead of pinning a core.
 *  - `stop()` cancels the animation frame outright. A hidden overlay costs
 *    nothing at all, rather than costing a little forever.
 */

export interface Frame {
  /** Seconds since the previous rendered frame, clamped. */
  dt: number;
  /** Seconds since the loop first started, excluding paused time. */
  time: number;
  index: number;
}

export interface LoopStats {
  /** Smoothed frames per second actually delivered. */
  fps: number;
  /** Smoothed milliseconds spent inside the frame callback. */
  frameTimeMs: number;
}

/** A single stall must not translate into a visible jump. */
const MAX_DT = 1 / 20;

/** Tolerance when deciding a frame is "close enough" to the cap interval. */
const PACING_SLACK_MS = 1.5;

export class RenderLoop {
  private handle = 0;
  private running = false;
  private lastFrameAt = 0;
  private time = 0;
  private index = 0;
  private interval = 1000 / 60;
  private fpsEma = 60;
  private frameTimeEma = 0;

  constructor(private readonly onFrame: (frame: Frame) => void) {}

  get isRunning(): boolean {
    return this.running;
  }

  get stats(): LoopStats {
    return { fps: this.fpsEma, frameTimeMs: this.frameTimeEma };
  }

  /** Target frames per second. Values above the display rate are harmless. */
  setFpsCap(fps: number): void {
    this.interval = 1000 / Math.max(1, fps);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrameAt = performance.now();
    this.handle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.handle);
    this.handle = 0;
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.handle = requestAnimationFrame(this.tick);

    const elapsed = now - this.lastFrameAt;
    // Under a cap below the refresh rate, most callbacks simply return.
    if (elapsed < this.interval - PACING_SLACK_MS) return;
    this.lastFrameAt = now;

    const dt = Math.min(MAX_DT, elapsed / 1000);
    this.time += dt;
    this.index += 1;

    const startedAt = performance.now();
    this.onFrame({ dt, time: this.time, index: this.index });
    const cost = performance.now() - startedAt;

    // Exponential moving averages; cheap, and stable enough to display.
    this.fpsEma += (1 / dt - this.fpsEma) * 0.1;
    this.frameTimeEma += (cost - this.frameTimeEma) * 0.1;
  };
}
