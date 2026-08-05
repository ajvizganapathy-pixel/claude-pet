/**
 * Rig preview: every state, side by side, running the *shipped* renderer
 * modules outside Electron.
 *
 * This is the tool for judging character work — it makes a pose regression
 * visible in one screenshot, without launching the overlay or waiting for a
 * real Claude Desktop session to reach the state you want to look at.
 */

import { STATE_NAMES, type StateEvent, type StateName } from '@shared/protocol.js';
import { descriptorFor } from '@shared/states.js';
import { RenderLoop } from '../renderer/engine/loop.js';
import { CanvasSurface } from '../renderer/engine/surface.js';
import { CompanionScene } from '../renderer/scenes/companionScene.js';

interface Cell {
  surface: CanvasSurface;
  scene: CompanionScene;
}

function required<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`preview: missing #${id}`);
  return el as T;
}

const grid = required<HTMLElement>('grid');
const motionInput = required<HTMLInputElement>('motion');
const fpsEl = required<HTMLElement>('fps');
const frameEl = required<HTMLElement>('frame');

const cells: Cell[] = STATE_NAMES.map((state) => createCell(state));

/** One extra cell cycles through every state, which is how crossfades get judged. */
const cycling = createCell('idle', 'transitions');
cells.push(cycling);
let cycleIndex = 0;
window.setInterval(() => {
  cycleIndex = (cycleIndex + 1) % STATE_NAMES.length;
  const state = STATE_NAMES[cycleIndex] ?? 'idle';
  const descriptor = descriptorFor(state);
  cycling.scene.setAccent(descriptor.accent);
  cycling.scene.setState({ state, label: descriptor.bubble, ts: Date.now() });
}, 2000);

let motion = 1;

motionInput.addEventListener('input', () => {
  motion = Number(motionInput.value) / 100;
  for (const cell of cells) cell.scene.setMotion(motion);
});

const loop = new RenderLoop((frame) => {
  for (const cell of cells) {
    cell.scene.update(frame);
    cell.surface.clear();
    cell.scene.draw(cell.surface.ctx, cell.surface.viewport, frame);
  }
  if (frame.index % 20 === 0) {
    const stats = loop.stats;
    fpsEl.textContent = stats.fps.toFixed(0);
    frameEl.textContent = stats.frameTimeMs.toFixed(1);
  }
});

loop.setFpsCap(60);
loop.start();

function createCell(state: StateName, title = state as string): Cell {
  const descriptor = descriptorFor(state);

  const wrapper = document.createElement('div');
  wrapper.className = 'cell';

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = title;
  name.style.color = descriptor.accent;

  const canvas = document.createElement('canvas');
  wrapper.append(canvas, name);
  grid.append(wrapper);

  const scene = new CompanionScene();
  scene.setAccent(descriptor.accent);
  scene.setState({ state, label: descriptor.bubble, ts: Date.now() } satisfies StateEvent);

  // Pointer reactions are part of the character; the preview exercises them too.
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    scene.setPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  });
  canvas.addEventListener('pointerleave', () => scene.setPointer(null));
  canvas.addEventListener('click', () => scene.poke());

  return { surface: new CanvasSurface(canvas), scene };
}
