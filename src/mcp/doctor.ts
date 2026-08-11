/**
 * `npm run doctor` — collects the facts about this machine, runs the checks in
 * `doctorChecks.ts`, and prints which link in the chain is broken.
 *
 * Exits non-zero only on a `fail`. A `warn` means the wiring is correct and
 * something simply is not running yet, which is not an error worth failing a
 * setup script over.
 */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { resolvePipePath } from '@shared/protocol.js';
import { buildEntry, configPath } from './registration.js';
import {
  registeredEntry,
  runChecks,
  worstStatus,
  type CheckStatus,
  type Facts,
} from './doctorChecks.js';

const asObject = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Resolves true if something is listening on the pipe, false otherwise. */
function probePipe(pipePath: string, timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(pipePath);
    const done = (result: boolean): void => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

function readConfig(file: string): Facts['config'] {
  try {
    return asObject(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOENT' ? null : 'unreadable';
  }
}

async function collect(): Promise<Facts> {
  // Bundled as CommonJS, so __dirname is the installed dist/mcp directory.
  const dist = path.resolve(__dirname, '..');
  const appData = process.env['APPDATA'] ?? null;

  const artifacts = [
    path.join(dist, 'mcp/server.js'),
    path.join(dist, 'main/index.js'),
    path.join(dist, 'preload/index.js'),
    path.join(dist, 'renderer/boot.js'),
    path.join(dist, 'renderer/index.html'),
    path.join(dist, 'renderer/assets/cat-sheet.png'),
  ];

  const config = appData === null ? null : readConfig(configPath(appData));
  const registered = registeredEntry(config);
  // Only absolute paths are ours to check; a bare command is resolved from PATH
  // by whoever launches it.
  const missingRegisteredPaths = registered
    ? [registered.command, ...registered.args]
        .filter((p) => path.isAbsolute(p))
        .filter((p) => !fs.existsSync(p))
    : [];

  return {
    platform: process.platform,
    nodeMajor: Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10),
    appData,
    expectedEntry: buildEntry(process.execPath, path.join(dist, 'mcp/server.js')),
    buildArtifacts: artifacts.map((p) => ({
      path: p,
      name: path.basename(p),
      exists: fs.existsSync(p),
    })),
    config,
    missingRegisteredPaths,
    logDirExists: appData === null ? false : fs.existsSync(path.join(appData, 'Claude', 'logs')),
    pipeReachable: await probePipe(resolvePipePath()),
  };
}

const SYMBOL: Record<CheckStatus, string> = { ok: '  ok  ', warn: ' warn ', fail: ' FAIL ' };

async function main(): Promise<void> {
  const checks = runChecks(await collect());

  console.log('\nClaude Desktop  ->  MCP server  ->  companion\n');
  for (const check of checks) {
    console.log(`[${SYMBOL[check.status]}] ${check.name.padEnd(15)} ${check.detail}`);
    if (check.fix && check.status !== 'ok') console.log(`${' '.repeat(9)}${check.fix}`);
  }

  const worst = worstStatus(checks);
  console.log();
  if (worst === 'fail') {
    console.log('Something in the chain is broken — see the FAIL lines above.');
    process.exitCode = 1;
  } else if (worst === 'warn') {
    console.log('The connection is wired up. The warnings above are things not yet running.');
  } else {
    console.log('All good. Ask Claude Desktop to do something and watch the companion.');
  }
  console.log();
}

void main();
