/**
 * Presentation metadata for each state: the parts both the main process (tray
 * tooltips, fallback labels) and the renderer (accent colour, particles) need.
 *
 * The *motion* for a state lives in `src/renderer/rig/poses.ts`. Adding an
 * expression means adding one entry here and one pose there — nothing else.
 */

import type { StateName } from './protocol.js';

export type ParticleKind = 'think' | 'spark' | 'sweat' | 'zzz';

export interface StateDescriptor {
  /** Short name used in the tray menu and diagnostics. */
  label: string;
  /** Default bubble text when an event does not carry its own. */
  bubble: string;
  /** Default task-panel line. */
  task: string;
  /** Drives the bubble dot, progress bar and ambient glow. */
  accent: string;
  particles?: ParticleKind;
  /** Replaces the task line entirely for terminal states. */
  badge?: string;
}

export const STATE_DESCRIPTORS: Record<StateName, StateDescriptor> = {
  idle: {
    label: 'idle',
    bubble: 'Idle',
    task: 'Waiting for work',
    accent: '#7E9CC4',
  },
  thinking: {
    label: 'thinking',
    bubble: 'Thinking…',
    task: 'Reasoning about the request',
    accent: '#9B8CD4',
    particles: 'think',
  },
  reading: {
    label: 'reading',
    bubble: 'Reading project…',
    task: 'Scanning repository files',
    accent: '#7E9CC4',
  },
  typing: {
    label: 'typing',
    bubble: 'Generating code…',
    task: 'Writing components',
    accent: '#6FC49B',
  },
  executing: {
    label: 'executing',
    bubble: 'Executing command…',
    task: 'Running a command',
    accent: '#D98A55',
  },
  working: {
    label: 'long task',
    bubble: 'Working…',
    task: 'Long-running task',
    accent: '#D98A55',
    particles: 'sweat',
  },
  success: {
    label: 'success',
    bubble: 'Finished',
    task: 'Task complete',
    accent: '#6FC49B',
    particles: 'spark',
    badge: '✔ Task complete',
  },
  error: {
    label: 'error',
    bubble: 'Fixing errors…',
    task: 'Something failed — waiting for a fix',
    accent: '#D9605A',
    badge: '⚠ Failed',
  },
  sleeping: {
    label: 'sleeping',
    bubble: 'Asleep',
    task: 'No activity',
    accent: '#4C5670',
    particles: 'zzz',
  },
};

export const descriptorFor = (state: StateName): StateDescriptor => STATE_DESCRIPTORS[state];
