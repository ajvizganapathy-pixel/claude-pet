/**
 * Passive state inference from Claude Desktop's MCP log.
 *
 * The spec anticipated request/streaming markers in the logs. The actual
 * format carries something better: `%APPDATA%\Claude\logs\mcp.log` records
 * every tool call *from every MCP server*, with the full JSON-RPC payload —
 *
 *   2026-04-27T10:44:23.833Z [info] [blender] Message from client:
 *     {"method":"tools/call","params":{"name":"get_scene_info",...},"id":4}
 *   2026-04-27T10:44:31.102Z [info] [blender] Message from server: {"result":...,"id":4}
 *
 * So this source can see the user's real tools, not only the companion's own,
 * and it can pair a call with its response by id to know when work finished.
 *
 * What the logs genuinely do not contain is token streaming, so `typing` is
 * never inferred here — it only arrives from a source that actually knows. A
 * companion that invents a state it cannot justify is worse than one that
 * sits and breathes.
 *
 * The format is undocumented and will change between versions. Every line is
 * parsed defensively and a failure degrades to silence, never to a crash.
 */

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '@shared/log.js';
import type { SourcedStateEvent, StateName } from '@shared/protocol.js';

const log = createLogger('logs');

/** Poll cadence. Fast enough for the ~300ms transition budget, still just a stat. */
const POLL_INTERVAL_MS = 200;

/** A single read is capped so a log rotation cannot pull megabytes into memory. */
const MAX_CHUNK_BYTES = 256 * 1024;

/** Lines longer than this are payload dumps we do not need in full. */
const MAX_LINE_LENGTH = 64 * 1024;

/** After a tool result, the model is reasoning; this is how long we say so. */
const THINKING_WINDOW_MS = 12_000;

const LINE_PATTERN = /^(\S+)\s+\[(\w+)\]\s+\[([^\]]+)\]\s+Message from (client|server):\s*(.*)$/;

interface PendingCall {
  tool: string;
  server: string;
  startedAt: number;
}

export declare interface LogTailer {
  on(event: 'state', listener: (event: SourcedStateEvent) => void): this;
  emit(event: 'state', payload: SourcedStateEvent): boolean;
}

export class LogTailer extends EventEmitter {
  private offset = 0;
  private carry = '';
  private watching = false;
  private reading = false;
  private readonly pending = new Map<string, PendingCall>();
  private thinkingTimer: NodeJS.Timeout | null = null;

  constructor(private readonly logPath: string) {
    super();
  }

  static defaultLogPath(appData: string): string {
    return path.join(appData, 'Claude', 'logs', 'mcp.log');
  }

  /** Returns false when the log is unreadable, so the caller can fall further down the ladder. */
  async start(): Promise<boolean> {
    try {
      const stats = await fsp.stat(this.logPath);
      // Start at the end: history is not state, and replaying it would make
      // the companion act out a session that finished hours ago.
      this.offset = stats.size;
    } catch (err) {
      log.info('MCP log not readable; log inference disabled', err);
      return false;
    }

    fs.watchFile(this.logPath, { interval: POLL_INTERVAL_MS }, () => void this.drain());
    this.watching = true;
    log.debug('tailing', this.logPath);
    return true;
  }

  stop(): void {
    if (this.watching) {
      fs.unwatchFile(this.logPath);
      this.watching = false;
    }
    if (this.thinkingTimer) clearTimeout(this.thinkingTimer);
    this.thinkingTimer = null;
    this.pending.clear();
  }

  private async drain(): Promise<void> {
    if (this.reading) return;
    this.reading = true;
    try {
      const stats = await fsp.stat(this.logPath);
      if (stats.size < this.offset) {
        // Rotated or truncated: start over rather than reading garbage.
        this.offset = 0;
        this.carry = '';
      }
      while (this.offset < stats.size) {
        const end = Math.min(stats.size, this.offset + MAX_CHUNK_BYTES);
        const chunk = await readRange(this.logPath, this.offset, end - 1);
        this.offset = end;
        this.consume(chunk);
      }
    } catch (err) {
      log.debug('log read failed', err);
    } finally {
      this.reading = false;
    }
  }

