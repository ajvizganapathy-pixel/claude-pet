/**
 * Translates DOM pointer events into canvas-space positions and gestures.
 *
 * Kept separate from the scene so the character reacts to *what happened*
 * rather than to browser event objects, and so the overlay can later reuse the
 * same positions for hit-testing without duplicating the maths.
 */

export interface PointerHandlers {
  /** Cursor moved within the canvas, or left it (null). */
  onMove(point: { x: number; y: number } | null): void;
  onPress(point: { x: number; y: number }): void;
  onDrag(delta: { dx: number; dy: number }): void;
  onRelease(moved: boolean): void;
  onContextMenu(): void;
}

/** Movement under this many pixels counts as a click, not a drag. */
const DRAG_THRESHOLD = 3;

export class PointerTracker {
  private active: { id: number; x: number; y: number; moved: boolean } | null = null;
  private readonly disposers: (() => void)[] = [];

  constructor(
    private readonly element: HTMLElement,
    private readonly handlers: PointerHandlers,
  ) {
    this.listen('pointermove', this.onPointerMove);
    this.listen('pointerdown', this.onPointerDown);
    this.listen('pointerup', this.onPointerUp);
    this.listen('pointercancel', this.onPointerUp);
    this.listen('pointerleave', this.onPointerLeave);
    this.listen('contextmenu', this.onContextMenu);
  }

  destroy(): void {
    for (const dispose of this.disposers) dispose();
    this.disposers.length = 0;
  }

  private listen<K extends keyof HTMLElementEventMap>(
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
  ): void {
    const listener = handler as EventListener;
    this.element.addEventListener(type, listener);
    this.disposers.push(() => this.element.removeEventListener(type, listener));
  }

  private toLocal(event: PointerEvent): { x: number; y: number } {
    const rect = this.element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private onPointerMove = (event: PointerEvent): void => {
    const point = this.toLocal(event);
    this.handlers.onMove(point);

    const active = this.active;
    if (!active || active.id !== event.pointerId) return;

    const dx = event.screenX - active.x;
    const dy = event.screenY - active.y;
    if (!active.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

    active.moved = true;
    active.x = event.screenX;
    active.y = event.screenY;
    this.handlers.onDrag({ dx, dy });
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.active = { id: event.pointerId, x: event.screenX, y: event.screenY, moved: false };
    this.element.setPointerCapture(event.pointerId);
    this.handlers.onPress(this.toLocal(event));
  };

  private onPointerUp = (event: PointerEvent): void => {
    const active = this.active;
    if (!active || active.id !== event.pointerId) return;
    this.active = null;
    if (this.element.hasPointerCapture(event.pointerId)) {
      this.element.releasePointerCapture(event.pointerId);
    }
    this.handlers.onRelease(active.moved);
  };

  private onPointerLeave = (): void => {
    if (this.active) return; // a drag continues past the edge
    this.handlers.onMove(null);
  };

  private onContextMenu = (event: Event): void => {
    event.preventDefault();
    this.handlers.onContextMenu();
  };
}
