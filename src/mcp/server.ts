/**
 * MCP server entry point — implemented in a later milestone.
 *
 * It will run as a stdio child of Claude Desktop and relay state events to the
 * companion over the named pipe described in `specs/state-protocol.md`.
 */

import { createLogger } from '@shared/log.js';

const log = createLogger('mcp');

log.warn('the MCP server is not implemented yet; no tool state will be reported');
