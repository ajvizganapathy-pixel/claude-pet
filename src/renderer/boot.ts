/**
 * Renderer entry point.
 *
 * Responsibilities are deliberately narrow: bind to the main-process API,
 * hand settings and state to the presentation modules, and own nothing else.
 */

import type { StateEvent } from '@shared/protocol.js';
import type { Settings } from '@shared/settings.js';
import { DEFAULT_SETTINGS } from '@shared/settings.js';
import { descriptorFor } from '@shared/states.js';

const api = window.saber;

const els = {
  hud: required<HTMLElement>('hud'),
  task: required<HTMLElement>('task'),
  bar: required<HTMLElement>('bar'),
  barFill: required<HTMLElement>('bar').querySelector('i') as HTMLElement,
  time: required<HTMLElement>('m-time'),
  files: required<HTMLElement>('m-files'),
  bubble: required<HTMLElement>('bubble'),
  bubbleText: required<HTMLElement>('bubble-text'),
  canvas: required<HTMLCanvasElement>('stage'),
};

function required<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`renderer: missing #${id}`);
  return el as T;
}

let settings: Settings = DEFAULT_SETTINGS;

function applySettings(next: Settings): void {
  settings = next;
  els.hud.hidden = !next.showTaskPanel;
  els.hud.setAttribute('aria-hidden', String(!next.showTaskPanel));
}

function applyState(event: StateEvent): void {
  const descriptor = descriptorFor(event.state);
  document.documentElement.style.setProperty('--accent', descriptor.accent);

  els.bubbleText.textContent = event.label || descriptor.bubble;
  els.task.textContent = descriptor.badge ?? event.task ?? descriptor.task;

  const hasProgress = typeof event.progress === 'number';
  els.bar.classList.toggle('indeterminate', !hasProgress && isBusy(event));
  els.barFill.style.width = hasProgress ? `${(event.progress! * 100).toFixed(1)}%` : '';

  els.files.textContent = String(event.meta?.files ?? 0);
  els.time.textContent = `${Math.floor(event.meta?.elapsed ?? 0)}s`;
}

const isBusy = (event: StateEvent): boolean =>
  event.state !== 'idle' && event.state !== 'sleeping' && event.state !== 'success';

/**
 * Placeholder painter. Milestone 2 replaces this with the render engine; it
 * exists so the transparent window is verifiably alive end to end.
 */
function startPlaceholderPainter(): void {
  const ctx = els.canvas.getContext('2d');
  if (!ctx) throw new Error('renderer: 2d context unavailable');

  let running = true;
  let start = performance.now();

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    els.canvas.width = Math.round(els.canvas.clientWidth * dpr);
    els.canvas.height = Math.round(els.canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  window.addEventListener('resize', resize);
  resize();

  const frame = (now: number): void => {
    if (!running) return;
    const t = (now - start) / 1000;
    const w = els.canvas.clientWidth;
    const h = els.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    const pulse = 1 + Math.sin(t * 1.5) * 0.04 * settings.motion;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.6, 42 * pulse * settings.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  api.onVisibility(({ visible }) => {
    if (visible && !running) {
      running = true;
      start = performance.now();
      requestAnimationFrame(frame);
    }
    running = visible;
  });
}

api.onSettings(applySettings);
api.onState(applyState);
api.onReload(() => window.location.reload());

void (async () => {
  applySettings(await api.getSettings());
  const state = await api.getState();
  if (state) applyState(state);
  startPlaceholderPainter();
  api.ready();
})();
