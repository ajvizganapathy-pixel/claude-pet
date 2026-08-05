/**
 * Development-only renderer hot reload.
 *
 * The dev runner restarts Electron for main-process changes; renderer bundles
 * are cheaper to swap in place, so the main process watches the built renderer
 * directory and reloads the window instead.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '@shared/log.js';

const log = createLogger('dev');
const DEBOUNCE_MS = 120;

export function watchRendererForReload(appPath: string, reload: () => void): () => void {
  const dir = path.join(appPath, 'dist/renderer');
  let timer: NodeJS.Timeout | null = null;

  try {
    const watcher = fs.watch(dir, { persistent: false }, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(reload, DEBOUNCE_MS);
    });
    log.debug('watching renderer bundle for changes');
    return () => {
      if (timer) clearTimeout(timer);
      watcher.close();
    };
  } catch (err) {
    log.warn('renderer watch unavailable', err);
    return () => {
      /* nothing to tear down */
    };
  }
}
