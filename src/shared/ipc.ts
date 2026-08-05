/**
 * The complete main <-> renderer surface. Channels are declared once here and
 * both sides import these types, so a renamed payload field is a compile error
 * rather than a silent no-op at runtime.
 */

import type { StateEvent } from './protocol.js';
import type { Settings } from './settings.js';

/** Main -> renderer, pushed. */
export const PUSH = {
  state: 'saber:state',
  settings: 'saber:settings',
  /** Sent when the window is shown or hidden so the render loop can sleep. */
  visibility: 'saber:visibility',
  /** Dev-only hot reload nudge. */
  reload: 'saber:reload',
} as const;

/** Renderer -> main, fire and forget. */
export const SEND = {
  /** Cursor entered or left the character's silhouette. */
  hover: 'saber:hover',
  /** User dragged the character; main moves the window. */
  drag: 'saber:drag',
  openSettings: 'saber:open-settings',
  /** Renderer is up and wants the current state replayed. */
  ready: 'saber:ready',
} as const;

/** Renderer -> main, awaited. */
export const INVOKE = {
  getSettings: 'saber:get-settings',
  patchSettings: 'saber:patch-settings',
  getState: 'saber:get-state',
  quit: 'saber:quit',
} as const;

export interface VisibilityPayload {
  visible: boolean;
}

export interface HoverPayload {
  /** True while the cursor is over the silhouette; the window stops ignoring clicks. */
  inside: boolean;
}

export type DragPhase = 'start' | 'move' | 'end';

export interface DragPayload {
  phase: DragPhase;
  /** Movement since the previous message, in device-independent pixels. */
  dx: number;
  dy: number;
}

/**
 * The API the preload script exposes on `window.saber`. Declared here so the
 * renderer and the preload implementation cannot disagree.
 */
export interface SaberApi {
  onState(handler: (event: StateEvent) => void): () => void;
  onSettings(handler: (settings: Settings) => void): () => void;
  onVisibility(handler: (payload: VisibilityPayload) => void): () => void;
  onReload(handler: () => void): () => void;

  setHover(payload: HoverPayload): void;
  drag(payload: DragPayload): void;
  openSettings(): void;
  ready(): void;

  getSettings(): Promise<Settings>;
  patchSettings(patch: Partial<Settings>): Promise<Settings>;
  getState(): Promise<StateEvent | null>;
  quit(): void;
}

declare global {
  interface Window {
    saber: SaberApi;
  }
}
