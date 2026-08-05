// Development runner: watch-builds every bundle, launches Electron, and
// restarts it when main-process code changes. Renderer changes are picked up
// by the main process itself (see `devReload.ts`), which reloads the window.

import { context } from 'esbuild';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { bundles, root, staticAssets } from './bundles.mjs';

const RESTART_ON = new Set(['main', 'preload', 'mcp']);

let electron = null;
let restarting = false;
let quitting = false;

async function copyAssets() {
  for (const asset of staticAssets) {
    try {
      const to = path.join(root, asset.to);
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(path.join(root, asset.from), to);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
}

function launch() {
  const electronBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  electron = spawn(electronBin, ['electron', '.'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, SABER_DEV: '1' },
  });
  electron.on('exit', (code) => {
    electron = null;
    if (!restarting && !quitting) process.exit(code ?? 0);
  });
}

async function restart() {
  if (!electron) return launch();
  restarting = true;
  const dead = new Promise((resolve) => electron.once('exit', resolve));
  electron.kill();
  await dead;
  restarting = false;
  launch();
}

/** Rebuild notifications are debounced so a burst of file writes causes one restart. */
let pending = null;
function scheduleRestart() {
  clearTimeout(pending);
  pending = setTimeout(() => void restart(), 150);
}

const notifyPlugin = (name) => ({
  name: 'saber-dev-notify',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length > 0) return;
      await copyAssets();
      if (RESTART_ON.has(name)) scheduleRestart();
    });
  },
});

const contexts = await Promise.all(
  bundles(true).map(async (b) => {
    const ctx = await context({ ...b.options, plugins: [notifyPlugin(b.name)] });
    await ctx.watch();
    return ctx;
  }),
);

await copyAssets();
launch();

const shutdown = async () => {
  quitting = true;
  electron?.kill();
  await Promise.all(contexts.map((c) => c.dispose()));
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
