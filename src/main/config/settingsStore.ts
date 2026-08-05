/**
 * Persistent settings, stored as JSON under the Electron user-data directory.
 *
 * Writes are debounced and atomic (temp file + rename) so a crash mid-save
 * cannot leave a truncated file that would reset the user's configuration.
 */

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '@shared/log.js';
import { DEFAULT_SETTINGS, normaliseSettings, type Settings } from '@shared/settings.js';

const log = createLogger('settings');
const SAVE_DEBOUNCE_MS = 250;

export class SettingsStore extends EventEmitter {
  private current: Settings = DEFAULT_SETTINGS;
  private saveTimer: NodeJS.Timeout | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {
    super();
  }

  get value(): Settings {
    return this.current;
  }

  /** Reads the file if present; a missing or corrupt file yields defaults. */
  load(): Settings {
    try {
      const text = fs.readFileSync(this.filePath, 'utf8');
      this.current = normaliseSettings(JSON.parse(text));
      log.debug('loaded settings', this.filePath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') log.warn('settings unreadable, using defaults', err);
      this.current = DEFAULT_SETTINGS;
    }
    return this.current;
  }

  /**
   * Applies a partial patch. Returns the resulting settings and emits `change`
   * only when something actually differs, so listeners can rebuild freely.
   */
  patch(patch: Partial<Settings>): Settings {
    const next = normaliseSettings(patch, this.current);
    const changed = (Object.keys(next) as (keyof Settings)[]).filter(
      (key) => !equal(next[key], this.current[key]),
    );
    if (changed.length === 0) return this.current;

    this.current = next;
    this.scheduleSave();
    this.emit('change', this.current, changed);
    return this.current;
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.save(), SAVE_DEBOUNCE_MS);
  }

  /** Flushes any pending write; called on quit. */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      await this.save();
    }
    await this.writing;
  }

  private save(): Promise<void> {
    const snapshot = JSON.stringify(this.current, null, 2);
    this.writing = this.writing
      .then(async () => {
        const tmp = `${this.filePath}.tmp`;
        await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
        await fsp.writeFile(tmp, snapshot, 'utf8');
        await fsp.rename(tmp, this.filePath);
      })
      .catch((err: unknown) => {
        log.error('could not persist settings', err);
      });
    return this.writing;
  }
}

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
