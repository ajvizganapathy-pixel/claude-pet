/**
 * Registering the companion's MCP server with Claude Desktop.
 *
 * The config file at `%APPDATA%\Claude\claude_desktop_config.json` belongs to
 * the user and very likely lists servers they depend on. Every operation here
 * is therefore a *merge*: unknown keys are preserved verbatim, other servers
 * are untouched, and the file is only rewritten when something actually
 * changes.
 *
 * Claude Desktop reads this file once, at launch — a registered server does
 * not appear until the app is fully quit from the tray and reopened.
 */

import path from 'node:path';

export const SERVER_KEY = 'saber';

export interface ServerEntry {
  command: string;
  args: string[];
  /** Only set when the command needs help behaving like Node; see `buildEntry`. */
  env?: Record<string, string>;
}

export interface RegistrationPlan {
  /** The config to write, or null when nothing needs to change. */
  config: Record<string, unknown> | null;
  action: 'added' | 'updated' | 'unchanged' | 'removed' | 'absent';
  entry: ServerEntry | null;
}

/**
 * Builds the entry Claude Desktop will launch.
 *
 * The absolute path to the current Node/Electron binary is used rather than
 * the bare command `node`: Claude Desktop launches servers with its own
 * environment, and there is no guarantee a `node` on PATH exists there.
 *
 * If that binary is Electron — which it is whenever this runs from inside the
 * packaged app rather than from `npm run register` — it needs
 * `ELECTRON_RUN_AS_NODE`, or it will try to open a window instead of running
 * the script and the server will never start.
 */
export function buildEntry(nodePath: string, serverPath: string): ServerEntry {
  const entry: ServerEntry = { command: nodePath, args: [path.resolve(serverPath)] };
  if (isElectron(nodePath)) entry.env = { ELECTRON_RUN_AS_NODE: '1' };
  return entry;
}

/**
 * Matches `electron.exe`, `Electron`, and the packaged app's own executable —
 * that is, anything that is not plain Node.
 *
 * Splits on both separators rather than using `path.basename`, which resolves
 * against the host platform: a Windows path examined on POSIX has no separators
 * at all, and the whole string comes back as the file name.
 */
const isElectron = (binary: string): boolean => {
  const name = (binary.split(/[\\/]/).pop() ?? '').toLowerCase();
  return name !== 'node.exe' && name !== 'node';
};

export function planRegistration(
  existing: unknown,
  entry: ServerEntry,
): RegistrationPlan {
  const config = asObject(existing);
  const servers = asObject(config['mcpServers']);
  const current = servers[SERVER_KEY];

  if (entryMatches(current, entry)) {
    return { config: null, action: 'unchanged', entry };
  }

  // Merge rather than replace: Claude Desktop or the user may have added
  // environment of their own to this entry, and rewriting it wholesale would
  // be a silent data loss inside a file we promised only to merge into.
  const merged = mergeEntry(current, entry);

  return {
    config: { ...config, mcpServers: { ...servers, [SERVER_KEY]: merged } },
    action: current === undefined ? 'added' : 'updated',
    entry: merged,
  };
}

export function planRemoval(existing: unknown): RegistrationPlan {
  const config = asObject(existing);
  const servers = asObject(config['mcpServers']);

  if (!(SERVER_KEY in servers)) {
    return { config: null, action: 'absent', entry: null };
  }

  const remaining = { ...servers };
  delete remaining[SERVER_KEY];
  return { config: { ...config, mcpServers: remaining }, action: 'removed', entry: null };
}

/** Anything that is not a plain object is treated as an empty one. */
function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

/** True when the registered entry already says everything this tool would set. */
export function entryMatches(current: unknown, entry: ServerEntry): boolean {
  const existing = asObject(current);
  const args = existing['args'];
  return (
    existing['command'] === entry.command &&
    Array.isArray(args) &&
    args.length === entry.args.length &&
    args.every((arg, index) => arg === entry.args[index]) &&
    sameEnv(existing['env'], entry.env)
  );
}

function mergeEntry(current: unknown, entry: ServerEntry): ServerEntry {
  const existingEnv = asObject(asObject(current)['env']) as Record<string, string>;
  const env = { ...existingEnv, ...entry.env };
  return Object.keys(env).length > 0 ? { ...entry, env } : { ...entry };
}

/**
 * Compares only the keys this tool sets. Claude Desktop and the user may add
 * their own environment to the entry, and rewriting the config to strip them
 * would be a merge that loses data.
 */
function sameEnv(current: unknown, wanted: Record<string, string> | undefined): boolean {
  const existing = asObject(current);
  for (const [key, value] of Object.entries(wanted ?? {})) {
    if (existing[key] !== value) return false;
  }
  return true;
}

export const configPath = (appData: string): string =>
  path.join(appData, 'Claude', 'claude_desktop_config.json');
