// The animation table: one clip per row of the sprite sheet.
//
// A clip is a name, a frame count, a playback rate, and a function from
// normalised loop position to a pose. Everything about how the companion moves
// lives here — `cat.mjs` only knows how to draw a pose, and the renderer only
// knows how to play a row.
//
// Adding an expression means adding one entry here and one line in
// `src/renderer/rig2d/clipForState.ts`, and nothing else.

const TAU = Math.PI * 2;

/** Sine over the loop, so every clip is seamless by construction. */
const wave = (t, phase = 0) => Math.sin((t + phase) * TAU);

/** Triangle wave — a linear sweep out and back, for scanning eyes. */
const sweep = (t) => 1 - 4 * Math.abs(((t + 0.25) % 1) - 0.5);

/** A single smooth pulse centred at `at`, `width` wide, zero at the loop seam. */
function pulse(t, at, width) {
  const d = Math.abs(((t - at + 1.5) % 1) - 0.5) - 0.5;
  const x = 1 + d / (width / 2);
  return x <= 0 ? 0 : x >= 1 ? 1 : 0.5 - 0.5 * Math.cos(x * Math.PI);
}

/** The resting breath every clip shares, so the character never sits dead still. */
const breathe = (t, depth = 1) => ({
  squash: (0.016 + 0.016 * wave(t)) * depth,
  bodyY: -0.005 * wave(t) * depth,
});

export const CLIPS = [
  {
    name: 'idle',
    frames: 12,
    fps: 10,
    pose: (t) => ({
      ...breathe(t),
      tailSweep: 0.40 * wave(t),
      headTilt: 0.022 * wave(t, 0.18),
      pupilX: 0.16 * wave(t, 0.30),
      ears: 1,
    }),
  },
  {
    // Played in place of `idle` now and then, which is how a sprite sheet gets
    // an irregular blink without a compositing layer.
    name: 'idleBlink',
    frames: 12,
    fps: 10,
    pose: (t) => ({
      ...breathe(t),
      tailSweep: 0.40 * wave(t),
      headTilt: 0.022 * wave(t, 0.18),
      pupilX: 0.16 * wave(t, 0.30),
      ears: 1,
      lid: pulse(t, 0.45, 0.22),
    }),
  },
  {
    name: 'thinking',
    frames: 12,
    fps: 9,
    pose: (t) => ({
      ...breathe(t, 0.7),
      chinPaw: 1,
      headTilt: -0.10 + 0.02 * wave(t),
      headY: -0.010,
      pupilX: 0.45 + 0.30 * wave(t),
      pupilY: -0.55,
      brow: -0.20,
      ears: 0.92,
      tailSweep: 0.18 * wave(t, 0.4),
      lid: 0.12,
    }),
  },
  {
    name: 'reading',
    frames: 12,
    fps: 10,
    pose: (t) => ({
      ...breathe(t, 0.8),
      headY: 0.028,
      headTilt: 0.05,
      pupilX: 0.75 * sweep(t),
      pupilY: 0.55,
      lid: 0.26,
      ears: 0.88,
      tailSweep: 0.22 * wave(t, 0.25),
    }),
  },
  {
    name: 'typing',
    frames: 8,
    fps: 14,
    pose: (t) => ({
      ...breathe(t, 0.5),
      headY: 0.020,
      headTilt: 0.03,
      pupilY: 0.50,
      // The paws alternate at twice the loop rate, which is what makes it read
      // as typing rather than as waving.
      pawL: 0.5 + 0.5 * wave(t * 2),
      pawR: 0.5 + 0.5 * wave(t * 2, 0.5),
      mouth: 0.10,
      ears: 0.95,
      tailSweep: 0.30 * wave(t),
    }),
  },
  {
    name: 'executing',
    frames: 10,
    fps: 12,
    pose: (t) => ({
      ...breathe(t, 0.9),
      ears: 1,
      brow: -0.35,
      mouth: 0.14,
      pupilY: -0.10,
      // A fast flick rather than a sway: alert, not relaxed.
      tailSweep: 0.55 * wave(t * 2),
      tailLift: 0.35,
    }),
  },
  {
    name: 'working',
    frames: 12,
    fps: 8,
    pose: (t) => ({
      ...breathe(t, 1.5),
      headY: 0.024,
      lid: 0.38,
      ears: 0.55,
      brow: 0.45,
      smile: -0.55,
      pupilY: 0.20,
      tailSweep: 0.14 * wave(t),
    }),
  },
  {
    name: 'success',
    frames: 10,
    fps: 12,
    pose: (t) => {
      // Two hops per loop, with the character actually leaving the floor.
      const hop = Math.abs(Math.sin(t * Math.PI * 2));
      return {
        smileEyes: 1,
        smile: 1,
        mouth: 0.40,
        bodyY: -0.055 * hop,
        squash: 0.05 * (1 - hop),
        pawL: 0.55 + 0.45 * hop,
        pawR: 0.55 + 0.45 * hop,
        ears: 1,
        tailLift: 0.85,
        tailSweep: 0.35 * wave(t * 2),
      };
    },
  },
  {
    name: 'error',
    frames: 8,
    fps: 14,
    pose: (t) => ({
      ...breathe(t, 0.4),
      brow: 0.95,
      ears: 0.15,
      mouth: 0.80,
      lid: 0,
      pupilY: -0.15,
      // A small horizontal shake, three times per loop.
      bodyX: 0.009 * wave(t * 3),
      tailSweep: -0.30,
      tailLift: -0.25,
    }),
  },
  {
    name: 'sleeping',
    frames: 12,
    fps: 6,
    pose: (t) => ({
      ...breathe(t, 2.2),
      lid: 1,
      headY: 0.046,
      headTilt: 0.055,
      ears: 0.40,
      smile: 0.30,
      tailSweep: 0.16 * wave(t),
    }),
  },
  {
    // A one-shot reaction to being clicked; the scene falls back to the state
    // clip when it finishes, so this row must not loop.
    name: 'poke',
    frames: 8,
    fps: 16,
    loop: false,
    pose: (t) => {
      const settle = 1 - t;
      return {
        bodyY: -0.030 * settle * Math.abs(Math.sin(t * Math.PI * 2)),
        squash: -0.04 * settle,
        ears: 1,
        brow: 0.60 * settle,
        mouth: 0.55 * settle,
        lid: 0,
        pupilY: -0.25 * settle,
        tailLift: 0.5 * settle,
        tailSweep: 0.6 * settle * wave(t * 2),
      };
    },
  },
];
