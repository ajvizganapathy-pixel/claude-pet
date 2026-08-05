/**
 * Watches which application is in the foreground so the overlay can follow
 * Claude Desktop.
 *
 * "Always on top of one app only" is not something Electron can express, so
 * the companion approximates it: stay at screen-saver level, and hide whenever
 * Claude is not frontmost. Polling lives here, in main, on a timer — never in
 * the renderer, where it would compete with the animation frame.
 *
 * The watcher is deliberately conservative. If it cannot tell what is in front
 * (no bindings, a protected process, a transient null), it reports "unknown"
 * and the caller keeps showing the companion. Hiding the overlay because a
 * query failed is far more annoying than leaving it up for a moment.
 */

import { EventEmitter } from 'node:events';
import { createLogger } from '@shared/log.js';
import { getForegroundProcess, isAvailable } from './win32.js';

const log = createLogger('foreground');

/** Fast enough to feel immediate, slow enough to be free. */
const DEFAULT_INTERVAL_MS = 400;

/** Claude Desktop's executable, however it was installed (MSIX or classic). */
const CLAUDE_EXECUTABLE = 'claude.exe';

export type ForegroundOwner = 'claude' | 'self' | 'other' | 'unknown';

export interface ForegroundWatcherOptions {
  intervalMs?: number;
  /** Process ids belonging to this app, which count as `self`. */
  ownPids?: () => readonly number[];
}

export declare interface ForegroundWatcher {
  on(event: 'change', listener: (owner: ForegroundOwner) => void): this;
  emit(event: 'change', owner: ForegroundOwner): boolean;
}

export class ForegroundWatcher extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private last: ForegroundOwner = 'unknown';

  constructor(private readonly options: ForegroundWatcherOptions = {}) {
    super();
  }

  get current(): ForegroundOwner {
    return this.last;
  }

  /** Returns false when the platform bindings are unavailable. */
  start(): boolean {
    if (this.timer) return true;
    if (!isAvailable()) {
      log.info('focus tracking unavailable; the companion will stay visible');
      return false;
    }

    const interval = this.options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.poll();
    this.timer = setInterval(() => this.poll(), interval);
    // Never keep the process alive purely to answer this question.
    this.timer.unref();
    return true;
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private poll(): void {
    const owner = this.classify();
    if (owner === this.last) return;
    this.last = owner;
    log.debug('foreground owner', owner);
    this.emit('change', owner);
  }

  private classify(): ForegroundOwner {
    const foreground = getForegroundProcess();
    if (!foreground) return 'unknown';

    const ownPids = this.options.ownPids?.() ?? [process.pid];
    if (ownPids.includes(foreground.pid)) return 'self';

    if (foreground.executable === null) return 'unknown';
    return foreground.executable === CLAUDE_EXECUTABLE ? 'claude' : 'other';
  }
}

/** Whether the overlay should be visible for a given foreground owner. */
export const allowsCompanion = (owner: ForegroundOwner): boolean => owner !== 'other';
