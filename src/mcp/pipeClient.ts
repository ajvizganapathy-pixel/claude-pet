/**
 * The MCP server's end of the pipe to the companion.
 *
 * The two processes have independent lifetimes: Claude Desktop starts this
 * server whenever it likes, and the companion may not be running yet, may be
 * restarting, or may never start at all. So this client:
 *
 *  - buffers events while disconnected, up to a bounded queue,
 *  - reconnects with backoff, indefinitely and quietly,
 *  - never throws, and never writes to stdout, which belongs to JSON-RPC.
 *
 * A companion that is not running is not an error. It is Tuesday.
 */

import net from 'node:net';
import { PIPE_DELIMITER, resolvePipePath, type StateEvent } from '@shared/protocol.js';

/** Old state is worthless; the queue holds only enough to survive a restart. */
const MAX_QUEUE = 16;

const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 10_000;

export class CompanionPipeClient {
  private socket: net.Socket | null = null;
  private queue: StateEvent[] = [];
  private backoff = RECONNECT_MIN_MS;
  private timer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(private readonly pipePath: string = resolvePipePath()) {}

  get connected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  start(): void {
    this.closed = false;
    this.connect();
  }

  send(event: StateEvent): void {
    if (this.closed) return;

    if (!this.connected) {
      this.queue.push(event);
      if (this.queue.length > MAX_QUEUE) this.queue.shift();
      return;
    }

    this.write(event);
  }

  stop(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.socket?.destroy();
    this.socket = null;
    this.queue = [];
  }

  private connect(): void {
    if (this.closed || this.socket) return;

    const socket = net.connect(this.pipePath);
    socket.setNoDelay(true);

    socket.once('connect', () => {
      this.socket = socket;
      this.backoff = RECONNECT_MIN_MS;
      const pending = this.queue;
      this.queue = [];
      for (const event of pending) this.write(event);
    });

    const retry = (): void => {
      socket.destroy();
      if (this.socket === socket) this.socket = null;
      this.scheduleReconnect();
    };
    socket.once('error', retry);
    socket.once('close', retry);
  }

  private scheduleReconnect(): void {
    if (this.closed || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.connect();
    }, this.backoff);
    // Reconnection must never be the reason this process stays alive.
    this.timer.unref();
    this.backoff = Math.min(RECONNECT_MAX_MS, this.backoff * 2);
  }

  private write(event: StateEvent): void {
    try {
      this.socket?.write(JSON.stringify(event) + PIPE_DELIMITER);
    } catch {
      // A failed write means the companion went away mid-send; the close
      // handler will reconnect. Losing one event is the correct outcome.
    }
  }
}
