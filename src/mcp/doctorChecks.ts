/**
 * The health checks behind `npm run doctor`, as pure functions over collected
 * facts — so they are testable without a Windows machine or a live Claude
 * Desktop. Gathering those facts, and printing the result, is `doctor.ts`.
 *
 *   Claude Desktop --(stdio)--> dist/mcp/server.js --(named pipe)--> companion
 *
 * The failures this exists to catch are all silent ones. A stale registration
 * after the repo is moved or re-cloned, a config edited by another tool, a
 * build that was never run, Claude Desktop never restarted after registering:
 * none of these produce an error anywhere, they just leave the companion
 * sitting still forever.
 */

import { configPath, entryMatches, SERVER_KEY, type ServerEntry } from './registration.js';

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
  /** What to do about it. Omitted when there is nothing to do. */
  fix?: string;
  /** Checks that only mean something on the platform the companion targets. */
  windowsOnly?: boolean;
}

/** Everything the checks need, gathered separately so they stay pure. */
export interface Facts {
  platform: string;
  nodeMajor: number;
  appData: string | null;
  /**
   * The entry this checkout would register. Built by the caller rather than
   * derived here: `buildEntry` resolves paths against the host platform, and
   * these checks must stay free of anything platform-dependent.
   */
  expectedEntry: ServerEntry;
  buildArtifacts: { path: string; exists: boolean; name: string }[];
  /** Parsed config, `null` if missing, `'unreadable'` if it exists but will not parse. */
  config: Record<string, unknown> | null | 'unreadable';
  /**
   * Registered paths that do not exist on disk. Collected rather than probed
   * here, both to keep the checks pure and because a Windows path cannot be
   * resolved on the machine running the tests.
   */
  missingRegisteredPaths: string[];
  logDirExists: boolean;
  pipeReachable: boolean;
}

const asObject = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** The entry currently registered, if any. */
export function registeredEntry(config: Facts['config']): ServerEntry | null {
  if (config === null || config === 'unreadable') return null;
  const entry = asObject(asObject(config['mcpServers'])[SERVER_KEY]);
  const command = entry['command'];
  const args = entry['args'];
  if (typeof command !== 'string' || !Array.isArray(args)) return null;

  const result: ServerEntry = {
    command,
    args: args.filter((a): a is string => typeof a === 'string'),
  };

  // Carried through, or comparing against a freshly built entry would report a
  // mismatch that re-registering can never resolve.
  const env = asObject(entry['env']);
  const kept = Object.entries(env).filter(
    (pair): pair is [string, string] => typeof pair[1] === 'string',
  );
  if (kept.length > 0) result.env = Object.fromEntries(kept);

  return result;
}

