/**
 * The named-pipe endpoint the MCP server reports state to.
 *
 * The companion and the MCP server have independent lifetimes — Claude Desktop
 * may launch the server long before the companion starts, or keep it running
 * after the companion quits — so neither side may assume the other is up. The
 * server buffers and reconnects; this end simply accepts whatever arrives and
 * survives clients coming and going.
 *
 * Framing is newline-delimited JSON, one event per line.
 */

import { EventEmitter } from 'node:events';
import net from 'node:net';
import { createLogger } from '@shared/log.js';
import { parseStateEvent, resolvePipePath, type SourcedStateEvent } from '@shared/protocol.js';

const log = createLogger('pipe');

/** A client that sends a line longer than this is malfunctioning. */
const MAX_LINE_LENGTH = 16 * 1024;

export declare interface StatePipeServer {
  on(event: 'state', listener: (payload: SourcedStateEvent) => void): this;
  emit(event: 'state', payload: SourcedStateEvent): boolean;
  /** Fired when an MCP server attaches or detaches, with the new count. */
  on(event: 'clients', listener: (count: number) => void): this;
  emit(event: 'clients', count: number): boolean;
}

export class StatePipeServer extends EventEmitter {
  private server: net.Server | null = null;
  private readonly sockets = new Set<net.Socket>();

  constructor(private readonly pipePath: string = resolvePipePath()) {
    super();
  }

  get clientCount(): number {
    return this.sockets.size;
  }

  /** Resolves false when the pipe cannot be created; the caller falls back. */
  start(): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer((socket) => this.accept(socket));

      server.once('error', (err: NodeJS.ErrnoException) => {
        // EADDRINUSE means another companion owns the pipe. The single-instance
        // lock normally prevents this; if it happens anyway, yield rather than
        // fight over the endpoint.
        log.warn('pipe unavailable; falling back to log inference', err);
        this.server = null;
        resolve(false);
      });

      server.listen(this.pipePath, () => {
        this.server = server;
        server.on('error', (err) => log.warn('pipe server error', err));
        log.info('listening on', this.pipePath);
        resolve(true);
      });
    });
  }

  stop(): void {
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    this.server?.close();
    this.server = null;
  }

  private accept(socket: net.Socket): void {
    this.sockets.add(socket);
    socket.setEncoding('utf8');
    log.debug('client connected');
    this.emit('clients', this.sockets.size);

    let buffer = '';

    socket.on('data', (chunk: string) => {
      buffer += chunk;
      if (buffer.length > MAX_LINE_LENGTH) {
        log.warn('oversized payload; dropping client');
        socket.destroy();
        return;
      }

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.trim().length === 0) continue;
        this.handleLine(line);
      }
    });

    const forget = (): void => {
      if (!this.sockets.delete(socket)) return;
      log.debug('client disconnected');
      this.emit('clients', this.sockets.size);
    };
    socket.on('close', forget);
    socket.on('error', (err) => {
      log.debug('client error', err);
      forget();
    });
  }

  private handleLine(line: string): void {
    let payload: unknown;
    try {
      payload = JSON.parse(line);
    } catch {
      log.debug('ignoring malformed line');
      return;
    }

    const event = parseStateEvent(payload);
    if (!event) {
      log.debug('ignoring invalid event');
      return;
    }

    this.emit('state', { ...event, source: 'tool' });
  }
}
