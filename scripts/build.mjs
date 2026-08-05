// One-shot production build of every bundle plus static assets.

import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { bundles, root, staticAssets } from './bundles.mjs';

async function copyAssets() {
  for (const asset of staticAssets) {
    const from = path.join(root, asset.from);
    const to = path.join(root, asset.to);
    try {
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to);
    } catch (err) {
      if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ENOENT') throw err;
      // A not-yet-written asset is expected while the app is being built up.
    }
  }
}

const dev = process.argv.includes('--dev');

await Promise.all(bundles(dev).map((b) => build(b.options)));
await copyAssets();

console.log(`saber: build complete (${dev ? 'development' : 'production'})`);
