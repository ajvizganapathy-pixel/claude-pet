/**
 * The entire privileged surface available to the renderer.
 *
 * Nothing here does work; it only forwards typed messages. Keeping it this
 * thin is what lets the renderer run sandboxed with context isolation on.
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { INVOKE, PUSH, SEND, type SaberApi } from '@shared/ipc.js';
import type { StateEvent } from '@shared/protocol.js';
import type { Settings } from '@shared/settings.js';

/** Wraps a push channel so callers get an unsubscribe function, not a leak. */
function subscribe<T>(channel: string, handler: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: SaberApi = {
  onState: (handler) => subscribe<StateEvent>(PUSH.state, handler),
  onSettings: (handler) => subscribe<Settings>(PUSH.settings, handler),
  onVisibility: (handler) => subscribe(PUSH.visibility, handler),
  onReload: (handler) => subscribe<void>(PUSH.reload, () => handler()),

  setHover: (payload) => ipcRenderer.send(SEND.hover, payload),
  drag: (payload) => ipcRenderer.send(SEND.drag, payload),
  openSettings: () => ipcRenderer.send(SEND.openSettings),
  ready: () => ipcRenderer.send(SEND.ready),

  getSettings: () => ipcRenderer.invoke(INVOKE.getSettings) as Promise<Settings>,
  patchSettings: (patch) => ipcRenderer.invoke(INVOKE.patchSettings, patch) as Promise<Settings>,
  getState: () => ipcRenderer.invoke(INVOKE.getState) as Promise<StateEvent | null>,
  quit: () => void ipcRenderer.invoke(INVOKE.quit),
};

contextBridge.exposeInMainWorld('saber', api);
