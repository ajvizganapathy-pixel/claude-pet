/**
 * The animation state machine.
 *
 * The prototype damped toward a single pose, which means a fast sequence like
 * `executing → error → thinking` reads as one long smear: each new target
 * overwrites the last before the body has arrived anywhere. This machine keeps
 * the outgoing poses alive as weighted layers and crossfades between them, so
 * every transition starts from a real posture instead of a half-finished one.
 *
 * Layers are capped and pruned, so cost is bounded regardless of how fast
 * states arrive.
 */

import type { StateName } from '@shared/protocol.js';
import { clamp01, smoothstep } from '../engine/math.js';
import { POSES, type PoseContext } from './poses.js';
import { REST_POSE, RIG_CHANNELS, type RigValues } from './rig.js';

/** How long a crossfade takes. Long enough to read, short enough to feel responsive. */
const TRANSITION_SECONDS = 0.26;

/**
 * Terminal states deserve a beat of their own — snapping out of a celebration
 * looks like the companion changed its mind about being pleased.
 */
const SLOW_TRANSITIONS: Partial<Record<StateName, number>> = {
  success: 0.42,
  error: 0.4,
  sleeping: 0.6,
};

/** More than this and the oldest contribution is inaudible anyway. */
const MAX_LAYERS = 3;

/** Below this weight a layer contributes less than a pixel of movement. */
const PRUNE_WEIGHT = 0.002;

interface Layer {
  state: StateName;
  /** Raw 0..1 influence, before normalisation. */
  weight: number;
  /** Scene time at which this layer became the active state. */
  enteredAt: number;
}

export class PoseMachine {
  private layers: Layer[] = [{ state: 'idle', weight: 1, enteredAt: 0 }];
  private transitionRate = 1 / TRANSITION_SECONDS;

  get current(): StateName {
    return this.layers[this.layers.length - 1]?.state ?? 'idle';
  }

  /** True while a crossfade is still in progress. */
  get isSettled(): boolean {
    return this.layers.length === 1;
  }

  transitionTo(state: StateName, now: number): void {
    if (state === this.current) return;

    // Re-entering a state that is still fading out reuses its layer, so
    // flapping between two states cannot accumulate stale contributions.
    const existing = this.layers.findIndex((layer) => layer.state === state);
    if (existing !== -1) {
      const [layer] = this.layers.splice(existing, 1);
      if (layer) {
        layer.enteredAt = now;
        this.layers.push(layer);
      }
    } else {
      this.layers.push({ state, weight: 0, enteredAt: now });
    }

    if (this.layers.length > MAX_LAYERS) this.layers.splice(0, this.layers.length - MAX_LAYERS);
    this.transitionRate = 1 / (SLOW_TRANSITIONS[state] ?? TRANSITION_SECONDS);
  }

  /** Advances the crossfade. Call once per frame before `evaluate`. */
  update(dt: number): void {
    const step = dt * this.transitionRate;
    const lastIndex = this.layers.length - 1;

    for (let i = 0; i <= lastIndex; i += 1) {
      const layer = this.layers[i];
      if (!layer) continue;
      layer.weight = clamp01(layer.weight + (i === lastIndex ? step : -step));
    }

    if (this.layers.length > 1) {
      this.layers = this.layers.filter((layer, index) =>
        index === this.layers.length - 1 ? true : layer.weight > PRUNE_WEIGHT,
      );
    }
  }

  /**
   * Writes the blended pose into `target`.
   *
   * Channels a pose does not mention fall back to the rest pose, so blending
   * is always against the neutral animal rather than against whatever the
   * previous state happened to leave behind.
   */
  evaluate(target: RigValues, context: Omit<PoseContext, 'stateTime'>): void {
    if (this.layers.length === 1) {
      const layer = this.layers[0];
      if (!layer) return;
      const pose = POSES[layer.state]({ ...context, stateTime: context.time - layer.enteredAt });
      for (const channel of RIG_CHANNELS) target[channel] = pose[channel] ?? REST_POSE[channel];
      return;
    }

    for (const channel of RIG_CHANNELS) target[channel] = 0;

    let total = 0;
    for (const layer of this.layers) {
      const weight = smoothstep(layer.weight);
      if (weight <= 0) continue;
      total += weight;

      const pose = POSES[layer.state]({ ...context, stateTime: context.time - layer.enteredAt });
      for (const channel of RIG_CHANNELS) {
        target[channel] += (pose[channel] ?? REST_POSE[channel]) * weight;
      }
    }

    if (total <= 0) {
      for (const channel of RIG_CHANNELS) target[channel] = REST_POSE[channel];
      return;
    }
    for (const channel of RIG_CHANNELS) target[channel] /= total;
  }
}
