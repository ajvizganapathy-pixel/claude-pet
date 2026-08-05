/**
 * Decides what the companion is actually doing, from several sources of
 * differing confidence.
 *
 * The fallback ladder from the protocol lives here:
 *   tool calls over the pipe  (exact)
 *     -> MCP log inference    (best effort)
 *       -> foreground window  (idle vs sleeping only)
 *
 * A lower-confidence source may not contradict a higher one while the higher
 * one is still fresh, so log guesswork cannot talk over a tool that reported
 * exactly what it was doing.
 *
 * Two derived rules the sources never emit themselves:
 *  - `working` is `executing` that outlived the threshold, not a separate
 *    detection path.
 *  - Nothing stays claimed forever. An unrefreshed state decays to idle,
 *    because the companion should never show a state it can no longer justify.
 */

import { EventEmitter } from 'node:events';
import { createLogger } from '@shared/log.js';
import {
  SOURCE_PRIORITY,
  WORKING_THRESHOLD_MS,
  type SourceKind,
  type SourcedStateEvent,
  type StateEvent,
  type StateName,
} from '@shared/protocol.js';
import { descriptorFor } from '@shared/states.js';

const log = createLogger('arbiter');

/** How long a source's claim outranks lower-confidence sources. */
const FRESHNESS_MS = 6_000;

/** An active state with no refresh for this long decays to idle. */
const STALE_MS = 45_000;

/** Terminal states hold for at least this long, so a result is legible. */
const TERMINAL_HOLD_MS = 4_000;

/** Claude unfocused for this long means the session has gone quiet. */
const SLEEP_AFTER_MS = 90_000;

/** How often derived transitions are re-evaluated. */
const TICK_MS = 500;

const TERMINAL: ReadonlySet<StateName> = new Set(['success', 'error']);
const RESTFUL: ReadonlySet<StateName> = new Set(['idle', 'sleeping']);

export declare interface StateArbiter {
  on(event: 'state', listener: (payload: StateEvent) => void): this;
  emit(event: 'state', payload: StateEvent): boolean;
}

export class StateArbiter extends EventEmitter {
  private current: StateEvent = idleEvent();
  private currentSource: SourceKind = 'focus';
  private enteredAt = Date.now();
  private lastSubmitAt = 0;
  private claudeFocused = true;
  private unfocusedSince: number | null = null;
  private ticker: NodeJS.Timeout | null = null;

  get state(): StateEvent {
    return this.current;
  }

  start(): void {
    if (this.ticker) return;
    this.ticker = setInterval(() => this.tick(), TICK_MS);
    this.ticker.unref();
  }

  stop(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  /** Feeds an event from one of the sources. */
  submit(event: SourcedStateEvent): void {
    if (!this.accepts(event)) {
      log.debug(`ignoring ${event.source} ${event.state}; ${this.currentSource} is fresher`);
      return;
    }

    const { source, ...rest } = event;
    this.currentSource = source;
    this.lastSubmitAt = Date.now();
    this.publish(rest);
  }

  /** Foreground-window signal — the bottom rung of the ladder. */
  setClaudeFocused(focused: boolean): void {
    if (this.claudeFocused === focused) return;
    this.claudeFocused = focused;
    this.unfocusedSince = focused ? null : Date.now();

    // Returning to Claude while asleep is an immediate wake-up; everything
    // else is left to the tick, so focus never interrupts real work.
    if (focused && this.current.state === 'sleeping') {
      this.currentSource = 'focus';
      this.publish(idleEvent());
    }
  }

  private accepts(event: SourcedStateEvent): boolean {
    const incoming = SOURCE_PRIORITY[event.source];
    const holding = SOURCE_PRIORITY[this.currentSource];
    if (incoming >= holding) return true;
    return Date.now() - this.lastSubmitAt > FRESHNESS_MS;
  }

  /** Derived transitions: promotion to `working`, decay to idle, sleeping. */
  private tick(): void {
    const now = Date.now();
    const age = now - this.enteredAt;

    if (this.current.state === 'executing' && age >= WORKING_THRESHOLD_MS) {
      this.publish({
        ...this.current,
        state: 'working',
        label: this.current.label,
        ts: now,
      });
      return;
    }

    if (TERMINAL.has(this.current.state) && age >= TERMINAL_HOLD_MS) {
      this.currentSource = 'focus';
      this.publish(idleEvent());
      return;
    }

    if (!RESTFUL.has(this.current.state) && now - this.lastSubmitAt >= STALE_MS) {
      log.debug('state went stale; returning to idle');
      this.currentSource = 'focus';
      this.publish(idleEvent());
      return;
    }

    if (
      this.current.state === 'idle' &&
      this.unfocusedSince !== null &&
      now - this.unfocusedSince >= SLEEP_AFTER_MS
    ) {
      this.currentSource = 'focus';
      this.publish(sleepingEvent());
    }
  }

  private publish(event: StateEvent): void {
    const changed =
      event.state !== this.current.state ||
      event.label !== this.current.label ||
      event.task !== this.current.task ||
      event.progress !== this.current.progress;

    if (event.state !== this.current.state) this.enteredAt = Date.now();
    this.current = event;
    if (changed) this.emit('state', event);
  }
}

function idleEvent(): StateEvent {
  const descriptor = descriptorFor('idle');
  return { state: 'idle', label: descriptor.bubble, task: descriptor.task, ts: Date.now() };
}

function sleepingEvent(): StateEvent {
  const descriptor = descriptorFor('sleeping');
  return { state: 'sleeping', label: descriptor.bubble, task: descriptor.task, ts: Date.now() };
}
