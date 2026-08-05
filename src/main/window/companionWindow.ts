/**
 * The companion overlay window.
 *
 * Windows-specific facts baked in here (see CLAUDE.md):
 *  - `transparent` must be set at construction and can never be toggled.
 *  - `frame: false` costs the drop shadow and resize handles; that is expected.
 *  - `backgroundColor: '#00000000'` is tried before disabling hardware
 *    acceleration, because disabling it costs GPU compositing everywhere.
 */

import { BrowserWindow, screen, type Rectangle } from 'electron';
import path from 'node:path';
import { createLogger } from '@shared/log.js';
import type { Settings } from '@shared/settings.js';

const log = createLogger('window');

/** Logical layout size of the overlay contents at scale 1. */
export const LAYOUT = {
  characterWidth: 360,
  characterHeight: 340,
  /** Head room above the character for the status bubble. */
  bubbleHeight: 46,
  taskPanelWidth: 300,
  /** Gap kept between the window and the screen edge. */
  margin: 16,
} as const;

export interface CompanionWindowDeps {
  preloadPath: string;
  rendererPath: string;
}

export function windowSize(settings: Settings): { width: number; height: number } {
  const scale = settings.scale;
  const width =
    LAYOUT.characterWidth * scale + (settings.showTaskPanel ? LAYOUT.taskPanelWidth : 0);
  const height = (LAYOUT.characterHeight + LAYOUT.bubbleHeight) * scale;
  return { width: Math.round(width), height: Math.round(height) };
}

/**
 * Resolves the window rectangle from settings: an explicit position when the
 * user has dragged the companion, otherwise the chosen corner of the display
 * that currently holds the cursor.
 */
export function computeBounds(settings: Settings): Rectangle {
  const { width, height } = windowSize(settings);

  if (settings.position) {
    const display = screen.getDisplayNearestPoint(settings.position);
    return clampToWorkArea({ ...settings.position, width, height }, display.workArea);
  }

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea;
  const m = LAYOUT.margin;
  const right = area.x + area.width - width - m;
  const bottom = area.y + area.height - height - m;

  switch (settings.anchor) {
    case 'bottom-left':
      return { x: area.x + m, y: bottom, width, height };
    case 'top-right':
      return { x: right, y: area.y + m, width, height };
    case 'top-left':
      return { x: area.x + m, y: area.y + m, width, height };
    case 'bottom-right':
    default:
      return { x: right, y: bottom, width, height };
  }
}

/** Keeps at least a corner of the window reachable if a display disappears. */
export function clampToWorkArea(bounds: Rectangle, area: Rectangle): Rectangle {
  const minVisible = 48;
  const x = Math.min(
    Math.max(bounds.x, area.x - bounds.width + minVisible),
    area.x + area.width - minVisible,
  );
  const y = Math.min(
    Math.max(bounds.y, area.y - bounds.height + minVisible),
    area.y + area.height - minVisible,
  );
  return { ...bounds, x: Math.round(x), y: Math.round(y) };
}

export function createCompanionWindow(settings: Settings, deps: CompanionWindowDeps): BrowserWindow {
  const bounds = computeBounds(settings);

  const window = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false, // moved programmatically; the OS drag would fight click-through
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // The overlay must never take focus from whatever the user is typing into.
    focusable: false,
    acceptFirstMouse: true,
    title: 'Saber',
    webPreferences: {
      preload: deps.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });

  window.setAlwaysOnTop(true, 'screen-saver');
  // Keep the overlay present when the user switches virtual desktops.
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  window.on('closed', () => log.debug('companion window closed'));

  void window.loadFile(deps.rendererPath).catch((err: unknown) => {
    log.error('failed to load renderer', err);
  });

  return window;
}

export const resolveAssetPaths = (appPath: string): CompanionWindowDeps => ({
  preloadPath: path.join(appPath, 'dist/preload/index.js'),
  rendererPath: path.join(appPath, 'dist/renderer/index.html'),
});
