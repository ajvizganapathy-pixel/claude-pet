/**
 * Thin Win32 bindings for the one thing Electron cannot answer: which
 * application currently owns the foreground window.
 *
 * FFI (koffi) rather than a helper process: the watcher runs several times a
 * second forever, and spawning a process at that cadence is the difference
 * between a companion and a background CPU load.
 *
 * Every entry point degrades to `null` if the bindings cannot be loaded, and
 * callers must treat `null` as "unknown" rather than as "not Claude".
 */

import path from 'node:path';
import { createLogger } from '@shared/log.js';

const log = createLogger('win32');

/** PROCESS_QUERY_LIMITED_INFORMATION — enough for the image name, no more. */
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const MAX_PATH_CHARS = 520;

interface Bindings {
  getForegroundWindow(): unknown;
  getWindowThreadProcessId(hwnd: unknown, pid: number[]): number;
  openProcess(access: number, inherit: boolean, pid: number): unknown;
  queryImageName(process: unknown, flags: number, buffer: Uint16Array, size: number[]): boolean;
  closeHandle(handle: unknown): boolean;
}

let bindings: Bindings | null | undefined;

function load(): Bindings | null {
  if (bindings !== undefined) return bindings;

  try {
    // Required lazily so a missing native module degrades instead of
    // preventing the app from starting at all.
    const koffi = require('koffi') as typeof import('koffi');
    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');

    bindings = {
      getForegroundWindow: user32.func('void* GetForegroundWindow()') as () => unknown,
      getWindowThreadProcessId: user32.func(
        'uint32 GetWindowThreadProcessId(void* hWnd, _Out_ uint32* pid)',
      ) as (hwnd: unknown, pid: number[]) => number,
      openProcess: kernel32.func('void* OpenProcess(uint32 access, bool inherit, uint32 pid)') as (
        access: number,
        inherit: boolean,
        pid: number,
      ) => unknown,
      queryImageName: kernel32.func(
        'bool QueryFullProcessImageNameW(void* proc, uint32 flags, _Out_ uint16* name, _Inout_ uint32* size)',
      ) as (proc: unknown, flags: number, name: Uint16Array, size: number[]) => boolean,
      closeHandle: kernel32.func('bool CloseHandle(void* handle)') as (h: unknown) => boolean,
    };
    log.debug('win32 bindings loaded');
  } catch (err) {
    log.warn('win32 bindings unavailable; focus tracking disabled', err);
    bindings = null;
  }

  return bindings;
}

export interface ForegroundProcess {
  pid: number;
  /** Full path to the executable, or null when the process denies inspection. */
  executablePath: string | null;
  /** Lower-cased file name, e.g. `claude.exe`. */
  executable: string | null;
}

/** Returns the foreground process, or null if it cannot be determined. */
export function getForegroundProcess(): ForegroundProcess | null {
  const api = load();
  if (!api) return null;

  try {
    const hwnd = api.getForegroundWindow();
    if (!hwnd) return null;

    const pidOut = [0];
    api.getWindowThreadProcessId(hwnd, pidOut);
    const pid = pidOut[0] ?? 0;
    if (pid === 0) return null;

    const executablePath = readImageName(api, pid);
    return {
      pid,
      executablePath,
      executable: executablePath ? path.basename(executablePath).toLowerCase() : null,
    };
  } catch (err) {
    log.warn('foreground window query failed', err);
    return null;
  }
}

function readImageName(api: Bindings, pid: number): string | null {
  const handle = api.openProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
  // Elevated and protected processes legitimately refuse this; not an error.
  if (!handle) return null;

  try {
    const buffer = new Uint16Array(MAX_PATH_CHARS);
    const size = [buffer.length];
    if (!api.queryImageName(handle, 0, buffer, size)) return null;

    const length = Math.min(size[0] ?? 0, buffer.length);
    return length > 0 ? String.fromCharCode(...buffer.subarray(0, length)) : null;
  } finally {
    api.closeHandle(handle);
  }
}

/** True when the bindings loaded; used to decide whether to poll at all. */
export const isAvailable = (): boolean => load() !== null;
