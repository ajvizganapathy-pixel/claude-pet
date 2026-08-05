# State protocol

How the companion learns what Claude is doing, without Claude Desktop knowing it exists.

## The inversion

Claude Desktop has no state API. Rather than observing it from outside, the companion ships an **MCP server** that Claude Desktop connects to as a normal tool provider. Claude's own tool calls become the state signal — the server is the observer, and it sits inside the trust boundary rather than guessing from outside it.

Registered in `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{ "mcpServers": { "saber": { "command": "node", "args": ["<install>/mcp/server.js"] } } }
```

The server runs as a stdio child of Claude Desktop, and relays events to the companion's main process over a local named pipe (`\\.\pipe\saber`). The companion may start after Claude Desktop, so the server buffers and the pipe reconnects — neither side may assume the other is up.

## Two sources, different confidence

**Tool calls (exact).** The server exposes a small set of tools Claude will naturally reach for during a coding session — file reads, command execution, search. Every invocation is an unambiguous state transition with real arguments attached: which file, which command, how many results.

**Log tailing (inferred).** `%APPDATA%\Claude\logs\` shows request start, streaming activity, and completion. This is where `thinking` and `typing` come from — a request open with no tokens yet is thinking; tokens arriving is typing, and their arrival rate drives the paw animation speed. Format is undocumented and will change between Claude Desktop versions, so parse defensively and degrade to `idle` rather than crashing.

## Events

One shape, sent on every transition. The renderer holds no logic about what a state means beyond how to animate it.

```ts
type StateEvent = {
  state: 'idle'|'thinking'|'reading'|'typing'|'executing'|'working'|'success'|'error'|'sleeping';
  label: string;        // bubble text, already human-facing: "Running tests…"
  task?: string;        // task panel line: "npm install — resolving packages"
  progress?: number;    // 0..1, omit when genuinely unknown — never fake it
  rate?: number;        // tokens/sec or similar, drives typing speed
  meta?: { files?: number; elapsed?: number; tool?: string };
  ts: number;
};
```

Two rules that keep it honest: **omit `progress` when you don't know it** — a bar that invents motion is worse than no bar — and **`working` is `executing` that outlived a threshold** (~8s), not a separate detection path.

## Fallback ladder

If the pipe is dead, fall back to log tailing alone. If the logs are unreadable, fall back to foreground-window detection — Claude Desktop focused means `idle`, unfocused means `sleeping`. The companion should never show a state it can't justify; when it doesn't know, it sits and breathes.
