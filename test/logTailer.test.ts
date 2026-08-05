import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { classifyTool, LogTailer } from '../src/main/sources/logTailer.js';
import type { SourcedStateEvent } from '@shared/protocol.js';

/** Lines in the shape Claude Desktop actually writes to mcp.log. */
const call = (id: number, tool: string, server = 'filesystem'): string =>
  `2026-08-05T14:26:03.258Z [info] [${server}] Message from client: ` +
  `{"method":"tools/call","params":{"name":"${tool}","arguments":{}},"jsonrpc":"2.0","id":${id}}\n`;

const reply = (id: number, body = '{"content":[]}'): string =>
  `2026-08-05T14:26:05.100Z [info] [filesystem] Message from server: ` +
  `{"result":${body},"jsonrpc":"2.0","id":${id}}\n`;

async function withTailer(
  run: (append: (line: string) => Promise<void>, events: SourcedStateEvent[]) => Promise<void>,
): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'saber-log-'));
  const file = path.join(dir, 'mcp.log');
  await fs.writeFile(file, 'pre-existing history that must not be replayed\n');

  const tailer = new LogTailer(file);
  const events: SourcedStateEvent[] = [];
  tailer.on('state', (event) => events.push(event));
  assert.equal(await tailer.start(), true);

  const append = async (line: string): Promise<void> => {
    await fs.appendFile(file, line);
    // fs.watchFile polls; give it a beat to notice and drain.
    await new Promise((resolve) => setTimeout(resolve, 500));
  };

  try {
    await run(append, events);
  } finally {
    tailer.stop();
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('start on a missing log reports failure instead of throwing', async () => {
  const tailer = new LogTailer(path.join(os.tmpdir(), 'saber-does-not-exist', 'mcp.log'));
  assert.equal(await tailer.start(), false);
  tailer.stop();
});

test('a tool call produces a state, and its reply produces thinking', async () => {
  await withTailer(async (append, events) => {
    await append(call(4, 'read_file'));
    assert.equal(events.at(-1)?.state, 'reading');
    assert.equal(events.at(-1)?.source, 'log');
    assert.equal(events.at(-1)?.meta?.tool, 'read_file');

    await append(reply(4));
    assert.equal(events.at(-1)?.state, 'thinking');
  });
});

test('history before start is not replayed', async () => {
  await withTailer(async (append, events) => {
    await append('2026-08-05T14:26:03.258Z [info] [x] unrelated noise\n');
    assert.equal(events.length, 0);
  });
});

test('an error result becomes the error state', async () => {
  await withTailer(async (append, events) => {
    await append(call(7, 'run_command'));
    await append(reply(7, '{"isError":true,"content":[]}'));
    assert.equal(events.at(-1)?.state, 'error');
  });
});

test('a reply while another call is in flight does not claim thinking', async () => {
  await withTailer(async (append, events) => {
    await append(call(1, 'read_file') + call(2, 'run_tests'));
    await append(reply(1));
    assert.notEqual(events.at(-1)?.state, 'thinking');
  });
});

test('malformed and unrelated lines are ignored', async () => {
  await withTailer(async (append, events) => {
    await append('garbage\n');
    await append('2026-08-05T14:26:03.258Z [info] [x] Message from client: not json\n');
    await append('2026-08-05T14:26:03.258Z [info] [x] Message from client: {"method":"tools/list"}\n');
    assert.equal(events.length, 0);
  });
});

test('tool names map to states by what they say they do', () => {
  assert.equal(classifyTool('read_file'), 'reading');
  assert.equal(classifyTool('search_files'), 'reading');
  assert.equal(classifyTool('list_directory'), 'reading');
  assert.equal(classifyTool('write_file'), 'typing');
  assert.equal(classifyTool('edit_block'), 'typing');
  assert.equal(classifyTool('run_command'), 'executing');
  assert.equal(classifyTool('something_unfamiliar'), 'executing');
});
