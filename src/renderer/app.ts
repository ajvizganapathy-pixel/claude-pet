/**
 * The renderer's composition root.
 *
 * Everything the overlay does is assembled here: the drawing surface, the
 * loop, the scene, the two pieces of DOM chrome, and the subscriptions that
 * feed them. No module below this one knows about `window.saber`.
 */

import type { StateEvent, StateName } from '@shared/protocol.js';
import { DEFAULT_SETTINGS, type Settings } from '@shared/settings.js';
import { descriptorFor } from '@shared/states.js';
import { RenderLoop, type Frame } from './engine/loop.js';
import type { CompanionScene as CompanionSceneContract } from './engine/scene.js';
import { CanvasSurface } from './engine/surface.js';
import { PointerTracker } from './input/pointerTracker.js';
import { CompanionScene } from './scenes/companionScene.js';
import { Bubble } from './ui/bubble.js';
import { TaskPanel, type TaskPanelElements } from './ui/taskPanel.js';

/**
 * Quiet states still breathe, so the loop cannot stop — but it can run at half
 * rate. At this cadence a slow breath is indistinguishable from 60 FPS and the
 * companion stops showing up in the process list's CPU column.
 */
const QUIET_FPS = 30;
const QUIET_STATES: ReadonlySet<StateName> = new Set(['idle', 'sleeping']);

/** How far the motion multiplier is pulled back under reduced-motion. */
const REDUCED_MOTION_FACTOR = 0.35;

export interface AppElements extends TaskPanelElements {
  canvas: HTMLCanvasElement;
  bubble: HTMLElement;
  bubbleText: HTMLElement;
}

export class RendererApp {
  private readonly surface: CanvasSurface;
  private readonly loop: RenderLoop;
  private readonly scene: CompanionSceneContract;
  private readonly bubble: Bubble;
  private readonly taskPanel: TaskPanel;
  private readonly pointer: PointerTracker;
  private readonly reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly disposers: (() => void)[] = [];

  private settings: Settings = DEFAULT_SETTINGS;
  private state: StateEvent | null = null;
  private visible = true;

  constructor(private readonly els: AppElements) {
    this.surface = new CanvasSurface(els.canvas);
    this.scene = new CompanionScene();
    this.loop = new RenderLoop((frame) => this.onFrame(frame));
    this.bubble = new Bubble(els.bubble, els.bubbleText);
    this.taskPanel = new TaskPanel(els);
    this.pointer = new PointerTracker(els.canvas, {
      onMove: (point) => this.scene.setPointer(point),
      onPress: () => undefined,
      onDrag: () => undefined,
      onRelease: (moved) => {
        if (!moved) this.scene.poke();
      },
      onContextMenu: () => window.saber.openSettings(),
    });
  }

  async start(): Promise<void> {
    const api = window.saber;

    this.disposers.push(
      api.onSettings((settings) => this.applySettings(settings)),
      api.onState((event) => this.applyState(event)),
      api.onVisibility(({ visible }) => this.setVisible(visible)),
      api.onReload(() => window.location.reload()),
    );

    const onMotionPreferenceChange = (): void => this.applySettings(this.settings);
    this.reducedMotionQuery.addEventListener('change', onMotionPreferenceChange);
    this.disposers.push(() =>
      this.reducedMotionQuery.removeEventListener('change', onMotionPreferenceChange),
    );

    this.applySettings(await api.getSettings());
    const initial = await api.getState();
    this.applyState(initial ?? idleEvent());

    this.loop.start();
    api.ready();
  }

  destroy(): void {
    for (const dispose of this.disposers) dispose();
    this.disposers.length = 0;
    this.loop.stop();
    this.pointer.destroy();
    this.scene.destroy?.();
    this.surface.destroy();
    this.bubble.destroy();
  }

  /** Exposed for diagnostics (see the settings window's performance readout). */
  get stats(): { fps: number; frameTimeMs: number } {
    return this.loop.stats;
  }

  private onFrame(frame: Frame): void {
    this.scene.update(frame);
    this.surface.clear();
    this.scene.draw(this.surface.ctx, this.surface.viewport, frame);
    this.taskPanel.tick();
  }

  private applySettings(settings: Settings): void {
    this.settings = settings;
    const reduced = this.prefersReducedMotion();

    this.taskPanel.setVisible(settings.showTaskPanel);
    this.bubble.setAnimated(!reduced);
    this.scene.setMotion(settings.motion * (reduced ? REDUCED_MOTION_FACTOR : 1));
    this.updateFrameRate();
  }

  private applyState(event: StateEvent): void {
    this.state = event;
    const descriptor = descriptorFor(event.state);

    document.documentElement.style.setProperty('--accent', descriptor.accent);
    this.scene.setAccent(descriptor.accent);
    this.scene.setState(event);
    this.bubble.show(event.label || descriptor.bubble);
    this.taskPanel.setState(event);
    this.updateFrameRate();
  }

  private setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    // A hidden overlay must cost nothing, so the loop is cancelled outright.
    if (visible) this.loop.start();
    else this.loop.stop();
  }

  private updateFrameRate(): void {
    const quiet = QUIET_STATES.has(this.state?.state ?? 'idle');
    this.loop.setFpsCap(quiet ? Math.min(QUIET_FPS, this.settings.frameRateCap) : this.settings.frameRateCap);
  }

  private prefersReducedMotion(): boolean {
    if (this.settings.motionPreference === 'reduced') return true;
    if (this.settings.motionPreference === 'full') return false;
    return this.reducedMotionQuery.matches;
  }
}

const idleEvent = (): StateEvent => ({
  state: 'idle',
  label: descriptorFor('idle').bubble,
  ts: Date.now(),
});
