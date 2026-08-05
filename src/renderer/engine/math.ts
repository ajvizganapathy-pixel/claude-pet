/**
 * Small numeric helpers shared by the engine and the rig.
 *
 * `damp` is the one that matters: it is frame-rate independent, so the same
 * motion plays identically at 30, 60 or 144 FPS. Nothing in the rig may assign
 * an animated value directly — everything moves through here.
 */

/** Exponential approach of `current` toward `target`. `rate` is per second. */
export const damp = (current: number, target: number, rate: number, dt: number): number =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

export const clamp01 = (value: number): number => clamp(value, 0, 1);

/** Smooth 0..1 ramp with zero derivative at both ends — used for crossfades. */
export const smoothstep = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/** Decaying oscillation, for hops and recoils that settle on their own. */
export const springPulse = (t: number, frequency: number, decay: number): number =>
  Math.max(0, Math.sin(t * frequency)) * Math.exp(-t * decay);

/** Converts `#rrggbb` plus an alpha into a canvas-ready rgba string. */
export function hexAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  if (!Number.isFinite(n)) return `rgba(255,255,255,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
