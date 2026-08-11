import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registeredEntry, runChecks, worstStatus, type Check, type Facts } from '../src/mcp/doctorChecks.js';
import { buildEntry, entryMatches, planRegistration, SERVER_KEY } from '../src/mcp/registration.js';

const SERVER = 'C:\\repo\\dist\\mcp\\server.js';
const NODE = 'C:\\Program Files\\nodejs\\node.exe';

const healthy = (): Facts => ({
  platform: 'win32',
  nodeMajor: 22,
  appData: 'C:\\Users\\me\\AppData\\Roaming',
  expectedEntry: { command: NODE, args: [SERVER] },
  buildArtifacts: [{ path: SERVER, name: 'server.js', exists: true }],
  config: { mcpServers: { [SERVER_KEY]: { command: NODE, args: [SERVER] } } },
  missingRegisteredPaths: [],
  logDirExists: true,
  pipeReachable: true,
});

const find = (checks: Check[], name: string): Check => {
  const check = checks.find((c) => c.name === name);
  assert.ok(check, `expected a '${name}' check`);
  return check;
};

test('a fully wired machine reports no problems', () => {
  const checks = runChecks(healthy());
  assert.equal(worstStatus(checks), 'ok');
  assert.equal(find(checks, 'Registration').status, 'ok');
});

test('a missing registration is a failure with a fix', () => {
  const checks = runChecks({ ...healthy(), config: {} });
  const check = find(checks, 'Registration');
  assert.equal(check.status, 'fail');
  assert.match(check.fix ?? '', /npm run register/);
  assert.equal(worstStatus(checks), 'fail');
});

test('a registration left behind by a moved checkout is caught', () => {
  // The exact silent failure this tool exists for: the entry is present and
  // well-formed, but points at a directory that is no longer this one.
  const stale = 'C:\\old-location\\dist\\mcp\\server.js';
  const checks = runChecks({
    ...healthy(),
    config: { mcpServers: { [SERVER_KEY]: { command: NODE, args: [stale] } } },
  });
  const check = find(checks, 'Registration');
  assert.equal(check.status, 'fail');
  assert.match(check.detail, /old-location/);
});

test('a registered path that no longer exists on disk is caught', () => {
  const checks = runChecks({
    ...healthy(),
    config: { mcpServers: { [SERVER_KEY]: { command: NODE, args: ['C:\\gone\\server.js'] } } },
    missingRegisteredPaths: ['C:\\gone\\server.js'],
  });
  const check = find(checks, 'Server binary');
  assert.equal(check.status, 'fail');
  assert.match(check.detail, /gone/);
});

test('an unparseable config fails without suggesting an overwrite', () => {
  const checks = runChecks({ ...healthy(), config: 'unreadable' });
  const check = find(checks, 'Config');
  assert.equal(check.status, 'fail');
  assert.doesNotMatch(check.fix ?? '', /npm run register/);
});

test('a missing build is a failure, and names what is missing', () => {
  const checks = runChecks({
    ...healthy(),
    buildArtifacts: [
      { path: SERVER, name: 'server.js', exists: false },
      { path: 'C:\\repo\\dist\\main\\index.js', name: 'index.js', exists: true },
    ],
  });
  const check = find(checks, 'Build');
  assert.equal(check.status, 'fail');
  assert.match(check.detail, /server\.js/);
});

test('a companion that is not running only warns — events are buffered', () => {
  const checks = runChecks({ ...healthy(), pipeReachable: false });
  assert.equal(find(checks, 'Companion').status, 'warn');
  assert.equal(worstStatus(checks), 'warn', 'the chain is still correctly wired');
});

test('off Windows the Claude Desktop checks are skipped, not failed', () => {
  const checks = runChecks({ ...healthy(), platform: 'linux', appData: null });
  assert.equal(worstStatus(checks), 'warn');
  assert.equal(checks.find((c) => c.name === 'Registration'), undefined);
});

test('off Windows a missing registration is reported but does not fail the run', () => {
  // `npm run setup` skips registration off Windows on purpose; failing the
  // doctor for the step it deliberately skipped would be nonsense.
  const checks = runChecks({ ...healthy(), platform: 'darwin', config: {} });
  const check = find(checks, 'Registration');
  assert.equal(check.status, 'warn');
  assert.match(check.detail, /no "saber" entry/);
  assert.equal(worstStatus(checks), 'warn');
});

test('on Windows the same missing registration is a hard failure', () => {
  const checks = runChecks({ ...healthy(), config: {} });
  assert.equal(find(checks, 'Registration').status, 'fail');
  assert.equal(worstStatus(checks), 'fail');
});

test('an old Node is a hard failure', () => {
  assert.equal(find(runChecks({ ...healthy(), nodeMajor: 18 }), 'Node').status, 'fail');
});

test('registeredEntry carries env through, so a match stays a match', () => {
  const entry = buildEntry('C:\\app\\Saber.exe', SERVER);
  assert.deepEqual(entry.env, { ELECTRON_RUN_AS_NODE: '1' });

  const written = planRegistration({}, entry).config as Record<string, never>;
  const parsed = registeredEntry(written);
  assert.ok(parsed);
  assert.ok(entryMatches(parsed, entry), 'a freshly written entry must read back as matching');
});

test('a node command needs no env', () => {
  assert.equal(buildEntry(NODE, SERVER).env, undefined);
});

test('registering preserves environment the user added to the entry', () => {
  const existing = {
    mcpServers: {
      [SERVER_KEY]: { command: 'C:\\old\\node.exe', args: [SERVER], env: { HTTP_PROXY: 'x' } },
    },
  };
  const plan = planRegistration(existing, buildEntry(NODE, SERVER));
  assert.equal(plan.action, 'updated');
  assert.deepEqual(plan.entry?.env, { HTTP_PROXY: 'x' });
});

test('registering leaves other servers untouched', () => {
  const existing = { mcpServers: { other: { command: 'x', args: [] } }, theme: 'dark' };
  const plan = planRegistration(existing, buildEntry(NODE, SERVER));
  const config = plan.config as { mcpServers: Record<string, unknown>; theme: string };
  assert.deepEqual(config.mcpServers['other'], { command: 'x', args: [] });
  assert.equal(config.theme, 'dark');
});
