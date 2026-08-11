/**
 * The MCP server and the companion have independent lifetimes: Claude Desktop
 * may have had the server running for hours before the companion starts, and
 * the companion may be restarted underneath it. These are the promises that
 * make that survivable.
 */

import assert from 'node:assert/strict';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { CompanionPipeClient } from '../src/mcp/pipeClient.js';
import { parseStateEvent, type StateEvent } from '@shared/protocol.js';

const event = (state: StateEvent['state'], label: string): StateEvent => ({
  state,
  label,
  ts: Date.now(),
});

/** A stand-in for the companion: collects events, and can be torn down. */
class FakeCompanion {
  readonly received: StateEvent[] = [];
  private server: net.Server | null = null;
  private readonly sockets = new Set<net.Socket>();

  constructor(readonly pipePath: string) {}

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => {
        this.sockets.add(socket);
        socket.on('close', () => this.sockets.delete(socket));
        socket.setEncoding('utf8');
        let buffer = '';
        socket.on('data', (chunk: string) => {
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            const parsed = parseStateEvent(JSON.parse(line));
            if (parsed) this.received.push(parsed);
          }
        });
      });
      server.once('error', reject);
      server.listen(this.pipePath, () => {
        this.server = server;
        resolve();
      });
    });
  }

  /**
   * `close()` only fires once every connection has ended, and the client holds
   * its socket open indefinitely — so the sockets go first or this never
   * resolves.
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      for (const socket of this.sockets) socket.destroy();
      this.sockets.clear();
      const server = this.server;
      this.server = null;
      if (!server) return resolve();
      server.close(() => resolve());
    });
  }
}

/** Polls until `condition` holds, or fails the test after `timeoutMs`. */
async function waitFor(condition: () => boolean, what: string, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) assert.fail(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Unix sockets on the test machine; the real path is a Windows named pipe. */
const socketPath = (name: string): string =>
  path.join(os.tmpdir(), `saber-${name}-${process.pid}-${Math.random().toString(36).slice(2)}`);

test('events sent before the companion exists are delivered once it appears', async (t: TestContext) => {
  const companion = new FakeCompanion(socketPath('late'));
  const client = new CompanionPipeClient(companion.pipePath);
  // Registered before anything can fail: a leaked listener keeps the whole test
  // runner alive long after the assertion that broke.
  t.after(async () => {
    client.stop();
    await companion.stop();
  });
  client.start();

  // Nothing is listening yet — this is the ordinary case, not an error.
  client.send(event('working', 'Long build…'));
  assert.equal(companion.received.length, 0);

  await companion.listen();
  await waitFor(() => companion.received.length > 0, 'the buffered event');

  assert.equal(companion.received[0]?.state, 'working');
  assert.equal(companion.received[0]?.label, 'Long build…');
});

test('the client reconnects after the companion restarts', async (t: TestContext) => {
  const pipePath = socketPath('restart');
  const first = new FakeCompanion(pipePath);
  const second = new FakeCompanion(pipePath);
  const client = new CompanionPipeClient(pipePath);
  t.after(async () => {
    client.stop();
    await first.stop();
    await second.stop();
  });

  await first.listen();
  client.start();
  await waitFor(() => client.connected, 'the initial connection');

  client.send(event('typing', 'Before'));
  await waitFor(() => first.received.length === 1, 'the first event');
  await first.stop();

  // Sent into the gap: the companion is gone and the replacement is not up.
  client.send(event('executing', 'During'));

  await second.listen();
  await waitFor(() => second.received.length > 0, 'delivery after the restart');

  assert.equal(second.received.at(-1)?.label, 'During');
});

test('the queue is bounded, and keeps the newest events', async (t: TestContext) => {
  const companion = new FakeCompanion(socketPath('bounded'));
  const client = new CompanionPipeClient(companion.pipePath);
  t.after(async () => {
    client.stop();
    await companion.stop();
  });
  client.start();

  // Far more than the queue holds. Stale state is worthless, so the oldest
  // must be the events that go.
  for (let i = 0; i < 200; i += 1) client.send(event('thinking', `event ${i}`));

  await companion.listen();
  await waitFor(() => companion.received.length > 0, 'the buffered events');
  // Give any remaining writes a moment to land before measuring.
  await new Promise((resolve) => setTimeout(resolve, 200));

  assert.ok(companion.received.length <= 16, `queue grew to ${companion.received.length}`);
  assert.equal(companion.received.at(-1)?.label, 'event 199', 'the newest event must survive');
});

test('sending after stop is a no-op rather than a throw', () => {
  const client = new CompanionPipeClient(socketPath('stopped'));
  client.start();
  client.stop();
  assert.doesNotThrow(() => client.send(event('idle', 'nothing')));
});
