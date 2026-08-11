/**
 * "Start with Windows".
 *
 * Electron's `setLoginItemSettings` writes the same
 * `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` entry the Settings app
 * shows under Startup apps, so the user can turn it off from either side. That
 * makes the OS the source of truth and the stored setting a cache — see
 * `reconcile` for how the two are kept honest.
 *
 * Two facts drive the shape of this module:
 *
 *  - **The launch path differs between packaged and development runs.** Packaged,
 *    `process.execPath` is the app's own exe and needs no arguments. In
 *    development it is `electron.exe`, which is useless on its own and must be
 *    handed the project directory. Registering the wrong one produces a startup
 *    entry that silently fails months later, so both are handled explicitly.
 *
 *  - **A login launch should be quiet.** The companion is an overlay, not
 *    something to greet you at sign-in, so the registered command carries
 *    `AUTOSTART_FLAG` and `openedAtLogin()` lets the caller start it in the
 *    tray instead of on screen.
 *
 * Every entry point is a no-op off Windows rather than an error: macOS and
 * Linux support the API with different semantics, and quietly doing nothing is
 * better than a startup crash on a platform the app does not target yet.
 */

import { app } from 'electron';
import { createLogger } from '@shared/log.js';

const log = createLogger('autolaunch');

/** Marks a process that the OS started at login rather than the user did. */
export const AUTOSTART_FLAG = '--autostart';

/** The API is only meaningful on the platform the companion targets. */
const supported = (): boolean => process.platform === 'win32';

/**
 * The exact command to register. Packaged builds point at their own
 * executable; development runs point Electron at the project directory, which
 * is what `npm start` does by hand.
 */
function launchCommand(): { path: string; args: string[] } {
  return app.isPackaged
    ? { path: process.execPath, args: [AUTOSTART_FLAG] }
    : { path: process.execPath, args: [app.getAppPath(), AUTOSTART_FLAG] };
}

/** True when this process was started by the login item rather than by hand. */
export function openedAtLogin(): boolean {
  if (process.argv.includes(AUTOSTART_FLAG)) return true;
  if (!supported()) return false;
  // Squirrel-packaged builds report this even when the flag is stripped.
  return app.getLoginItemSettings(launchCommand()).wasOpenedAtLogin;
}

/** Whether the OS currently has a login item registered for this app. */
export function isEnabled(): boolean {
  if (!supported()) return false;
  try {
    return app.getLoginItemSettings(launchCommand()).openAtLogin;
  } catch (err) {
    log.warn('could not read the login item', err);
    return false;
  }
}

/**
 * Registers or removes the login item. Returns what the OS reports afterwards,
 * which is not always what was asked for — group policy and managed machines
 * can refuse the write — so callers should persist the returned value rather
 * than the requested one.
 */
export function setEnabled(enabled: boolean): boolean {
  if (!supported()) {
    if (enabled) log.info(`launch at login is Windows-only; ignoring on ${process.platform}`);
    return false;
  }

  const command = launchCommand();
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: command.path,
      args: command.args,
      // Keep the entry out of Task Manager's "high impact" startup list; the
      // overlay is idle until Claude Desktop does something anyway.
      enabled: true,
    });
  } catch (err) {
    log.error('could not write the login item', err);
    return isEnabled();
  }

  const actual = isEnabled();
  if (actual !== enabled) {
    log.warn(`login item stayed ${actual ? 'on' : 'off'} after asking for ${enabled ? 'on' : 'off'}`);
  } else {
    log.info(`launch at login ${enabled ? 'enabled' : 'disabled'}`);
    if (!app.isPackaged && enabled) {
      log.warn('registered a development launch command; re-register after packaging');
    }
  }
  return actual;
}

/**
 * Brings the stored setting and the OS into agreement at startup, and returns
 * the reconciled value for the caller to persist.
 *
 * The two directions of disagreement are not symmetrical:
 *
 *  - **Wanted but absent** → re-register. Turning a startup app off from
 *    Windows Settings does not delete the `Run` entry (it records a veto under
 *    `StartupApproved`), so a genuinely missing entry means something else
 *    removed it: a reinstall, a moved install directory, a cleanup tool. That
 *    is worth repairing, and doing so cannot override a user's Settings veto
 *    because the veto leaves the entry in place.
 *
 *  - **Present but unwanted** → adopt the OS state. Someone added it outside
 *    the app; deleting it would be the more surprising choice.
 */
export function reconcile(stored: boolean): boolean {
  if (!supported()) return stored;

  const actual = isEnabled();
  if (actual === stored) return stored;

  if (stored) {
    log.info('login item wanted but missing; re-registering');
    return setEnabled(true);
  }

  log.info('login item present but not stored; adopting the OS state');
  return actual;
}
