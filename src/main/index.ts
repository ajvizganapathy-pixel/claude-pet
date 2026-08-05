/**
 * Application entry point. Wiring only — every behaviour lives in a module
 * under `src/main/`, and this file decides the order they come up in.
 */

import { app } from 'electron';
import path from 'node:path';
import { createLogger, setLogLevel, type LogLevel } from '@shared/log.js';
import type { Settings } from '@shared/settings.js';
import { Companion } from './companion.js';
import { SettingsStore } from './config/settingsStore.js';
import { watchRendererForReload } from './dev/devReload.js';
import { registerIpc } from './ipc/bridge.js';
import { allowsCompanion, ForegroundWatcher } from './platform/foregroundWatcher.js';
import { CompanionTray } from './tray.js';
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
  app.setAppUserModelId('com.saber.companion');

  await app.whenReady();

  const settings = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'));
  settings.load();

  // SABER_LOG overrides the stored level, so a debugging session never has to
  // edit (and then remember to revert) the user's settings file.
  const envLevel = process.env['SABER_LOG'] as LogLevel | undefined;
  const applyLogLevel = (level: LogLevel): void => setLogLevel(envLevel ?? level);
  applyLogLevel(settings.value.logLevel);
  settings.on('change', (next: Settings) => applyLogLevel(next.logLevel));

  const companion = new Companion(settings, resolveAssetPaths(app.getAppPath()));
  companion.start();

  const quit = (): void => app.quit();

  const tray = new CompanionTray({
    appPath: app.getAppPath(),
    isVisible: () => companion.wantedVisible,
    setVisible: (visible) => companion.setWanted(visible),
    getSettings: () => settings.value,
    patchSettings: (patch) => settings.patch(patch),
    openSettings: () => log.info('settings window arrives in a later milestone'),
    quit,
  });
  tray.start();

  companion.onVisibilityChanged(() => tray.rebuild());
  settings.on('change', () => tray.rebuild());

  // Follow Claude Desktop's focus. `unknown` counts as permission to show:
  // hiding because a query failed is worse than a moment of over-eagerness.
  const foreground = new ForegroundWatcher({
    ownPids: () => [process.pid],
  });
  foreground.on('change', (owner) => companion.setFocusAllows(allowsCompanion(owner)));
  foreground.start();

  const disposeIpc = registerIpc({
    settings,
    companion,
    openSettings: () => log.info('settings window arrives in a later milestone'),
    quit,
  });

  const stopDevWatch = isDev
    ? watchRendererForReload(app.getAppPath(), () => companion.reloadRenderer())
    : null;

  app.on('second-instance', () => companion.setWanted(true));

  // The companion lives in the tray; closing its window must not quit the app.
  app.on('window-all-closed', () => {
    /* intentionally empty */
  });

  app.on('before-quit', () => {
    stopDevWatch?.();
    foreground.stop();
    disposeIpc();
    tray.destroy();
    void settings.flush();
  });

  log.info('saber ready', isDev ? '(development)' : '');
}
