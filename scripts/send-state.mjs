// Sends a state event to a running companion over the named pipe.
//
// The manual counterpart to the MCP server: useful for exercising a state
// without waiting for Claude Desktop to reach it.
//
//   node scripts/send-state.mjs executing "Running tests…" "npm test"

import net from 'node:net';

const PIPE_PATH = '\\\\.\\pipe\\saber';

const [state = 'idle', label = state, task] = process.argv.slice(2);

const event = { state, label, ts: Date.now() };
if (task) event.task = task;

const socket = net.connect(PIPE_PATH, () => {
  socket.write(`${JSON.stringify(event)}\n`, () => socket.end());
  console.log(`sent ${state}`);
});

socket.on('error', (err) => {
  console.error(`could not reach the companion: ${err.message}`);
  process.exit(1);
});
