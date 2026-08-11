/**
 * The state → clip mapping, and the idle variation that keeps a looping sheet
 * from looking mechanical.
 *
 * This is the sprite equivalent of `rig/poses.ts`: adding an expression means
 * adding a clip in `scripts/sprites/clips.mjs`, regenerating, and adding one
 * line here.
 */

import type { StateName } from '@shared/protocol.js';
import { clipByName, type SpriteClip } from './sheetManifest.js';

/** Clip name per state. Every state must resolve, so `idle` is the backstop. */
const CLIP_NAMES: Record<StateName, string> = {
  idle: 'idle',
  thinking: 'thinking',
  reading: 'reading',
  typing: 'typing',
  executing: 'executing',
  working: 'working',
  success: 'success',
  error: 'error',
  sleeping: 'sleeping',
};

/**
 * Variants played in place of `idle`, with the weight each is chosen at. A cat
 * that blinks on a fixed cadence reads as a loop; one that blinks on some
 * passes and not others reads as alive.
 */
const IDLE_VARIANTS: readonly { name: string; weight: number }[] = [
  { name: 'idle', weight: 0.6 },
  { name: 'idleBlink', weight: 0.4 },
];

/** The one-shot played when the character is clicked. */
export const POKE_CLIP = 'poke';

export function clipForState(state: StateName): SpriteClip {
  const clip = clipByName(CLIP_NAMES[state]) ?? clipByName('idle');
  if (!clip) throw new Error('sprite sheet has no idle clip');
  return clip;
}

/** Picks the next idle variant. Injectable randomness keeps this testable. */
export function pickIdleVariant(random: () => number = Math.random): SpriteClip {
  const total = IDLE_VARIANTS.reduce((sum, v) => sum + v.weight, 0);
  let roll = random() * total;
  for (const variant of IDLE_VARIANTS) {
    roll -= variant.weight;
    if (roll <= 0) {
      const clip = clipByName(variant.name);
      if (clip) return clip;
    }
  }
  return clipForState('idle');
}

/** True when a clip is one of the interchangeable idle variants. */
export const isIdleVariant = (clip: SpriteClip | null): boolean =>
  clip !== null && IDLE_VARIANTS.some((v) => v.name === clip.name);
