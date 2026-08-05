# Saber

A desktop companion for Claude Desktop on Windows: a frameless, transparent,
always-on-top overlay containing a procedurally drawn saber-toothed cat whose
posture tracks what Claude is doing right now.

## Requirements

- Windows 10/11
- Node.js 20+

## Running

```bash
npm install
npm run dev
```

`npm run dev` watch-builds every bundle and launches Electron, restarting it on
main-process changes and reloading the window on renderer changes.

```bash
npm run build      # production bundles into dist/
npm start          # build, then run
npm run typecheck  # tsc --noEmit
```

## Connecting it to Claude Desktop

```bash
npm run register
```

This merges an entry into `%APPDATA%\Claude\claude_desktop_config.json`,
preserving every other server and key, after taking a backup alongside it.
Use `npm run register -- --check` to see what it would do first, and
`npm run register -- --remove` to undo it.

Then **quit Claude Desktop from the tray and reopen it** — the config is read
only at launch, so closing the window is not enough.

The companion works without this: it also infers state passively by tailing
`%APPDATA%\Claude\logs\mcp.log`, which records tool calls from every MCP
server. Registering adds the signals no log line contains — that a task
*finished*, whether it succeeded, and how far along it is.

To exercise a state by hand while the app is running:

```bash
node scripts/send-state.mjs executing "Running tests…" "npm test"
```

## Layout

```
src/shared/     contracts shared by all three processes (state protocol, IPC, settings)
src/main/       window ownership, overlay behaviour, state sources, configuration
src/preload/    the contextBridge surface, and nothing else
src/renderer/   canvas engine, character rig, animation state machine, overlay UI
src/mcp/        the MCP server Claude Desktop launches as a stdio child
specs/          the state protocol contract
```

Design notes live in `BUILD-BRIEF.md` (intent), `CLAUDE.md` (Windows gotchas)
and `specs/state-protocol.md` (the event contract).

`companion-prototype.html` is the reference rig — open it in a browser to see
the character and animation the renderer implements.
