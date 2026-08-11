/**
 * Settings schema, defaults and normalisation. Shared so the main process, the
 * companion renderer and the settings window all agree on the shape without
 * anyone re-deriving it.
 *
 * Normalisation is total: `normaliseSettings` accepts anything (a hand-edited
 * file, a partial patch, `undefined`) and always returns a valid object.
 */

export type CornerAnchor = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export type MotionPreference = 'auto' | 'full' | 'reduced';

/**
 * Which character the renderer draws.
 *
 *  - `sprite` plays the baked cartoon-cat sheet in `assets/character/`.
 *  - `procedural` draws the original vector rig, which needs no assets and is
 *    also what `sprite` falls back to if the sheet cannot be loaded.
 */
export type CharacterStyle = 'sprite' | 'procedural';

export interface Settings {
  /** Explicit window position in screen pixels; null means "use the anchor". */
  position: { x: number; y: number } | null;
  anchor: CornerAnchor;
  /** Which character artwork the renderer draws. */
  character: CharacterStyle;
  /** Character scale multiplier. */
  scale: number;
  /** Global motion multiplier; 0 stills the rig without hiding it. */
  motion: number;
  /** Hide the companion when Claude Desktop is not the foreground window. */
  followClaudeFocus: boolean;
  /** Show the task panel next to the character. */
  showTaskPanel: boolean;
  /** Honour the OS reduced-motion setting, or force one way. */
  motionPreference: MotionPreference;
  /** Off by default, per the brief. */
  sound: boolean;
  /** Start hidden in the tray. */
  startHidden: boolean;
  /**
   * Register the app with the OS so it starts at login. Windows-only; the
   * setting is stored on every platform but only acted on where it applies.
   */
  launchAtLogin: boolean;
  /** Cap the render loop; 60 unless the user wants to spend less power. */
  frameRateCap: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
}

export const DEFAULT_SETTINGS: Settings = {
  position: null,
  anchor: 'bottom-right',
  character: 'sprite',
  scale: 1,
  motion: 1,
  followClaudeFocus: true,
  showTaskPanel: true,
  motionPreference: 'auto',
  sound: false,
  startHidden: false,
  launchAtLogin: false,
  frameRateCap: 60,
  logLevel: 'info',
};

export const SETTINGS_LIMITS = {
  scale: { min: 0.6, max: 1.6 },
  motion: { min: 0, max: 1.5 },
  frameRateCap: { min: 24, max: 144 },
} as const;

const ANCHORS: readonly CornerAnchor[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
const CHARACTERS: readonly CharacterStyle[] = ['sprite', 'procedural'];
const MOTION_PREFS: readonly MotionPreference[] = ['auto', 'full', 'reduced'];
const LOG_LEVELS: readonly Settings['logLevel'][] = ['debug', 'info', 'warn', 'error', 'silent'];

const clamp = (n: number, min: number, max: number): number =>
  n < min ? min : n > max ? max : n;

function num(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function position(value: unknown): Settings['position'] {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const x = raw['x'];
  const y = raw['y'];
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.round(x), y: Math.round(y) };
}

/** Merges an untrusted partial over a base, clamping every field into range. */
export function normaliseSettings(input: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(raw, key);

  return {
    position: has('position') ? position(raw['position']) : base.position,
    anchor: oneOf(raw['anchor'], ANCHORS, base.anchor),
    character: oneOf(raw['character'], CHARACTERS, base.character),
    scale: num(raw['scale'], base.scale, SETTINGS_LIMITS.scale.min, SETTINGS_LIMITS.scale.max),
    motion: num(raw['motion'], base.motion, SETTINGS_LIMITS.motion.min, SETTINGS_LIMITS.motion.max),
    followClaudeFocus: bool(raw['followClaudeFocus'], base.followClaudeFocus),
    showTaskPanel: bool(raw['showTaskPanel'], base.showTaskPanel),
    motionPreference: oneOf(raw['motionPreference'], MOTION_PREFS, base.motionPreference),
    sound: bool(raw['sound'], base.sound),
    startHidden: bool(raw['startHidden'], base.startHidden),
    launchAtLogin: bool(raw['launchAtLogin'], base.launchAtLogin),
    frameRateCap: Math.round(
      num(
        raw['frameRateCap'],
        base.frameRateCap,
        SETTINGS_LIMITS.frameRateCap.min,
        SETTINGS_LIMITS.frameRateCap.max,
      ),
    ),
    logLevel: oneOf(raw['logLevel'], LOG_LEVELS, base.logLevel),
  };
}
