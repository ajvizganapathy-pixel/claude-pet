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