export function runChecks(facts: Facts): Check[] {
  const checks: Check[] = [];

  checks.push(
    facts.platform === 'win32'
      ? { name: 'Platform', status: 'ok', detail: 'Windows' }
      : {
          name: 'Platform',
          status: 'warn',
          detail: `${facts.platform} — the companion targets Windows`,
          fix: 'Registration and the named pipe are Windows-only; the rest still builds.',
        },
  );

  checks.push(
    facts.nodeMajor >= 20
      ? { name: 'Node', status: 'ok', detail: `v${facts.nodeMajor}` }
      : {
          name: 'Node',
          status: 'fail',
          detail: `v${facts.nodeMajor}, but this project needs 20 or newer`,
          fix: 'Install Node 20+ and run npm install again.',
        },
  );

  const missing = facts.buildArtifacts.filter((a) => !a.exists);
  checks.push(
    missing.length === 0
      ? { name: 'Build', status: 'ok', detail: `${facts.buildArtifacts.length} artifacts present` }
      : {
          name: 'Build',
          status: 'fail',
          detail: `missing ${missing.map((m) => m.name).join(', ')}`,
          fix: 'Run: npm run build',
        },
  );

  // Everything below needs a Windows user profile to look at.
  if (facts.appData === null) {
    checks.push({
      name: 'Claude Desktop',
      status: 'warn',
      detail: 'APPDATA is not set, so the config cannot be located',
      fix: 'Run this on Windows to check the Claude Desktop side.',
    });
    return checks;
  }

  const target = configPath(facts.appData);

  if (facts.config === 'unreadable') {
    checks.push({
      name: 'Config',
      windowsOnly: true,
      status: 'fail',
      detail: `${target} exists but is not valid JSON`,
      fix: 'Fix or move that file; the registrar will not overwrite a config it cannot parse.',
    });
  } else if (facts.config === null) {
    checks.push({
      name: 'Config',
      windowsOnly: true,
      status: 'warn',
      detail: 'no claude_desktop_config.json yet',
      fix: 'Run: npm run register (it will create one)',
    });
  } else {
    checks.push({ name: 'Config', windowsOnly: true, status: 'ok', detail: target });
  }

  const registered = registeredEntry(facts.config);
  const expected = facts.expectedEntry;

  if (!registered) {
    checks.push({
      name: 'Registration',
      windowsOnly: true,
      status: 'fail',
      detail: `no "${SERVER_KEY}" entry in mcpServers`,
      fix: 'Run: npm run register',
    });
  } else if (!entryMatches(registered, expected)) {
    // The common cause is a moved or re-cloned checkout: the entry still points
    // at wherever the repo used to live, and nothing reports the mismatch.
    checks.push({
      name: 'Registration',
      windowsOnly: true,
      status: 'fail',
      detail:
        `registered as "${registered.command} ${registered.args.join(' ')}", ` +
        `but this checkout builds "${expected.command} ${expected.args.join(' ')}"`,
      fix: 'Run: npm run register (it rewrites the entry to this checkout)',
    });
  } else {
    checks.push({ name: 'Registration', windowsOnly: true, status: 'ok', detail: 'points at this checkout' });
  }

  // A registered command that does not exist on disk fails at launch, inside
  // Claude Desktop, where the user will never see the error.
  if (registered) {
    checks.push(
      facts.missingRegisteredPaths.length === 0
        ? { name: 'Server binary', windowsOnly: true, status: 'ok', detail: 'registered paths exist' }
        : {
            name: 'Server binary',
            windowsOnly: true,
            status: 'fail',
            detail: `registered path does not exist: ${facts.missingRegisteredPaths.join(', ')}`,
            fix: 'Run: npm run register',
          },
    );
  }

  checks.push(
    facts.logDirExists
      ? { name: 'Claude logs', windowsOnly: true, status: 'ok', detail: 'log inference available' }
      : {
          name: 'Claude logs',
          windowsOnly: true,
          status: 'warn',
          detail: 'no logs directory yet',
          fix: 'Start Claude Desktop once. Without logs, thinking and typing are not inferred.',
        },
  );

  checks.push(
    facts.pipeReachable
      ? { name: 'Companion', windowsOnly: true, status: 'ok', detail: 'running and accepting events' }
      : {
          name: 'Companion',
          windowsOnly: true,
          status: 'warn',
          detail: 'not running',
          fix: 'Start it with: npm start — the MCP server buffers events until it appears.',
        },
  );

  return downgradeOffWindows(checks, facts.platform);
}

/**
 * Off Windows the Claude Desktop side is not broken, it is inapplicable — so a
 * missing registration must not fail a setup run that deliberately skipped it.
 * The findings still print; they simply stop being errors.
 */
function downgradeOffWindows(checks: Check[], platform: string): Check[] {
  if (platform === 'win32') return checks;
  return checks.map((check) =>
    check.windowsOnly && check.status === 'fail' ? { ...check, status: 'warn' } : check,
  );
}

/** `fail` anywhere means the chain is broken; `warn` alone means it will work. */
export const worstStatus = (checks: Check[]): CheckStatus =>
  checks.some((c) => c.status === 'fail')
    ? 'fail'
    : checks.some((c) => c.status === 'warn')
      ? 'warn'
      : 'ok';
