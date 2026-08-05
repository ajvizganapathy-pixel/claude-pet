import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildEntry,
  planRegistration,
  planRemoval,
  SERVER_KEY,
} from '../src/mcp/registration.js';

const entry = buildEntry('C:\\node\\node.exe', 'C:\\app\\dist\\mcp\\server.js');

test('adds the entry to an empty or missing config', () => {
  for (const existing of [undefined, {}, { mcpServers: {} }]) {
    const plan = planRegistration(existing, entry);
    assert.equal(plan.action, 'added');
    assert.deepEqual((plan.config?.['mcpServers'] as Record<string, unknown>)[SERVER_KEY], entry);
  }
});

test('never disturbs other servers or unrelated keys', () => {
  const existing = {
    mcpServers: { filesystem: { command: 'npx', args: ['-y', 'server-filesystem'] } },
    coworkUserFilesPath: 'C:\\files',
    preferences: { theme: 'dark' },
  };

  const plan = planRegistration(existing, entry);
  const servers = plan.config?.['mcpServers'] as Record<string, unknown>;

  assert.deepEqual(servers['filesystem'], existing.mcpServers.filesystem);
  assert.equal(plan.config?.['coworkUserFilesPath'], 'C:\\files');
  assert.deepEqual(plan.config?.['preferences'], { theme: 'dark' });
});

test('re-registering an unchanged entry writes nothing', () => {
  const existing = { mcpServers: { [SERVER_KEY]: entry } };
  const plan = planRegistration(existing, entry);

  assert.equal(plan.action, 'unchanged');
  assert.equal(plan.config, null);
});

test('a moved install path is an update, not a duplicate', () => {
  const existing = {
    mcpServers: { [SERVER_KEY]: { command: 'node', args: ['C:\\old\\server.js'] } },
  };
  const plan = planRegistration(existing, entry);

  assert.equal(plan.action, 'updated');
  assert.deepEqual((plan.config?.['mcpServers'] as Record<string, unknown>)[SERVER_KEY], entry);
});

test('removal takes out only our entry', () => {
  const existing = {
    mcpServers: { [SERVER_KEY]: entry, other: { command: 'x', args: [] } },
    preferences: { theme: 'dark' },
  };
  const plan = planRemoval(existing);
  const servers = plan.config?.['mcpServers'] as Record<string, unknown>;

  assert.equal(plan.action, 'removed');
  assert.equal(SERVER_KEY in servers, false);
  assert.deepEqual(servers['other'], { command: 'x', args: [] });
  assert.deepEqual(plan.config?.['preferences'], { theme: 'dark' });
});

test('removing when absent is a no-op', () => {
  assert.equal(planRemoval({ mcpServers: {} }).action, 'absent');
  assert.equal(planRemoval({}).config, null);
});

test('a malformed config is treated as empty rather than trusted', () => {
  // Arrays and scalars where objects belong must not throw or leak through.
  assert.equal(planRegistration({ mcpServers: [1, 2, 3] }, entry).action, 'added');
  assert.equal(planRegistration('nonsense', entry).action, 'added');
});
