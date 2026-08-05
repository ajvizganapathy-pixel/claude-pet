/**
 * The single place where renderer messages enter the main process.
 *
 * Every payload is treated as untrusted and normalised before use — the
 * renderer is sandboxed, but keeping the boundary honest costs nothing.
 */

import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { createLogger } from '@shared/log.js';
import { INVOKE, SEND, type DragPayload, type HoverPayload } from '@shared/ipc.js';
import { normaliseSettings, type Settings } from '@shared/settings.js';
import type { Companion } from '../companion.js';
import type { SettingsStore } from '../config/settingsStore.js';

const log = createLogger('ipc');

export interface BridgeDeps {
  settings: SettingsStore;
  companion: Companion;
  openSettings(): void;
  quit(): void;
}

/** Guards against messages from any web contents we did not create. */
const isTrusted = (event: IpcMainEvent | IpcMainInvokeEvent): boolean =>
  event.senderFrame?.url.startsWith('file://') ?? false;

export function registerIpc(deps: BridgeDeps): () => void {
  const { settings, companion } = deps;

  const on = (channel: string, handler: (event: IpcMainEvent, payload: unknown) => void): void => {
    ipcMain.on(channel, (event, payload: unknown) => {
      if (!isTrusted(event)) return;
      try {
        handler(event, payload);
      } catch (err) {
        log.error(`handler failed for ${channel}`, err);
      }
    });
  };

  const handle = (
    channel: string,
    handler: (event: IpcMainInvokeEvent, payload: unknown) => unknown,
  ): void => {
    ipcMain.handle(channel, (event, payload: unknown) => {
      if (!isTrusted(event)) return null;
      try {
        return handler(event, payload);
      } catch (err) {
        log.error(`handler failed for ${channel}`, err);
        return null;
      }
    });
  };

  on(SEND.ready, () => companion.markReady());

  on(SEND.hover, (_event, payload) => {
    const hover = payload as Partial<HoverPayload> | undefined;
    companion.setInteractive(hover?.inside === true);
  });

  on(SEND.drag, (_event, payload) => {
    const drag = payload as Partial<DragPayload> | undefined;
    if (!drag) return;
    if (drag.phase === 'move') {
      companion.moveBy(numberOr(drag.dx, 0), numberOr(drag.dy, 0));
    } else if (drag.phase === 'end') {
      companion.commitPosition();
    }
  });

  on(SEND.openSettings, () => deps.openSettings());

  handle(INVOKE.getSettings, () => settings.value);
  handle(INVOKE.patchSettings, (_event, payload) => {
    const patch = normaliseSettings(payload, settings.value) as Partial<Settings>;
    return settings.patch(patch);
  });
  handle(INVOKE.getState, () => companion.currentState);
  handle(INVOKE.quit, () => {
    deps.quit();
    return null;
  });

  return () => {
    for (const channel of [...Object.values(SEND), ...Object.values(INVOKE)]) {
      ipcMain.removeAllListeners(channel);
      ipcMain.removeHandler(channel);
    }
  };
}

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
