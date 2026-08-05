// Shared esbuild configuration for every bundle in the app.
// Kept in one place so `build.mjs` and `dev.mjs` cannot drift apart.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist');

/** Electron's own modules are provided at runtime and must never be bundled. */
const electronExternals = ['electron'];

/**
 * Modules resolved at runtime rather than bundled: koffi ships a `.node`
 * binary esbuild cannot inline, and the MCP SDK is loaded by the server child.
 */
export const runtimeExternals = ['koffi', '@modelcontextprotocol/sdk'];

const common = {
  bundle: true,
  sourcemap: true,
  logLevel: 'warning',
  alias: { '@shared': path.join(root, 'src/shared') },
};

/**
 * @param {boolean} dev
 * @returns {Array<{name: string, options: import('esbuild').BuildOptions}>}
 */
export function bundles(dev) {
  const shared = {
    ...common,
    minify: !dev,
    define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
  };

  return [
    {
      name: 'main',
      options: {
        ...shared,
        entryPoints: [path.join(root, 'src/main/index.ts')],
        outfile: path.join(outDir, 'main/index.js'),
        platform: 'node',
        format: 'cjs',
        target: 'node20',
        external: [...electronExternals, ...runtimeExternals],
      },
    },
    {
      name: 'preload',
      options: {
        ...shared,
        entryPoints: [path.join(root, 'src/preload/index.ts')],
        outfile: path.join(outDir, 'preload/index.js'),
        platform: 'node',
        format: 'cjs',
        target: 'node20',
        external: electronExternals,
      },
    },
    {
      name: 'renderer',
      options: {
        ...shared,
        entryPoints: [path.join(root, 'src/renderer/boot.ts')],
        outfile: path.join(outDir, 'renderer/boot.js'),
        platform: 'browser',
        format: 'esm',
        target: 'chrome128',
      },
    },
    {
      // Developer tool: every state side by side, running the shipped renderer.
      name: 'preview',
      options: {
        ...shared,
        entryPoints: [path.join(root, 'src/preview/preview.ts')],
        outfile: path.join(outDir, 'preview/preview.js'),
        platform: 'browser',
        format: 'esm',
        target: 'chrome128',
      },
    },
    {
      name: 'mcp',
      options: {
        ...shared,
        entryPoints: [path.join(root, 'src/mcp/server.ts')],
        outfile: path.join(outDir, 'mcp/server.js'),
        platform: 'node',
        format: 'cjs',
        target: 'node20',
        external: runtimeExternals,
      },
    },
  ];
}

/** Static renderer assets copied verbatim next to the bundled renderer. */
export const staticAssets = [
  { from: 'src/renderer/index.html', to: 'dist/renderer/index.html' },
  { from: 'src/renderer/style.css', to: 'dist/renderer/style.css' },
  { from: 'src/renderer/settings.html', to: 'dist/renderer/settings.html' },
  { from: 'src/preview/index.html', to: 'dist/preview/index.html' },
  { from: 'src/preview/preview.css', to: 'dist/preview/preview.css' },
];
