// Bundles the TypeScript tests with the same resolution rules as the app,
// then runs them under the Node test runner.
//
// Bundling first (rather than relying on Node's type stripping) keeps the
// `@shared/*` alias and `.js`-style specifiers working exactly as they do in
// the shipped bundles, so tests exercise the real module graph.

import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { root, runtimeExternals } from './bundles.mjs';

const testDir = path.join(root, 'test');
const outDir = path.join(root, 'dist/test');

const entries = (await fs.readdir(testDir).catch(() => []))
  .filter((name) => name.endsWith('.test.ts'))
  .map((name) => path.join(testDir, name));

if (entries.length === 0) {
  console.log('saber: no tests found');
  process.exit(0);
}

await fs.rm(outDir, { recursive: true, force: true });
await build({
  entryPoints: entries,
  outdir: outDir,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: 'inline',
  logLevel: 'warning',
  alias: { '@shared': path.join(root, 'src/shared') },
  external: ['node:*', 'electron', ...runtimeExternals],
});

// Explicit file list rather than a directory: Node's positional test
// arguments are globs, and a bare directory is not one.
const built = (await fs.readdir(outDir))
  .filter((name) => name.endsWith('.test.mjs'))
  .map((name) => path.join(outDir, name));

const child = spawn(process.execPath, ['--test', ...built], { cwd: root, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