  private consume(chunk: string): void {
    const text = this.carry + chunk;
    const lines = text.split(/\r?\n/);
    this.carry = lines.pop() ?? '';
    if (this.carry.length > MAX_LINE_LENGTH) this.carry = '';

    for (const line of lines) {
      if (line.length === 0 || line.length > MAX_LINE_LENGTH) continue;
      try {
        this.parseLine(line);
      } catch (err) {
        log.debug('unparsable log line', err);
      }
    }
  }

  private parseLine(line: string): void {
    const match = LINE_PATTERN.exec(line);
    if (!match) return;

    const [, , , server = '', direction, payload = ''] = match;
    const message = parseJson(payload);
    if (!message) return;

    if (direction === 'client') this.onClientMessage(server, message);
    else this.onServerMessage(message);
  }

  private onClientMessage(server: string, message: Record<string, unknown>): void {
    if (message['method'] !== 'tools/call') return;

    const params = message['params'];
    const tool = typeof params === 'object' && params !== null
      ? String((params as Record<string, unknown>)['name'] ?? '')
      : '';
    if (!tool) return;

    const id = idOf(message);
    if (id) this.pending.set(id, { tool, server, startedAt: Date.now() });

    const state = classifyTool(tool);
    this.emitState({
      state,
      label: labelForTool(state, tool),
      task: `${server} — ${tool}`,
      meta: { tool },
    });
  }

  private onServerMessage(message: Record<string, unknown>): void {
    const id = idOf(message);
    if (!id) return;

    const call = this.pending.get(id);
    if (!call) return;
    this.pending.delete(id);

    const elapsed = (Date.now() - call.startedAt) / 1000;

    if (isErrorResult(message)) {
      this.emitState({
        state: 'error',
        label: 'Something failed',
        task: `${call.tool} failed`,
        meta: { tool: call.tool, elapsed },
      });
      return;
    }

    // Another call may already be in flight; the newest one wins.
    if (this.pending.size > 0) return;

    this.emitState({
      state: 'thinking',
      label: 'Thinking…',
      task: 'Reasoning about the result',
      meta: { tool: call.tool, elapsed },
    });

    // Nothing follows a final tool result in the log, so the thinking claim
    // is given an expiry rather than being left standing indefinitely.
    if (this.thinkingTimer) clearTimeout(this.thinkingTimer);
    this.thinkingTimer = setTimeout(() => {
      if (this.pending.size === 0) {
        this.emitState({ state: 'idle', label: 'Idle', task: 'Waiting for work' });
      }
    }, THINKING_WINDOW_MS);
    this.thinkingTimer.unref();
  }

  private emitState(event: Omit<SourcedStateEvent, 'ts' | 'source'>): void {
    this.emit('state', { ...event, source: 'log', ts: Date.now() });
  }
}

async function readRange(file: string, start: number, end: number): Promise<string> {
  const handle = await fsp.open(file, 'r');
  try {
    const length = end - start + 1;
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

function parseJson(payload: string): Record<string, unknown> | null {
  // Some lines summarise rather than dump JSON (`method="tools/list" id=1`).
  if (!payload.startsWith('{')) return null;
  try {
    const value: unknown = JSON.parse(payload);
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const idOf = (message: Record<string, unknown>): string | null => {
  const id = message['id'];
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
};

function isErrorResult(message: Record<string, unknown>): boolean {
  if ('error' in message && message['error']) return true;
  const result = message['result'];
  return (
    typeof result === 'object' &&
    result !== null &&
    (result as Record<string, unknown>)['isError'] === true
  );
}

/**
 * Maps a tool name onto a state by what the name says it does. Tool naming is
 * conventional enough across MCP servers that this is reliable in practice,
 * and an unrecognised tool falls back to the honest generic: something is
 * running.
 */
export function classifyTool(tool: string): StateName {
  const name = tool.toLowerCase();
  if (/(^|_)(read|get|list|search|find|grep|glob|fetch|query|inspect|view)/.test(name)) {
    return 'reading';
  }
  if (/(^|_)(write|edit|create|update|append|patch|apply|replace|generate)/.test(name)) {
    return 'typing';
  }
  return 'executing';
}

function labelForTool(state: StateName, tool: string): string {
  const readable = tool.replace(/[_-]+/g, ' ');
  switch (state) {
    case 'reading':
      return 'Reading project…';
    case 'typing':
      return 'Writing…';
    default:
      return `Running ${readable}…`;
  }
}
