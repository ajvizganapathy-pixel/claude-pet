/**
 * Owns the overlay window's lifetime and everything pushed into it.
 *
 * The rest of the main process talks to the renderer only through this class,
 * so window recreation (scale change, display change) stays in one place.
 */

import { BrowserWindow, screen, type Rectangle } from 'electron';
import { createLogger } from '@shared/log.js';
import { PUSH, type VisibilityPayload } from '@shared/ipc.js';
import type { StateEvent } from '@shared/protocol.js';
import type { Settings } from '@shared/settings.js';
import type { SettingsStore } from './config/settingsStore.js';
import {
  clampToWorkArea,
  computeBounds,
  createCompanionWindow,
  windowSize,
  type CompanionWindowDeps,
} from './window/companionWindow.js';

const log = createLogger('companion');

/** Settings that change the window itself rather than only its contents. */
const STRUCTURAL_KEYS: ReadonlySet<keyof Settings> = new Set(['scale', 'showTaskPanel', 'anchor']);

export class Companion {
  private window: BrowserWindow | null = null;
  private lastState: StateEvent | null = null;
  private rendererReady = false;
  /** Whether the user/tray wants it visible, independent of focus following. */
  private wanted: boolean;
  /** Whether focus tracking currently permits showing it. */
  private focusAllows = true;
  private visibilityListener: ((visible: boolean) => void) | null = null;
  private lastNotifiedVisibility: boolean | null = null;

  constructor(
    private readonly settings: SettingsStore,
    private readonly assets: CompanionWindowDeps,
  ) {
    this.wanted = !settings.value.startHidden;
    settings.on('change', (next: Settings, changed: (keyof Settings)[]) => {
      this.onSettingsChanged(next, changed);
    });
  }

  start(): void {
    this.ensureWindow();
    this.applyVisibility();
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window;

    this.rendererReady = false;
    const window = createCompanionWindow(this.settings.value, this.assets);
    this.window = window;

    window.on('closed', () => {
      if (this.window === window) this.window = null;
    });

    // A renderer exception is otherwise invisible: the overlay simply stops
    // painting with nothing in any log to say why.
    window.webContents.on('render-process-gone', (_event, details) => {
      log.error('renderer process gone', details.reason);
    });
    // Electron 33 signature: (event, level, message, line, sourceId).
    // Levels are 0 verbose … 3 error.
    window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const where = sourceId ? ` (${sourceId}:${line})` : '';
      if (level >= 3) log.error(`renderer: ${message}${where}`);
      else log.debug(`renderer: ${message}`);
    });

    return window;
  }

  /** Called by the IPC bridge once the renderer has mounted. */
  markReady(): void {
    this.rendererReady = true;
    log.debug('renderer ready');
    this.push(PUSH.settings, this.settings.value);
    if (this.lastState) this.push(PUSH.state, this.lastState);
    this.push(PUSH.visibility, { visible: this.isVisible() } satisfies VisibilityPayload);
  }

  get currentState(): StateEvent | null {
    return this.lastState;
  }

  setState(event: StateEvent): void {
    this.lastState = event;
    this.push(PUSH.state, event);
  }

  /** Tray / settings toggle. */
  setWanted(visible: boolean): void {
    this.wanted = visible;
    this.applyVisibility();
  }

  get wantedVisible(): boolean {
    return this.wanted;
  }

  /** Foreground-window watcher result. */
  setFocusAllows(allowed: boolean): void {
    if (this.focusAllows === allowed) return;
    this.focusAllows = allowed;
    this.applyVisibility();
  }

  isVisible(): boolean {
    return this.wanted && (this.focusAllows || !this.settings.value.followClaudeFocus);
  }

  /** Notified whenever the overlay's effective visibility changes. */
  onVisibilityChanged(listener: (visible: boolean) => void): void {
    this.visibilityListener = listener;
  }

  private applyVisibility(): void {
    const window = this.ensureWindow();
    const visible = this.isVisible();

    if (visible && !window.isVisible()) {
      window.showInactive();
      // Re-arm click-through: showing a window resets nothing, but an earlier
      // hover that ended while hidden would otherwise leave it interactive.
      this.setInteractive(false);
    }
    if (!visible && window.isVisible()) window.hide();

    this.push(PUSH.visibility, { visible } satisfies VisibilityPayload);
    if (visible !== this.lastNotifiedVisibility) {
      this.lastNotifiedVisibility = visible;
      this.visibilityListener?.(visible);
    }
  }

  /** Moves the window by a delta and remembers the new position. */
  moveBy(dx: number, dy: number): void {
    const window = this.window;
    if (!window || window.isDestroyed()) return;

    const bounds = window.getBounds();
    const next: Rectangle = { ...bounds, x: Math.round(bounds.x + dx), y: Math.round(bounds.y + dy) };
    const display = screen.getDisplayNearestPoint({ x: next.x, y: next.y });
    const clamped = clampToWorkArea(next, display.workArea);
    window.setBounds(clamped);
  }

  /** Persists wherever the window ended up after a drag. */
  commitPosition(): void {
    const window = this.window;
    if (!window || window.isDestroyed()) return;
    const { x, y } = window.getBounds();
    this.settings.patch({ position: { x, y } });
  }

  /**
   * Click-through. `forward: true` keeps mouse-move events flowing so the
   * renderer can keep hit-testing; every `false` must be paired with a `true`
   * or the window swallows clicks permanently.
   */
  setInteractive(interactive: boolean): void {
    const window = this.window;
    if (!window || window.isDestroyed()) return;
    window.setIgnoreMouseEvents(!interactive, { forward: true });
  }

  reloadRenderer(): void {
    this.window?.webContents.reloadIgnoringCache();
  }

  destroy(): void {
    this.window?.destroy();
    this.window = null;
  }

  private onSettingsChanged(next: Settings, changed: (keyof Settings)[]): void {
    const structural = changed.some((key) => STRUCTURAL_KEYS.has(key));
    const window = this.window;

    if (structural && window && !window.isDestroyed()) {
      const size = windowSize(next);
      const bounds = next.position
        ? clampToWorkArea(
            { ...window.getBounds(), ...size },
            screen.getDisplayNearestPoint(window.getBounds()).workArea,
          )
        : computeBounds(next);
      window.setBounds(bounds);
      log.debug('resized overlay', size);
    }

    this.push(PUSH.settings, next);
    if (changed.includes('followClaudeFocus') || changed.includes('startHidden')) {
      this.applyVisibility();
    }
  }

  private push(channel: string, payload: unknown): void {
    const window = this.window;
    if (!window || window.isDestroyed()) return;
    if (!this.rendererReady && channel !== PUSH.reload) return;
    window.webContents.send(channel, payload);
  }
}
