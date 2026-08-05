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
 */
export function buildEntry(nodePath: string, serverPath: string): ServerEntry {
  return { command: nodePath, args: [path.resolve(serverPath)] };
}

export function planRegistration(
  existing: unknown,
  entry: ServerEntry,
): RegistrationPlan {
  const config = asObject(existing);
  const servers = asObject(config['mcpServers']);
  const current = servers[SERVER_KEY];

  if (isSameEntry(current, entry)) {
    return { config: null, action: 'unchanged', entry };
  }

  return {
    config: { ...config, mcpServers: { ...servers, [SERVER_KEY]: entry } },
    action: current === undefined ? 'added' : 'updated',
    entry,
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

function isSameEntry(current: unknown, entry: ServerEntry): boolean {
  const existing = asObject(current);
  const args = existing['args'];
  return (
    existing['command'] === entry.command &&
    Array.isArray(args) &&
    args.length === entry.args.length &&
    args.every((arg, index) => arg === entry.args[index])
  );
}

export const configPath = (appData: string): string =>
  path.join(appData, 'Claude', 'claude_desktop_config.json');
