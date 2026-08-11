/**
 * The tray icon — the companion's only permanent, clickable surface.
 *
 * The overlay itself is non-focusable and mostly click-through, so everything
 * the user might want to do to it has to be reachable from here.
 */

import { Menu, Tray, app, nativeImage } from 'electron';
import path from 'node:path';
import { createLogger } from '@shared/log.js';
import type { StateEvent } from '@shared/protocol.js';
import type { Settings } from '@shared/settings.js';
import { descriptorFor } from '@shared/states.js';

const log = createLogger('tray');

export interface TrayDeps {
  appPath: string;
  isVisible(): boolean;
  setVisible(visible: boolean): void;
  getSettings(): Settings;
  patchSettings(patch: Partial<Settings>): void;
  openSettings(): void;
  quit(): void;
}

export class CompanionTray {
  private tray: Tray | null = null;
  private state: StateEvent | null = null;

  constructor(private readonly deps: TrayDeps) {}

  start(): void {
    const icon = nativeImage.createFromPath(path.join(this.deps.appPath, 'assets/tray-32.png'));
    if (icon.isEmpty()) {
      log.warn('tray icon missing; run `npm run icons`');
    }

    this.tray = new Tray(icon);
    this.tray.setToolTip('Saber');
    // Left click is the fastest way to get the companion back after hiding it.
    this.tray.on('click', () => this.deps.setVisible(!this.deps.isVisible()));
    this.rebuild();
  }

  setState(event: StateEvent): void {
    this.state = event;
    this.tray?.setToolTip(`Saber — ${event.label}`);
    this.rebuild();
  }

  /** Called whenever visibility or settings change, to re-tick the checkboxes. */
  rebuild(): void {
    if (!this.tray) return;
    const settings = this.deps.getSettings();
    const descriptor = descriptorFor(this.state?.state ?? 'idle');

    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `Saber — ${descriptor.label}`, enabled: false },
        { type: 'separator' },
        {
          label: 'Show companion',
          type: 'checkbox',
          checked: this.deps.isVisible(),
          click: (item) => this.deps.setVisible(item.checked),
        },
        {
          label: 'Follow Claude Desktop',
          type: 'checkbox',
          checked: settings.followClaudeFocus,
          toolTip: 'Hide the companion while another application is in front',
          click: (item) => this.deps.patchSettings({ followClaudeFocus: item.checked }),
        },
        {
          label: 'Show task panel',
          type: 'checkbox',
          checked: settings.showTaskPanel,
          click: (item) => this.deps.patchSettings({ showTaskPanel: item.checked }),
        },
        {
          label: 'Start with Windows',
          type: 'checkbox',
          checked: settings.launchAtLogin,
          // The OS can refuse the write (group policy, managed machines), so
          // the click reflects intent and the next rebuild shows the truth.
          enabled: process.platform === 'win32',
          toolTip: 'Launch the companion in the tray when you sign in',
          click: (item) => this.deps.patchSettings({ launchAtLogin: item.checked }),
        },
        { type: 'separator' },
        {
          label: 'Reset position',
          click: () => this.deps.patchSettings({ position: null }),
        },
        { label: 'Settings…', click: () => this.deps.openSettings() },
        { type: 'separator' },
        { label: `Version ${app.getVersion()}`, enabled: false },
        { label: 'Quit Saber', click: () => this.deps.quit() },
      ]),
    );
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }
}
