/**
 * Decides when the overlay window should stop being click-through.
 *
 * This is the single most load-bearing behaviour in the app: get it wrong and
 * the window silently eats clicks meant for whatever is underneath it. Two
 * rules keep it safe:
 *
 *  1. Default to click-through. Interactivity is only ever granted while the
 *     cursor is demonstrably over the character.
 *  2. Report only *transitions*, never per-frame state, so the main process
 *     receives two messages per hover rather than sixty a second.
 *
 * While the window is click-through, Electron forwards mouse-move messages
 * (`setIgnoreMouseEvents(true, { forward: true })`), which is what lets this
 * keep tracking without owning the cursor.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HitTestHandlers {
  /** Called only when the answer changes. */
  onChange(inside: boolean): void;
}

/**
 * Grown slightly beyond the drawn silhouette: a cursor one pixel off the fur
 * should still count, and the box is already an approximation of a curve.
 */
const HIT_PADDING = 6;

export class HitTester {
  private inside = false;
  private bounds: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private locked = false;
  private readonly dispose: () => void;

  constructor(private readonly handlers: HitTestHandlers) {
    const onMove = (event: MouseEvent): void => this.evaluate({ x: event.clientX, y: event.clientY });
    const onLeave = (): void => this.evaluate(null);

    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    this.dispose = () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }

  /** The character moves; the scene supplies fresh bounds every frame. */
  setBounds(bounds: Rect): void {
    this.bounds = bounds;
  }

  /**
   * Holds interactivity on regardless of cursor position — used while
   * dragging, where the cursor routinely leaves the silhouette it grabbed.
   */
  setLocked(locked: boolean): void {
    if (this.locked === locked) return;
    this.locked = locked;
    if (locked) this.set(true);
    else this.evaluate(null);
  }

  destroy(): void {
    this.dispose();
    // Leaving the window interactive on teardown would trap clicks.
    this.set(false);
  }

  private evaluate(point: { x: number; y: number } | null): void {
    if (this.locked) return;
    this.set(point !== null && contains(this.bounds, point.x, point.y, HIT_PADDING));
  }

  private set(inside: boolean): void {
    if (inside === this.inside) return;
    this.inside = inside;
    this.handlers.onChange(inside);
  }
}

export function contains(rect: Rect, x: number, y: number, padding = 0): boolean {
  return (
    x >= rect.x - padding &&
    x <= rect.x + rect.width + padding &&
    y >= rect.y - padding &&
    y <= rect.y + rect.height + padding
  );
}
