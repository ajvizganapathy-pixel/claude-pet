/**
 * The event contract between the observers (MCP server, log tailer) and the
 * renderer. See `specs/state-protocol.md`.
 *
 * This module is imported by all three processes and must stay dependency-free.
 */

export const STATE_NAMES = [
  'idle',
  'thinking',
  'reading',
  'typing',
  'executing',
  'working',
  'success',
  'error',
  'sleeping',
] as const;

export type StateName = (typeof STATE_NAMES)[number];

export interface StateMeta {
  /** Number of files touched by the current task, when known. */
  files?: number;
  /** Seconds the current task has been running, when the source can measure it. */
  elapsed?: number;
  /** Name of the tool that produced this event, for diagnostics. */
  tool?: string;
}

export interface StateEvent {
  state: StateName;
  /** Bubble text, already human-facing: "Running tests…" */
  label: string;
  /** Task panel line: "npm install — resolving packages" */
  task?: string;
  /** 0..1. Omitted when genuinely unknown — never synthesised. */
  progress?: number;
  /** Tokens/sec or similar; drives paw animation speed. */
  rate?: number;
  meta?: StateMeta;
  /** Epoch milliseconds at the moment of the transition. */
  ts: number;
}

/**
 * Confidence tier of the source that produced an event. The arbiter uses this
 * to decide which source wins when several are alive at once.
 */
export const SOURCE_PRIORITY = {
  /** Direct tool invocations — unambiguous. */
  tool: 30,
  /** Parsed from Claude Desktop logs — best effort, format undocumented. */
  log: 20,
  /** Foreground-window detection — only ever produces idle/sleeping. */
  focus: 10,
} as const;

export type SourceKind = keyof typeof SOURCE_PRIORITY;

export interface SourcedStateEvent extends StateEvent {
  source: SourceKind;
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isStateName = (v: unknown): v is StateName =>
  typeof v === 'string' && (STATE_NAMES as readonly string[]).includes(v);

/**
 * Validates an untrusted payload — anything arriving over the pipe or parsed
 * out of a log file. Returns `null` rather than throwing: an unreadable event
 * must degrade to "no new information", never crash a process.
 */
export function parseStateEvent(value: unknown): StateEvent | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;

  if (!isStateName(raw['state'])) return null;
  if (typeof raw['label'] !== 'string') return null;

  const event: StateEvent = {
    state: raw['state'],
    label: raw['label'].slice(0, 120),
    ts: isFiniteNumber(raw['ts']) ? raw['ts'] : Date.now(),
  };

  if (typeof raw['task'] === 'string') event.task = raw['task'].slice(0, 200);
  if (isFiniteNumber(raw['progress'])) event.progress = clamp01(raw['progress']);
  if (isFiniteNumber(raw['rate'])) event.rate = Math.max(0, raw['rate']);

  const meta = parseMeta(raw['meta']);
  if (meta) event.meta = meta;

  return event;
}

function parseMeta(value: unknown): StateMeta | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const meta: StateMeta = {};
  if (isFiniteNumber(raw['files'])) meta.files = Math.max(0, Math.floor(raw['files']));
  if (isFiniteNumber(raw['elapsed'])) meta.elapsed = Math.max(0, raw['elapsed']);
  if (typeof raw['tool'] === 'string') meta.tool = raw['tool'].slice(0, 60);
  return Object.keys(meta).length > 0 ? meta : null;
}

export const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** `working` is `executing` that outlived this threshold, not a separate signal. */
export const WORKING_THRESHOLD_MS = 8_000;

/** Named pipe the MCP server writes to and the main process listens on. */
export const PIPE_PATH = '\\\\.\\pipe\\saber';

/**
 * The pipe both ends should use. `SABER_PIPE` overrides it, which lets tests
 * (and two developers on one machine) run without fighting over the endpoint.
 */
export const resolvePipePath = (env: NodeJS.ProcessEnv = process.env): string =>
  env['SABER_PIPE'] || PIPE_PATH;

/** Wire framing for the pipe: newline-delimited JSON, one event per line. */
export const PIPE_DELIMITER = '\n';
