/**
 * Application entry point. Wiring only — every behaviour lives in a module
 * under `src/main/`, and this file decides the order they come up in.
 */

import { app } from 'electron';
import path from 'node:path';
import { createLogger, setLogLevel } from '@shared/log.js';
import { Companion } from './companion.js';
import { SettingsStore } from './config/settingsStore.js';
import { registerIpc } from './ipc/bridge.js';
import { watchRendererForReload } from './dev/devReload.js';
import { resolveAssetPaths } from './window/companionWindow.js';

const log = createLogger('main');
const isDev = process.env['SABER_DEV'] === '1';

/** A second launch should surface the existing overlay, not start a rival one. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void bootstrap();
}

async function bootstrap(): Promise<void> {
  // The overlay is a background utility: it must never own the dock/taskbar.
  app.setAppUserModelId('com.saber.companion');

  await app.whenReady();

  const settings = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'));
  settings.load();
  setLogLevel(settings.value.logLevel);
  settings.on('change', (next: { logLevel: Parameters<typeof setLogLevel>[0] }) => {
    setLogLevel(next.logLevel);
  });

  const companion = new Companion(settings, resolveAssetPaths(app.getAppPath()));
  companion.start();

  const disposeIpc = registerIpc({
    settings,
    companion,
    openSettings: () => log.info('settings window arrives in a later milestone'),
    quit: () => app.quit(),
  });

  const stopDevWatch = isDev ? watchRendererForReload(app.getAppPath(), () => companion.reloadRenderer()) : null;

  app.on('second-instance', () => companion.setWanted(true));

  // The overlay lives in the tray; closing its window must not quit the app.
  app.on('window-all-closed', () => {
    /* intentionally empty */
  });

  app.on('before-quit', () => {
    stopDevWatch?.();
    disposeIpc();
    void settings.flush();
  });

  log.info('saber ready', isDev ? '(development)' : '');
}
