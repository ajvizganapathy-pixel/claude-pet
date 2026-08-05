/**
 * The MCP server Claude Desktop launches as a stdio child.
 *
 * It exists to observe, not to work. The spec suggested exposing file reads,
 * search and command execution so that Claude's use of them would double as a
 * state signal. Two things argue against that, and both got stronger once the
 * real log format turned out to record *every* server's tool calls:
 *
 *  1. Duplication. The companion already sees the user's existing filesystem
 *     and shell tools through the log tailer. Shipping rivals to them adds no
 *     signal, and risks Claude picking the redundant copy over the better one.
 *  2. Surface. An unsandboxed exec tool — and to a lesser extent arbitrary
 *     file reads — is a real capability to hand out. Adding one whose only
 *     purpose is to trigger an animation is a bad trade at any price.
 *
 * So the tools here report, and nothing else. They are the only way the
 * companion learns things no log line contains: that a task *succeeded*, that
 * it failed, and how far along it is.
 *
 * stdout belongs to JSON-RPC. Every diagnostic goes to stderr.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { createLogger, setLogLevel } from '@shared/log.js';
import { clamp01, type StateEvent, type StateName } from '@shared/protocol.js';
import { CompanionPipeClient } from './pipeClient.js';

const log = createLogger('mcp');
setLogLevel((process.env['SABER_LOG'] as 'debug' | undefined) ?? 'info');

const pipe = new CompanionPipeClient();

const ACTIVITY_STATES: readonly StateName[] = [
  'thinking',
  'reading',
  'typing',
  'executing',
  'working',
];

const TOOLS: Tool[] = [
  {
    name: 'report_activity',
    description:
      'Tell the desktop companion what you are currently doing, so it can reflect the work ' +
      'on screen. Call this when you begin something the user will wait for — reading through ' +
      'a project, writing a file, running a build or test suite — and again if the nature of ' +
      'the work changes. Cheap to call and safe to call often; it has no side effects beyond ' +
      'updating the companion.',
    inputSchema: {
      type: 'object',
      properties: {
        activity: {
          type: 'string',
          enum: [...ACTIVITY_STATES],
          description:
            'thinking (reasoning, no tool running), reading (inspecting files or search ' +
            'results), typing (writing code or prose), executing (a command is running), ' +
            'working (a long build, install or test run).',
        },
        label: {
          type: 'string',
          description:
            'Short present-tense phrase shown in the speech bubble, e.g. "Running tests…". ' +
            'Under about 40 characters.',
        },
        detail: {
          type: 'string',
          description: 'Optional longer line for the task panel, e.g. "npm test — 12 of 40 files".',
        },
        progress: {
          type: 'number',
          description:
            'Optional completion between 0 and 1. Omit unless you genuinely know it — the ' +
            'companion shows an indeterminate bar rather than inventing a number.',
        },
      },
      required: ['activity', 'label'],
    },
  },
  {
    name: 'report_result',
    description:
      'Tell the desktop companion that the task you were working on has finished. Call this ' +
      'once at the end of a piece of work the user was waiting for. This is the only way the ' +
      'companion can distinguish a task that completed from one that merely went quiet.',
    inputSchema: {
      type: 'object',
      properties: {
        outcome: {
          type: 'string',
          enum: ['success', 'error'],
          description: 'Whether the work succeeded or failed.',
        },
        summary: {
          type: 'string',
          description: 'Short phrase for the bubble, e.g. "Tests passed" or "Build failed".',
        },
        detail: {
          type: 'string',
          description: 'Optional longer line for the task panel.',
        },
      },
      required: ['outcome', 'summary'],
    },
  },
];

const server = new Server(
  { name: 'saber', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, (request): CallToolResult => {
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  switch (request.params.name) {
    case 'report_activity':
      return handle(buildActivityEvent(args), 'Companion updated.');
    case 'report_result':
      return handle(buildResultEvent(args), 'Companion updated.');
    default:
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
      };
  }
});

function handle(event: StateEvent | null, ok: string): CallToolResult {
  if (!event) {
    return { isError: true, content: [{ type: 'text', text: 'Invalid arguments.' }] };
  }
  pipe.send(event);
  // The result is intentionally terse: this tool exists for its side effect,
  // and a long reply would waste the model's context on nothing.
  return { content: [{ type: 'text', text: ok }] };
}

function buildActivityEvent(args: Record<string, unknown>): StateEvent | null {
  const activity = args['activity'];
  const label = args['label'];
  if (typeof activity !== 'string' || typeof label !== 'string') return null;
  if (!ACTIVITY_STATES.includes(activity as StateName)) return null;

  const event: StateEvent = {
    state: activity as StateName,
    label: label.slice(0, 120),
    ts: Date.now(),
    meta: { tool: 'report_activity' },
  };

  const detail = args['detail'];
  if (typeof detail === 'string' && detail.length > 0) event.task = detail.slice(0, 200);

  // Progress is passed through only when it is genuinely a number, per the
  // protocol's rule against inventing motion.
  const progress = args['progress'];
  if (typeof progress === 'number' && Number.isFinite(progress)) {
    event.progress = clamp01(progress);
  }

  return event;
}

function buildResultEvent(args: Record<string, unknown>): StateEvent | null {
  const outcome = args['outcome'];
  const summary = args['summary'];
  if (outcome !== 'success' && outcome !== 'error') return null;
  if (typeof summary !== 'string') return null;

  const event: StateEvent = {
    state: outcome,
    label: summary.slice(0, 120),
    ts: Date.now(),
    meta: { tool: 'report_result' },
  };
  if (outcome === 'success') event.progress = 1;

  const detail = args['detail'];
  if (typeof detail === 'string' && detail.length > 0) event.task = detail.slice(0, 200);

  return event;
}

async function main(): Promise<void> {
  pipe.start();
  await server.connect(new StdioServerTransport());
  log.info('mcp server ready');
}

const shutdown = (): void => {
  pipe.stop();
  void server.close();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
// A stdio server outlives nothing: when the parent closes the pipe, we go.
process.stdin.on('close', shutdown);

main().catch((err: unknown) => {
  log.error('mcp server failed to start', err);
  process.exit(1);
});
