/**
 * A device-pixel-ratio aware 2D drawing surface.
 *
 * Owns exactly one concern: keeping the backing store in step with the CSS box
 * so scenes can draw in logical pixels and never think about DPR again.
 */

/** Above 2x the extra pixels cost real GPU time and buy nothing visible. */
const MAX_DPR = 2;

export interface Viewport {
  /** Logical (CSS pixel) dimensions the scene draws against. */
  width: number;
  height: number;
  dpr: number;
}

export class CanvasSurface {
  readonly ctx: CanvasRenderingContext2D;
  private view: Viewport = { width: 0, height: 0, dpr: 1 };
  private observer: ResizeObserver | null = null;
  private listeners = new Set<(view: Viewport) => void>();

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('surface: 2d context unavailable');
    this.ctx = ctx;

    this.observer = new ResizeObserver(() => this.sync());
    this.observer.observe(canvas);
    // devicePixelRatio changes when the window moves between displays.
    window.addEventListener('resize', this.sync);
    this.sync();
  }

  get viewport(): Viewport {
    return this.view;
  }

  onResize(listener: (view: Viewport) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.view.width, this.view.height);
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    window.removeEventListener('resize', this.sync);
    this.listeners.clear();
  }

  private sync = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;

    const backingWidth = Math.round(width * dpr);
    const backingHeight = Math.round(height * dpr);

    const unchanged =
      this.canvas.width === backingWidth &&
      this.canvas.height === backingHeight &&
      this.view.dpr === dpr;
    if (unchanged) return;

    // Assigning width/height also resets the transform, hence the re-apply.
    this.canvas.width = backingWidth;
    this.canvas.height = backingHeight;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.view = { width, height, dpr };
    for (const listener of this.listeners) listener(this.view);
  };
}
