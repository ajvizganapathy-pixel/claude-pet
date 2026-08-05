/**
 * The task panel: what Claude is doing, how far along it is, and for how long.
 *
 * The progress rule from the protocol is enforced here rather than trusted:
 * an event without `progress` gets the indeterminate sliver, never a number.
 * A bar that invents motion is worse than no bar.
 */

import type { StateEvent } from '@shared/protocol.js';
import { descriptorFor } from '@shared/states.js';

export interface TaskPanelElements {
  root: HTMLElement;
  task: HTMLElement;
  bar: HTMLElement;
  barFill: HTMLElement;
  time: HTMLElement;
  files: HTMLElement;
}

/** States where an elapsed timer is meaningful. */
const TIMED = new Set<StateEvent['state']>([
  'thinking',
  'reading',
  'typing',
  'executing',
  'working',
]);

export class TaskPanel {
  private event: StateEvent | null = null;
  /** Wall-clock reference for the live elapsed counter. */
  private startedAt = 0;
  private baseElapsed = 0;
  private shownSeconds = -1;

  constructor(private readonly els: TaskPanelElements) {}

  setVisible(visible: boolean): void {
    this.els.root.hidden = !visible;
    this.els.root.setAttribute('aria-hidden', String(!visible));
  }

  setState(event: StateEvent): void {
    const descriptor = descriptorFor(event.state);
    const sameTask = this.event?.state === event.state && this.event.task === event.task;

    this.event = event;
    if (!sameTask) {
      this.startedAt = performance.now();
      this.baseElapsed = event.meta?.elapsed ?? 0;
      this.shownSeconds = -1;
    } else if (event.meta?.elapsed !== undefined) {
      // A source that measures elapsed time itself always wins over our clock.
      this.startedAt = performance.now();
      this.baseElapsed = event.meta.elapsed;
    }

    this.els.task.textContent = descriptor.badge ?? event.task ?? descriptor.task;
    this.els.files.textContent = String(event.meta?.files ?? 0);

    const progress = event.progress;
    this.els.bar.classList.toggle('indeterminate', progress === undefined && TIMED.has(event.state));
    this.els.barFill.style.width = progress === undefined ? '' : `${(progress * 100).toFixed(1)}%`;
  }

  /** Called once per frame; only touches the DOM when the second changes. */
  tick(): void {
    if (!this.event) return;
    const seconds = TIMED.has(this.event.state)
      ? Math.floor(this.baseElapsed + (performance.now() - this.startedAt) / 1000)
      : Math.floor(this.baseElapsed);

    if (seconds === this.shownSeconds) return;
    this.shownSeconds = seconds;
    this.els.time.textContent = formatElapsed(seconds);
  }
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
