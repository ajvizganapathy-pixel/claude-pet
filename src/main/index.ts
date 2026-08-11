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
import * as autoLaunch from './platform/autoLaunch.js';
import { allowsCompanion, ForegroundWatcher } from './platform/foregroundWatcher.js';
import { LogTailer } from './sources/logTailer.js';
import { StatePipeServer } from './sources/pipeServer.js';
import { StateArbiter } from './sources/stateArbiter.js';
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

  // The OS holds the real login item, so adopt whatever it says before anything
  // reads `launchAtLogin` — including the tray, which renders it as a checkbox.
  const reconciled = autoLaunch.reconcile(settings.value.launchAtLogin);
  if (reconciled !== settings.value.launchAtLogin) settings.patch({ launchAtLogin: reconciled });
  settings.on('change', (next: Settings, changed: (keyof Settings)[]) => {
    // Only act on a real change, or every unrelated patch would rewrite the
    // registry entry.
    if (changed.includes('launchAtLogin')) {
      const applied = autoLaunch.setEnabled(next.launchAtLogin);
      if (applied !== next.launchAtLogin) settings.patch({ launchAtLogin: applied });
    }
  });

  // A login launch should arrive in the tray, not on top of the sign-in screen.
  const companion = new Companion(settings, resolveAssetPaths(app.getAppPath()), {
    startHidden: settings.value.startHidden || autoLaunch.openedAtLogin(),
  });
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

  // State sources, wired through the arbiter that implements the fallback
  // ladder: pipe (exact) over log inference (best effort) over focus alone.
  const arbiter = new StateArbiter();
  arbiter.on('state', (event) => {
    log.debug(`state -> ${event.state} (${event.label})`);
    companion.setState(event);
    tray.setState(event);
  });
  arbiter.start();

  const pipe = new StatePipeServer();
  pipe.on('state', (event) => arbiter.submit(event));
  const pipeReady = await pipe.start();

  const logTailer = new LogTailer(LogTailer.defaultLogPath(app.getPath('appData')));
  logTailer.on('state', (event) => arbiter.submit(event));
  const logsReady = await logTailer.start();

  // Follow Claude Desktop's focus. `unknown` counts as permission to show:
  // hiding because a query failed is worse than a moment of over-eagerness.
  const foreground = new ForegroundWatcher({
    ownPids: () => [process.pid],
  });
  foreground.on('change', (owner) => {
    companion.setFocusAllows(allowsCompanion(owner));
    arbiter.setClaudeFocused(owner === 'claude');
  });
  const focusReady = foreground.start();

  log.info(
    `state sources — pipe:${yesNo(pipeReady)} logs:${yesNo(logsReady)} focus:${yesNo(focusReady)}`,
  );

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
    logTailer.stop();
    pipe.stop();
    arbiter.stop();
    disposeIpc();
    tray.destroy();
    void settings.flush();
  });

  log.info('saber ready', isDev ? '(development)' : '');
}

const yesNo = (value: boolean): string => (value ? 'yes' : 'no');
