/**
 * End-to-end test of the MCP server: spawns the *built* server as Claude
 * Desktop would, speaks real JSON-RPC over stdio, and asserts the resulting
 * state event arrives on the pipe.
 */

import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseStateEvent, type StateEvent } from '@shared/protocol.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const serverEntry = path.join(root, 'dist/mcp/server.js');
const pipePath = `\\\\.\\pipe\\saber-test-${process.pid}`;

let server: ChildProcessWithoutNullStreams;
let listener: net.Server;
const received: StateEvent[] = [];
const pending = new Map<number, (message: Record<string, unknown>) => void>();
let nextId = 1;

/** Stands in for the companion's main process. */
function startListener(): Promise<void> {
  return new Promise((resolve) => {
    listener = net.createServer((socket) => {
      let buffer = '';
      socket.setEncoding('utf8');
      socket.on('data', (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = parseStateEvent(JSON.parse(line));
          if (event) received.push(event);
        }
      });
    });
    listener.listen(pipePath, resolve);
  });
}

function request(method: string, params?: unknown): Promise<Record<string, unknown>> {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

/** Waits for the pipe write, which happens independently of the JSON-RPC reply. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 250));

before(async () => {
  await startListener();

  server = spawn(process.execPath, [serverEntry], {
    env: { ...process.env, SABER_PIPE: pipePath },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let buffer = '';
  server.stdout.setEncoding('utf8');
  server.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line) as Record<string, unknown>;
      const id = message['id'];
      if (typeof id === 'number') pending.get(id)?.(message);
    }
  });

  await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'saber-test', version: '0' },
  });
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
});

after(() => {
  server?.kill();
  listener?.close();
});

test('advertises only reporting tools — no file or shell access', async () => {
  const response = await request('tools/list');
  const result = response['result'] as { tools: { name: string }[] };
  const names = result.tools.map((tool) => tool.name).sort();

  assert.deepEqual(names, ['report_activity', 'report_result']);
});

test('report_activity reaches the companion as a state event', async () => {
  received.length = 0;
  const response = await request('tools/call', {
    name: 'report_activity',
    arguments: { activity: 'executing', label: 'Running tests…', detail: 'npm test', progress: 0.4 },
  });

  assert.equal((response['result'] as { isError?: boolean }).isError, undefined);
  await settle();

  const event = received.at(-1);
  assert.equal(event?.state, 'executing');
  assert.equal(event?.label, 'Running tests…');
  assert.equal(event?.task, 'npm test');
  assert.equal(event?.progress, 0.4);
});

test('progress is omitted when the caller does not supply it', async () => {
  received.length = 0;
  await request('tools/call', {
    name: 'report_activity',
    arguments: { activity: 'thinking', label: 'Thinking…' },
  });
  await settle();

  assert.equal(received.at(-1)?.progress, undefined);
});

test('report_result carries the outcome through', async () => {
  received.length = 0;
  await request('tools/call', {
    name: 'report_result',
    arguments: { outcome: 'error', summary: 'Build failed', detail: '3 type errors' },
  });
  await settle();

  const event = received.at(-1);
  assert.equal(event?.state, 'error');
  assert.equal(event?.label, 'Build failed');
});

test('invalid arguments are rejected rather than guessed at', async () => {
  const response = await request('tools/call', {
    name: 'report_activity',
    arguments: { activity: 'dancing', label: 'Nope' },
  });

  assert.equal((response['result'] as { isError?: boolean }).isError, true);
});

test('an unknown tool is an error, not a crash', async () => {
  const response = await request('tools/call', { name: 'delete_everything', arguments: {} });
  assert.equal((response['result'] as { isError?: boolean }).isError, true);
});
