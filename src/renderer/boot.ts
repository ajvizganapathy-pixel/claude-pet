/**
 * Renderer entry point: resolve the DOM, hand it to the app, and get out of
 * the way. Everything else lives under `src/renderer/`.
 */

import { RendererApp, type AppElements } from './app.js';

function required<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`renderer: missing #${id}`);
  return el as T;
}

function requiredChild<T extends HTMLElement>(parent: HTMLElement, selector: string): T {
  const el = parent.querySelector<T>(selector);
  if (!el) throw new Error(`renderer: missing ${selector}`);
  return el;
}

const bar = required<HTMLElement>('bar');

const elements: AppElements = {
  root: required<HTMLElement>('hud'),
  task: required<HTMLElement>('task'),
  bar,
  barFill: requiredChild<HTMLElement>(bar, 'i'),
  time: required<HTMLElement>('m-time'),
  files: required<HTMLElement>('m-files'),
  canvas: required<HTMLCanvasElement>('stage'),
  bubble: required<HTMLElement>('bubble'),
  bubbleText: required<HTMLElement>('bubble-text'),
};

const app = new RendererApp(elements);
window.addEventListener('beforeunload', () => app.destroy());

void app.start().catch((err: unknown) => {
  console.error('saber: renderer failed to start', err);
});
